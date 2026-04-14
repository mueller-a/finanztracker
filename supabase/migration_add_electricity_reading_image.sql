-- ============================================================
-- Finanztracker – Foto-Upload für Zählerstände
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================
--
-- 1. Erweitert `electricity_readings` um `image_path` (Storage-Pfad)
-- 2. Erstellt privaten Storage Bucket `meter-readings`
-- 3. Setzt RLS-Policies: Nutzer dürfen nur ihre eigenen Dateien sehen
--
-- Storage-Pfad-Konvention:  {user_id}/{reading_id_or_timestamp}.jpg
-- (Die User-ID als Prefix ermöglicht effiziente RLS-Prüfung.)
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, ON CONFLICT, DROP POLICY IF EXISTS.
-- ============================================================

-- ── 1. Spalte in electricity_readings ─────────────────────────
ALTER TABLE public.electricity_readings
  ADD COLUMN IF NOT EXISTS image_path text;

-- ── 2. Storage Bucket erstellen (falls nicht vorhanden) ───────
INSERT INTO storage.buckets (id, name, public)
VALUES ('meter-readings', 'meter-readings', false)
ON CONFLICT (id) DO NOTHING;

-- ── 3. RLS-Policies auf storage.objects ───────────────────────
-- Eigene Policies für diesen Bucket (storage.objects hat RLS bereits aktiviert).
-- Pfad-Konvention: das erste Segment vor dem '/' muss die auth.uid() sein.

DROP POLICY IF EXISTS "meter_readings_select_own" ON storage.objects;
DROP POLICY IF EXISTS "meter_readings_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "meter_readings_update_own" ON storage.objects;
DROP POLICY IF EXISTS "meter_readings_delete_own" ON storage.objects;

CREATE POLICY "meter_readings_select_own"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'meter-readings'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "meter_readings_insert_own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'meter-readings'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "meter_readings_update_own"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'meter-readings'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'meter-readings'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "meter_readings_delete_own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'meter-readings'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
