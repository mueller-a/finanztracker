-- ============================================================
-- Finanztracker – bAV Snapshot-Erweiterung
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================
--
-- Erweitert die bestehende policy_snapshots Tabelle um
-- bAV-spezifische Spalten (AG/AN-Anteil). Die Tabelle wird
-- bereits von insurance-Policen genutzt; bAV-Policen (type='bav'
-- in etf_policen) verwenden dieselbe Infrastruktur.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.
-- ============================================================

ALTER TABLE public.policy_snapshots
  ADD COLUMN IF NOT EXISTS employer_contribution_paid  numeric(12,2),  -- Kumulierte AG-Beiträge
  ADD COLUMN IF NOT EXISTS employee_contribution_paid  numeric(12,2);  -- Kumulierte AN-Beiträge (Entgeltumwandlung)
