// Supabase Edge Function: destatis-vpi
// CORS-Proxy zur Destatis GENESIS API (Tabelle 61111-0001, Verbraucherpreisindex).
// Wird vom Frontend-Hook `useInflationData` mit 24h-Cache aufgerufen.
//
// Setup:
//   supabase functions deploy destatis-vpi
//   supabase secrets set DESTATIS_USER=xxx DESTATIS_PW=xxx
//
// Ohne hinterlegte Credentials antwortet die Function mit 503; das
// Frontend fällt dann auf die statischen VPI-Werte aus
// client/src/lib/inflationData.js zurück.
//
// Antwort-Format:
//   {
//     ok: true,
//     source: "destatis" | "fallback",
//     base_year: 2020,
//     vpi: { "2015": 95.5, ..., "2025": 122.0 },
//     fetched_at: ISO timestamp
//   }

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const GENESIS_URL = 'https://www-genesis.destatis.de/genesisWS/rest/2020/data/tablefile';
const TABLE_KEY   = '61111-0001';

async function fetchFromDestatis(user: string, pw: string): Promise<Record<string, number>> {
  const params = new URLSearchParams({
    username: user,
    password: pw,
    name:     TABLE_KEY,
    format:   'csv',
    language: 'de',
  });
  const res = await fetch(`${GENESIS_URL}?${params.toString()}`, { method: 'GET' });
  if (!res.ok) throw new Error(`Destatis HTTP ${res.status}`);
  const text = await res.text();

  // CSV-Parsing: Spalten sind je nach Tabelle unterschiedlich.
  // Für 61111-0001 erwarten wir Zeilen wie: "2020;Jahr;Verbraucherpreisindex;100,0"
  // Wir suchen pro Jahr nach dem Jahres-Durchschnitt.
  const out: Record<string, number> = {};
  for (const line of text.split('\n')) {
    const cells = line.split(';').map((s) => s.trim().replace(/^"|"$/g, ''));
    if (cells.length < 4) continue;
    const yearMatch = /^\d{4}$/.exec(cells[0]);
    if (!yearMatch) continue;
    const valueStr = cells[cells.length - 1].replace(',', '.');
    const value = Number(valueStr);
    if (!Number.isFinite(value)) continue;
    out[cells[0]] = value;
  }
  if (Object.keys(out).length === 0) throw new Error('Destatis-Antwort konnte nicht geparst werden.');
  return out;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const user = Deno.env.get('DESTATIS_USER');
  const pw   = Deno.env.get('DESTATIS_PW');

  if (!user || !pw) {
    return new Response(JSON.stringify({
      ok:    false,
      error: 'destatis_credentials_missing',
      hint:  'Set DESTATIS_USER and DESTATIS_PW via `supabase secrets set`.',
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  try {
    const vpi = await fetchFromDestatis(user, pw);
    return new Response(JSON.stringify({
      ok:         true,
      source:     'destatis',
      base_year:  2020,
      vpi,
      fetched_at: new Date().toISOString(),
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400', // 24h
        ...CORS_HEADERS,
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({
      ok:    false,
      error: err?.message ?? 'unknown_error',
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
});
