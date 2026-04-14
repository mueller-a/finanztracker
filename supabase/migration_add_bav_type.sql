-- ============================================================
-- InsureTrack – bAV Type Migration
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- The existing check constraint only allows ('insurance', 'avd', 'depot').
-- Drop it and recreate with 'bav' included.

ALTER TABLE public.etf_policen
  DROP CONSTRAINT IF EXISTS etf_policen_type_check;

ALTER TABLE public.etf_policen
  ADD CONSTRAINT etf_policen_type_check
  CHECK (type IN ('insurance', 'avd', 'depot', 'bav'));
