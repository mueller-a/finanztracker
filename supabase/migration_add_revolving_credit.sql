-- ─────────────────────────────────────────────────────────────────────────────
--  MIGRATION: Rahmenkredit (Revolving Credit) Support
--  Run once in Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add debt_type column (default = 'annuity' to keep existing rows unchanged)
ALTER TABLE public.debts
  ADD COLUMN IF NOT EXISTS debt_type TEXT DEFAULT 'annuity'
    CHECK (debt_type IN ('annuity', 'revolving'));

-- 2. Add credit_limit column (Kreditrahmen) — only used for revolving debts
ALTER TABLE public.debts
  ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(12,2) DEFAULT NULL;

-- 3. Backfill: set all existing debts to 'annuity' (already the default, just explicit)
UPDATE public.debts
SET debt_type = 'annuity'
WHERE debt_type IS NULL;

-- 4. Optional index for filtering by type
CREATE INDEX IF NOT EXISTS idx_debts_type ON public.debts (debt_type);
