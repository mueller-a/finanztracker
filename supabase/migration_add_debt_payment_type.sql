-- ============================================================
-- Finanztracker – Kredit-Buchungstypen: Tilgung vs. Entnahme
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================
--
-- Rahmenkredite (Revolving) können nicht nur getilgt, sondern auch weitere
-- Geldentnahmen haben. Bisher speichert `debt_payments` nur Tilgungen.
--
-- Erweiterung: Spalte `type` mit CHECK auf ('repayment','withdrawal').
--   repayment  → senkt den Saldo (bisherige Logik)
--   withdrawal → erhöht den Saldo (neu, nur für Rahmenkredite sinnvoll)
--
-- Bestehende Zeilen werden als 'repayment' gebackfillt.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS / UPDATE ... WHERE type IS NULL.
-- ============================================================

-- ── 1. Spalte + CHECK ─────────────────────────────────────────
ALTER TABLE public.debt_payments
  ADD COLUMN IF NOT EXISTS type text;

-- CHECK-Constraint idempotent neu aufbauen
ALTER TABLE public.debt_payments
  DROP CONSTRAINT IF EXISTS debt_payments_type_check;

ALTER TABLE public.debt_payments
  ADD CONSTRAINT debt_payments_type_check
  CHECK (type IN ('repayment', 'withdrawal'));

COMMENT ON COLUMN public.debt_payments.type
  IS 'Buchungstyp: repayment (Tilgung, senkt Saldo) oder withdrawal (Entnahme, erhöht Saldo). Withdrawals sind nur für Rahmenkredite sinnvoll.';

-- ── 2. Backfill: bestehende Einträge = repayment ──────────────
UPDATE public.debt_payments
SET type = 'repayment'
WHERE type IS NULL;

-- ── 3. NOT NULL + Default ─────────────────────────────────────
ALTER TABLE public.debt_payments
  ALTER COLUMN type SET DEFAULT 'repayment';

ALTER TABLE public.debt_payments
  ALTER COLUMN type SET NOT NULL;

-- ── 4. Index für typische Abfragen (Balance-Berechnung pro Kredit) ──
CREATE INDEX IF NOT EXISTS idx_debt_payments_debt_type
  ON public.debt_payments (debt_id, type);
