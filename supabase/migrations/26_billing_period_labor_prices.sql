-- ============================================================
-- Finanztracker – Mehrere Arbeitspreise pro Abrechnungsperiode
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================
--
-- Siehe Skill "domain-strom" (Sektion "Erweiterte Preis-Logik"):
--   Ein Stromanbieter kann unterjährig den Arbeitspreis ändern.
--   Aus der 1:1-Beziehung Abrechnungsperiode ↔ Arbeitspreis wird
--   eine 1:N-Beziehung.
--
-- Änderungen:
-- 1. electricity_periods um period_start / period_end ergänzen
--    (für tageweise Gewichtung der Preis-Perioden).
-- 2. Neue Tabelle billing_period_labor_prices (FK → electricity_periods).
-- 3. Bestehenden Arbeitspreis als ersten Eintrag in die neue Tabelle migrieren.
-- 4. RLS-Policies konsistent mit electricity_periods ("Allow all for anon").
--
-- Idempotent: IF NOT EXISTS, ON CONFLICT, DROP POLICY IF EXISTS.
-- ============================================================

-- ── 1. electricity_periods: Start-/End-Datum ──────────────────
ALTER TABLE public.electricity_periods
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end   date;

COMMENT ON COLUMN public.electricity_periods.period_start
  IS 'Beginn der Abrechnungsperiode. Wird für tageweise Gewichtung der Arbeitspreise genutzt.';
COMMENT ON COLUMN public.electricity_periods.period_end
  IS 'Ende der Abrechnungsperiode (inklusive).';

-- ── 2. Neue Tabelle billing_period_labor_prices ───────────────
CREATE TABLE IF NOT EXISTS public.billing_period_labor_prices (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_period_id   uuid          NOT NULL REFERENCES public.electricity_periods(id) ON DELETE CASCADE,
  price_per_kwh       numeric(8,5)  NOT NULL,  -- €/kWh (z.B. 0.28410)
  valid_from          date          NOT NULL,
  created_at          timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.billing_period_labor_prices            IS 'N Arbeitspreise pro Abrechnungsperiode (unterjährige Preisänderungen).';
COMMENT ON COLUMN public.billing_period_labor_prices.price_per_kwh IS 'Arbeitspreis in €/kWh (z.B. 0.28410).';
COMMENT ON COLUMN public.billing_period_labor_prices.valid_from    IS 'Datum, ab dem dieser Preis gilt. Erster Preis = period_start.';

CREATE INDEX IF NOT EXISTS idx_bpl_prices_period
  ON public.billing_period_labor_prices (billing_period_id, valid_from);

-- RLS konsistent mit electricity_periods (bestehende Policy: "Allow all for anon")
ALTER TABLE public.billing_period_labor_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon" ON public.billing_period_labor_prices;

CREATE POLICY "Allow all for anon" ON public.billing_period_labor_prices
  FOR ALL USING (true) WITH CHECK (true);

-- ── 3. Daten-Migration: bestehende arbeitspreis-Werte als ersten Eintrag ───
-- Für jede Periode, die noch keinen Labor-Price hat und einen arbeitspreis > 0,
-- legen wir einen Eintrag mit valid_from = period_start oder abgeleitet aus
-- `period` (Format "YYYY" oder "YYYY/YYYY") an.
INSERT INTO public.billing_period_labor_prices (billing_period_id, price_per_kwh, valid_from)
SELECT
  ep.id,
  ep.arbeitspreis,
  COALESCE(
    ep.period_start,
    -- Ableitung aus dem period-String: "2024" → 2024-01-01, "2022/2023" → 2022-01-01
    (split_part(ep.period, '/', 1) || '-01-01')::date
  )
FROM public.electricity_periods ep
WHERE ep.arbeitspreis IS NOT NULL
  AND ep.arbeitspreis > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.billing_period_labor_prices bp
    WHERE bp.billing_period_id = ep.id
  );
