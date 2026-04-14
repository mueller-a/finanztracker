-- ============================================================
-- InsureTrack – PKV Configs Migration
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Table: pkv_configs
-- Stores saved PKV calculator scenarios per user.
-- `data` JSONB holds the full calculator state (tarife, sliders, etc.)
-- Multiple rows per user = multiple named scenarios for comparison.

CREATE TABLE IF NOT EXISTS public.pkv_configs (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text        NOT NULL DEFAULT 'Neue Konfiguration',
  data        jsonb       NOT NULL DEFAULT '{}',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pkv_configs_pkey PRIMARY KEY (id)
);

-- Row Level Security
ALTER TABLE public.pkv_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own PKV configs"
  ON public.pkv_configs FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for fast per-user lookups
CREATE INDEX IF NOT EXISTS pkv_configs_user_id_idx
  ON public.pkv_configs (user_id);
