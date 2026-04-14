-- ============================================================
-- Finanztracker – Splitted Consumption pro Arbeitspreis
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================
--
-- Stromrechnungen weisen den Verbrauch häufig getrennt nach
-- Preiszeiträumen aus (z.B. „01.01.–31.07. = 2.140 kWh @ 0,3199 €“,
-- „01.08.–31.12. = 1.310 kWh @ 0,2841 €“).
--
-- Damit Gesamtkosten korrekt als Σ(pᵢ·vᵢ) statt Σ(p̄·V_total) berechnet
-- werden können, bekommt jeder Arbeitspreis seine eigene Verbrauchsmenge.
--
-- Idempotent: IF NOT EXISTS.
-- ============================================================

ALTER TABLE public.billing_period_labor_prices
  ADD COLUMN IF NOT EXISTS consumption_kwh numeric(10,2);

COMMENT ON COLUMN public.billing_period_labor_prices.consumption_kwh
  IS 'Verbrauch in kWh, der diesem Arbeitspreis-Zeitraum zugeordnet ist. NULL = noch nicht erfasst (nutzt Fallback auf gewichteten Durchschnitt).';

-- Optional: Datenmigration für bestehende Perioden mit nur EINEM Preis-Eintrag.
-- Wenn eine Periode genau einen labor_price hat und in electricity_periods.verbrauch_kwh
-- ein Wert steht, übernehmen wir diesen als consumption_kwh des einzigen Preises.
UPDATE public.billing_period_labor_prices bp
SET consumption_kwh = ep.verbrauch_kwh
FROM public.electricity_periods ep
WHERE bp.billing_period_id = ep.id
  AND bp.consumption_kwh IS NULL
  AND ep.verbrauch_kwh IS NOT NULL
  AND ep.verbrauch_kwh > 0
  AND (
    SELECT COUNT(*) FROM public.billing_period_labor_prices x
    WHERE x.billing_period_id = ep.id
  ) = 1;
