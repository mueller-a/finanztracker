/**
 * Netto-Rentenberechnung nach Steuern und Sozialversicherung.
 *
 * Berücksichtigt:
 *   - Persönlicher Steuersatz im Alter
 *   - PKV vs. GKV Status (PKV: 0 € SV, GKV: ~19% KV+PV)
 *   - Typ-spezifische Besteuerung:
 *       · bAV / DRV / AVD : voll nachgelagert
 *       · insurance (Schicht 3): Ertragsanteilbesteuerung §22 EStG — NICHT voll
 *         besteuert! Ertragsanteil nach Alter bei Rentenbeginn (z.B. 17% mit 67).
 *         KVdR: Schicht-3-Rente ist regelmäßig beitragsfrei (siehe Skill "domain-versicherungen").
 *       · depot: Abgeltungssteuer nur auf Gewinnanteil, 30% Teilfreistellung
 */

import { computeAnnuityTax } from './insuranceTax';
import { computeBavAnnuityTax } from './bavTax';
import { computeGrvTax } from './grvTax';

const GKV_PV_RATE_ALTER = 0.189; // ~14.6% KV + 4.3% PV (Rentner-Beitrag voller Satz)

/**
 * Calculate net retirement income for a single policy.
 *
 * @param {string} type        – 'insurance' | 'bav' | 'avd' | 'depot' | 'drv'
 * @param {number} brutto      – Monthly gross income from this source
 * @param {number} steuerSatz  – Personal tax rate in retirement (0–100, percent)
 * @param {boolean} isPkv      – true = PKV (no SV deduction), false = GKV (~19%)
 * @param {object} [opts]      – Extra options per type
 * @param {number} [opts.gewinnAnteil]           For depot: share of withdrawal that is gain (0–1)
 * @param {number} [opts.ageAtRetirementStart]   For insurance: age at pension start (for Ertragsanteil)
 * @returns {{ brutto, steuer, sv, netto, details }}
 */
export function calculateNetRetirementIncome(type, brutto, steuerSatz, isPkv, opts) {
  if (!brutto || brutto <= 0) return { brutto: 0, steuer: 0, sv: 0, netto: 0, details: [] };

  var stSatz = (steuerSatz || 25) / 100;
  var steuer = 0;
  var sv     = 0;
  var details = [];

  if (type === 'bav') {
    // bAV: 100% nachgelagerte Besteuerung + KV/PV mit KV-Freibetrag (§226 SGB V)
    var bavTax = computeBavAnnuityTax({
      monthlyPension: brutto,
      personalTaxRate: steuerSatz || 25,
      isPkv: isPkv,
    });
    steuer = bavTax.steuer;
    sv     = bavTax.svGesamt;
    details = [
      { label: 'Bruttorente (bAV)', value: brutto, color: 'green' },
      { label: 'Einkommensteuer (' + Math.round(stSatz * 100) + '% auf 100%)', value: -steuer, color: 'red' },
      ...(isPkv
        ? [{ label: 'KV/PV (PKV)', value: 0, color: 'grey', note: 'PKV-Vorteil: 0 €' }]
        : [
            { label: 'KV (Freibetrag ' + bavTax.kvFreibetragMonat + ' €, auf ' + Math.round(bavTax.kvBemessung) + ' €)', value: -bavTax.kvBeitrag, color: 'red' },
            { label: 'PV (kein Freibetrag)', value: -bavTax.pvBeitrag, color: 'red' },
          ]),
    ];
  } else if (type === 'drv') {
    // Gesetzliche Rente: Kohortenregel §22 EStG (steuerpflichtiger Anteil
    // abhängig vom Rentenbeginn) + KVdR (halber KV-Satz + voller PV-Satz).
    var rentenJahr = opts && opts.rentenbeginnJahr;
    var grvTax = computeGrvTax({
      monthlyPension:             brutto,
      personalTaxRate:            steuerSatz || 25,
      rentenbeginnJahr:           rentenJahr,
      isPkv:                      isPkv,
      steuerpflichtigPctOverride: opts && opts.grvSteuerpflichtigPct,
    });
    steuer = grvTax.steuer;
    sv     = grvTax.svGesamt;
    details = [
      { label: 'Bruttorente (DRV)', value: brutto, color: 'green' },
      { label: 'Steuerpflichtig (' + grvTax.steuerpflichtigPct + '%, Kohortenregel)', value: grvTax.steuerpflichtig, color: 'grey' },
      { label: 'Einkommensteuer (' + Math.round(stSatz * 100) + '% auf steuerpfl. Anteil)', value: -steuer, color: 'red' },
      ...(isPkv
        ? [{ label: 'KV/PV (PKV)', value: 0, color: 'grey', note: 'PKV-Vorteil: 0 €' }]
        : [
            { label: 'KV (KVdR halber Satz)', value: -grvTax.kvBeitrag, color: 'red' },
            { label: 'PV (voller Satz)', value: -grvTax.pvBeitrag, color: 'red' },
          ]),
    ];
  } else if (type === 'insurance') {
    // Private Rentenversicherung Schicht 3: Ertragsanteilbesteuerung §22 EStG.
    // Nur der Ertragsanteil (z.B. 17% bei Alter 67) der Monatsrente wird mit dem
    // persönlichen Satz versteuert. SV ist in der KVdR regelmäßig beitragsfrei.
    var ageAtRetirementStart = (opts && opts.ageAtRetirementStart != null)
      ? opts.ageAtRetirementStart : 67;
    var annuityTax = computeAnnuityTax({
      monthlyPension: brutto,
      ageAtRetirementStart: ageAtRetirementStart,
      personalTaxRate: steuerSatz || 25,
    });
    steuer = annuityTax.steuer;
    sv     = 0; // Schicht-3-Rente regelmäßig beitragsfrei in der KVdR
    details = [
      { label: 'Bruttorente (RV)', value: brutto, color: 'green' },
      { label: 'Ertragsanteil (' + annuityTax.ertragsanteilPct + '%) §22 EStG', value: annuityTax.steuerpflichtig, color: 'grey' },
      { label: 'Einkommensteuer (' + Math.round(stSatz * 100) + '% auf Ertragsanteil)', value: -steuer, color: 'red' },
      { label: 'KV/PV', value: 0, color: 'grey', note: 'Schicht 3 — KVdR beitragsfrei' },
    ];
  } else if (type === 'avd') {
    // AVD: nachgelagert besteuert wie bAV
    steuer = brutto * stSatz;
    sv     = isPkv ? 0 : brutto * GKV_PV_RATE_ALTER;
    details = [
      { label: 'Bruttorente (AVD)', value: brutto, color: 'green' },
      { label: 'Einkommensteuer (' + Math.round(stSatz * 100) + '%)', value: -steuer, color: 'red' },
      ...(isPkv ? [{ label: 'KV/PV (PKV)', value: 0, color: 'grey', note: 'PKV-Vorteil: 0 €' }]
                : [{ label: 'KV/PV (GKV ~19%)', value: -sv, color: 'red' }]),
    ];
  } else if (type === 'depot') {
    // Freies ETF-Depot: Abgeltungssteuer nur auf Gewinnanteil, 30% Teilfreistellung
    var gewinnAnteil = (opts && opts.gewinnAnteil != null) ? opts.gewinnAnteil : 0.5;
    var steuerpflichtig = brutto * gewinnAnteil * 0.70; // 30% teilfreigestellt
    steuer = steuerpflichtig * 0.26375; // 25% + 5.5% Soli
    sv     = 0; // Keine SV auf Kapitalerträge
    details = [
      { label: 'Entnahme (brutto)', value: brutto, color: 'green' },
      { label: 'Gewinnanteil (' + Math.round(gewinnAnteil * 100) + '%)', value: brutto * gewinnAnteil, color: 'grey' },
      { label: 'Teilfreistellung (30%)', value: -(brutto * gewinnAnteil * 0.30), color: 'grey' },
      { label: 'Abgeltungssteuer (26,375%)', value: -steuer, color: 'red' },
      { label: 'KV/PV', value: 0, color: 'grey', note: 'Keine SV auf Kapitalerträge' },
    ];
  }

  var netto = Math.max(0, brutto - steuer - sv);

  return { brutto: brutto, steuer: steuer, sv: sv, netto: netto, details: details };
}

