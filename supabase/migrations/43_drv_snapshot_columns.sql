-- ─── policy_snapshots: DRV-spezifische Spalten ──────────────────────────────
-- Erweitert die generische Snapshot-Tabelle, sodass auch jährliche
-- Renteninformationen (DRV-Bescheid) abgelegt werden können.
--
-- Werte stammen aus dem jährlichen Rentenbescheid:
--   - drv_anwartschaft     = bisher erworbene Bruttorente (€/Monat)
--   - drv_hochgerechnete   = hochgerechnete Bruttorente bei Renteneintritt (€/Monat)
--   - drv_entgeltpunkte    = aktueller Punktestand
--
-- Alle Felder sind nullable — andere Policy-Typen lassen sie leer.

ALTER TABLE public.policy_snapshots
  ADD COLUMN IF NOT EXISTS drv_anwartschaft   numeric(10,2),
  ADD COLUMN IF NOT EXISTS drv_hochgerechnete numeric(10,2),
  ADD COLUMN IF NOT EXISTS drv_entgeltpunkte  numeric(10,4);

COMMENT ON COLUMN public.policy_snapshots.drv_anwartschaft   IS 'DRV: bisher erarbeitete Bruttorente €/Monat (aus jährl. Rentenbescheid).';
COMMENT ON COLUMN public.policy_snapshots.drv_hochgerechnete IS 'DRV: hochgerechnete Bruttorente bei Renteneintritt (€/Monat).';
COMMENT ON COLUMN public.policy_snapshots.drv_entgeltpunkte  IS 'DRV: aktueller Entgeltpunkte-Stand.';
