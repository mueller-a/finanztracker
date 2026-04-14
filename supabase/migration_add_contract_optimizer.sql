-- ============================================================
-- InsureTrack – Contract Optimizer Fields
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── insurance_entries ─────────────────────────────────────────
ALTER TABLE public.insurance_entries
  ADD COLUMN IF NOT EXISTS notice_period_months integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS contract_end_date date,
  ADD COLUMN IF NOT EXISTS is_cancelled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancellation_date date,
  ADD COLUMN IF NOT EXISTS optimizer_note text;

-- ── electricity_tariffs ───────────────────────────────────────
ALTER TABLE public.electricity_tariffs
  ADD COLUMN IF NOT EXISTS notice_period_months integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS contract_end_date date,
  ADD COLUMN IF NOT EXISTS is_cancelled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancellation_date date,
  ADD COLUMN IF NOT EXISTS optimizer_note text;
