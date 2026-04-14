-- ============================================================
-- Finanztracker – Arbeitspreis auf 6 Nachkommastellen erweitern
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================
--
-- Bisher: numeric(8,5) → max 5 Nachkommastellen (z.B. 0,28410).
-- Neu:    numeric(10,6) → 6 Nachkommastellen (z.B. 0,284100 bzw. 0,123456).
--
-- Idempotent: ALTER TABLE … TYPE ist bei gleichbleibender Zielgröße ein No-op
-- (PostgreSQL rechnet nur um, verliert keine Daten — 5 Nachkommastellen ⊂ 6).
-- ============================================================

ALTER TABLE public.billing_period_labor_prices
  ALTER COLUMN price_per_kwh TYPE numeric(10,6);

COMMENT ON COLUMN public.billing_period_labor_prices.price_per_kwh
  IS 'Arbeitspreis in €/kWh mit bis zu 6 Nachkommastellen (z.B. 0,284100).';
