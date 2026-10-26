-- Expand phase: add the service-role-only rate-limit RPC without breaking gateway v11.
-- Apply this migration while v11 still uses consume_hq_rate_limit(text), then deploy
-- the matching gateway revision and verify the new overload is being used.
-- Revoke the legacy overload only in a separate cleanup phase after live verification.
-- Do not put that destructive permission change into this compatibility migration.
CREATE OR REPLACE FUNCTION public.consume_hq_rate_limit(
  p_user_id uuid,
  p_limit_key text
)
RETURNS TABLE (
  allowed boolean,
  limit_key text,
  request_limit integer,
  remaining integer,
  reset_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_now timestamptz := now();
  v_window_seconds integer;
  v_max_requests integer;
  v_window_started_at timestamptz;
  v_request_count integer;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required' USING ERRCODE = '22023';
  END IF;

  IF p_limit_key = 'minute' THEN
    v_window_seconds := 60;
    v_max_requests := 10;
  ELSIF p_limit_key = 'day' THEN
    v_window_seconds := 86400;
    v_max_requests := 100;
  ELSE
    RAISE EXCEPTION 'invalid_limit_key' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.hq_rate_limits AS current_limit
    (user_id, limit_key, window_started_at, request_count, updated_at)
  VALUES
    (p_user_id, p_limit_key, v_now, 1, v_now)
  ON CONFLICT (user_id, limit_key) DO UPDATE
  SET
    window_started_at = CASE
      WHEN current_limit.window_started_at <= v_now - (v_window_seconds * interval '1 second')
      THEN v_now
      ELSE current_limit.window_started_at
    END,
    request_count = CASE
      WHEN current_limit.window_started_at <= v_now - (v_window_seconds * interval '1 second')
      THEN 1
      ELSE current_limit.request_count + 1
    END,
    updated_at = v_now
  RETURNING current_limit.window_started_at, current_limit.request_count
  INTO v_window_started_at, v_request_count;

  RETURN QUERY SELECT
    (v_request_count <= v_max_requests),
    p_limit_key,
    v_max_requests,
    greatest(0, v_max_requests - v_request_count),
    v_window_started_at + (v_window_seconds * interval '1 second');
END;
$function$;

-- Compatibility phase: deliberately retain the legacy overload for the v11 -> v12 transition.
-- Its removal is a separate release gate after the new gateway is verified in production.
REVOKE ALL ON FUNCTION public.consume_hq_rate_limit(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_hq_rate_limit(uuid, text) TO service_role;

COMMENT ON FUNCTION public.consume_hq_rate_limit(uuid, text) IS
  'Server-only per-user rate limit. Execute permission is restricted to service_role; callers must pass a user ID verified by the trusted gateway.';
