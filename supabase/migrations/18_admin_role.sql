-- ============================================================
-- InsureTrack – Admin Role Migration
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Add role column
ALTER TABLE public.user_module_settings
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';

-- 2. Promote your account to admin
-- Replace the email below with your actual Google account email
UPDATE public.user_module_settings
  SET role = 'admin'
  WHERE user_id IN (
    SELECT id FROM auth.users WHERE email = 'andreejoachim.mueller@gmail.com'
  );

-- 3. Admin RLS: admins can read ALL user_module_settings rows (for user management)
CREATE POLICY "admins_read_all_settings" ON public.user_module_settings
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR (SELECT role FROM public.user_module_settings WHERE user_id = auth.uid()) = 'admin'
  );

-- 4. Drop the old select policy (it's now replaced by the admin-aware one above)
DROP POLICY IF EXISTS "user_module_settings_select" ON public.user_module_settings;
