-- ============================================================
-- Finanztracker – Datei-Upload für Stromrechnungen (Jahreshistorie)
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================
--
-- 1. Erweitert `electricity_periods` um `bill_file_path` (Storage-Pfad).
-- 2. Erstellt privaten Storage Bucket `electricity-bills`.
-- 3. Setzt RLS-Policies auf storage.objects:
--    Nutzer dürfen nur ihre eigenen Belege lesen / schreiben / löschen.
--
-- Storage-Pfad-Konvention: {auth.uid()}/{period_id}-{timestamp}.{ext}
-- Das erste Pfad-Segment MUSS die User-ID sein (RLS-Check).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, ON CONFLICT, DROP POLICY IF EXISTS.
-- ============================================================

-- ── 1. Spalte in electricity_periods ──────────────────────────
ALTER TABLE public.electricity_periods
  ADD COLUMN IF NOT EXISTS bill_file_path text;

COMMENT ON COLUMN public.electricity_periods.bill_file_path
  IS 'Pfad der hochgeladenen Stromrechnung im Storage-Bucket "electricity-bills" (PDF/Bild). NULL = keine Rechnung hinterlegt.';

-- ── 2. Storage Bucket ─────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('electricity-bills', 'electricity-bills', false)
ON CONFLICT (id) DO NOTHING;

-- ── 3. RLS-Policies auf storage.objects ───────────────────────
DROP POLICY IF EXISTS "electricity_bills_select_own" ON storage.objects;
DROP POLICY IF EXISTS "electricity_bills_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "electricity_bills_update_own" ON storage.objects;
DROP POLICY IF EXISTS "electricity_bills_delete_own" ON storage.objects;

CREATE POLICY "electricity_bills_select_own"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'electricity-bills'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "electricity_bills_insert_own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'electricity-bills'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "electricity_bills_update_own"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'electricity-bills'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'electricity-bills'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "electricity_bills_delete_own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'electricity-bills'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ── 4. CORS-Hinweis ────────────────────────────────────────────
-- Supabase Storage erlaubt CORS-Konfiguration nur via Dashboard
-- (Project Settings → Storage → CORS) oder per Management API.
-- Für lokale Entwicklung ggf. http://localhost:3000 ergänzen.
--
-- Standard-CORS für Buckets: '*' für Browser-Zugriff. Da wir Signed URLs
-- nutzen, sind keine zusätzlichen CORS-Regeln nötig.
