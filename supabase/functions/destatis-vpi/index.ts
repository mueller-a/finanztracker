// Supabase Edge Function: destatis-vpi
// CORS-Proxy zur Destatis GENESIS API (Tabelle 61111-0001, Verbraucherpreisindex).
// Wird vom Frontend-Hook `useInflationData` mit 24h-Cache aufgerufen.
//
// Setup:
//   supabase functions deploy destatis-vpi --no-verify-jwt
//   supabase secrets set DESTATIS_USER=xxx DESTATIS_PW=xxx
//
// Ohne hinterlegte Credentials antwortet die Function mit 503; das
// Frontend fällt dann auf die statischen VPI-Werte aus
// client/src/lib/inflationData.js zurück.
//
// API-Doku: https://www-genesis.destatis.de/genesis/online?operation=tableHelp&levelindex=0&levelid=&id=&objectid=
// Tabelle 61111-0001: Verbraucherpreisindex, Jahres-Index, Basisjahr 2020 = 100.
//
// Antwort-Format:
//   {
//     ok: true,
//     source: "destatis",
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

const TABLE_KEY    = '61111-0001';
const GENESIS_BASE = 'https://www-genesis.destatis.de/genesisWS/rest/2020/data';

// Versucht zwei Formate, weil das `ffcsv`-Format leichter zu parsen ist als
// das klassische CSV mit Multi-Sektionen-Header.
//
// 1. ffcsv (Flat File CSV) — primär.
// 2. csv  — Fallback.
//
// Beide werden via POST/GET an /tablefile gesendet (REST 2020 erlaubt beides).
async function fetchVpi(authHeaders: Record<string, string>): Promise<{
  vpi: Record<string, number>;
  debug?: { headers: string[]; sampleLine: string; timeIdx: number; valIdx: number };
}> {
  // Endpoint /data/table (statt /tablefile) liefert die Tabelle als JSON-
  // Wrapper mit der CSV als String in `Object.Content`. /tablefile würde ein
  // ZIP zurückgeben — das wäre in Deno zusätzlicher Aufwand zum Entpacken.
  const body = new URLSearchParams({
    name:      TABLE_KEY,
    area:      'all',
    format:    'ffcsv',
    compress:  'false',
    transpose: 'false',
    language:  'de',
  });

  const res = await fetch(`${GENESIS_BASE}/table`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept':       '*/*',
      'User-Agent':   'Mozilla/5.0 (compatible; Finanztracker/1.0)',
      ...authHeaders,
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Destatis HTTP ${res.status}${errBody ? ` — ${errBody.slice(0, 200)}` : ''}`);
  }
  const responseText = await res.text();

  // /table liefert JSON-Wrapper:
  //   { Status: { Code: 0, Content: "OK" }, Object: { Content: "<CSV-Inhalt>", ... } }
  let wrapper: any;
  try {
    wrapper = JSON.parse(responseText);
  } catch {
    throw new Error('Destatis: Antwort ist kein JSON. Vorschau: ' + responseText.slice(0, 200));
  }

  const statusCode = wrapper?.Status?.Code ?? wrapper?.status?.code;
  if (statusCode && statusCode !== 0) {
    const msg = wrapper?.Status?.Content ?? wrapper?.status?.content;
    throw new Error(`Destatis Status ${statusCode}: ${msg}`);
  }

  const text = wrapper?.Object?.Content ?? wrapper?.object?.content;
  if (!text || typeof text !== 'string') {
    throw new Error('Destatis: kein Object.Content im Wrapper. Vorschau: ' + responseText.slice(0, 200));
  }

  // ffcsv (seit Nov 2024) ist Long-Format mit benannten Header-Spalten.
  // Erwartete Spalten u.a.:
  //   "Zeit_Code";"Zeit"                        → "JAHR";"1991"
  //   "1_Merkmal_Code";"1_Merkmal_Label"        → "PREISBASIS";"Basisjahr 2020 = 100"
  //   "1_Auspraegung_Code";"1_Auspraegung_Label" → "PRBJ005";"Verbraucherpreisindex"
  //   "PREIS1__VERBRAUCHERPREISINDEX__2020=100" → 61.9
  //
  // Strategie: Spalte "Zeit" finden + erste **numerische** Spalte (Wert).
  // Header-Erkennung ist case-insensitive und tolerant gegen Substring-Matches.
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error('Leere Destatis-Antwort');

  const headers = lines[0].split(';').map((s) => s.trim().replace(/^"|"$/g, ''));
  const headersLower = headers.map((h) => h.toLowerCase());

  // 1) Zeit-Spalte: bevorzugt "Zeit" (das Label, nicht "Zeit_Code"), sonst Heuristik.
  let timeIdx = headersLower.findIndex((h) => h === 'zeit');
  if (timeIdx === -1) timeIdx = headersLower.findIndex((h) => h === 'jahr');
  if (timeIdx === -1) timeIdx = headersLower.findIndex((h) => /^zeit$|^jahr$/.test(h));

  // 2) Wert-Spalte: erste Spalte, deren Header explizit nach "Wert" aussieht
  //    ODER deren erste Daten-Zeile eine plausible Zahl (50..200) enthält.
  let valIdx = headersLower.findIndex((h) =>
    h === 'wert' || h.endsWith('__wert') || h.includes('verbraucherpreisindex') || h.startsWith('preis')
  );
  if (valIdx === -1 && lines.length > 1) {
    const firstDataCells = lines[1].split(';').map((s) => s.trim().replace(/^"|"$/g, ''));
    for (let i = 0; i < firstDataCells.length; i++) {
      if (i === timeIdx) continue;
      const v = Number(firstDataCells[i].replace(',', '.'));
      if (Number.isFinite(v) && v >= 50 && v <= 200) { valIdx = i; break; }
    }
  }

  const out: Record<string, number> = {};
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(';').map((s) => s.trim().replace(/^"|"$/g, ''));
    if (cells.length < 2) continue;

    let yearStr: string | null = timeIdx >= 0 ? (cells[timeIdx] ?? null) : null;
    let valStr:  string | null = valIdx  >= 0 ? (cells[valIdx]  ?? null) : null;

    // Fallback: pro Zeile manuell suchen (für ältere/abweichende Formate).
    if (!yearStr) {
      for (const c of cells) {
        if (/^\d{4}$/.test(c)) { yearStr = c; break; }
      }
    }
    if (!valStr) {
      for (let k = cells.length - 1; k >= 0; k--) {
        const v = Number(cells[k].replace(',', '.'));
        if (Number.isFinite(v) && v >= 50 && v <= 200) { valStr = cells[k]; break; }
      }
    }

    if (!yearStr || !/^\d{4}$/.test(yearStr) || !valStr) continue;
    const value = Number(String(valStr).replace(',', '.'));
    if (!Number.isFinite(value) || value < 50 || value > 200) continue;

    // Bei Long-Format gibt's mehrere Zeilen pro Jahr (verschiedene Merkmale).
    // Wir nehmen den ersten Treffer pro Jahr — bei der VPI-Tabelle ist das der
    // Jahres-Index zur Basis 2020 = 100.
    if (!(yearStr in out)) out[yearStr] = value;
  }

  if (Object.keys(out).length === 0) {
    throw new Error(
      'Destatis-Antwort konnte nicht geparst werden. ' +
      `Header: ${headers.slice(0, 8).join(' | ')}. ` +
      `Erste Datenzeile: ${(lines[1] ?? '').slice(0, 200)}`
    );
  }

  if (Object.keys(out).length < 5) {
    console.warn('destatis-vpi: nur ' + Object.keys(out).length + ' Jahre erkannt. Header: ' + headers.slice(0, 10).join(' | '));
  }

  return {
    vpi: out,
    debug: {
      headers,
      sampleLine: lines[1] ?? '',
      timeIdx,
      valIdx,
    },
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Auth-Resolver — Destatis GENESIS REST 2020 erwartet Header (nicht Body):
  //   - Token:    Header `Authorization: Bearer <token>`
  //               (alternativ: Header `username` mit dem Token, password leer)
  //   - User/PW:  Header `username` + `password`
  const token = Deno.env.get('DESTATIS_TOKEN');
  const user  = Deno.env.get('DESTATIS_USER');
  const pw    = Deno.env.get('DESTATIS_PW');

  let authHeaders: Record<string, string> | null = null;
  if (token) {
    // Beide Varianten gleichzeitig setzen — Destatis hat in unterschiedlichen
    // Doku-Versionen mal `Authorization: Bearer …`, mal Header `username` als
    // Token-Träger gefordert. Doppelt zu setzen schadet nicht.
    authHeaders = {
      'Authorization': `Bearer ${token}`,
      'username':      token,
      'password':      '',
    };
  } else if (user && pw) {
    authHeaders = { 'username': user, 'password': pw };
  }

  if (!authHeaders) {
    return new Response(JSON.stringify({
      ok:    false,
      error: 'destatis_credentials_missing',
      hint:  'Set either DESTATIS_TOKEN or DESTATIS_USER+DESTATIS_PW via `supabase secrets set`.',
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  try {
    const { vpi } = await fetchVpi(authHeaders);
    return new Response(JSON.stringify({
      ok:         true,
      source:     'destatis',
      base_year:  2020,
      vpi,
      year_count: Object.keys(vpi).length,
      fetched_at: new Date().toISOString(),
    }), {
      status: 200,
      headers: {
        'Content-Type':  'application/json',
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
