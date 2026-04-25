-- ─── Holdings-History: realer Verlauf der Depot-Positionen ──────────────────
-- Wird automatisch beim Speichern einer Depot-Police angelegt, wenn sich die
-- Holdings ändern (siehe useETFPolicen.savePolicy). Pro Eintrag wird das
-- komplette Holdings-Array als JSON gespeichert + die abgeleiteten Werte
-- 'invested_value' (Σ shares × avg_buy_price) und 'market_value'
-- (Σ shares × live_price zum Zeitpunkt der Speicherung).
--
-- Verwendung im Frontend: Zeitleiste der Portfolio-Veränderungen +
-- Eingezahlt-Kapital-Verlauf-Chart in der Depot-Detail-View.

CREATE TABLE IF NOT EXISTS public.holdings_history (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id       uuid          NOT NULL REFERENCES public.etf_policen(id) ON DELETE CASCADE,
  snapshot_at     timestamptz   NOT NULL DEFAULT now(),
  holdings        jsonb         NOT NULL,
  invested_value  numeric(14,2) NOT NULL DEFAULT 0,
  market_value    numeric(14,2),
  created_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_holdings_history_policy
  ON public.holdings_history (policy_id, snapshot_at DESC);

COMMENT ON TABLE  public.holdings_history             IS 'Historie der Depot-Holdings — pro Speicherung mit geänderten Holdings ein Eintrag.';
COMMENT ON COLUMN public.holdings_history.holdings    IS 'Snapshot des gesamten Holdings-Arrays als JSON (id, name, isin, symbol, shares, avg_buy_price).';
COMMENT ON COLUMN public.holdings_history.invested_value IS 'Σ shares × avg_buy_price zum Snapshot-Zeitpunkt (eingezahltes Kapital).';
COMMENT ON COLUMN public.holdings_history.market_value   IS 'Σ shares × live_price zum Snapshot-Zeitpunkt (oder NULL falls nicht verfügbar).';

-- RLS: User sieht nur die History seiner eigenen Policen.
-- Joined über etf_policen.user_id.
ALTER TABLE public.holdings_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "holdings_history_owner_select" ON public.holdings_history;
CREATE POLICY "holdings_history_owner_select"
  ON public.holdings_history FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.etf_policen p
    WHERE p.id = holdings_history.policy_id
      AND p.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "holdings_history_owner_insert" ON public.holdings_history;
CREATE POLICY "holdings_history_owner_insert"
  ON public.holdings_history FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.etf_policen p
    WHERE p.id = holdings_history.policy_id
      AND p.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "holdings_history_owner_delete" ON public.holdings_history;
CREATE POLICY "holdings_history_owner_delete"
  ON public.holdings_history FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.etf_policen p
    WHERE p.id = holdings_history.policy_id
      AND p.user_id = auth.uid()
  ));
