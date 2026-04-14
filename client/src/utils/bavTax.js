/**
 * Steuerberechnung für betriebliche Altersvorsorge (bAV).
 *
 * Rechtsgrundlagen:
 *   - §22 Nr. 5 EStG: Betriebsrenten aus Direktversicherung / Pensionskasse /
 *     Pensionsfonds sind im Alter zu **100 %** einkommensteuerpflichtig
 *     (nachgelagerte Besteuerung bei Entgeltumwandlung).
 *   - §226 Abs. 2 SGB V: **Versorgungsfreibetrag** (KV-Freibetrag) —
 *     Betriebsrenten unter dem Freibetrag sind KV-beitragsfrei.
 *     Ab 2026: 176,75 €/Monat.
 *   - Pflegeversicherung: kein Freibetrag, voller Beitrag auf gesamte Rente.
 *
 * Unterschied zur privaten Rentenversicherung (Schicht 3):
 *   - Private RV: nur der Ertragsanteil (z.B. 17% mit 67) wird besteuert, keine SV.
 *   - bAV: 100% des Bruttobetrags werden besteuert + KV/PV-Abzüge.
 *   → Massiv höhere Abzüge bei bAV im Vergleich zu privater RV!
 */

// ── Sozialversicherungs-Parameter 2026 ───────────────────────────────────────
const KV_FREIBETRAG_MONAT_2026 = 176.75;       // §226 Abs. 2 SGB V (Stand 2026)
const KV_BEITRAGSSATZ_VOLL     = 0.146;         // 14,6% allg. Beitragssatz
const KV_ZUSATZBEITRAG_DURCHSCHNITT = 0.017;    // ~1,7% Durchschnitt 2026
const PV_BEITRAGSSATZ_2026     = 0.036;          // 3,6% (voller Satz für Kinderlose, Rentner zahlen voll)
// Note: Rentner zahlen den vollen KV+PV-Satz auf Betriebsrenten (§§248, 249a SGB V)

/**
 * @typedef {object} BavLumpSumTaxResult
 * @property {number} brutto
 * @property {number} steuer
 * @property {number} kvBeitrag
 * @property {number} pvBeitrag
 * @property {number} svGesamt
 * @property {number} netto
 * @property {number} kvFreibetragMonat
 * @property {string} hinweis
 */

/**
 * @typedef {object} BavAnnuityTaxResult
 * @property {number} brutto
 * @property {number} steuer
 * @property {number} kvBeitrag
 * @property {number} pvBeitrag
 * @property {number} svGesamt
 * @property {number} netto
 * @property {number} kvBemessung  – KV-beitragspflichtiger Anteil (nach Freibetrag)
 * @property {number} kvFreibetragMonat
 */

/**
 * Szenario A: Einmalauszahlung der bAV.
 *
 * - 100% einkommensteuerpflichtig (§22 Nr. 5 EStG)
 * - KV/PV: Betriebsrenten-Regelung, aber bei Einmalauszahlung wird die
 *   Auszahlung auf 120 Monate verteilt (§229 Abs. 1 S. 3 SGB V).
 *   → Monatlicher fiktiver Betrag = Einmalauszahlung / 120.
 *   → KV-Freibetrag wird pro fiktivem Monat angewendet.
 *
 * @param {object} input
 * @param {number} input.payoutAmount     – Einmalauszahlung brutto (€)
 * @param {number} input.personalTaxRate  – Persönlicher Steuersatz (%)
 * @param {number} [input.kvZusatzbeitrag] – GKV-Zusatzbeitrag in % (default 1,7)
 * @param {boolean} [input.isPkv]         – true = PKV (keine SV-Abzüge)
 * @returns {BavLumpSumTaxResult}
 */
export function computeBavLumpSumTax(input) {
  const brutto = Math.max(0, Number(input?.payoutAmount) || 0);
  const stSatz = (Number(input?.personalTaxRate) || 0) / 100;
  const isPkv  = !!input?.isPkv;

  // Einkommensteuer: 100% des Bruttos
  const steuer = brutto * stSatz;

  // SV-Berechnung bei GKV: Einmalauszahlung / 120 Monate = fiktiver Monatsbetrag
  let kvBeitrag = 0;
  let pvBeitrag = 0;

  if (!isPkv && brutto > 0) {
    const fiktivMonat = brutto / 120;
    const kvZusatz    = (Number(input?.kvZusatzbeitrag) || KV_ZUSATZBEITRAG_DURCHSCHNITT * 100) / 100;
    const kvSatz      = KV_BEITRAGSSATZ_VOLL + kvZusatz;

    // KV: Freibetrag pro Monat anwenden, dann über 120 Monate
    const kvBemessungMonat = Math.max(0, fiktivMonat - KV_FREIBETRAG_MONAT_2026);
    kvBeitrag = kvBemessungMonat * kvSatz * 120;

    // PV: kein Freibetrag, voller Betrag
    pvBeitrag = fiktivMonat * PV_BEITRAGSSATZ_2026 * 120;
  }

  const svGesamt = kvBeitrag + pvBeitrag;
  const netto    = brutto - steuer - svGesamt;

  return {
    brutto,
    steuer,
    kvBeitrag,
    pvBeitrag,
    svGesamt,
    netto: Math.max(0, netto),
    kvFreibetragMonat: KV_FREIBETRAG_MONAT_2026,
    hinweis: isPkv
      ? 'PKV: Keine SV-Abzüge auf Betriebsrenten.'
      : `GKV: Einmalauszahlung wird auf 120 Monate verteilt (§229 SGB V). KV-Freibetrag ${KV_FREIBETRAG_MONAT_2026} €/Monat.`,
  };
}

