/**
 * Steuer- und SV-Berechnung für die gesetzliche Rente (GRV / DRV).
 *
 * Rechtsgrundlagen:
 *   - §22 Nr. 1 S. 3 lit. a Doppelbuchstabe aa EStG: **Kohortenregel** für
 *     Bestandsrenten — der steuerpflichtige Anteil hängt vom Jahr des
 *     Rentenbeginns ab. Seit 2023 wird der Anstieg verlangsamt, sodass
 *     die 100%-Besteuerung erst 2058 erreicht ist.
 *       · Rentenbeginn 2005:   50 %
 *       · Rentenbeginn 2020:   80 %
 *       · Rentenbeginn 2023:   82,5 %
 *       · Rentenbeginn 2024:   83 %
 *       · Rentenbeginn 2025:   83,5 %
 *       · Rentenbeginn 2026:   84 %   (lineare +0,5%/Jahr bis 2058 = 100%)
 *   - §228 Abs. 2 SGB V / §§ 248, 249a SGB V: **GKV-Rentner (KVdR)** —
 *     Rentner zahlen auf die GRV nur den **halben Beitragssatz**
 *     (hälftiger allg. Satz + hälftiger Zusatzbeitrag). Zusätzlich die
 *     halbe Rente wird durch die Rentenversicherung selbst gezahlt.
 *   - PV: voller Beitragssatz (kein Freibetrag, keine Teilung).
 *
 * ACHTUNG: Die aufgabenrelevante Vereinfachung ("86% steuerpflichtig")
 * aus SKILL.md / Aufgabe weicht von der realen Kohortenregel (84% für 2026)
 * ab. Die Utility folgt strikt dem Gesetzestext; das User-Request-Value
 * kann über `rentenbeginn` durchgereicht werden oder als Override.
 */

// ── Sozialversicherung 2026 ──────────────────────────────────────────────────
const KV_BEITRAGSSATZ_VOLL         = 0.146;   // allg. Beitragssatz 14,6%
const KV_ZUSATZBEITRAG_DURCHSCHNITT = 0.017;  // ~1,7% Durchschnitt 2026
const PV_BEITRAGSSATZ_2026         = 0.036;   // 3,6% (für Rentner: voll)

/**
 * Steuerpflichtiger Anteil der GRV nach Rentenbeginn-Jahr (Kohortenregel).
 *
 * Lineare Fortschreibung:
 *   - 2005 = 50%, ab 2023 = 82,5%, danach +0,5%/Jahr bis 2058 = 100%
 *
 * @param {number} rentenbeginnJahr
 * @returns {number} Anteil in Prozent (0–100)
 */
export function getSteuerpflichtigerAnteil(rentenbeginnJahr) {
  const jahr = Number(rentenbeginnJahr);
  if (!Number.isFinite(jahr)) return 84;
  if (jahr <= 2005) return 50;
  if (jahr >= 2058) return 100;

  // Zwei Stufen: vor/nach 2023 (Wachstumsverlangsamung durch WachstumschancenG)
  if (jahr <= 2020) {
    // +1%/Jahr von 2005 bis 2020 (50% → 80%)
    return 50 + (jahr - 2005) * 2;
  }
  if (jahr <= 2022) {
    // +1%/Jahr (80% → 82%)
    return 80 + (jahr - 2020) * 1;
  }
  // Ab 2023: +0,5%/Jahr (82,5% bei 2023 → 100% bei 2058)
  return Math.min(100, 82 + (jahr - 2022) * 0.5);
}

/**
 * @typedef {object} GrvTaxResult
 * @property {number} brutto
 * @property {number} steuerpflichtigPct   Kohorten-Anteil (z.B. 84 für 2026)
 * @property {number} steuerpflichtig      EUR-Betrag, auf den Einkommensteuer anfällt
 * @property {number} steuer
 * @property {number} kvBeitrag            GKV-Beitrag (halber Satz bei KVdR)
 * @property {number} pvBeitrag            PV voll
 * @property {number} svGesamt
 * @property {number} netto
 * @property {number} netto_real           Kaufkraft heute (nach Inflation bis Rentenbeginn)
 */

/**
 * Berechnet die monatliche Netto-Rente aus der gesetzlichen Rente.
 *
 * @param {object} input
 * @param {number} input.monthlyPension       Bruttorente (€/Monat)
 * @param {number} input.personalTaxRate      Persönlicher Steuersatz (%)
 * @param {number} [input.rentenbeginnJahr]   Jahr des Rentenbeginns (default 2026)
 * @param {boolean} [input.isPkv]             PKV-Status (default false = GKV/KVdR)
 * @param {number} [input.kvZusatzbeitrag]    GKV-Zusatzbeitrag in % (default 1,7)
 * @param {number} [input.yearsUntilRente]    Jahre bis Rentenbeginn (für Real-Netto)
 * @param {number} [input.inflationRate]      Inflation p.a. in % (für Real-Netto)
 * @param {number} [input.steuerpflichtigPctOverride]  User-Override (z.B. 86 für Annahme aus Aufgabe)
 * @returns {GrvTaxResult}
 */
export function computeGrvTax(input) {
  const brutto = Math.max(0, Number(input?.monthlyPension) || 0);
  const stSatz = (Number(input?.personalTaxRate) || 0) / 100;
  const isPkv  = !!input?.isPkv;
  const rentenbeginnJahr = Number(input?.rentenbeginnJahr) || 2026;

  // Steuerpflichtiger Anteil (Kohortenregel) — override-bar für Szenario-Annahmen
  const steuerpflichtigPct = input?.steuerpflichtigPctOverride != null
    ? Number(input.steuerpflichtigPctOverride)
    : getSteuerpflichtigerAnteil(rentenbeginnJahr);

  const steuerpflichtig = brutto * (steuerpflichtigPct / 100);
  const steuer          = steuerpflichtig * stSatz;

  // SV bei GKV-Rentner (KVdR): halber allgemeiner Beitragssatz + halber Zusatzbeitrag,
  // PV mit vollem Satz (kein Freibetrag).
  let kvBeitrag = 0;
  let pvBeitrag = 0;
  if (!isPkv && brutto > 0) {
    const kvZusatzDezimal = (Number(input?.kvZusatzbeitrag) || KV_ZUSATZBEITRAG_DURCHSCHNITT * 100) / 100;
    const kvSatzHalb      = KV_BEITRAGSSATZ_VOLL / 2 + kvZusatzDezimal / 2;
    kvBeitrag             = brutto * kvSatzHalb;
    pvBeitrag             = brutto * PV_BEITRAGSSATZ_2026;
  }

  const svGesamt = kvBeitrag + pvBeitrag;
  const netto    = Math.max(0, brutto - steuer - svGesamt);

  // Real-Netto (Kaufkraft heute) — optional
  let netto_real = netto;
  const y = Number(input?.yearsUntilRente);
  const i = Number(input?.inflationRate);
  if (Number.isFinite(y) && y > 0 && Number.isFinite(i) && i > 0) {
    netto_real = netto / Math.pow(1 + i / 100, y);
  }

  return {
    brutto,
    steuerpflichtigPct,
    steuerpflichtig,
    steuer,
    kvBeitrag,
    pvBeitrag,
    svGesamt,
    netto,
    netto_real,
  };
}
