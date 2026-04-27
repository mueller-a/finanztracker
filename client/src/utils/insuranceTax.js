/**
 * Steuerberechnung für private Rentenversicherungen (Schicht 3 DE).
 *
 * Rechtsgrundlagen (siehe Skills "domain-versicherungen" + "steuern-de"):
 *   - KEINE Abgeltungsteuer während der Ansparphase (kein § 20 Nr. 7 EStG).
 *   - Szenario A (Kapitalabfindung): Halbeinkünfteverfahren nach § 20 Abs. 1 Nr. 6 EStG
 *     → wenn Vertragslaufzeit ≥ 12 J und Auszahlung nach vollendetem 62. LJ,
 *       sind 50 % des Gewinns steuerfrei, der Rest mit dem persönlichen Satz.
 *   - Szenario B (Verrentung): Ertragsanteilbesteuerung nach § 22 Nr. 1 S. 3 lit. a EStG
 *     → nur der Ertragsanteil der Monatsrente wird versteuert.
 */

/**
 * @typedef {object} LumpSumTaxInput
 * @property {number} payoutAmount          Einmalzahlung brutto (€)
 * @property {number} totalContributions    Summe eingezahlter Beiträge (€)
 * @property {number} contractDurationYears Vertragslaufzeit bis Auszahlung (Jahre)
 * @property {number} ageAtPayout           Alter bei Auszahlung (Jahre)
 * @property {number} personalTaxRate       Persönlicher Steuersatz (%)
 */

/**
 * @typedef {object} LumpSumTaxResult
 * @property {number}  brutto
 * @property {number}  gewinn
 * @property {number}  steuerpflichtigerErtrag
 * @property {number}  steuer
 * @property {number}  netto
 * @property {boolean} qualifiesForHalbeinkuenfte
 * @property {boolean} meetsDuration
 * @property {boolean} meetsAge
 * @property {string[]} warnings
 */

/**
 * @typedef {object} AnnuityTaxInput
 * @property {number} monthlyPension        Monatliche Bruttorente (€)
 * @property {number} ageAtRetirementStart  Alter bei Rentenbeginn (Jahre)
 * @property {number} personalTaxRate       Persönlicher Steuersatz (%)
 */

/**
 * @typedef {object} AnnuityTaxResult
 * @property {number} brutto
 * @property {number} ertragsanteilPct
 * @property {number} steuerpflichtig
 * @property {number} steuer
 * @property {number} netto
 */

/**
 * Ertragsanteil-Tabelle nach § 22 Nr. 1 S. 3 lit. a Doppelbuchstabe bb EStG
 * (lineare Leibrenten). Alter = vollendetes Lebensjahr bei Rentenbeginn.
 * Werte für 60–80 sind die offiziellen Prozentsätze; außerhalb wird geklemmt.
 */
const ERTRAGSANTEIL_TABLE = {
  60: 22, 61: 22, 62: 21, 63: 20, 64: 19, 65: 18, 66: 18, 67: 17,
  68: 16, 69: 16, 70: 15, 71: 14, 72: 14, 73: 13, 74: 13, 75: 11,
  76: 11, 77: 10, 78: 10, 79: 9,  80: 9,
};

/**
 * Liefert den Ertragsanteil in Prozent für das Alter bei Rentenbeginn.
 * Werte < 60 werden auf 22 % geklemmt, Werte > 80 auf 9 %.
 *
 * @param {number} ageAtRetirementStart
 * @returns {number} Ertragsanteil in Prozent (ganze Zahl)
 */
export function getErtragsanteil(ageAtRetirementStart) {
  if (ageAtRetirementStart == null || Number.isNaN(ageAtRetirementStart)) return 18;
  const age = Math.floor(Number(ageAtRetirementStart));
  if (age < 60) return 22;
  if (age > 80) return 9;
  return ERTRAGSANTEIL_TABLE[age] ?? 18;
}

/**
 * Szenario A: Einmalauszahlung nach dem Halbeinkünfteverfahren.
 *
 * @param {LumpSumTaxInput} input
 * @returns {LumpSumTaxResult}
 */
export function computeLumpSumTax(input) {
  const brutto        = Math.max(0, Number(input?.payoutAmount) || 0);
  const einzahlungen  = Math.max(0, Number(input?.totalContributions) || 0);
  const gewinn        = Math.max(0, brutto - einzahlungen);
  const stSatz        = (Number(input?.personalTaxRate) || 0) / 100;

  const durationYears = Number(input?.contractDurationYears) || 0;
  const age           = Number(input?.ageAtPayout) || 0;
  const meetsDuration = durationYears >= 12;
  const meetsAge      = age >= 62;
  const qualifies     = meetsDuration && meetsAge;

  // Halbeinkünfte: 50 % steuerfrei, sonst voller Gewinn (Fallback-Regel).
  const steuerpflichtigerErtrag = qualifies ? gewinn * 0.5 : gewinn;
  const steuer = steuerpflichtigerErtrag * stSatz;
  const netto  = brutto - steuer;

  const warnings = [];
  if (!meetsDuration) {
    warnings.push(`Vertragslaufzeit nur ${durationYears.toFixed(1)} Jahre (< 12) — Halbeinkünfteverfahren greift nicht.`);
  }
  if (!meetsAge) {
    warnings.push(`Alter bei Auszahlung ${Math.floor(age)} (< 62) — Halbeinkünfteverfahren greift nicht.`);
  }

  return {
    brutto,
    gewinn,
    steuerpflichtigerErtrag,
    steuer,
    netto,
    qualifiesForHalbeinkuenfte: qualifies,
    meetsDuration,
    meetsAge,
    warnings,
  };
}

/**
 * Szenario B: Monatliche Rente mit Ertragsanteilbesteuerung.
 *
 * @param {AnnuityTaxInput} input
 * @returns {AnnuityTaxResult}
 */
export function computeAnnuityTax(input) {
  const brutto = Math.max(0, Number(input?.monthlyPension) || 0);
  const ertragsanteilPct = getErtragsanteil(input?.ageAtRetirementStart);
  const steuerpflichtig  = brutto * (ertragsanteilPct / 100);
  const stSatz = (Number(input?.personalTaxRate) || 0) / 100;
  const steuer = steuerpflichtig * stSatz;
  const netto  = brutto - steuer;

  return {
    brutto,
    ertragsanteilPct,
    steuerpflichtig,
    steuer,
    netto,
  };
}
