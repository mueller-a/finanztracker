-- ============================================================
-- Weiterbildungsbudget (jährliches Personal-Development-Budget)
-- Stand: 2026-08-25
-- Siehe Skill "domain-weiterbildungsbudget".
-- ============================================================

-- 1. Tabelle für einzelne Ausgaben-Einträge
CREATE TABLE IF NOT EXISTS public.learning_budget_items (
  id            uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid           NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount        numeric(10,2)  NOT NULL CHECK (amount >= 0),
  category      text           NOT NULL CHECK (category IN ('fachbuch','konferenz','training','sonstiges')),
  description   text,
  occurred_at   date           NOT NULL DEFAULT CURRENT_DATE,
  created_at    timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS learning_budget_items_user_date_idx
  ON public.learning_budget_items (user_id, occurred_at DESC);

-- 2. Sidebar-Präferenz + editierbares Jahreslimit in user_module_settings
ALTER TABLE public.user_module_settings
  ADD COLUMN IF NOT EXISTS show_learning_budget          boolean       DEFAULT true,
  ADD COLUMN IF NOT EXISTS learning_budget_annual_limit   numeric(10,2) DEFAULT 1200;

-- 3. RLS — einfache user_id-Isolation, kein Household-Sharing nötig
ALTER TABLE public.learning_budget_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS learning_budget_items_select ON public.learning_budget_items;
CREATE POLICY learning_budget_items_select ON public.learning_budget_items
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS learning_budget_items_insert ON public.learning_budget_items;
CREATE POLICY learning_budget_items_insert ON public.learning_budget_items
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS learning_budget_items_update ON public.learning_budget_items;
CREATE POLICY learning_budget_items_update ON public.learning_budget_items
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS learning_budget_items_delete ON public.learning_budget_items;
CREATE POLICY learning_budget_items_delete ON public.learning_budget_items
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 4. App-Modul-Eintrag, damit der Admin das Feature global verbergen kann
INSERT INTO public.app_modules (module_key, label, sort_order, is_active)
VALUES ('learning_budget', 'Weiterbildungsbudget', 66, true)
ON CONFLICT (module_key) DO UPDATE
  SET label      = EXCLUDED.label,
      sort_order = EXCLUDED.sort_order;
