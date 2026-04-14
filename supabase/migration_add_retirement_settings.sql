-- ============================================================
-- InsureTrack – Retirement Tax Settings
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE public.user_module_settings
  ADD COLUMN IF NOT EXISTS is_pkv boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS steuer_satz_alter integer NOT NULL DEFAULT 25;
