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

    // PKV/GKV Parameter
    // PKV: 0 = GKV, 1 = PKV (privat), 2 = PKV mit privater PV
    const PKV = gh.ghKvType === 'pkv' ? 2 : 0;

    // PKPV = Jahres-PKV-Beitrag (Gesamt) in Cents, nur relevant bei PKV > 0
    const pkpvJahr = gh.ghKvType === 'pkv'
      ? toCents((gh.ghPkvBasis || gh.ghPkvBeitrag || 0) * 12)
      : 0;

    // KVZ = GKV-Zusatzbeitrag in Promille (also z.B. 2,48% → 24,8 → 25 gerundet)
    // BMF erwartet den Wert als Promille × 10 (also in Hundertstel-Prozent)
    const KVZ = Math.round((gh.ghGkvZusatz || 0) * 100);

    // PVZ = Zuschlag für Kinderlose (0 = nein, 1 = ja)
    const PVZ = (gh.ghKinder || 0) === 0 ? 1 : 0;

    // ZKF = Kinderfreibetrag (Anzahl halbe Freibeträge, 0.5 Schritte)
    const ZKF = gh.ghKinderFB || 0;

    // Konfession: 0 = keine, 1 = ev/rk
    const R = gh.ghKist ? 1 : 0;

    const body = {
      code:   'ext2026',
      LZZ:    1,              // 1 = Jahr
      RE4:    toCents(jahresbrutto),
      STKL:   gh.ghStkl || 1,
      ZKF,
      PKV,
      PVZ,
      R,
      ZMVB:   12,
      KVZ,
      PKPV:   pkpvJahr,
      f:      1,              // Faktor Stkl. 4 = 1
      AJAHR:  0,
      ALTER1: 0,
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
