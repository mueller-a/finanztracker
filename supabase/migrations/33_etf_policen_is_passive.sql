-- ============================================================
-- Finanztracker – bAV: Beitragsfrei-Stellung
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================
--
-- Kennzeichnet Policen (insbes. bAV) als "passiv" = beitragsfrei.
-- Auf passiven Verträgen werden ab Markierung keine weiteren Beiträge
-- eingezahlt; das vorhandene Kapital verzinst sich jedoch weiter.
--
-- Die Spalte gilt technisch für alle Policen (etf_policen); praktisch
-- relevant ist sie für type='bav' (auch nutzbar für 'insurance', sollte
-- dort später gewünscht sein).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, Backfill über Default.
-- ============================================================

ALTER TABLE public.etf_policen
  ADD COLUMN IF NOT EXISTS is_passive boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.etf_policen.is_passive
  IS 'true = Vertrag beitragsfrei gestellt. Keine weiteren Beiträge in der Projektion; Kapital verzinst sich weiter.';
