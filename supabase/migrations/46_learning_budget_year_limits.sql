-- ============================================================
-- Weiterbildungsbudget: Jahres-spezifische Limits
-- Stand: 2026-08-25
--
-- Ersetzt das globale user_module_settings.learning_budget_annual_limit
-- (galt für alle Jahre gleich) durch pro-Jahr-Werte. Damit wirken sich
-- Änderungen am aktuellen Jahr nie rückwirkend auf vergangene Jahre aus.
-- Zukünftige Jahre ohne eigenen Eintrag übernehmen im Frontend automatisch
-- den Wert des zuletzt gesetzten Vorjahres (Fallback-Suche rückwärts).
-- Siehe Skill "domain-weiterbildungsbudget".
-- ============================================================

-- 1. Tabelle: ein Limit-Eintrag pro User + Jahr
CREATE TABLE IF NOT EXISTS public.learning_budget_year_limits (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year         integer       NOT NULL,
  annual_limit numeric(10,2) NOT NULL CHECK (annual_limit >= 0),
  updated_at   timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (user_id, year)
);

-- 2. RLS — einfache user_id-Isolation
ALTER TABLE public.learning_budget_year_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS learning_budget_year_limits_select ON public.learning_budget_year_limits;
CREATE POLICY learning_budget_year_limits_select ON public.learning_budget_year_limits
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS learning_budget_year_limits_insert ON public.learning_budget_year_limits;
CREATE POLICY learning_budget_year_limits_insert ON public.learning_budget_year_limits
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS learning_budget_year_limits_update ON public.learning_budget_year_limits;
CREATE POLICY learning_budget_year_limits_update ON public.learning_budget_year_limits
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS learning_budget_year_limits_delete ON public.learning_budget_year_limits;
CREATE POLICY learning_budget_year_limits_delete ON public.learning_budget_year_limits
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 3. Globales Limit war noch ungenutzt (0 Items in learning_budget_items) →
--    sauber entfernen, ersetzt durch obige Jahres-Tabelle.
ALTER TABLE public.user_module_settings
  DROP COLUMN IF EXISTS learning_budget_annual_limit;