/**
 * Calculate net for all policies and return aggregated result.
 *
 * @param {Array} policies – array of { type, params, result }
 * @param {number} steuerSatz – percent
 * @param {boolean} isPkv
 * @param {object} [globalOpts]
 * @param {number} [globalOpts.birthYear] – for insurance: used to compute age at Rentenbeginn
 * @returns {{ totalBrutto, totalSteuer, totalSv, totalNetto, perPolicy: [] }}
 */
export function calculateTotalNetRetirement(policies, steuerSatz, isPkv, globalOpts) {
  var totalBrutto = 0, totalSteuer = 0, totalSv = 0, totalNetto = 0;
  var perPolicy = [];
  var birthYear = globalOpts && globalOpts.birthYear;

  policies.forEach(function(pol) {
    var r = pol.result;
    if (!r) return;

    // Default: monthly gross pension (possibleRente). Für DRV wollen wir
    // die Bruttorente vor den alten SV/Steuer-Abzügen — sonst würde
    // doppelt abgezogen, weil `calcDRV` bereits nettoRente in possibleRente speichert.
    var brutto = r.possibleRente || 0;
    if (pol.type === 'drv' && r.bruttoRente) {
      brutto = r.bruttoRente;
    }
    if (brutto <= 0) return;

    // Per-type options
    var opts = {};
    if (pol.type === 'depot' && r.kapBeiRente > 0 && r.totalEingezahlt > 0) {
      opts.gewinnAnteil = Math.max(0, Math.min(1, (r.kapBeiRente - r.totalEingezahlt) / r.kapBeiRente));
    }
    if (pol.type === 'insurance' && birthYear && pol.params && pol.params.rentenJahr) {
      opts.ageAtRetirementStart = pol.params.rentenJahr - birthYear;
    }
    if (pol.type === 'drv' && pol.params && pol.params.rentenJahr) {
      opts.rentenbeginnJahr = pol.params.rentenJahr;
    }
    // Für insurance auch den individuellen Satz der Police respektieren
    var effectiveSteuerSatz = steuerSatz;
    if (pol.type === 'insurance' && r.personalTaxRate != null) {
      effectiveSteuerSatz = r.personalTaxRate;
    }
    if (pol.type === 'drv' && r.steuerSatz != null) {
      effectiveSteuerSatz = r.steuerSatz;
    }

    var net = calculateNetRetirementIncome(pol.type, brutto, effectiveSteuerSatz, isPkv, opts);
    totalBrutto += net.brutto;
    totalSteuer += net.steuer;
    totalSv     += net.sv;
    totalNetto  += net.netto;

    perPolicy.push({
      id: pol.id, name: pol.name, type: pol.type, color: pol.color,
      ...net,
    });
  });

  return { totalBrutto: totalBrutto, totalSteuer: totalSteuer, totalSv: totalSv, totalNetto: totalNetto, perPolicy: perPolicy };
}
