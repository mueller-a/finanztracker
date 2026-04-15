// ============================================================
// BMF Lohnsteuer-Validator Proxy (Edge Function)
// ============================================================
//
// Deployment:
//   supabase functions deploy bmf-lst-validator
//
// Die BMF-Schnittstelle (bmf-steuerrechner.de) liefert keine CORS-Header,
// deshalb benötigen wir einen Server-seitigen Proxy. Diese Edge Function
// nimmt die Parameter vom Client entgegen, ruft die BMF-Seite im Namen
// des Servers auf und parst die XML-Antwort.
//
// Request (POST JSON):
// {
//   "code": "ext2026",          // "ext2026" = LSt2026ext (einfache Variante)
//   "LZZ": 1,                    // 1 = Jahr, 2 = Monat, 3 = Woche, 4 = Tag
//   "RE4": 8823516,              // Zu versteuerndes Einkommen (JB) in CENTS
//   "STKL": 1,                   // Steuerklasse 1-6
//   "ZKF": 0,                    // Kinderfreibetrag (0, 0.5, 1, 1.5, …)
//   "PKV": 1,                    // 0 = GKV, 1 = PKV ohne PV-Zusatz, 2 = PKV mit
//   "PVZ": 0,                    // Zuschlag für Kinderlose (0 oder 1)
//   "R": 0,                      // Konfession (0 = keine)
//   "ZMVB": 12,                  // Zahl der Monate (1-12)
//   ...                          // weitere Felder siehe BMF-Doku
// }
//
// Response JSON:
// {
//   "ok": true,
//   "lstlzz": 1900300,            // Lohnsteuer für LZZ in CENTS
//   "solzlzz": 0,                 // Soli für LZZ in CENTS
//   "bk": 0, "bks": 0,            // Bemessungsgrundlage Kirchensteuer
//   "raw": { ... }                // alle BMF-Felder als Zahlen
// }

