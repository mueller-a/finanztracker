-- ============================================================
-- Finanztracker – Außerordentliche Gebühren pro Abrechnungsperiode
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================
--
-- Beispiele: Mahngebühr, Rücklastschriftgebühr, Sperrgebühr.
-- Diese Kosten beeinflussen den Periodensaldo (Guthaben/Nachzahlung),
-- aber NICHT die kWh-Statistik (gewichteter Arbeitspreis bleibt unverändert).
--
-- Setup:
--   1. Tabelle billing_period_extra_costs (FK → electricity_periods, ON DELETE CASCADE)
--   2. user_id wird per Trigger aus auth.uid() gesetzt (analog zu electricity_periods)
--   3. RLS: auth.uid() = user_id (granulare Policies, konsistent mit migration_rls_all_tables.sql)
--
-- Idempotent: IF NOT EXISTS / DROP POLICY IF EXISTS.
-- ============================================================

-- ── 1. Tabelle ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_period_extra_costs (
  id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_period_id  uuid          NOT NULL REFERENCES public.electricity_periods(id) ON DELETE CASCADE,
  description        text          NOT NULL DEFAULT '',
  amount             numeric(8,2)  NOT NULL CHECK (amount >= 0),
  user_id            uuid          REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at         timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.billing_period_extra_costs              IS 'Außerordentliche Gebühren (Mahn-, Rücklastschrift-, Sperrgebühren) pro Abrechnungsperiode. Beeinflussen den Saldo, aber NICHT die kWh-Statistik.';
COMMENT ON COLUMN public.billing_period_extra_costs.description  IS 'Kurze Beschreibung der Gebühr (z.B. "Mahngebühr 10/2024").';
COMMENT ON COLUMN public.billing_period_extra_costs.amount       IS 'Gebührenbetrag in € (immer ≥ 0; Vorzeichen hängt davon ab, ob Gutschrift oder Belastung — hier ausschließlich Belastung).';

CREATE INDEX IF NOT EXISTS idx_bp_extra_costs_period
  ON public.billing_period_extra_costs (billing_period_id);

-- ── 2. Auto-Trigger für user_id ───────────────────────────────
-- public.set_user_id() existiert bereits aus migration_rls_all_tables.sql.
DROP TRIGGER IF EXISTS trg_set_user_id_bp_extra_costs ON public.billing_period_extra_costs;
CREATE TRIGGER trg_set_user_id_bp_extra_costs
  BEFORE INSERT ON public.billing_period_extra_costs
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

-- ── 3. RLS: auth.uid() = user_id ──────────────────────────────
ALTER TABLE public.billing_period_extra_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon"               ON public.billing_period_extra_costs;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.billing_period_extra_costs;
DROP POLICY IF EXISTS "bp_extra_costs_select"            ON public.billing_period_extra_costs;
DROP POLICY IF EXISTS "bp_extra_costs_insert"            ON public.billing_period_extra_costs;
DROP POLICY IF EXISTS "bp_extra_costs_update"            ON public.billing_period_extra_costs;
DROP POLICY IF EXISTS "bp_extra_costs_delete"            ON public.billing_period_extra_costs;

CREATE POLICY "bp_extra_costs_select" ON public.billing_period_extra_costs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "bp_extra_costs_insert" ON public.billing_period_extra_costs
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
  -- user_id IS NULL erlaubt Insert, weil der BEFORE-Trigger den Wert setzt.

CREATE POLICY "bp_extra_costs_update" ON public.billing_period_extra_costs
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "bp_extra_costs_delete" ON public.billing_period_extra_costs
  FOR DELETE USING (auth.uid() = user_id);
