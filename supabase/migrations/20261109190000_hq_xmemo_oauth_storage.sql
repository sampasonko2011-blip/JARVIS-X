-- XMemo OAuth transaction and encrypted credential storage.
-- Source-control migration only. Apply only after review and coordinated gateway release.
-- Provider tokens and PKCE verifiers are envelope-encrypted by the Edge Function
-- with a server-side key; this schema never stores plaintext credentials.

CREATE TABLE IF NOT EXISTS public.hq_xmemo_oauth_transactions (
  state_hash text PRIMARY KEY CHECK (state_hash ~ '^[A-Za-z0-9_-]{43}$'),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id text NOT NULL CHECK (length(client_id) BETWEEN 1 AND 256),
  redirect_uri text NOT NULL CHECK (redirect_uri LIKE 'https://%'),
  resource text NOT NULL CHECK (resource = 'https://xmemo.dev/mcp'),
  scopes text[] NOT NULL CHECK (scopes = ARRAY['memory:read','memory:write']::text[]),
  encrypted_code_verifier text NOT NULL CHECK (length(encrypted_code_verifier) BETWEEN 1 AND 8192),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > created_at),
  CHECK (expires_at <= created_at + interval '15 minutes')
);

CREATE INDEX IF NOT EXISTS hq_xmemo_oauth_transactions_expiry_idx
  ON public.hq_xmemo_oauth_transactions (expires_at);

CREATE TABLE IF NOT EXISTS public.hq_xmemo_oauth_credentials (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource text NOT NULL CHECK (resource = 'https://xmemo.dev/mcp'),
  client_id text NOT NULL CHECK (length(client_id) BETWEEN 1 AND 256),
  scopes text[] NOT NULL CHECK (scopes = ARRAY['memory:read','memory:write']::text[]),
  encrypted_access_token text NOT NULL CHECK (length(encrypted_access_token) BETWEEN 1 AND 16384),
  encrypted_refresh_token text NOT NULL CHECK (length(encrypted_refresh_token) BETWEEN 1 AND 16384),
  encryption_key_version text NOT NULL CHECK (length(encryption_key_version) BETWEEN 1 AND 64),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, resource)
);

ALTER TABLE public.hq_xmemo_oauth_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hq_xmemo_oauth_credentials ENABLE ROW LEVEL SECURITY;

-- No browser role may read or mutate OAuth transactions or provider credentials.
REVOKE ALL ON TABLE public.hq_xmemo_oauth_transactions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.hq_xmemo_oauth_credentials FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.hq_xmemo_oauth_transactions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.hq_xmemo_oauth_credentials TO service_role;

CREATE OR REPLACE FUNCTION public.consume_hq_xmemo_oauth_transaction(
  p_state_hash text,
  p_user_id uuid,
  p_now timestamptz DEFAULT now()
)
RETURNS TABLE (
  user_id uuid,
  client_id text,
  redirect_uri text,
  resource text,
  scopes text[],
  encrypted_code_verifier text,
  created_at timestamptz,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF p_state_hash IS NULL OR p_state_hash !~ '^[A-Za-z0-9_-]{43}$' OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'oauth_transaction_input_invalid' USING ERRCODE = '22023';
  END IF;

  -- Atomic DELETE ... RETURNING makes the authorization state single-use.
  RETURN QUERY
  DELETE FROM public.hq_xmemo_oauth_transactions AS transaction
  WHERE transaction.state_hash = p_state_hash
    AND transaction.user_id = p_user_id
    AND transaction.expires_at > p_now
  RETURNING
    transaction.user_id,
    transaction.client_id,
    transaction.redirect_uri,
    transaction.resource,
    transaction.scopes,
    transaction.encrypted_code_verifier,
    transaction.created_at,
    transaction.expires_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_hq_xmemo_oauth_transaction(text, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_hq_xmemo_oauth_transaction(text, uuid, timestamptz) TO service_role;

COMMENT ON TABLE public.hq_xmemo_oauth_transactions IS
  'Short-lived, user-bound, single-use XMemo OAuth transactions. PKCE verifier is envelope-encrypted by the trusted Edge Function.';
COMMENT ON TABLE public.hq_xmemo_oauth_credentials IS
  'User-scoped XMemo OAuth credentials. Access and refresh tokens must be envelope-encrypted before insertion; browser roles have no access.';
COMMENT ON FUNCTION public.consume_hq_xmemo_oauth_transaction(text, uuid, timestamptz) IS
  'Atomically consumes one unexpired OAuth transaction for the authenticated Supabase user. Service-role only.';
