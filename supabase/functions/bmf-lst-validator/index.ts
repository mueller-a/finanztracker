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

// BMF hält mehrere URL+Code-Kombinationen parallel vor. Wir probieren sie der
// Reihe nach, bis eine gültiges XML mit <ausgabe>-Tags liefert.
// - URL `XXXXVersion1.xhtml` erwartet code=LStXXXXext oder LStXXXXstd
// - ext = "erweiterte" Variante (volle Vorsorgepauschale)
// - std = "standard" Variante
const BMF_ATTEMPTS: Array<{ url: string; code: string }> = [
  { url: 'https://www.bmf-steuerrechner.de/interface/2026Version1.xhtml', code: 'LSt2026ext' },
  { url: 'https://www.bmf-steuerrechner.de/interface/2026Version1.xhtml', code: 'LSt2026std' },
  { url: 'https://www.bmf-steuerrechner.de/interface/2025Version1.xhtml', code: 'LSt2025ext' },
  { url: 'https://www.bmf-steuerrechner.de/interface/2025Version1.xhtml', code: 'LSt2025std' },
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

    // Build query string for BMF URL
    // `code` wird pro Attempt gesetzt (siehe BMF_ATTEMPTS unten) — der Wert
    // aus `params.code` wird ignoriert, weil unser Fallback-Matrix-Ansatz die
    // zuverlässigen Kombinationen kennt.
    const queryParams = new URLSearchParams({
      code:    'PLACEHOLDER',
      LZZ:     String(params.LZZ     ?? 1),    // 1 = Jahr
      RE4:     String(params.RE4     ?? 0),    // zu versteuerndes Einkommen in Cents
      STKL:    String(params.STKL    ?? 1),
      ZKF:     String(params.ZKF     ?? 0),
      PKV:     String(params.PKV     ?? 0),    // 0 = GKV, 1 = PKV
      PVZ:     String(params.PVZ     ?? 0),
      R:       String(params.R       ?? 0),
      ZMVB:    String(params.ZMVB    ?? 12),
      KVZ:     String(params.KVZ     ?? 0),    // GKV-Zusatzbeitrag in ‰
      PKPV:    String(params.PKPV    ?? 0),    // PKV/PV-Beitrag in Cents
      AJAHR:   String(params.AJAHR   ?? 0),
      ALTER1:  String(params.ALTER1  ?? 0),
      f:       String(params.f       ?? 1),
      VBEZ:    String(params.VBEZ    ?? 0),
      VBEZM:   String(params.VBEZM   ?? 0),
      VBEZS:   String(params.VBEZS   ?? 0),
      VBS:     String(params.VBS     ?? 0),
      VJAHR:   String(params.VJAHR   ?? 0),
      KRV:     String(params.KRV     ?? 0),
      LZZHINZU: String(params.LZZHINZU ?? 0),
      LZZFREIB: String(params.LZZFREIB ?? 0),
      SONSTB:  String(params.SONSTB  ?? 0),
      SONSTENT: String(params.SONSTENT ?? 0),
      STERBE:  String(params.STERBE  ?? 0),
      VKAPA:   String(params.VKAPA   ?? 0),
      VMT:     String(params.VMT     ?? 0),
      ZKRV:    String(params.ZKRV    ?? 0),
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

        xmlText = body;
        usedUrl = baseUrl;
        usedCode = code;
        let match;
        raw = {};
        while ((match = ausgabeRegex.exec(body)) !== null) {
          raw[match[1]] = Number(match[2]);
        }
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
