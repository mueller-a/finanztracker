-- ============================================================
-- Finanztracker – Gehaltshistorie & Prognose
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================
--
-- Speichert pro Nutzer und Jahr ein Brutto-/Netto-Snapshot.
-- `is_projection = true` markiert berechnete Prognose-Werte
-- (im UI kursiv/andere Farbe dargestellt).
--
-- Siehe Skill "domain-gehalt" (Sektion "Gehaltshistorie & -prognose").
--
-- Idempotent: IF NOT EXISTS / DROP POLICY IF EXISTS.
-- ============================================================

-- ── 1. Tabelle ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.salary_history (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid          REFERENCES auth.users(id) ON DELETE CASCADE,
  year           integer       NOT NULL CHECK (year BETWEEN 1990 AND 2100),
  annual_gross   numeric(12,2) NOT NULL CHECK (annual_gross >= 0),
  net_monthly    numeric(12,2),
  is_projection  boolean       NOT NULL DEFAULT false,
  created_at     timestamptz   NOT NULL DEFAULT now(),
  updated_at     timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT salary_history_user_year_unique UNIQUE (user_id, year)
);

COMMENT ON TABLE  public.salary_history             IS 'Pro User & Jahr ein Brutto-Eintrag (real oder Prognose). Steigerung wird im Frontend aus den Vorjahreswerten berechnet.';
COMMENT ON COLUMN public.salary_history.annual_gross IS 'Bruttoeinkommen p.a. in € (Pflichtfeld).';
COMMENT ON COLUMN public.salary_history.net_monthly  IS 'Netto/Monat in € — optional manuell oder per Schätzung gefüllt.';
COMMENT ON COLUMN public.salary_history.is_projection IS 'true = vom Prognose-Modus generiert, false = vom Nutzer real eingetragen.';

CREATE INDEX IF NOT EXISTS idx_salary_history_user_year
  ON public.salary_history (user_id, year);

-- ── 2. Auto-Trigger user_id ───────────────────────────────────
DROP TRIGGER IF EXISTS trg_set_user_id_salary_history ON public.salary_history;
CREATE TRIGGER trg_set_user_id_salary_history
  BEFORE INSERT ON public.salary_history
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

-- ── 3. RLS: auth.uid() = user_id ──────────────────────────────
ALTER TABLE public.salary_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "salary_history_select" ON public.salary_history;
DROP POLICY IF EXISTS "salary_history_insert" ON public.salary_history;
DROP POLICY IF EXISTS "salary_history_update" ON public.salary_history;
DROP POLICY IF EXISTS "salary_history_delete" ON public.salary_history;

CREATE POLICY "salary_history_select" ON public.salary_history
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "salary_history_insert" ON public.salary_history
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "salary_history_update" ON public.salary_history
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "salary_history_delete" ON public.salary_history
  FOR DELETE USING (auth.uid() = user_id);
