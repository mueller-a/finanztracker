-- ============================================================
-- InsureTrack – Insurance Providers Migration
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Table: insurance_providers
-- Stores named insurers per user with optional URLs.
-- Entries in insurance_entries can reference a provider via FK
-- while still keeping the denormalized `provider` text column
-- as a display-name fallback for existing/legacy rows.

CREATE TABLE IF NOT EXISTS public.insurance_providers (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             text        NOT NULL,
  website_url      text        NOT NULL DEFAULT '',
  portal_login_url text        NOT NULL DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT insurance_providers_pkey PRIMARY KEY (id),
  CONSTRAINT insurance_providers_user_name_unique UNIQUE (user_id, name)
);

ALTER TABLE public.insurance_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own insurance providers"
  ON public.insurance_providers FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS insurance_providers_user_id_idx
  ON public.insurance_providers (user_id);

-- Add provider_id FK to insurance_entries (nullable for backward compat)
ALTER TABLE public.insurance_entries
  ADD COLUMN IF NOT EXISTS provider_id uuid
    REFERENCES public.insurance_providers(id) ON DELETE SET NULL;

-- Make the legacy `provider` text column nullable
-- (new rows from the dropdown still populate it as a display-name copy)
ALTER TABLE public.insurance_entries
  ALTER COLUMN provider SET DEFAULT '',
  ALTER COLUMN provider DROP NOT NULL;
