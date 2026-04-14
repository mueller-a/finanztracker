-- ============================================================
-- InsureTrack – Policy Snapshots (Hybrid Tracking)
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================
--
-- Speichert jährliche Standmitteilungen für ETF-Policen / Renten-
-- versicherungen. Die Ruhestandsplanung nutzt den neuesten Snapshot
-- als Startpunkt für die Zukunfts-Prognose ("Hybrid Tracking").
--
-- Beziehung: 1 Policy → N Snapshots
-- ============================================================

CREATE TABLE IF NOT EXISTS public.policy_snapshots (
  id                       uuid          NOT NULL DEFAULT gen_random_uuid(),
  user_id                  uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  policy_id                text          NOT NULL REFERENCES public.etf_policen(id) ON DELETE CASCADE,
  snapshot_date            date          NOT NULL,

  -- Vertragswerte (laut Standmitteilung)
  contract_value           numeric(12,2) NOT NULL DEFAULT 0,  -- Vertragswert (= Fondsguthaben + Bewertungsreserve)
  fund_balance             numeric(12,2),                      -- Aktuelles Fondsguthaben
  valuation_reserves       numeric(12,2),                      -- Aktuelle Bewertungsreserve
  guaranteed_value         numeric(12,2),                      -- davon garantiert

  -- Beitragszahlungen
  total_contributions_paid numeric(12,2),                      -- Summe gezahlter Beiträge seit Vertragsbeginn

  -- Detaillierte Kosten (für den Berichtszeitraum, meist 1 Jahr)
  cost_acquisition         numeric(12,2),                      -- Abschluss- und Vertriebskosten
  cost_administration      numeric(12,2),                      -- Verwaltungskosten
  cost_fund                numeric(12,2),                      -- Fondskosten (TER)
  cost_other               numeric(12,2),                      -- sonstige Kosten
  total_costs_paid         numeric(12,2),                      -- Summe aller Kosten

  -- Fondsverteilung (Liste von Fonds-Objekten)
  -- Schema: [{ "name": "iShares MSCI World", "isin": "IE00...", "share_pct": 100, "unit_price": 11.24, "units": 90.72, "value": 1019.67 }, ...]
  fund_allocation          jsonb         NOT NULL DEFAULT '[]',

  note                     text          DEFAULT '',
  created_at               timestamptz   NOT NULL DEFAULT now(),
  updated_at               timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT policy_snapshots_pkey PRIMARY KEY (id),
  CONSTRAINT policy_snapshots_unique_date UNIQUE (policy_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_policy_snapshots_policy
  ON public.policy_snapshots (policy_id, snapshot_date DESC);

ALTER TABLE public.policy_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "policy_snapshots_select" ON public.policy_snapshots;
DROP POLICY IF EXISTS "policy_snapshots_insert" ON public.policy_snapshots;
DROP POLICY IF EXISTS "policy_snapshots_update" ON public.policy_snapshots;
DROP POLICY IF EXISTS "policy_snapshots_delete" ON public.policy_snapshots;

CREATE POLICY "policy_snapshots_select" ON public.policy_snapshots
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "policy_snapshots_insert" ON public.policy_snapshots
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "policy_snapshots_update" ON public.policy_snapshots
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "policy_snapshots_delete" ON public.policy_snapshots
  FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_set_user_id_policy_snapshots ON public.policy_snapshots;
CREATE TRIGGER trg_set_user_id_policy_snapshots
  BEFORE INSERT ON public.policy_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

-- ── Schema-Upgrade für bestehende Installation ────────────────
-- Falls die Tabelle bereits existiert, fehlende Spalten ergänzen
ALTER TABLE public.policy_snapshots
  ADD COLUMN IF NOT EXISTS guaranteed_value    numeric(12,2),
  ADD COLUMN IF NOT EXISTS cost_acquisition    numeric(12,2),
  ADD COLUMN IF NOT EXISTS cost_administration numeric(12,2),
  ADD COLUMN IF NOT EXISTS cost_fund           numeric(12,2),
  ADD COLUMN IF NOT EXISTS cost_other          numeric(12,2);
