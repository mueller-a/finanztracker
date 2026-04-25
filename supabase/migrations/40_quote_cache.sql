-- ─── Quote Cache: Live-Preise von Yahoo Finance (Edge Function get-quote) ──
-- Speichert pro Symbol den letzten gefetchten Preis, sodass parallele Aufrufe
-- aus dem Frontend sich an einer Quelle bedienen und Yahoo nicht überlastet
-- wird. TTL 15 Minuten — die Edge Function entscheidet anhand `fetched_at`,
-- ob ein Refresh nötig ist.
--
-- Mapping ISIN → Symbol wird ebenfalls hier abgelegt (isin als Index, symbol
-- als kanonische Adresse). Beim ersten Lookup macht die Edge Function einen
-- Yahoo-Search und speichert das Mapping. Spätere Aufrufe mit der gleichen
-- ISIN sparen die Search-Round-Trip.

CREATE TABLE IF NOT EXISTS public.quote_cache (
  symbol      text        PRIMARY KEY,
  isin        text,
  name        text,
  price       numeric(14, 4) NOT NULL,
  currency    text        NOT NULL DEFAULT 'EUR',
  fetched_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_cache_isin ON public.quote_cache (isin);

COMMENT ON TABLE  public.quote_cache       IS 'Cache für Yahoo-Finance-Quotes. TTL 15 Min wird in der Edge Function get-quote geprüft.';
COMMENT ON COLUMN public.quote_cache.fetched_at IS 'Zeitpunkt des letzten erfolgreichen Yahoo-Fetch.';

-- RLS: jeder eingeloggte User darf lesen + die Edge Function (service_role)
-- darf schreiben. Quotes sind öffentliche Marktdaten, kein User-spezifischer
-- Zugriff nötig.
ALTER TABLE public.quote_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quote_cache_read_authenticated" ON public.quote_cache;
CREATE POLICY "quote_cache_read_authenticated"
  ON public.quote_cache FOR SELECT
  TO authenticated
  USING (true);