// @ts-ignore Deno imports
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// Der korrekte Interface-Code laut offizieller Schnittstellenbeschreibung
// (https://www.bmf-steuerrechner.de/javax.faces.resource/daten/xmls/Lohnsteuer2026.xml.xhtml)
// ist `Lohnsteuer2026` — nicht die früher vermuteten Varianten LSt…ext/std.
const BMF_ATTEMPTS: Array<{ url: string; code: string }> = [
  { url: 'https://www.bmf-steuerrechner.de/interface/2026Version1.xhtml', code: 'Lohnsteuer2026' },
  { url: 'https://www.bmf-steuerrechner.de/interface/2025Version1.xhtml', code: 'Lohnsteuer2025' },
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  // x-client-info + apikey werden automatisch von supabase-js im Browser gesetzt
  // und müssen im Preflight explizit erlaubt sein, sonst blockiert Chrome
  // die Anfrage ("Request header field x-client-info is not allowed …").
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BmfParams {
  code?: string;
  LZZ?: number;
  RE4?: number;
  STKL?: number;
  ZKF?: number;
  PKV?: number;
  PVZ?: number;
  R?: number;
  ZMVB?: number;
  KVZ?: number;
  PKPV?: number;
  AJAHR?: number;
  ALTER1?: number;
  f?: number;
  VBEZ?: number;
  VBEZM?: number;
  VBEZS?: number;
  VBS?: number;
  VJAHR?: number;
  KRV?: number;
  LZZHINZU?: number;
  LZZFREIB?: number;
  SONSTB?: number;
  SONSTENT?: number;
  STERBE?: number;
  VKAPA?: number;
  VMT?: number;
  ZKRV?: number;
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Only POST allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const params: BmfParams = await req.json();

    // ── Health-Probe: fester minimaler BMF-Request ──────────────────────────
    // Vor dem eigentlichen User-Request rufen wir BMF mit einem minimalen
    // Standard-Case auf (60 k€ Jahresbrutto, Stkl 1, keine SV-Abzüge).
    // Wenn dieser Probe-Request LSTLZZ > 0 liefert, weiß man: BMF funktioniert
    // und unser User-Request-Parameter-Set ist das Problem. Wenn Probe auch 0 ist,
    // stimmt mit der Schnittstelle/dem Code etwas nicht.
    let probeResult: { code: string; lstlzz: number; raw: Record<string, number> } | null = null;
    try {
      const probeParams = new URLSearchParams({
        code: 'LSt2026std',
        LZZ:  '1',
        RE4:  '6000000',  // 60 k€ Jahresbrutto
        STKL: '1',
        f:    '1',
      });
      const probeResp = await fetch(
        `https://www.bmf-steuerrechner.de/interface/2026Version1.xhtml?${probeParams.toString()}`,
        { headers: { 'Accept': '*/*', 'User-Agent': 'Mozilla/5.0' } }
      );
      const probeBody = await probeResp.text();
      const probeParsed: Record<string, number> = {};
      const pRegex = /<ausgabe\s+name="([^"]+)"\s+value="([^"]+)"/g;
      let pm;
      while ((pm = pRegex.exec(probeBody)) !== null) {
        probeParsed[pm[1]] = Number(pm[2]);
      }
      probeResult = { code: 'LSt2026std', lstlzz: probeParsed.LSTLZZ ?? 0, raw: probeParsed };
    } catch { /* egal — probe ist nice-to-have */ }

    // Parameter gemäss offizieller XML-Schnittstellen-Beschreibung
    // Lohnsteuer2026 (BMF, PAP Version 1.0):
    //   - RE4   = Arbeitslohn im aktuellen LZZ (Cent)
    //   - JRE4  = Jahresarbeitslohn OHNE sonstige Bezüge (Cent) — bei LZZ=1 identisch mit RE4
    //   - LZZ   = 1=Jahr, 2=Monat, 3=Woche, 4=Tag
    //   - STKL  = 1..6
    //   - R     = Religionsgemeinschaft (0=keine) — Pflichtfeld ohne Default!
    //   - KVZ   = Zusatzbeitragssatz in PROZENT (z.B. 2.5), NICHT in ‰
    //   - PKV   = 0=GKV, 1=PKV
    //   - PKPV  = PKV-AN-Beitrag MONATLICH (Cent) — unabhängig von LZZ
    //   - PKPVAGZ = AG-Zuschuss zur PKV MONATLICH (Cent)
    //   - f     = Faktor Stkl. IV (3 Dezimalstellen)
    //   - af    = 1, wenn Faktorverfahren gewählt (sonst 0)
    //   - ALV   = 0 = arbeitslosenversichert
    //   - KRV   = 0 = rentenversichert
    const queryParams = new URLSearchParams({
      code:     'PLACEHOLDER',                  // wird pro Attempt gesetzt
      LZZ:      String(params.LZZ     ?? 1),
      RE4:      String(params.RE4     ?? 0),
      JRE4:     String((params as any).JRE4 ?? params.RE4 ?? 0),
      STKL:     String(params.STKL    ?? 1),
      R:        String(params.R       ?? 0),    // Pflichtfeld!
      ZKF:      String(params.ZKF     ?? 0),
      PKV:      String(params.PKV     ?? 0),
      PVZ:      String(params.PVZ     ?? 0),
      KVZ:      String(params.KVZ     ?? 0),    // Prozent, nicht ‰
      PKPV:     String(params.PKPV    ?? 0),    // MONATLICH in Cent
      PKPVAGZ:  String((params as any).PKPVAGZ ?? 0),
      AJAHR:    String(params.AJAHR   ?? 0),
      ALTER1:   String(params.ALTER1  ?? 0),
      ALV:      String((params as any).ALV ?? 0),
      KRV:      String(params.KRV     ?? 0),
      f:        String(params.f       ?? 1),
      af:       String((params as any).af ?? 0),
      ZMVB:     String(params.ZMVB    ?? 0),
      LZZFREIB: String(params.LZZFREIB ?? 0),
      LZZHINZU: String(params.LZZHINZU ?? 0),
      JFREIB:   String((params as any).JFREIB ?? 0),
      JHINZU:   String((params as any).JHINZU ?? 0),
      VBEZ:     String(params.VBEZ    ?? 0),
      VBEZM:    String(params.VBEZM   ?? 0),
      VBEZS:    String(params.VBEZS   ?? 0),
      VBS:      String(params.VBS     ?? 0),
      VJAHR:    String(params.VJAHR   ?? 0),
      JVBEZ:    String((params as any).JVBEZ ?? 0),
      JRE4ENT:  String((params as any).JRE4ENT ?? 0),
      SONSTB:   String(params.SONSTB  ?? 0),
      SONSTENT: String(params.SONSTENT ?? 0),
      STERBE:   String(params.STERBE  ?? 0),
      MBV:      String((params as any).MBV ?? 0),
    });

    // Probiere alle URL+Code-Kombinationen, bis eine valide XML mit
    // <ausgabe>-Tags liefert.
    let xmlText = '';
    let usedUrl = '';
    let usedCode = '';
    let raw: Record<string, number> = {};
    const ausgabeRegex = /<ausgabe\s+name="([^"]+)"\s+value="([^"]+)"/g;

    const attempts: Array<{
      url: string; code: string; status: number;
      contentType: string; preview: string; error?: string;
    }> = [];

    for (const { url: baseUrl, code } of BMF_ATTEMPTS) {
      queryParams.set('code', code);
      const bmfUrl = `${baseUrl}?${queryParams.toString()}`;
      try {
        const bmfResponse = await fetch(bmfUrl, {
          headers: {
            'Accept':     'application/xml, text/xml, */*',
            'User-Agent': 'Mozilla/5.0 (compatible; Finanztracker-Validator/1.0)',
          },
        });
        const body = await bmfResponse.text();
        const ct   = bmfResponse.headers.get('content-type') ?? '';
        attempts.push({
          url: baseUrl, code,
          status: bmfResponse.status,
          contentType: ct,
          preview: body.slice(0, 400),
        });

        if (!bmfResponse.ok) continue;
        const probe = /<ausgabe\s+name="(LSTLZZ|LSTJAHR|SOLZLZZ)"/i.test(body);
        if (!probe) continue;

        // Parse <ausgabe>-Tags
        const parsed: Record<string, number> = {};
        let match;
        while ((match = ausgabeRegex.exec(body)) !== null) {
          parsed[match[1]] = Number(match[2]);
        }
        // Sinnvolle LSt erwartet (LSTLZZ > 0). Wenn 0 zurückkommt,
        // probiere die nächste Code-Variante (z.B. ext/std falsch).
        // Aber: bei wirklich 0 LSt (niedriges Einkommen) ist 0 korrekt —
        // wir akzeptieren 0 nur, wenn es auch die LETZTE Variante ist.
        const hasLst = (parsed.LSTLZZ ?? 0) > 0 || (parsed.LSTJAHR ?? 0) > 0;
        if (!hasLst) {
          // Als Fallback merken, aber weiter probieren
          if (!xmlText) { xmlText = body; usedUrl = baseUrl; usedCode = code; raw = parsed; }
          continue;
        }

        xmlText = body;
        usedUrl = baseUrl;
        usedCode = code;
        raw = parsed;
        break;
      } catch (err) {
        attempts.push({
          url: baseUrl, code, status: 0, contentType: '', preview: '',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (Object.keys(raw).length === 0) {
      return new Response(JSON.stringify({
        ok:     false,
        error:  'BMF: keine <ausgabe>-Tags in Antwort',
        attempts,   // Array mit URL/Status/ContentType/Preview pro Versuch
      }), {
        status:  502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      ok:      true,
      source:  usedUrl,
      code:    usedCode,
      lstlzz:  raw.LSTLZZ  ?? 0,  // Lohnsteuer in Cents (für den LZZ)
      solzlzz: raw.SOLZLZZ ?? 0,  // Soli in Cents
      bk:      raw.BK      ?? 0,
      bks:     raw.BKS     ?? 0,
      raw,
      // Debug: was wurde an BMF gesendet (alle Parameter)
      requestSent: Object.fromEntries(queryParams.entries()),
      probeResult,
    }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({
      ok:    false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }), {
      status:  500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
