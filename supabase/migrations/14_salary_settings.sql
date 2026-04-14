-- ============================================================
-- InsureTrack – Salary Settings Table
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.salary_settings (
  id         uuid        NOT NULL DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  params     jsonb       NOT NULL DEFAULT '{}',
  netto      numeric(10,2),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT salary_settings_pkey PRIMARY KEY (id),
  CONSTRAINT salary_settings_user_unique UNIQUE (user_id)
);

ALTER TABLE public.salary_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own salary settings"
  ON public.salary_settings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
