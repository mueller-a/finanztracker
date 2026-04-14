-- ============================================================
-- Finanztracker – Initial Interest Override für Kredite
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================
--
-- Erweitert die Tabelle `debts` (interne Bezeichnung; im Produkt-Text
-- "Verbindlichkeiten / Loans") um eine optionale Override-Spalte für den
-- Zinsanteil der ERSTEN Rate im Tilgungsplan.
--
-- Use Case:
--   - Reale Banken buchen oft die erste Rate mit einem abweichenden
--     (meist geringeren) Zinsbetrag, weil die tatsächliche Laufzeit im
--     ersten Monat kürzer als 30 Tage ist.
--   - Der User kann den Ist-Wert aus dem Kontoauszug erfassen; die
--     Engine rechnet die Tilgung der ersten Rate entsprechend neu, der
--     Restplan läuft ab Monat 2 basierend auf dem neuen Restdarlehen.
--
-- NULL = kein Override (Standard-Annuitäts-Berechnung)
-- Idempotent: ADD COLUMN IF NOT EXISTS.
-- ============================================================

ALTER TABLE public.debts
  ADD COLUMN IF NOT EXISTS initial_interest_override numeric(10,2);

COMMENT ON COLUMN public.debts.initial_interest_override
  IS 'Optional override für den Zinsbetrag (EUR) der ersten Rate. NULL = Standard-Berechnung.';
