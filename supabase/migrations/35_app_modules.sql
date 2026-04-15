-- ============================================================
-- Finanztracker – Global Feature-Toggles (Admin-gesteuert)
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================
--
-- Tabelle `app_modules` steuert Module global für alle Nutzer
-- (z. B. wenn ein Modul in Entwicklung ist oder temporär deaktiviert wird).
--
-- Unterschied zu `user_module_settings.show_*`:
--   - app_modules        = Admin-Entscheidung, gilt für ALLE Nutzer.
--   - user_module_settings.show_* = persönliche Sidebar-Präferenz des Users.
--
-- Ein Modul ist nur "effektiv aktiv", wenn BEIDE ja sagen.
--
-- Idempotent: IF NOT EXISTS / DROP POLICY IF EXISTS / ON CONFLICT.
-- ============================================================

-- ── 1. Tabelle ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_modules (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key  text        NOT NULL UNIQUE,
  label       text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.app_modules            IS 'Globale Feature-Toggles. Nur Admins dürfen schreiben, alle authentifizierten User dürfen lesen.';
COMMENT ON COLUMN public.app_modules.module_key IS 'Stabiler technischer Schlüssel (z. B. "electricity", "pkv", "retirement"). Wird im Frontend referenziert.';
COMMENT ON COLUMN public.app_modules.is_active  IS 'true = Modul app-weit aktiv. false = für ALLE Nutzer ausgeblendet/unzugänglich.';

CREATE INDEX IF NOT EXISTS idx_app_modules_key ON public.app_modules (module_key);

-- ── 2. Initiale Modul-Liste ───────────────────────────────────
-- ON CONFLICT: bei bereits vorhandenen Einträgen nur `label`/`sort_order`
-- aktualisieren, niemals `is_active` überschreiben (Admin-Entscheidungen
-- bleiben erhalten).
INSERT INTO public.app_modules (module_key, label, sort_order, is_active) VALUES
  ('dashboard',   'Dashboard',              0,  true),
  ('insurance',   'Versicherungen',         10, true),
  ('electricity', 'Strom',                  20, true),
  ('savings',     'Guthaben & Sparziele',   30, true),
  ('real_estate', 'Immobilien',             40, true),
  ('debts',       'Verbindlichkeiten',      50, true),
  ('budget',      'Budget',                 60, true),
  ('salary',      'Gehaltsrechner',         70, true),
  ('pkv',         'PKV-Rechner',            80, true),
  ('retirement',  'Ruhestandsplanung',      90, true),
  ('optimizer',   'Spar-Radar',             100, true)
ON CONFLICT (module_key) DO UPDATE
  SET label      = EXCLUDED.label,
      sort_order = EXCLUDED.sort_order;

-- ── 3. RLS: SELECT für alle authenticated, WRITE nur für Admins ──
ALTER TABLE public.app_modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_modules_select_all"    ON public.app_modules;
DROP POLICY IF EXISTS "app_modules_insert_admin"  ON public.app_modules;
DROP POLICY IF EXISTS "app_modules_update_admin"  ON public.app_modules;
DROP POLICY IF EXISTS "app_modules_delete_admin"  ON public.app_modules;

-- Admin-Prüfung: existiert eine user_module_settings-Zeile für auth.uid()
-- mit role='admin'? (Definiert in migration_add_admin_role.sql.)
CREATE POLICY "app_modules_select_all" ON public.app_modules
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "app_modules_insert_admin" ON public.app_modules
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_module_settings
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "app_modules_update_admin" ON public.app_modules
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_module_settings
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_module_settings
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "app_modules_delete_admin" ON public.app_modules
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_module_settings
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
