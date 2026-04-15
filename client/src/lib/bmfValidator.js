/**
 * BMF Lohnsteuer-Validator
 *
 * Ruft die offizielle Lohnsteuer-Berechnungs-API des Bundesfinanzministeriums
 * über eine Supabase Edge Function auf (CORS-Proxy) und vergleicht das
 * Ergebnis mit der lokalen Berechnung.
 *
 * Schnittstelle: LSt2026ext
 * Proxy: /functions/v1/bmf-lst-validator
 */

import { supabase } from './supabaseClient';

/** Euro → Cents (Integer) */
function toCents(euro) {
  return Math.round((Number(euro) || 0) * 100);
}

/** Cents → Euro */
function fromCents(cents) {
  return (Number(cents) || 0) / 100;
}

/**
 * Validate local salary calculation against BMF API.
 *
 * @param {object} gh - Gehalts-State (gleich wie für calcGehaltResult)
 * @param {object} localResult - Ergebnis von calcGehaltResult()
 * @returns {Promise<{ok, bmfLstJahr, localLstJahr, diff, match, bmfSoliJahr, raw, error}>}
 */
export async function fetchBmfTaxValidation(gh, localResult) {
  try {
    // Build BMF request parameters
    // LSt2026ext erwartet RE4 = zu versteuerndes Einkommen × 100 (in Cents)
    // Wir übergeben das Jahresbrutto und lassen die BMF die Abzüge intern berechnen
    // — alternativ können wir den RE4 direkt mit unserem eigenen ZVE füttern
    // (aber das erfordert dass VSP etc. identisch sind).
    //
    // Saubere Variante: Wir übergeben das **Jahresbrutto** als RE4
    // und die PKV-Beiträge als PKPV, dann rechnet die BMF selbst.

    const jahresbrutto = (gh.ghBrutto || 0) * 12;

    // Parameter gemäss offizieller BMF-Schnittstellenbeschreibung
    // "Lohnsteuer2026" (siehe
    //  https://www.bmf-steuerrechner.de/javax.faces.resource/daten/xmls/Lohnsteuer2026.xml.xhtml):
    //
    // RE4   = Arbeitslohn für aktuellen LZZ (Cent) — bei LZZ=1 = Jahresbrutto
    // JRE4  = Jahresarbeitslohn ohne sonstige Bezüge (Cent)
    // KVZ   = GKV-Zusatzbeitrag in PROZENT (z.B. 2.5), NICHT ‰ × 10
    // PKV   = 0 = GKV, 1 = PKV
    // PKPV  = PKV-AN-Beitrag MONATLICH in Cent (nicht × 12)
    // PKPVAGZ = AG-Zuschuss zur PKV MONATLICH in Cent
    // R     = Religionsgemeinschaft (0=keine) — Pflichtfeld
    // f     = Faktor Stkl. IV (3 Dezimalstellen); af = 1 bei Faktorverfahren
    // ALV   = 0 = arbeitslosenversichert
    // KRV   = 0 = rentenversichert

    const isPkv = gh.ghKvType === 'pkv';
    const body = {
      // `code` wird in der Edge Function durch die BMF_ATTEMPTS-Matrix überschrieben;
      // der Default-Wert hier ist nur ein Fallback.
      code:   'LSt2026std',
      LZZ:    1,                                           // 1 = Jahr
      RE4:    toCents(jahresbrutto),
      JRE4:   toCents(jahresbrutto),                       // bei LZZ=1 gleich RE4
      STKL:   gh.ghStkl || 1,
      R:      gh.ghKist ? 1 : 0,                           // Pflichtfeld!
      ZKF:    gh.ghKinderFB || 0,
      PKV:    isPkv ? 1 : 0,                               // 0/1, NICHT 0/1/2
      PVZ:    (gh.ghKinder || 0) === 0 ? 1 : 0,            // Zuschlag f. Kinderlose
      KVZ:    gh.ghGkvZusatz || 0,                         // in PROZENT, nicht ‰
      PKPV:   isPkv ? toCents(gh.ghPkvBasis || gh.ghPkvBeitrag || 0) : 0,     // MONATLICH
      PKPVAGZ:isPkv ? toCents(gh.ghPkvAgZuschuss || 0)                         // MONATLICH
                    : 0,
      f:      1,                                           // kein Faktorverfahren
      af:     0,
      ALV:    0,
      KRV:    0,
      AJAHR:  0,
      ALTER1: 0,
      ZMVB:   0,
    };

    // Call via Edge Function proxy
    const { data, error } = await supabase.functions.invoke('bmf-lst-validator', { body });

    if (error) {
      return { ok: false, error: error.message || 'Edge function error' };
    }

    if (!data?.ok) {
      return { ok: false, error: data?.error || 'BMF API error' };
    }

    // BMF gibt die Werte für den LZZ zurück — bei LZZ=1 (Jahr) also als Jahreswert.
    // Die Werte sind in Cents.
    const bmfLstJahr  = fromCents(data.lstlzz);
    const bmfSoliJahr = fromCents(data.solzlzz);

    const localLstJahr = Math.round(localResult.lstJahr);
    const diff         = Math.round((bmfLstJahr - localLstJahr) * 100) / 100;
    const match        = Math.abs(diff) < 1; // Tolerance: 1 €/Jahr

    return {
      ok: true,
      bmfLstJahr,
      bmfSoliJahr,
      localLstJahr,
      diff,
      diffPct: localLstJahr > 0 ? Math.round(diff / localLstJahr * 10000) / 100 : 0,
      match,
      raw: data.raw,
    };
  } catch (err) {
    return { ok: false, error: err.message || 'Network error' };
  }
}
