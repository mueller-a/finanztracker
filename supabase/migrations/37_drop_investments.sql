-- ============================================================
-- Finanztracker – Cleanup: Eigenständiges Investment-Modul zurückgebaut
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================
--
-- Rückbau der versehentlich angelegten eigenen Investment-Tabellen.
-- Depot-Snapshots werden stattdessen über die bestehende Tabelle
-- `policy_snapshots` verwaltet (Typ 'depot' in etf_policen).
-- Nur ausführen, wenn die vorherige Migration 37_investments.sql schon
-- deployed wurde — sonst einfach überspringen.
--
-- Idempotent: DROP … IF EXISTS.
-- ============================================================

DROP TABLE IF EXISTS public.investment_snapshots CASCADE;
DROP TABLE IF EXISTS public.savings_plans        CASCADE;

DELETE FROM public.app_modules WHERE module_key = 'investments';
