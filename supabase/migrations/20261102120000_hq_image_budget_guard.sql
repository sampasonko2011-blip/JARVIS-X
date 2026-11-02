-- Separate, explicit budget gate for Nano Banana image generation.
-- Disabled by default. No image generation is possible until an operator
-- configures a daily ceiling and explicitly enables this guard.
CREATE TABLE IF NOT EXISTS public.hq_image_budget_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  kill_switch_enabled boolean NOT NULL DEFAULT false,
  account_owner_approved boolean NOT NULL DEFAULT false,
  account_owner_approved_at timestamptz,
  pricing_reviewed_at timestamptz,
  pricing_reference text,
  daily_limit_usd numeric(12,6) NOT NULL DEFAULT 0 CHECK (daily_limit_usd >= 0),
  per_image_reservation_usd numeric(12,6) NOT NULL DEFAULT 0.033600 CHECK (per_image_reservation_usd > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.hq_image_budget_config (singleton, enabled, kill_switch_enabled, daily_limit_usd, per_image_reservation_usd)
VALUES (true, false, false, 0, 0.033600)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.hq_image_budget_daily (
  budget_day date PRIMARY KEY,
  reserved_usd numeric(12,6) NOT NULL DEFAULT 0 CHECK (reserved_usd >= 0),
  reserved_images integer NOT NULL DEFAULT 0 CHECK (reserved_images >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hq_image_budget_reservations (
  reservation_id uuid PRIMARY KEY,
  budget_day date NOT NULL,
  user_id uuid NOT NULL,
  reserved_usd numeric(12,6) NOT NULL CHECK (reserved_usd > 0),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'completed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hq_image_budget_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hq_image_budget_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hq_image_budget_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.hq_image_budget_config FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.hq_image_budget_daily FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.hq_image_budget_reservations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.hq_image_budget_config TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.hq_image_budget_daily TO service_role;
GRANT SELECT, INSERT ON TABLE public.hq_image_budget_reservations TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_hq_image_budget(p_reservation_id uuid, p_user_id uuid)
RETURNS TABLE (allowed boolean, reason text, reserved_usd numeric, reserved_today_usd numeric, daily_limit_usd numeric)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  cfg public.hq_image_budget_config%ROWTYPE;
  v_day date := (now() AT TIME ZONE 'UTC')::date;
  v_reserved numeric(12,6);
BEGIN
  IF p_reservation_id IS NULL OR p_user_id IS NULL THEN
    RETURN QUERY SELECT false, 'invalid_reservation_identity', NULL::numeric, NULL::numeric, 0::numeric;
    RETURN;
  END IF;

  SELECT * INTO cfg FROM public.hq_image_budget_config WHERE singleton = true FOR UPDATE;
  IF NOT FOUND OR NOT cfg.enabled THEN
    RETURN QUERY SELECT false, 'image_budget_disabled', NULL::numeric, NULL::numeric, COALESCE(cfg.daily_limit_usd, 0);
    RETURN;
  END IF;
  IF NOT cfg.account_owner_approved OR cfg.account_owner_approved_at IS NULL THEN
    RETURN QUERY SELECT false, 'account_owner_approval_required', cfg.per_image_reservation_usd, NULL::numeric, cfg.daily_limit_usd;
    RETURN;
  END IF;
  IF cfg.pricing_reviewed_at IS NULL OR cfg.pricing_reviewed_at < now() - interval '30 days' OR cfg.pricing_reference IS NULL OR length(trim(cfg.pricing_reference)) = 0 THEN
    RETURN QUERY SELECT false, 'image_pricing_review_required', cfg.per_image_reservation_usd, NULL::numeric, cfg.daily_limit_usd;
    RETURN;
  END IF;
  IF cfg.kill_switch_enabled THEN
    RETURN QUERY SELECT false, 'image_budget_kill_switch_enabled', cfg.per_image_reservation_usd, NULL::numeric, cfg.daily_limit_usd;
    RETURN;
  END IF;
  IF cfg.daily_limit_usd <= 0 OR cfg.per_image_reservation_usd <= 0 THEN
    RETURN QUERY SELECT false, 'image_budget_not_configured', cfg.per_image_reservation_usd, NULL::numeric, cfg.daily_limit_usd;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.hq_image_budget_reservations r WHERE r.reservation_id = p_reservation_id) THEN
    RETURN QUERY SELECT false, 'duplicate_image_reservation_id', cfg.per_image_reservation_usd, NULL::numeric, cfg.daily_limit_usd;
    RETURN;
  END IF;

  INSERT INTO public.hq_image_budget_daily (budget_day, reserved_usd, reserved_images)
  VALUES (v_day, 0, 0)
  ON CONFLICT (budget_day) DO NOTHING;

  SELECT d.reserved_usd INTO v_reserved
  FROM public.hq_image_budget_daily d
  WHERE d.budget_day = v_day
  FOR UPDATE;

  IF v_reserved + cfg.per_image_reservation_usd > cfg.daily_limit_usd THEN
    UPDATE public.hq_image_budget_config SET kill_switch_enabled = true, updated_at = now() WHERE singleton = true;
    RETURN QUERY SELECT false, 'image_daily_budget_exhausted', cfg.per_image_reservation_usd, v_reserved, cfg.daily_limit_usd;
    RETURN;
  END IF;

  UPDATE public.hq_image_budget_daily
    SET reserved_usd = reserved_usd + cfg.per_image_reservation_usd,
        reserved_images = reserved_images + 1,
        updated_at = now()
    WHERE budget_day = v_day;

  INSERT INTO public.hq_image_budget_reservations (reservation_id, budget_day, user_id, reserved_usd)
  VALUES (p_reservation_id, v_day, p_user_id, cfg.per_image_reservation_usd);

  RETURN QUERY SELECT true, 'reserved', cfg.per_image_reservation_usd,
    v_reserved + cfg.per_image_reservation_usd, cfg.daily_limit_usd;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_hq_image_budget(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_hq_image_budget(uuid, uuid) TO service_role;

COMMENT ON TABLE public.hq_image_budget_config IS
  'Separate operator-controlled Nano Banana budget. Disabled with a zero daily limit by default.';
COMMENT ON TABLE public.hq_image_budget_daily IS
  'UTC-day cumulative image generation reservations; failed requests are not automatically refunded.';
COMMENT ON FUNCTION public.reserve_hq_image_budget(uuid, uuid) IS
  'Atomically reserve one image-generation ceiling before calling Nano Banana. Service-role only.';
