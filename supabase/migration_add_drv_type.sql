-- ============================================================
-- InsureTrack – DRV Type Migration
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Extend the type check constraint to include 'drv' (Gesetzliche Rente).
-- Note: run migration_add_bav_type.sql first if not already done.

ALTER TABLE public.etf_policen
  DROP CONSTRAINT IF EXISTS etf_policen_type_check;

ALTER TABLE public.etf_policen
  ADD CONSTRAINT etf_policen_type_check
  CHECK (type IN ('insurance', 'avd', 'depot', 'bav', 'drv'));

-- Note: payout_strategy and rentenfaktor are stored inside the params JSONB column.
-- No separate columns needed.