/**
 * Szenario B: Monatliche Betriebsrente.
 *
 * - 100% einkommensteuerpflichtig (§22 Nr. 5 EStG)
 * - KV: nur der Teil über dem Freibetrag (176,75 €/Mon) wird verbeitragt
 * - PV: voller Beitrag auf gesamte Rente (kein Freibetrag)
 *
 * @param {object} input
 * @param {number} input.monthlyPension   – Brutto-Betriebsrente pro Monat (€)
 * @param {number} input.personalTaxRate  – Persönlicher Steuersatz (%)
 * @param {number} [input.kvZusatzbeitrag] – GKV-Zusatzbeitrag in % (default 1,7)
 * @param {boolean} [input.isPkv]         – true = PKV (keine SV-Abzüge)
 * @returns {BavAnnuityTaxResult}
 */
export function computeBavAnnuityTax(input) {
  const brutto = Math.max(0, Number(input?.monthlyPension) || 0);
  const stSatz = (Number(input?.personalTaxRate) || 0) / 100;
  const isPkv  = !!input?.isPkv;

  // Einkommensteuer: 100%
  const steuer = brutto * stSatz;

  let kvBeitrag   = 0;
  let pvBeitrag   = 0;
  let kvBemessung = 0;

  if (!isPkv && brutto > 0) {
    const kvZusatz = (Number(input?.kvZusatzbeitrag) || KV_ZUSATZBEITRAG_DURCHSCHNITT * 100) / 100;
    const kvSatz   = KV_BEITRAGSSATZ_VOLL + kvZusatz;

    // KV: Freibetrag abziehen
    kvBemessung = Math.max(0, brutto - KV_FREIBETRAG_MONAT_2026);
    kvBeitrag   = kvBemessung * kvSatz;

    // PV: kein Freibetrag
    pvBeitrag = brutto * PV_BEITRAGSSATZ_2026;
  }

  const svGesamt = kvBeitrag + pvBeitrag;
  const netto    = brutto - steuer - svGesamt;

  return {
    brutto,
    steuer,
    kvBeitrag,
    pvBeitrag,
    svGesamt,
    netto: Math.max(0, netto),
    kvBemessung,
    kvFreibetragMonat: KV_FREIBETRAG_MONAT_2026,
  };
}

/**
 * Vergleich: Private Rentenversicherung (Ertragsanteil) vs. bAV (Vollversteuerung).
 *
 * Zeigt auf einen Blick, wie viel mehr Abzüge bei bAV anfallen.
 *
 * @param {object} input
 * @param {number} input.monthlyPension        – Bruttorente (€/Monat)
 * @param {number} input.personalTaxRate       – Pers. Steuersatz (%)
 * @param {number} input.ageAtRetirementStart  – Alter bei Rentenbeginn (für Ertragsanteil)
 * @param {boolean} [input.isPkv]
 * @param {number} [input.kvZusatzbeitrag]
 * @returns {{ bavNetto, privatNetto, differenz, bavAbzuege, privatAbzuege }}
 */
export function compareBavVsPrivat(input) {
  // bAV
  const bav = computeBavAnnuityTax(input);

  // Private RV — import-free: inline Ertragsanteil
  const ERTRAGSANTEIL = {
    60: 22, 61: 22, 62: 21, 63: 20, 64: 19, 65: 18, 66: 18, 67: 17,
    68: 16, 69: 16, 70: 15, 71: 14, 72: 14, 73: 13, 74: 13, 75: 11,
  };
  const age = Math.floor(Number(input?.ageAtRetirementStart) || 67);
  const ea  = age < 60 ? 22 : age > 75 ? 11 : (ERTRAGSANTEIL[age] ?? 18);

  const brutto        = bav.brutto;
  const stSatz        = (Number(input?.personalTaxRate) || 0) / 100;
  const privatSteuer  = brutto * (ea / 100) * stSatz;
  const privatSV      = 0; // Schicht-3: KVdR regelmäßig beitragsfrei
  const privatNetto   = brutto - privatSteuer - privatSV;

  return {
    bavNetto:       bav.netto,
    privatNetto:    Math.max(0, privatNetto),
    differenz:      Math.max(0, privatNetto) - bav.netto,
    bavAbzuege:     bav.steuer + bav.svGesamt,
    privatAbzuege:  privatSteuer + privatSV,
    bavDetail:      bav,
    ertragsanteilPct: ea,
  };
}
