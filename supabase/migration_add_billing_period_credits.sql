-- ============================================================
-- Finanztracker – Gutschriften & Boni pro Abrechnungsperiode
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================
--
-- Beispiele: Neukundenbonus, Treuebonus, Sofort-Bonus.
-- Diese Beträge MINDERN den Periodensaldo (= zusätzliches Guthaben),
-- beeinflussen aber NICHT die kWh-/Preis-Statistik.
--
-- Setup:
--   1. Tabelle billing_period_credits (FK → electricity_periods, ON DELETE CASCADE)
--   2. user_id wird per Trigger aus auth.uid() gesetzt (analog zu electricity_periods)
--   3. RLS: auth.uid() = user_id (granulare Policies, konsistent mit migration_rls_all_tables.sql)
--
-- Idempotent: IF NOT EXISTS / DROP POLICY IF EXISTS.
-- ============================================================

-- ── 1. Tabelle ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_period_credits (
  id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_period_id  uuid          NOT NULL REFERENCES public.electricity_periods(id) ON DELETE CASCADE,
  description        text          NOT NULL DEFAULT '',
  amount             numeric(8,2)  NOT NULL CHECK (amount >= 0),
  user_id            uuid          REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at         timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.billing_period_credits              IS 'Gutschriften & Boni (Neukunden-, Treue-, Sofortbonus) pro Abrechnungsperiode. Mindern den Saldo, beeinflussen aber NICHT die kWh-Statistik.';
COMMENT ON COLUMN public.billing_period_credits.description  IS 'Kurze Beschreibung (z.B. "Neukundenbonus").';
COMMENT ON COLUMN public.billing_period_credits.amount       IS 'Gutschriftsbetrag in € (immer positiv gespeichert; wirkt mindernd in der Berechnung).';

CREATE INDEX IF NOT EXISTS idx_bp_credits_period
  ON public.billing_period_credits (billing_period_id);

-- ── 2. Auto-Trigger für user_id ───────────────────────────────
-- public.set_user_id() existiert bereits aus migration_rls_all_tables.sql.
DROP TRIGGER IF EXISTS trg_set_user_id_bp_credits ON public.billing_period_credits;
CREATE TRIGGER trg_set_user_id_bp_credits
  BEFORE INSERT ON public.billing_period_credits
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

-- ── 3. RLS: auth.uid() = user_id ──────────────────────────────
ALTER TABLE public.billing_period_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon"               ON public.billing_period_credits;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.billing_period_credits;
DROP POLICY IF EXISTS "bp_credits_select"                ON public.billing_period_credits;
DROP POLICY IF EXISTS "bp_credits_insert"                ON public.billing_period_credits;
DROP POLICY IF EXISTS "bp_credits_update"                ON public.billing_period_credits;
DROP POLICY IF EXISTS "bp_credits_delete"                ON public.billing_period_credits;

CREATE POLICY "bp_credits_select" ON public.billing_period_credits
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "bp_credits_insert" ON public.billing_period_credits
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
  -- user_id IS NULL erlaubt Insert, weil der BEFORE-Trigger den Wert setzt.

CREATE POLICY "bp_credits_update" ON public.billing_period_credits
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "bp_credits_delete" ON public.billing_period_credits
  FOR DELETE USING (auth.uid() = user_id);
