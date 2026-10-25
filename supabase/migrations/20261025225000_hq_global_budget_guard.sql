-- Global paid-inference budget guard.
-- Reservations are conservative ceilings, not provider-reported actual spend.
-- The guard is disabled until an operator sets a safe per-request reservation
-- based on the actual model pricing/token ceilings, then explicitly enables it.

CREATE TABLE IF NOT EXISTS public.hq_global_budget_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  kill_switch_enabled boolean NOT NULL DEFAULT false,
  daily_limit_usd numeric(12,6) NOT NULL DEFAULT 10.000000 CHECK (daily_limit_usd > 0),
  request_reservation_usd numeric(12,6) CHECK (request_reservation_usd > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.hq_global_budget_config (singleton, enabled, kill_switch_enabled, daily_limit_usd, request_reservation_usd)
VALUES (true, false, false, 10.000000, NULL)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.hq_global_budget_daily (
  budget_day date PRIMARY KEY,
  reserved_usd numeric(12,6) NOT NULL DEFAULT 0 CHECK (reserved_usd >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hq_global_budget_reservations (
  reservation_id uuid PRIMARY KEY,
  budget_day date NOT NULL,
  user_id uuid NOT NULL,
  reserved_usd numeric(12,6) NOT NULL CHECK (reserved_usd > 0),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'completed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hq_global_budget_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hq_global_budget_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hq_global_budget_reservations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.hq_global_budget_config FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.hq_global_budget_daily FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.hq_global_budget_reservations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.hq_global_budget_config TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.hq_global_budget_daily TO service_role;
GRANT SELECT, INSERT ON TABLE public.hq_global_budget_reservations TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_hq_global_budget(
  p_reservation_id uuid,
  p_user_id uuid
)
RETURNS TABLE (
  allowed boolean,
  reason text,
  reserved_usd numeric,
  reserved_today_usd numeric,
  daily_limit_usd numeric
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  cfg public.hq_global_budget_config%ROWTYPE;
  v_day date := (now() AT TIME ZONE 'UTC')::date;
  v_reserved numeric(12,6);
BEGIN
  IF p_reservation_id IS NULL OR p_user_id IS NULL THEN
    RETURN QUERY SELECT false, 'invalid_reservation_identity', NULL::numeric, NULL::numeric, NULL::numeric;
    RETURN;
  END IF;

  SELECT * INTO cfg
  FROM public.hq_global_budget_config
  WHERE singleton = true
  FOR UPDATE;

  IF NOT FOUND OR NOT cfg.enabled OR cfg.request_reservation_usd IS NULL THEN
    RETURN QUERY SELECT false, 'budget_guard_not_configured', NULL::numeric, NULL::numeric, COALESCE(cfg.daily_limit_usd, 10.000000);
    RETURN;
  END IF;

  IF cfg.kill_switch_enabled THEN
    RETURN QUERY SELECT false, 'global_kill_switch_enabled', cfg.request_reservation_usd, NULL::numeric, cfg.daily_limit_usd;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.hq_global_budget_reservations r
    WHERE r.reservation_id = p_reservation_id
  ) THEN
    RETURN QUERY SELECT false, 'duplicate_reservation_id', cfg.request_reservation_usd, NULL::numeric, cfg.daily_limit_usd;
    RETURN;
  END IF;

  INSERT INTO public.hq_global_budget_daily (budget_day, reserved_usd)
  VALUES (v_day, 0)
  ON CONFLICT (budget_day) DO NOTHING;

  SELECT d.reserved_usd INTO v_reserved
  FROM public.hq_global_budget_daily d
  WHERE d.budget_day = v_day
  FOR UPDATE;

  IF v_reserved + cfg.request_reservation_usd > cfg.daily_limit_usd THEN
    UPDATE public.hq_global_budget_config
      SET kill_switch_enabled = true, updated_at = now()
      WHERE singleton = true;
    RETURN QUERY SELECT false, 'global_daily_budget_exhausted', cfg.request_reservation_usd, v_reserved, cfg.daily_limit_usd;
    RETURN;
  END IF;

  UPDATE public.hq_global_budget_daily
    SET reserved_usd = reserved_usd + cfg.request_reservation_usd, updated_at = now()
    WHERE budget_day = v_day;

  INSERT INTO public.hq_global_budget_reservations (reservation_id, budget_day, user_id, reserved_usd)
  VALUES (p_reservation_id, v_day, p_user_id, cfg.request_reservation_usd);

  RETURN QUERY SELECT true, 'reserved', cfg.request_reservation_usd, v_reserved + cfg.request_reservation_usd, cfg.daily_limit_usd;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_hq_global_budget(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_hq_global_budget(uuid, uuid) TO service_role;

COMMENT ON TABLE public.hq_global_budget_config IS
  'Operator-controlled global reservation guard. Disabled by default; configure a safe per-request upper-bound reservation before enabling paid inference.';
COMMENT ON TABLE public.hq_global_budget_daily IS
  'UTC-day cumulative reserved inference budget. Reservations are deliberately not released on failures, so this is conservative rather than actual billed spend.';
COMMENT ON FUNCTION public.reserve_hq_global_budget(uuid, uuid) IS
  'Atomic, idempotency-keyed daily reservation. When the cap would be exceeded, turns on the persistent global kill switch and denies the request.';
