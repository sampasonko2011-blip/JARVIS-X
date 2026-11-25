-- P3 PRONOTE iPad bridge: latest snapshot per user and revocable, scoped ingestion tokens.
-- Tokens are stored only as SHA-256 digests. The plaintext is returned once by the
-- authenticated token-issuance endpoint and must never be written to repository logs.
CREATE TABLE IF NOT EXISTS public.pronote_ipad_ingest_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_used_at timestamptz,
  CONSTRAINT pronote_ipad_token_expiry_valid CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS pronote_ipad_tokens_user_idx
  ON public.pronote_ipad_ingest_tokens(user_id, created_at DESC);

ALTER TABLE public.pronote_ipad_ingest_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pronote_ipad_ingest_tokens FROM anon, authenticated;
GRANT ALL ON TABLE public.pronote_ipad_ingest_tokens TO service_role;

CREATE TABLE IF NOT EXISTS public.pronote_ipad_snapshots (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  schema_version text NOT NULL CHECK (schema_version = 'pronote.snapshot.v1'),
  generated_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  snapshot_hash text NOT NULL CHECK (snapshot_hash ~ '^[a-f0-9]{64}$'),
  event_count integer NOT NULL CHECK (event_count >= 0 AND event_count <= 2000),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object')
);

ALTER TABLE public.pronote_ipad_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read their own PRONOTE iPad snapshot" ON public.pronote_ipad_snapshots;
CREATE POLICY "Users can read their own PRONOTE iPad snapshot"
  ON public.pronote_ipad_snapshots FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE ON TABLE public.pronote_ipad_snapshots FROM anon, authenticated;
GRANT SELECT ON TABLE public.pronote_ipad_snapshots TO authenticated;
GRANT ALL ON TABLE public.pronote_ipad_snapshots TO service_role;
