/**
 * Electricity forecast calculations.
 *
 * All functions are pure (no side effects) so they can be unit-tested easily.
 *
 * Key concept: readings store ABSOLUTE counter values (kWh).
 * Consumption between two readings = reading_later.value - reading_earlier.value
 */

// ─── Seasonal weights (index 0 = January) ────────────────────────────────────
// Derived from typical German household consumption profiles (BDEW Standardlastprofil H0).
// Each value is a relative weight; they sum to 12 so the average weight = 1.0.
const SEASONAL_WEIGHTS = [
  1.30, // Jan — highest: heating, short days
  1.20, // Feb
  1.10, // Mar
  0.95, // Apr
  0.85, // May
  0.75, // Jun — lowest: long days, no heating
  0.72, // Jul
  0.75, // Aug
  0.85, // Sep
  1.00, // Oct
  1.15, // Nov
  1.28, // Dec
];

/**
 * Returns the number of days in a given month (1-indexed).
 */
function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * Returns the number of days in a given year.
 */
function daysInYear(year) {
  return ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) ? 366 : 365;
}

/**
 * Sort readings by date ascending, return only those in the given year.
 */
export function readingsForYear(readings, year) {
  return readings
    .filter((r) => new Date(r.date).getFullYear() === year)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

/**
 * Calculate total consumption (kWh) between two readings.
 */
export function consumption(first, last) {
  if (!first || !last) return 0;
  return Math.max(0, last.value - first.value);
}

/**
 * Days elapsed between two readings (inclusive of end day).
 */
export function daysBetween(dateA, dateB) {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((new Date(dateB) - new Date(dateA)) / msPerDay);
}

/**
 * Average daily consumption based on observed readings.
 * Returns kWh/day (linear, no seasonal adjustment).
 */
export function avgDailyLinear(firstReading, latestReading) {
  const days   = daysBetween(firstReading.date, latestReading.date);
  const kwh    = consumption(firstReading, latestReading);
  if (days <= 0) return 0;
  return kwh / days;
}

/**
 * Weighted seasonal factor for a given calendar day.
 * Blends the weight of the current and next month proportionally by day-of-month.
 */
function seasonalFactorForDate(date) {
  const d     = new Date(date);
  const month = d.getMonth();           // 0-indexed
  const day   = d.getDate();
  const days  = daysInMonth(d.getFullYear(), month + 1);
  const next  = (month + 1) % 12;
  const blend = day / days;
  return SEASONAL_WEIGHTS[month] * (1 - blend) + SEASONAL_WEIGHTS[next] * blend;
}

/**
 * Seasonally-weighted average daily consumption.
 *
 * The idea: the observed period might be skewed toward summer or winter.
 * We divide the raw daily average by the average seasonal factor of the
 * observed period to get the "base" consumption, then re-apply the correct
 * seasonal factor for each future day when projecting.
 *
 * Returns { baseDailyKwh, observedSeasonalFactor }
 */
function baselineFromReadings(firstReading, latestReading) {
  const days = daysBetween(firstReading.date, latestReading.date);
  if (days <= 0) return { baseDailyKwh: 0, observedSeasonalFactor: 1 };

  // Average seasonal factor over the observed period (rough midpoint approximation)
  const midDate = new Date((new Date(firstReading.date).getTime() + new Date(latestReading.date).getTime()) / 2);
  const observedSeasonalFactor = seasonalFactorForDate(midDate);

  const rawDaily  = avgDailyLinear(firstReading, latestReading);
  const baseDailyKwh = rawDaily / observedSeasonalFactor;

  return { baseDailyKwh, observedSeasonalFactor };
}

/**
 * Project remaining consumption from today to end of year,
 * applying seasonal weights day-by-day (approximated month-by-month for performance).
 *
 * @param {object} firstReading  – earliest reading of the current year
 * @param {object} latestReading – most recent reading
 * @param {Date}   today         – reference date (injectable for testing)
 * @returns {object} forecast
 */
export function buildForecast(firstReading, latestReading, today = new Date()) {
  const year = today.getFullYear();

  if (!firstReading || !latestReading) {
    return { observed: 0, projected: 0, total: 0, dailyAvg: 0, daysObserved: 0, daysRemaining: 0 };
  }

  const { baseDailyKwh } = baselineFromReadings(firstReading, latestReading);
  const observedKwh      = consumption(firstReading, latestReading);
  const daysObserved     = daysBetween(firstReading.date, latestReading.date);

  // Days remaining from latest reading date to Dec 31
  const yearEnd       = new Date(year, 11, 31);
  const daysRemaining = Math.max(0, daysBetween(latestReading.date, yearEnd));

  // Project future consumption month-by-month with seasonal weights
  let projectedKwh = 0;
  let cursor = new Date(latestReading.date);
  cursor.setDate(cursor.getDate() + 1); // start day after latest reading

  while (cursor <= yearEnd) {
    const month       = cursor.getMonth(); // 0-indexed
    const weight      = SEASONAL_WEIGHTS[month];
    const daysInMo    = daysInMonth(cursor.getFullYear(), month + 1);
    // How many days of this month remain from cursor to yearEnd?
    const monthEnd    = new Date(cursor.getFullYear(), month + 1, 0);
    const endOfWindow = monthEnd < yearEnd ? monthEnd : yearEnd;
    const daysInWindow = daysBetween(cursor, endOfWindow) + 1;

    projectedKwh += baseDailyKwh * weight * daysInWindow;

    // Jump to first day of next month
    cursor = new Date(cursor.getFullYear(), month + 1, 1);
  }

  const totalKwh = observedKwh + projectedKwh;

  return {
    observed:       Math.round(observedKwh),
    projected:      Math.round(projectedKwh),
    total:          Math.round(totalKwh),
    dailyAvg:       Math.round(baseDailyKwh * 10) / 10,
    daysObserved,
    daysRemaining,
    yearDays:       daysInYear(year),
  };
}

// ─── Variable monatliche Abschläge ──────────────────────────────────────────
// Ein Tarif kann mehrere Abschlags-Werte mit gestaffeltem valid_from haben
// (siehe SQL-Migration `tariff_installments`). Diese Helper berechnen,
// wie viel Abschlag in einem bestimmten Monat fällig ist und summieren über
// das ganze Jahr (für Prognose) bzw. nur bis "heute" (für kumulierte
// Ist-Zahlungen).

/**
 * Liefert den fälligen Abschlag für einen bestimmten Monat (1-12) im Jahr `year`
 * basierend auf der nach valid_from sortierten Installment-Liste.
 *
 * Logik: aktiv ist der jüngste Eintrag, dessen valid_from ≤ Monatserster.
 * Wenn keiner passt (z.B. Monat liegt vor allen valid_from), Fallback auf 0.
 *
 * @param {Array<{amount:number|string, valid_from:string|Date}>} installments
 * @param {number} year   – Jahreszahl (z.B. 2026)
 * @param {number} month  – 1-basiert (1 = Januar)
 * @returns {number} amount in €
 */
export function installmentForMonth(installments, year, month) {
  if (!Array.isArray(installments) || installments.length === 0) return 0;
  const monthStart = new Date(year, month - 1, 1).getTime();

  // Sortiert nach valid_from aufsteigend; aktiv = letzter Eintrag mit valid_from ≤ monthStart.
  const sorted = [...installments]
    .map((i) => ({ amount: Number(i.amount) || 0, ts: new Date(i.valid_from).getTime() }))
    .filter((i) => Number.isFinite(i.ts))
    .sort((a, b) => a.ts - b.ts);

  let active = 0;
  for (const i of sorted) {
    if (i.ts <= monthStart) active = i.amount;
    else break;
  }
  // Fallback: wenn ALLE valid_from in der Zukunft liegen, nimm den frühesten
  // (Annahme: User hat den Tarif noch nicht "rückwirkend" gestartet).
  if (active === 0 && sorted.length > 0 && sorted[0].ts > monthStart) {
    active = sorted[0].amount;
  }
  return active;
}

/**
 * Summiert alle Abschläge eines Jahres — entweder bis Monat `untilMonth`
 * (default 12 = ganzes Jahr) oder bis zum aktuellen Monat (für "bereits gezahlt").
 *
 * Hinweis: Aggregation ist monatsgenau (jeder Kalendermonat zählt 1×).
 * Für unterjährige Tarif-Wechsel mitten im Monat: der Eintrag, der am
 * Monatsersten gilt, wird für den ganzen Monat verwendet.
 *
 * @param {Array} installments
 * @param {number} year
 * @param {number} [untilMonth=12]   – inklusive (1 = nur Januar)
 * @returns {number} Summe €
 */
export function advancesForYear(installments, year, untilMonth = 12) {
  let sum = 0;
  for (let m = 1; m <= Math.max(0, Math.min(12, untilMonth)); m++) {
    sum += installmentForMonth(installments, year, m);
  }
  return sum;
}

/**
 * Berechnet die bisher gezahlten Abschläge bis `today`.
 * Konvention: ein Monat zählt als "gezahlt", sobald er begonnen hat
 * (Abschläge werden i.d.R. zum Monatsanfang abgebucht).
 */
export function paidAdvancesYTD(installments, today = new Date()) {
  const year  = today.getFullYear();
  const month = today.getMonth() + 1; // 1-12
  return advancesForYear(installments, year, month);
}

/**
 * Liefert eine Aufschlüsselung pro Monat des Jahres — nützlich für Charts.
 * @returns {Array<{ month: 'Jan'|…, monthIdx: 0..11, amount: number, isPaid: boolean, cumulative: number }>}
 */
export function monthlyInstallmentBreakdown(installments, year, today = new Date()) {
  const labels = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  const isCurrentYear = today.getFullYear() === year;
  const currentMonth  = today.getMonth() + 1;

  let cumulative = 0;
  return labels.map((lbl, idx) => {
    const m = idx + 1;
    const amount = installmentForMonth(installments, year, m);
    cumulative += amount;
    const isPaid = isCurrentYear ? m <= currentMonth : true;
    return { month: lbl, monthIdx: idx, amount, isPaid, cumulative };
  });
}

/**
 * Calculate expected annual cost and compare with planned advances.
 *
 * Bevorzugt das Array `tariff.installments` (falls vorhanden) für die
 * Vorauszahlungs-Summe. Fällt sonst auf `tariff.monthly_advance × 12` zurück.
 *
 * @param {number} forecastKwh     – projected annual consumption
 * @param {object} tariff          – { base_price, unit_price, monthly_advance, installments?, ... }
 * @param {Date}   [today]         – Referenzdatum für YTD-Aufstellung
 * @returns {object} cost analysis
 */
export function buildCostForecast(forecastKwh, tariff, today = new Date()) {
  if (!tariff) return null;

  const energyCost  = forecastKwh * tariff.unit_price;
  const totalCost   = energyCost + tariff.base_price;

  const year = today.getFullYear();
  const hasInstallments = Array.isArray(tariff.installments) && tariff.installments.length > 0;

  // Erwartete Vorauszahlungen für das ganze Jahr
  const advances = hasInstallments
    ? advancesForYear(tariff.installments, year, 12)
    : Number(tariff.monthly_advance || 0) * 12;

  // Bereits gezahlte Vorauszahlungen YTD
  const advancesPaid = hasInstallments
    ? paidAdvancesYTD(tariff.installments, today)
    : Number(tariff.monthly_advance || 0) * (today.getMonth() + 1);

  const delta = advances - totalCost; // positive = Guthaben, negative = Nachzahlung

  return {
    energyCost:    Math.round(energyCost   * 100) / 100,
    totalCost:     Math.round(totalCost    * 100) / 100,
    advances:      Math.round(advances     * 100) / 100,
    advancesPaid:  Math.round(advancesPaid * 100) / 100,
    delta:         Math.round(delta        * 100) / 100,
    isGuthaben:    delta >= 0,
  };
}

// ─── Multi-Arbeitspreise: gewichteter Durchschnitt ──────────────────────────
// Formel (SKILL.md §310):
//   AP_weighted = Σ (p_i × D_i) / D_total
//   wobei D_i = Tage der Preis-Periode i, D_total = Tage der Abrechnungsperiode
//
// Eingabe-`prices`: Array von { price_per_kwh, valid_from }
// Das Ende der Periode i ist der Beginn von i+1 (oder periodEnd für die letzte).
// Preise vor periodStart werden auf periodStart begrenzt, Preise nach periodEnd verworfen.

function msPerDay() { return 1000 * 60 * 60 * 24; }

function daysInclusive(startIso, endIso) {
  // Anzahl Tage zwischen Start und End (beide inklusive → +1)
  const s = new Date(startIso);
  const e = new Date(endIso);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
  const diff = Math.round((e - s) / msPerDay()) + 1;
  return Math.max(0, diff);
}

/**
 * Berechnet den gewichteten Durchschnitts-Arbeitspreis für eine Abrechnungsperiode.
 *
 * Wenn keine Preise übergeben werden oder die Periode ungültig ist, wird 0 zurückgegeben.
 * Wenn nur 1 Preis existiert, entspricht das Ergebnis exakt diesem Preis.
 *
 * @param {Array<{price_per_kwh: number, valid_from: string}>} prices
 * @param {string|Date} periodStart
 * @param {string|Date} periodEnd
 * @returns {number} AP_weighted in €/kWh (nicht gerundet — Aufrufer entscheidet)
 */
export function weightedAvgPrice(prices, periodStart, periodEnd) {
  if (!Array.isArray(prices) || prices.length === 0) return 0;
  if (!periodStart || !periodEnd) {
    // Fallback: simples Mittel, wenn keine Datumsgrenzen bekannt
    const sum = prices.reduce((s, p) => s + Number(p.price_per_kwh || 0), 0);
    return sum / prices.length;
  }

  const startMs = new Date(periodStart).getTime();
  const endMs   = new Date(periodEnd).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return 0;

  // Sortiere Preise aufsteigend nach valid_from und begrenze auf Periode
  const sorted = [...prices]
    .map((p) => ({
      price: Number(p.price_per_kwh || 0),
      from:  Math.max(startMs, new Date(p.valid_from).getTime()),
    }))
    .filter((p) => Number.isFinite(p.from) && p.from <= endMs)
    .sort((a, b) => a.from - b.from);

  if (sorted.length === 0) return 0;

  // Stelle sicher, dass der erste Preis bei periodStart beginnt
  sorted[0].from = Math.min(sorted[0].from, startMs);

  const dTotal = Math.round((endMs - startMs) / msPerDay()) + 1;
  if (dTotal <= 0) return 0;

  let weightedSum = 0;
  for (let i = 0; i < sorted.length; i++) {
    const segStart = sorted[i].from;
    const segEnd   = i + 1 < sorted.length ? sorted[i + 1].from - msPerDay() : endMs;
    const dI = Math.max(0, Math.round((segEnd - segStart) / msPerDay()) + 1);
    weightedSum += sorted[i].price * dI;
  }
  return weightedSum / dTotal;
}

/**
 * Hilfsfunktion: leitet period_start / period_end aus einer electricity_periods-
 * Zeile ab. Fällt auf das period-Label zurück ("2024" → 2024-01-01 bis 2024-12-31).
 */
export function derivePeriodRange(periodRow) {
  if (!periodRow) return { start: null, end: null };
  if (periodRow.period_start && periodRow.period_end) {
    return { start: periodRow.period_start, end: periodRow.period_end };
  }
  const label = String(periodRow.period || '');
  const firstYear = parseInt(label.split('/')[0], 10);
  const lastYear  = label.includes('/') ? parseInt(label.split('/')[1], 10) : firstYear;
  if (!Number.isFinite(firstYear) || !Number.isFinite(lastYear)) return { start: null, end: null };
  return {
    start: `${firstYear}-01-01`,
    end:   `${lastYear}-12-31`,
  };
}

/**
 * Liefert den effektiven Arbeitspreis für eine Periode — gewichteter Durchschnitt
 * aller zugehörigen labor_prices. Fällt auf periodRow.arbeitspreis zurück, wenn
 * keine labor_prices existieren (Backward-Compat für Daten vor der Migration).
 */
export function effectiveArbeitspreis(periodRow, laborPrices) {
  if (Array.isArray(laborPrices) && laborPrices.length > 0) {
    const { start, end } = derivePeriodRange(periodRow);
    return weightedAvgPrice(laborPrices, start, end);
  }
  return Number(periodRow?.arbeitspreis) || 0;
}

// ─── Splitted Consumption: Σ(pᵢ × vᵢ) ───────────────────────────────────────
/**
 * Summiert die Verbräuche aller Preisphasen.
 * Phasen ohne consumption_kwh werden als 0 gewertet.
 */
export function totalSplitConsumption(laborPrices) {
  if (!Array.isArray(laborPrices)) return 0;
  return laborPrices.reduce((s, lp) => s + (Number(lp.consumption_kwh) || 0), 0);
}

/**
 * Liefert true, wenn ALLE Preisphasen einen `consumption_kwh`-Wert > 0 haben.
 * Nur dann ist die exakte Splitted-Berechnung anwendbar; sonst Fallback auf
 * gewichteten Durchschnitt × Gesamtverbrauch.
 */
export function hasSplitConsumption(laborPrices) {
  if (!Array.isArray(laborPrices) || laborPrices.length === 0) return false;
  return laborPrices.every(
    (lp) => lp.consumption_kwh != null && Number(lp.consumption_kwh) > 0,
  );
}

/**
 * Exakte Energiekosten einer Abrechnungsperiode auf Basis der Splitted Consumption:
 *   energyCost = Σ (price_per_kwh_i × consumption_kwh_i)
 *
 * Wenn nicht alle Phasen einen Verbrauch haben, fällt die Funktion auf den
 * gewichteten Durchschnitt × Gesamtverbrauch (periodRow.verbrauch_kwh) zurück.
 *
 * @returns {number} Energiekosten in € (ohne Grundpreis)
 */
export function splitEnergyCost(periodRow, laborPrices) {
  if (hasSplitConsumption(laborPrices)) {
    return laborPrices.reduce(
      (s, lp) => s + Number(lp.price_per_kwh || 0) * Number(lp.consumption_kwh || 0),
      0,
    );
  }
  // Fallback: gewichteter Ø × Gesamtverbrauch
  const apEff = effectiveArbeitspreis(periodRow, laborPrices);
  return apEff * (Number(periodRow?.verbrauch_kwh) || 0);
}

/**
 * Gesamtkosten einer Abrechnungsperiode:
 *   Grundpreis + Energiekosten (Σ pᵢ·vᵢ oder Fallback)
 *   + außerordentliche Gebühren (Mahn-, Rücklastschrift-, …)
 *   − Gutschriften & Boni (Neukunden-, Treuebonus, …)
 *
 * Wichtig (SKILL.md): Extra-Kosten und Gutschriften beeinflussen NUR die
 * Periodensumme, NICHT die kWh-/Preis-Statistiken. Sie fließen ausschließlich
 * hier ein, nicht in `splitEnergyCost` oder `effectiveArbeitspreis`.
 */
export function splitTotalCost(periodRow, laborPrices, extraCosts, credits) {
  return (
    (Number(periodRow?.grundpreis) || 0)
    + splitEnergyCost(periodRow, laborPrices)
    + totalExtraCosts(extraCosts)
    - totalCredits(credits)
  );
}

/**
 * Summiert außerordentliche Gebühren (Mahn-, Rücklastschrift-, …).
 * Defensive Konvertierung — leere Einträge werden ignoriert.
 */
export function totalExtraCosts(extraCosts) {
  if (!Array.isArray(extraCosts)) return 0;
  return extraCosts.reduce((s, c) => s + (Number(c.amount) || 0), 0);
}

/**
 * Summiert Gutschriften & Boni (Neukundenbonus, Treuebonus, …).
 * Beträge werden positiv gespeichert und in `splitTotalCost` subtrahiert.
 */
export function totalCredits(credits) {
  if (!Array.isArray(credits)) return 0;
  return credits.reduce((s, c) => s + (Number(c.amount) || 0), 0);
}

// ─── daysInclusive export (falls extern gebraucht) ──────────────────────────
export { daysInclusive };

/**
 * Build chart data: monthly consumption from readings.
 * Returns array of { month: 'Jan', kwh: 120 } for the given year.
 */
export function buildMonthlyChart(readings, year) {
  const sorted = readings
    .filter((r) => {
      const d = new Date(r.date);
      return d.getFullYear() === year || d.getFullYear() === year - 1;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const months = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  const result = [];

  for (let m = 0; m < 12; m++) {
    // Find readings that bracket this month
    const monthStart = new Date(year, m, 1);
    const monthEnd   = new Date(year, m + 1, 0);

    // Reading just before or at start of month
    const before = [...sorted].reverse().find((r) => new Date(r.date) <= monthStart);
    // Reading at or after end of month
    const after  = sorted.find((r) => new Date(r.date) >= monthEnd);

    if (before && after && before !== after) {
      const totalDays   = daysBetween(before.date, after.date);
      const totalKwh    = consumption(before, after);
      const daysInMo    = daysInMonth(year, m + 1);
      const kwh         = totalDays > 0 ? Math.round((totalKwh / totalDays) * daysInMo) : null;
      result.push({ month: months[m], kwh });
    } else {
      result.push({ month: months[m], kwh: null });
    }
  }

  return result;
}
