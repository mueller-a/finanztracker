-- ============================================================
-- Finanztracker – Variable monatliche Abschläge pro Tarif
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================
--
-- Bisher: electricity_tariffs.monthly_advance (statisch, ein Wert pro Tarif).
-- Neu:    Mehrere Abschlags-Werte mit gestaffeltem Beginn (z.B. Jan-Apr 100 €,
--         ab Mai 110 €). Die alte Spalte bleibt als Backward-Compat (= aktueller
--         oder letzter bekannter Wert) erhalten.
--
-- Idempotent: IF NOT EXISTS / ON CONFLICT / DROP POLICY IF EXISTS.
-- ============================================================

-- ── 1. Tabelle ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tariff_installments (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  tariff_id   uuid          NOT NULL REFERENCES public.electricity_tariffs(id) ON DELETE CASCADE,
  amount      numeric(8,2)  NOT NULL CHECK (amount >= 0),
  valid_from  date          NOT NULL,
  created_at  timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.tariff_installments            IS 'Variable monatliche Abschläge pro Tarif. Pro Tarif beliebig viele Einträge mit gestaffeltem valid_from.';
COMMENT ON COLUMN public.tariff_installments.amount     IS 'Abschlagshöhe in € pro Monat (gilt ab valid_from bis zum nächsten Eintrag).';
COMMENT ON COLUMN public.tariff_installments.valid_from IS 'Datum, ab dem dieser Abschlag gilt. Erster Eintrag = Tarifbeginn.';

CREATE INDEX IF NOT EXISTS idx_tariff_installments_tariff_from
  ON public.tariff_installments (tariff_id, valid_from);

-- ── 2. RLS konsistent mit electricity_tariffs ──────────────────
ALTER TABLE public.tariff_installments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon" ON public.tariff_installments;

CREATE POLICY "Allow all for anon" ON public.tariff_installments
  FOR ALL USING (true) WITH CHECK (true);

-- ── 3. Datenmigration: bestehende monthly_advance als 1. Eintrag übernehmen ──
-- Für jeden Tarif, der noch keinen Installment-Eintrag hat und einen
-- monthly_advance > 0, legen wir einen Eintrag mit valid_from = tariff.valid_from an.
INSERT INTO public.tariff_installments (tariff_id, amount, valid_from)
SELECT
  t.id,
  t.monthly_advance,
  t.valid_from
FROM public.electricity_tariffs t
WHERE t.monthly_advance IS NOT NULL
  AND t.monthly_advance > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.tariff_installments i
    WHERE i.tariff_id = t.id
  );
