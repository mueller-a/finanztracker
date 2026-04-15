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

const BMF_URL = 'https://www.bmf-steuerrechner.de/interface/2026Version1.xhtml';

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
    // Default values required by the BMF XSD
    const queryParams = new URLSearchParams({
      code:    params.code    ?? 'ext2026',
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

    const bmfUrl = `${BMF_URL}?${queryParams.toString()}`;

    const bmfResponse = await fetch(bmfUrl, {
      headers: {
        'Accept':     'application/xml, text/xml',
        'User-Agent': 'InsureTrack-Validator/1.0',
      },
    });

    if (!bmfResponse.ok) {
      return new Response(JSON.stringify({
        ok:     false,
        error:  `BMF API returned ${bmfResponse.status}`,
        status: bmfResponse.status,
      }), {
        status:  502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const xmlText = await bmfResponse.text();

    // Parse the XML — BMF returns flat <ausgaben> elements like:
    //   <ausgabe name="LSTLZZ" value="190030" type="STANDARD"/>
    //   <ausgabe name="SOLZLZZ" value="0" type="STANDARD"/>
    const raw: Record<string, number> = {};
    const ausgabeRegex = /<ausgabe\s+name="([^"]+)"\s+value="([^"]+)"/g;
    let match;
    while ((match = ausgabeRegex.exec(xmlText)) !== null) {
      raw[match[1]] = Number(match[2]);
    }

    return new Response(JSON.stringify({
      ok:      true,
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
