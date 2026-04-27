-- ─── Zentrale Logo-Bibliothek pro User ─────────────────────────────────────
-- Logos für Bank-/Broker-/Provider-Marken (z. B. ING, DKB, comdirect),
-- die in Asset Manager, Verbindlichkeiten und Freistellungsaufträgen
-- gemeinsam genutzt werden. Wer einmal das ING-Logo hochlädt, soll es
-- über alle drei Module hinweg wiederverwenden können — Dedup pro User.
--
-- Storage-Pfad-Konvention: {user_id}/{logo_id}.jpg
-- (Erstes Segment vor '/' = auth.uid() für RLS via storage.foldername.)

-- ── 1. Tabelle ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.entity_logos (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  domain      text,
  image_path  text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Dedup pro User: gleicher Name (case-insensitive) nur einmal
CREATE UNIQUE INDEX IF NOT EXISTS entity_logos_user_name_key
  ON public.entity_logos (user_id, lower(name));

COMMENT ON TABLE  public.entity_logos            IS 'User-eigene Logo-Bibliothek; Marken-Logos die in mehreren Modulen referenziert werden.';
COMMENT ON COLUMN public.entity_logos.name       IS 'Anzeigename des Logos (z. B. "ING") — case-insensitive eindeutig pro User.';
COMMENT ON COLUMN public.entity_logos.domain     IS 'Optional: Domain für Auto-Fetch via Google S2 Favicons (z. B. "ing.de").';
COMMENT ON COLUMN public.entity_logos.image_path IS 'Storage-Pfad im Bucket entity-logos: {user_id}/{logo_id}.jpg';

-- ── 2. RLS ────────────────────────────────────────────────────────────────
ALTER TABLE public.entity_logos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "entity_logos_owner_select" ON public.entity_logos;
CREATE POLICY "entity_logos_owner_select"
  ON public.entity_logos FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "entity_logos_owner_insert" ON public.entity_logos;
CREATE POLICY "entity_logos_owner_insert"
  ON public.entity_logos FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "entity_logos_owner_update" ON public.entity_logos;
CREATE POLICY "entity_logos_owner_update"
  ON public.entity_logos FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "entity_logos_owner_delete" ON public.entity_logos;
CREATE POLICY "entity_logos_owner_delete"
  ON public.entity_logos FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ── 3. FK-Spalten in den drei konsumierenden Tabellen ─────────────────────
-- ON DELETE SET NULL: Logo-Löschung lässt referenzierende Einträge zurück;
-- sie zeigen wieder ihr Material-Symbol-Fallback.

ALTER TABLE public.savings_goals
  ADD COLUMN IF NOT EXISTS logo_id uuid REFERENCES public.entity_logos(id) ON DELETE SET NULL;

ALTER TABLE public.debts
  ADD COLUMN IF NOT EXISTS logo_id uuid REFERENCES public.entity_logos(id) ON DELETE SET NULL;

ALTER TABLE public.freistellungsauftraege
  ADD COLUMN IF NOT EXISTS logo_id uuid REFERENCES public.entity_logos(id) ON DELETE SET NULL;

-- ── 4. Storage Bucket ──────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('entity-logos', 'entity-logos', false)
ON CONFLICT (id) DO NOTHING;

-- ── 5. Storage RLS ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "entity_logos_storage_select_own" ON storage.objects;
DROP POLICY IF EXISTS "entity_logos_storage_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "entity_logos_storage_update_own" ON storage.objects;
DROP POLICY IF EXISTS "entity_logos_storage_delete_own" ON storage.objects;

CREATE POLICY "entity_logos_storage_select_own"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'entity-logos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "entity_logos_storage_insert_own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'entity-logos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "entity_logos_storage_update_own"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'entity-logos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'entity-logos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "entity_logos_storage_delete_own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'entity-logos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
