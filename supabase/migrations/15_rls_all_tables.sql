-- ============================================================
-- InsureTrack – Row Level Security für ALLE Tabellen
-- Run in: Supabase Dashboard → SQL Editor
--
-- Was passiert:
--   1. Trigger-Funktion: auto-fills user_id bei INSERT (kein Code-Umbau nötig)
--   2. user_id Spalte wird hinzugefügt (falls fehlend)
--   3. Bestehende Daten werden dem ersten User zugewiesen
--   4. user_id wird NOT NULL gesetzt
--   5. Alte "Allow all" Policies werden entfernt
--   6. Vier granulare Policies pro Tabelle (SELECT/INSERT/UPDATE/DELETE)
--
-- WICHTIG: Vor Ausführung prüfen, ob nur EIN User existiert.
--          Bei mehreren Usern → Schritt 3 manuell anpassen.
-- ============================================================

-- ╔═══════════════════════════════════════════════════════════╗
-- ║  PHASE 0: Trigger-Funktion für auto user_id bei INSERT   ║
-- ╚═══════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.set_user_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ╔═══════════════════════════════════════════════════════════╗
-- ║  PHASE 1: user_id Spalte hinzufügen (falls fehlend)      ║
-- ╚═══════════════════════════════════════════════════════════╝

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.insurance_entries
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.electricity_readings
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.electricity_tariffs
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.electricity_periods
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.savings_goals
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.savings_entries
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.debts
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.debt_payments
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.custom_budget_items
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;


-- ╔═══════════════════════════════════════════════════════════╗
-- ║  PHASE 2: Bestehende Daten dem ersten User zuweisen       ║
-- ║  (Single-User → Multi-User Transition)                    ║
-- ╚═══════════════════════════════════════════════════════════╝

-- Ermittelt den ersten registrierten User und setzt alle NULL-user_ids.
-- Falls mehrere User existieren: diesen Block manuell anpassen!

DO $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM auth.users ORDER BY created_at LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Kein User gefunden — Backfill übersprungen.';
    RETURN;
  END IF;

  RAISE NOTICE 'Backfill: Setze user_id = % für alle Zeilen ohne user_id', v_user_id;

  UPDATE public.categories           SET user_id = v_user_id WHERE user_id IS NULL;
  UPDATE public.insurance_entries   SET user_id = v_user_id WHERE user_id IS NULL;
  UPDATE public.electricity_readings SET user_id = v_user_id WHERE user_id IS NULL;
  UPDATE public.electricity_tariffs  SET user_id = v_user_id WHERE user_id IS NULL;
  UPDATE public.electricity_periods  SET user_id = v_user_id WHERE user_id IS NULL;
  UPDATE public.savings_goals        SET user_id = v_user_id WHERE user_id IS NULL;
  UPDATE public.savings_entries      SET user_id = v_user_id WHERE user_id IS NULL;
  UPDATE public.debts                SET user_id = v_user_id WHERE user_id IS NULL;
  UPDATE public.debt_payments        SET user_id = v_user_id WHERE user_id IS NULL;
  UPDATE public.custom_budget_items  SET user_id = v_user_id WHERE user_id IS NULL;
END $$;


-- ╔═══════════════════════════════════════════════════════════╗
-- ║  PHASE 3: user_id NOT NULL setzen                         ║
-- ╚═══════════════════════════════════════════════════════════╝

ALTER TABLE public.categories           ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.insurance_entries   ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.electricity_readings ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.electricity_tariffs  ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.electricity_periods  ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.savings_goals        ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.savings_entries      ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.debts                ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.debt_payments        ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.custom_budget_items  ALTER COLUMN user_id SET NOT NULL;


-- ╔═══════════════════════════════════════════════════════════╗
-- ║  PHASE 4: Auto-Trigger für user_id bei INSERT             ║
-- ║  (bestehender App-Code braucht KEINE Änderung)            ║
-- ╚═══════════════════════════════════════════════════════════╝

CREATE TRIGGER trg_set_user_id_categories
  BEFORE INSERT ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

CREATE TRIGGER trg_set_user_id_insurance_entries
  BEFORE INSERT ON public.insurance_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

CREATE TRIGGER trg_set_user_id_electricity_readings
  BEFORE INSERT ON public.electricity_readings
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

CREATE TRIGGER trg_set_user_id_electricity_tariffs
  BEFORE INSERT ON public.electricity_tariffs
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

CREATE TRIGGER trg_set_user_id_electricity_periods
  BEFORE INSERT ON public.electricity_periods
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

CREATE TRIGGER trg_set_user_id_savings_goals
  BEFORE INSERT ON public.savings_goals
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

CREATE TRIGGER trg_set_user_id_savings_entries
  BEFORE INSERT ON public.savings_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

CREATE TRIGGER trg_set_user_id_debts
  BEFORE INSERT ON public.debts
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

CREATE TRIGGER trg_set_user_id_debt_payments
  BEFORE INSERT ON public.debt_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

CREATE TRIGGER trg_set_user_id_custom_budget_items
  BEFORE INSERT ON public.custom_budget_items
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();


-- ╔═══════════════════════════════════════════════════════════╗
-- ║  PHASE 5: Alte permissive Policies entfernen              ║
-- ╚═══════════════════════════════════════════════════════════╝

-- Beide möglichen Policy-Namen droppen (schema.sql vs. migration)
-- Jede Tabelle kann "Allow all for anon" ODER "Allow all for authenticated users" haben.

DROP POLICY IF EXISTS "Allow all for anon" ON public.categories;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.categories;

