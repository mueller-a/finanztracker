// Supabase Edge Function: get-quote
// CORS-Proxy zur Yahoo-Finance-Quote-API für Live-Bewertung der Depot-Holdings.
//
// Setup:
//   supabase functions deploy get-quote --no-verify-jwt
//   (kein Secret nötig — Yahoo-Endpoint ist öffentlich, aber CORS-blockiert)
//
// Request (POST):
//   { items: [{ isin?: string, symbol?: string }, ...] }
//
// Response:
//   {
//     ok: true,
//     quotes: {
//       "<symbol>": { symbol, isin?, name, price, currency, fetched_at },
//       ...
//     },
//     errors: { "<key>": "..."}   // falls einzelne Items nicht aufgelöst wurden
//   }
//
// Workflow pro Item:
//   1. Wenn `symbol` direkt vorhanden → Yahoo Quote-Endpoint anfragen.
//   2. Wenn nur `isin` vorhanden → Yahoo Search anfragen, Symbol extrahieren,
//      dann Quote anfragen.
//   3. Ergebnis in `quote_cache` speichern; bei Hits unter 15 min TTL den
//      Cache-Wert ohne Yahoo-Aufruf zurückgeben.
//
// CORS: 'Access-Control-Allow-Origin: *' für Browser-Aufrufe.

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const CACHE_TTL_MIN = 15;
const YAHOO_SEARCH = 'https://query1.finance.yahoo.com/v1/finance/search';
const YAHOO_QUOTE  = 'https://query1.finance.yahoo.com/v7/finance/quote';

// Yahoo blockiert Requests ohne UA — minimaler Browser-UA reicht.
const UA_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  'Accept':          'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

// ── Yahoo: ISIN → Symbol via Search ──────────────────────────────────────────
async function lookupSymbolByIsin(isin: string): Promise<{ symbol: string; name: string } | null> {
  const url = `${YAHOO_SEARCH}?q=${encodeURIComponent(isin)}&quotesCount=5&newsCount=0`;
  const res = await fetch(url, { headers: UA_HEADERS });
  if (!res.ok) return null;
  const json = await res.json();
  const quotes = Array.isArray(json?.quotes) ? json.quotes : [];
  // Bevorzuge Treffer mit ETF/EQUITY und einer Symbol-Endung (z.B. .DE/.AS/.L)
  const ranked = quotes
    .filter((q: any) => q.symbol)
    .sort((a: any, b: any) => {
      const score = (q: any) => (q.quoteType === 'ETF' ? 2 : q.quoteType === 'EQUITY' ? 1 : 0)
                              + (q.symbol?.includes('.') ? 1 : 0);
      return score(b) - score(a);
    });
  const first = ranked[0];
  if (!first?.symbol) return null;
  return {
    symbol: String(first.symbol),
    name:   String(first.longname || first.shortname || first.symbol),
  };
}

// ── Yahoo: Symbol → Preis ──────────────────────────────────────────────────
async function fetchQuoteForSymbol(symbol: string): Promise<{ price: number; currency: string; name: string } | null> {
  const url = `${YAHOO_QUOTE}?symbols=${encodeURIComponent(symbol)}`;
  const res = await fetch(url, { headers: UA_HEADERS });
  if (!res.ok) return null;
  const json = await res.json();
  const r = json?.quoteResponse?.result?.[0];
  if (!r) return null;
  const price = Number(r.regularMarketPrice ?? r.bid ?? r.ask ?? 0);
  if (!Number.isFinite(price) || price <= 0) return null;
  return {
    price,
    currency: String(r.currency || 'EUR'),
    name:     String(r.longName || r.shortName || symbol),
  };
}

// ── Cache-Lookup: liefert Eintrag wenn jünger als TTL ───────────────────────
function isFresh(fetchedAt: string): boolean {
  const t = new Date(fetchedAt).getTime();
  if (!Number.isFinite(t)) return false;
  return (Date.now() - t) < CACHE_TTL_MIN * 60 * 1000;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  let body: { items?: Array<{ isin?: string; symbol?: string }> } = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const items = Array.isArray(body.items) ? body.items : [];

  if (items.length === 0) {
    return new Response(JSON.stringify({ ok: true, quotes: {}, errors: {} }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // Supabase-Admin-Client zum Cache-Lesen/Schreiben (service_role).
  const supaUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supaKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase = createClient(supaUrl, supaKey, { auth: { persistSession: false } });

  const quotes: Record<string, any> = {};
  const errors: Record<string, string> = {};

  // Cache-Hit-Lookup en bloc — alle Symbols + ISINs in einer Query.
  const allSymbols = items.map((i) => i.symbol).filter(Boolean) as string[];
  const allIsins   = items.map((i) => i.isin).filter(Boolean)   as string[];

  let cacheRows: any[] = [];
  if (allSymbols.length > 0 || allIsins.length > 0) {
    const orFilter: string[] = [];
    if (allSymbols.length > 0) orFilter.push(`symbol.in.(${allSymbols.map((s) => `"${s}"`).join(',')})`);
    if (allIsins.length   > 0) orFilter.push(`isin.in.(${allIsins.map((s) => `"${s}"`).join(',')})`);
    const { data } = await supabase
      .from('quote_cache')
      .select('*')
      .or(orFilter.join(','));
    cacheRows = data ?? [];
  }
  const cacheBySymbol = Object.fromEntries(cacheRows.map((r) => [r.symbol, r]));
  const cacheByIsin   = Object.fromEntries(cacheRows.filter((r) => r.isin).map((r) => [r.isin, r]));

  // Pro Item: cache-hit oder fetch.
  for (const item of items) {
    const key = item.symbol || item.isin || '';
    if (!key) continue;

    const cached = (item.symbol && cacheBySymbol[item.symbol])
                || (item.isin   && cacheByIsin[item.isin])
                || null;

    if (cached && isFresh(cached.fetched_at)) {
      quotes[key] = {
        symbol:     cached.symbol,
        isin:       cached.isin,
        name:       cached.name,
        price:      Number(cached.price),
        currency:   cached.currency,
        fetched_at: cached.fetched_at,
        cached:     true,
      };
      continue;
    }

    try {
      let symbol = item.symbol || cached?.symbol || null;
      let name   = cached?.name || null;

      if (!symbol && item.isin) {
        const found = await lookupSymbolByIsin(item.isin);
        if (!found) {
          errors[key] = `ISIN ${item.isin} konnte nicht aufgelöst werden`;
          continue;
        }
        symbol = found.symbol;
        name   = found.name;
      }
      if (!symbol) {
        errors[key] = 'Weder Symbol noch ISIN — nichts zu fetchen';
        continue;
      }

      const q = await fetchQuoteForSymbol(symbol);
      if (!q) {
        errors[key] = `Kein Quote für ${symbol}`;
        continue;
      }

      const row = {
        symbol,
        isin:       item.isin || cached?.isin || null,
        name:       q.name || name || symbol,
        price:      q.price,
        currency:   q.currency,
        fetched_at: new Date().toISOString(),
      };

      // Upsert in Cache (best effort — Fehler nicht eskalieren)
      await supabase.from('quote_cache').upsert(row, { onConflict: 'symbol' });

      quotes[key] = { ...row, cached: false };
    } catch (e: any) {
      errors[key] = e?.message || 'Unbekannter Fehler';
    }
  }

  return new Response(JSON.stringify({ ok: true, quotes, errors }), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
});
