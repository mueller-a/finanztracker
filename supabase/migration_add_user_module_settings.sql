-- ============================================================
-- InsureTrack – User Module Settings
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_module_settings (
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  show_insurance       boolean NOT NULL DEFAULT true,
  show_electricity     boolean NOT NULL DEFAULT true,
  show_debts           boolean NOT NULL DEFAULT true,
  show_budget          boolean NOT NULL DEFAULT true,
  show_salary          boolean NOT NULL DEFAULT true,
  show_pkv_calc        boolean NOT NULL DEFAULT true,
  show_retirement_plan boolean NOT NULL DEFAULT true,
  show_savings         boolean NOT NULL DEFAULT true,
  dark_mode            boolean,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_module_settings_pkey PRIMARY KEY (user_id)
);

ALTER TABLE public.user_module_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_module_settings_select" ON public.user_module_settings
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_module_settings_insert" ON public.user_module_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_module_settings_update" ON public.user_module_settings
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_module_settings_delete" ON public.user_module_settings
  FOR DELETE USING (auth.uid() = user_id);