-- UNIQUE constraint: name → (user_id, name) damit mehrere User gleiche Kategorienamen haben können
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_name_key;
ALTER TABLE public.categories ADD CONSTRAINT categories_user_name_unique UNIQUE (user_id, name);

DROP POLICY IF EXISTS "Allow all for anon" ON public.insurance_entries;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.insurance_entries;

DROP POLICY IF EXISTS "Allow all for anon" ON public.electricity_readings;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.electricity_readings;

DROP POLICY IF EXISTS "Allow all for anon" ON public.electricity_tariffs;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.electricity_tariffs;

DROP POLICY IF EXISTS "Allow all for anon" ON public.electricity_periods;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.electricity_periods;

DROP POLICY IF EXISTS "Allow all for anon" ON public.savings_goals;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.savings_goals;

DROP POLICY IF EXISTS "Allow all for anon" ON public.savings_entries;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.savings_entries;

DROP POLICY IF EXISTS "Allow all for anon" ON public.debts;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.debts;

DROP POLICY IF EXISTS "Allow all for anon" ON public.debt_payments;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.debt_payments;

DROP POLICY IF EXISTS "Allow all for anon" ON public.custom_budget_items;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.custom_budget_items;


-- ╔═══════════════════════════════════════════════════════════╗
-- ║  PHASE 6: RLS aktivieren + granulare Policies erstellen   ║
-- ╚═══════════════════════════════════════════════════════════╝

-- ── categories ────────────────────────────────────────────────

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_select" ON public.categories
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "categories_insert" ON public.categories
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "categories_update" ON public.categories
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "categories_delete" ON public.categories
  FOR DELETE USING (auth.uid() = user_id);

-- ── insurance_entries ─────────────────────────────────────────

ALTER TABLE public.insurance_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "insurance_entries_select" ON public.insurance_entries
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insurance_entries_insert" ON public.insurance_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "insurance_entries_update" ON public.insurance_entries
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "insurance_entries_delete" ON public.insurance_entries
  FOR DELETE USING (auth.uid() = user_id);

-- ── electricity_readings ──────────────────────────────────────

ALTER TABLE public.electricity_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "electricity_readings_select" ON public.electricity_readings
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "electricity_readings_insert" ON public.electricity_readings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "electricity_readings_update" ON public.electricity_readings
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "electricity_readings_delete" ON public.electricity_readings
  FOR DELETE USING (auth.uid() = user_id);

-- ── electricity_tariffs ───────────────────────────────────────

ALTER TABLE public.electricity_tariffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "electricity_tariffs_select" ON public.electricity_tariffs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "electricity_tariffs_insert" ON public.electricity_tariffs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "electricity_tariffs_update" ON public.electricity_tariffs
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "electricity_tariffs_delete" ON public.electricity_tariffs
  FOR DELETE USING (auth.uid() = user_id);

-- ── electricity_periods ───────────────────────────────────────

ALTER TABLE public.electricity_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "electricity_periods_select" ON public.electricity_periods
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "electricity_periods_insert" ON public.electricity_periods
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "electricity_periods_update" ON public.electricity_periods
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "electricity_periods_delete" ON public.electricity_periods
  FOR DELETE USING (auth.uid() = user_id);

-- ── savings_goals ─────────────────────────────────────────────

ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "savings_goals_select" ON public.savings_goals
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "savings_goals_insert" ON public.savings_goals
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "savings_goals_update" ON public.savings_goals
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "savings_goals_delete" ON public.savings_goals
  FOR DELETE USING (auth.uid() = user_id);

-- ── savings_entries ───────────────────────────────────────────

ALTER TABLE public.savings_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "savings_entries_select" ON public.savings_entries
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "savings_entries_insert" ON public.savings_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "savings_entries_update" ON public.savings_entries
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "savings_entries_delete" ON public.savings_entries
  FOR DELETE USING (auth.uid() = user_id);

-- ── debts ─────────────────────────────────────────────────────

ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "debts_select" ON public.debts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "debts_insert" ON public.debts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "debts_update" ON public.debts
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "debts_delete" ON public.debts
  FOR DELETE USING (auth.uid() = user_id);

-- ── debt_payments ─────────────────────────────────────────────

ALTER TABLE public.debt_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "debt_payments_select" ON public.debt_payments
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "debt_payments_insert" ON public.debt_payments
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "debt_payments_update" ON public.debt_payments
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "debt_payments_delete" ON public.debt_payments
  FOR DELETE USING (auth.uid() = user_id);

-- ── custom_budget_items ───────────────────────────────────────

ALTER TABLE public.custom_budget_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "custom_budget_items_select" ON public.custom_budget_items
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "custom_budget_items_insert" ON public.custom_budget_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "custom_budget_items_update" ON public.custom_budget_items
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "custom_budget_items_delete" ON public.custom_budget_items
  FOR DELETE USING (auth.uid() = user_id);


-- ╔═══════════════════════════════════════════════════════════╗
-- ║  ZUSAMMENFASSUNG                                          ║
-- ╚═══════════════════════════════════════════════════════════╝
--
--  Tabellen mit user_id + granularen Policies (10 migriert):
--    categories, insurance_entries, electricity_readings,
--    electricity_tariffs, electricity_periods, savings_goals,
--    savings_entries, debts, debt_payments, custom_budget_items
--
--  Tabellen bereits gesichert (4 unverändert):
--    etf_policen, pkv_configs, insurance_providers, salary_settings
--
--  Constraint-Änderung:
--    categories: UNIQUE(name) → UNIQUE(user_id, name)
--
--  Auto-Trigger:
--    set_user_id() füllt user_id automatisch bei INSERT,
--    bestehender App-Code muss NICHT angepasst werden.
--
-- ============================================================
