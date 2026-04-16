-- ============================================================
-- Haushaltsbuch (Wochen-Budget für Gemeinschaftskonto)
-- Stand: 2026-04-16
-- SKILL.md §558-578
-- ============================================================

-- 1. Tabelle für geteilte Haushaltstransaktionen
CREATE TABLE IF NOT EXISTS public.household_transactions (
  id            uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  uuid           NOT NULL,
  user_id       uuid           NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount        numeric(10,2)  NOT NULL CHECK (amount >= 0),
  type          text           NOT NULL CHECK (type IN ('expense','income')),
  category      text           NOT NULL,
  description   text,
  occurred_at   date           NOT NULL DEFAULT CURRENT_DATE,
  created_at    timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS household_transactions_hh_date_idx
  ON public.household_transactions (household_id, occurred_at DESC);

-- 2. household_id + Limits in user_module_settings
ALTER TABLE public.user_module_settings
  ADD COLUMN IF NOT EXISTS household_id             uuid,
  ADD COLUMN IF NOT EXISTS household_weekly_limit   numeric(10,2) DEFAULT 150,
  ADD COLUMN IF NOT EXISTS household_monthly_limit  numeric(10,2) DEFAULT 650;

-- 3. RLS — nur Nutzer mit passender household_id in user_module_settings sehen Zeilen
ALTER TABLE public.household_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS household_tx_select ON public.household_transactions;
CREATE POLICY household_tx_select ON public.household_transactions
  FOR SELECT TO authenticated
  USING (
    household_id IN (
      SELECT household_id FROM public.user_module_settings
       WHERE user_id = auth.uid() AND household_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS household_tx_insert ON public.household_transactions;
CREATE POLICY household_tx_insert ON public.household_transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND household_id IN (
      SELECT household_id FROM public.user_module_settings
       WHERE user_id = auth.uid() AND household_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS household_tx_update ON public.household_transactions;
CREATE POLICY household_tx_update ON public.household_transactions
  FOR UPDATE TO authenticated
  USING (
    household_id IN (
      SELECT household_id FROM public.user_module_settings
       WHERE user_id = auth.uid() AND household_id IS NOT NULL
    )
  )
  WITH CHECK (
    household_id IN (
      SELECT household_id FROM public.user_module_settings
       WHERE user_id = auth.uid() AND household_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS household_tx_delete ON public.household_transactions;
CREATE POLICY household_tx_delete ON public.household_transactions
  FOR DELETE TO authenticated
  USING (
    household_id IN (
      SELECT household_id FROM public.user_module_settings
       WHERE user_id = auth.uid() AND household_id IS NOT NULL
    )
  );

-- 4. RPC: Partner-User-Name via household_id (für Avatar-Anzeige, ohne auth.users-Zugriff)
CREATE OR REPLACE FUNCTION public.get_household_members(p_household_id uuid)
RETURNS TABLE (user_id uuid, email text, display_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.email, COALESCE(u.raw_user_meta_data->>'full_name', u.email)
    FROM public.user_module_settings s
    JOIN auth.users u ON u.id = s.user_id
   WHERE s.household_id = p_household_id
     AND p_household_id IN (
       SELECT household_id FROM public.user_module_settings
        WHERE user_id = auth.uid() AND household_id IS NOT NULL
     );
$$;

GRANT EXECUTE ON FUNCTION public.get_household_members(uuid) TO authenticated;
