/**
 * Immobilien-Berechnungslogik
 *
 * Annuitätendarlehen, LTV, AfA (linear + degressiv),
 * 15%-Grenze Erhaltungsaufwand, Steuervorteil, 10-Jahres-Haltefrist.
 */

// ── Annuitätendarlehen ────────────────────────────────────────

/**
 * Monatliche Annuitätenrate.
 * Rate = Restschuld × (Zins + Tilgung) / 12
 */
export function monthlyRate(principal, interestRate, repaymentRate) {
  return principal * (interestRate / 100 + repaymentRate / 100) / 12;
}

/**
 * Build full amortization schedule month by month.
 * @param {object} mortgage - { principal, interest_rate, repayment_rate, start_date, fixed_until, special_repayment_yearly }
 * @param {number} maxMonths - safety cap (default 480 = 40 Jahre)
 * @returns {Array} schedule entries
 */
export function buildMortgageSchedule(mortgage, maxMonths) {
  maxMonths = maxMonths || 480;
  var balance     = Number(mortgage.principal);
  var zinsRate    = Number(mortgage.interest_rate) / 100 / 12;
  var annuity     = monthlyRate(balance, mortgage.interest_rate, mortgage.repayment_rate);
  var specialYearly = Number(mortgage.special_repayment_yearly) || 0;

  var start = mortgage.start_date ? new Date(mortgage.start_date) : new Date();
  var cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  var fixedUntil = mortgage.fixed_until ? new Date(mortgage.fixed_until) : null;

  var result = [];
  var cumZinsen = 0, cumTilgung = 0;

  for (var i = 0; i < maxMonths && balance > 0.01; i++) {
    var year  = cursor.getFullYear();
    var month = cursor.getMonth();

    // Sondertilgung: 1x pro Jahr im Januar
    var sonder = 0;
    if (specialYearly > 0 && month === 0 && i > 0) {
      sonder = Math.min(specialYearly, balance);
      balance = Math.max(0, balance - sonder);
      cumTilgung += sonder;
    }

    if (balance <= 0.01) {
      result.push({ month: i, date: cursor.toISOString().split('T')[0], year: year, balance: 0, zinsen: 0, tilgung: 0, sonder: sonder, cumZinsen: r2(cumZinsen), cumTilgung: r2(cumTilgung), isFixedEnd: false });
      break;
    }

    var zinsen  = balance * zinsRate;
    var tilgung = Math.min(annuity - zinsen, balance);
    if (tilgung < 0) tilgung = 0;
    balance = Math.max(0, balance - tilgung);

    cumZinsen  += zinsen;
    cumTilgung += tilgung;

    var isFixedEnd = fixedUntil && year === fixedUntil.getFullYear() && month === fixedUntil.getMonth();

    result.push({
      month: i,
      date: cursor.toISOString().split('T')[0],
      year: year,
      balance: r2(balance),
      zinsen: r2(zinsen),
      tilgung: r2(tilgung),
      sonder: sonder,
      rate: r2(zinsen + tilgung),
      cumZinsen: r2(cumZinsen),
      cumTilgung: r2(cumTilgung),
      isFixedEnd: isFixedEnd,
    });

    cursor = new Date(year, month + 1, 1);
  }

  return result;
}

function r2(v) { return Math.round(v * 100) / 100; }

/**
 * Summary stats from a mortgage schedule.
 */
export function mortgageSummary(schedule, principal) {
  if (!schedule.length) return { balance: principal, totalZinsen: 0, totalTilgung: 0, payoffDate: null, payoffMonths: 0 };
  var last = schedule[schedule.length - 1];
  return {
    balance:      last.balance,
    totalZinsen:  last.cumZinsen,
    totalTilgung: last.cumTilgung,
    payoffDate:   last.balance <= 0.01 ? last.date : null,
    payoffMonths: last.balance <= 0.01 ? schedule.length : null,
  };
}

/**
 * Current balance from schedule (entry matching today).
 */
export function getCurrentMortgageBalance(schedule) {
  var today = new Date().toISOString().split('T')[0].substring(0, 7);
  var past = schedule.filter(function(e) { return e.date.substring(0, 7) <= today; });
  if (past.length === 0) return schedule[0] ? schedule[0].balance : 0;
  return past[past.length - 1].balance;
}

// ── LTV (Loan-to-Value) ──────────────────────────────────────

export function calcLTV(restschuld, marktwert) {
  if (!marktwert || marktwert <= 0) return 0;
  return r2((restschuld / marktwert) * 100);
}

// ── AfA (Absetzung für Abnutzung) ─────────────────────────────

/**
 * Jährliche AfA für eine Immobilie.
 * @param {object} property - { purchase_price, land_value_ratio, build_year, purchase_date }
 * @param {string} mode - 'linear' | 'degressiv'
 * @param {number} yearOfCalc - das Jahr für das die AfA berechnet wird
 * @returns {{ jahresAfa, gebaeudewert, afaSatz, mode, hinweis }}
 */
export function calcAfA(property, mode, yearOfCalc) {
  var kaufpreis     = Number(property.purchase_price) || 0;
  var grundRatio    = Number(property.land_value_ratio) || 20;
  var gebaeudewert  = kaufpreis * (1 - grundRatio / 100);
  var baujahr       = Number(property.build_year) || 1990;
  var kaufjahr      = property.purchase_date ? new Date(property.purchase_date).getFullYear() : new Date().getFullYear();

  mode = mode || 'linear';
  yearOfCalc = yearOfCalc || new Date().getFullYear();

  var afaSatz = 0;
  var hinweis = '';

  if (mode === 'degressiv') {
    // Degressive AfA: 5% für 6 Jahre, nur Neubau ab 2024 (§ 7 Abs. 5a EStG)
    if (baujahr >= 2024) {
      var jahreSeitKauf = yearOfCalc - kaufjahr;
      if (jahreSeitKauf < 6) {
        afaSatz = 5;
        hinweis = 'Degressive AfA (5% für 6 Jahre, Neubau ab 2024)';
      } else {
        // Nach 6 Jahren: Wechsel zu linear
        afaSatz = baujahr >= 2023 ? 3 : 2;
        hinweis = 'Nach 6 Jahren degressiv: Wechsel zu linearer AfA';
      }
    } else {
      hinweis = 'Degressive AfA nur für Neubau ab 2024 verfügbar';
      afaSatz = baujahr >= 2023 ? 3 : 2;
      mode = 'linear';
    }
  } else {
    // Lineare AfA
    if (baujahr >= 2023) {
      afaSatz = 3; // Neubau ab 2023: 3% (§ 7 Abs. 4 EStG)
      hinweis = 'Lineare AfA 3% (Neubau ab 2023)';
    } else {
      afaSatz = 2; // Altbau: 2% (50 Jahre)
      hinweis = 'Lineare AfA 2% (Altbau, 50 Jahre)';
    }
  }

  var jahresAfa = gebaeudewert * afaSatz / 100;

  return {
    jahresAfa:    r2(jahresAfa),
    monatsAfa:    r2(jahresAfa / 12),
    gebaeudewert: r2(gebaeudewert),
    grundstueck:  r2(kaufpreis - gebaeudewert),
    afaSatz:      afaSatz,
    mode:         mode,
    hinweis:      hinweis,
  };
}

// ── 15%-Grenze Erhaltungsaufwand ──────────────────────────────

/**
 * Prüft die 15%-Grenze für Erhaltungsaufwand in den ersten 3 Jahren.
 * @param {number} gebaeudewert - Gebäudeanteil des Kaufpreises
 * @param {number} erhaltungsaufwand - Kumulierte Instandhaltungskosten in den ersten 3 Jahren
 * @returns {{ limit, used, remaining, exceeded, warnung }}
 */
export function check15PctLimit(gebaeudewert, erhaltungsaufwand) {
  var limit = gebaeudewert * 0.15;
  var remaining = Math.max(0, limit - erhaltungsaufwand);
  var exceeded = erhaltungsaufwand > limit;

  return {
    limit:     r2(limit),
    used:      r2(erhaltungsaufwand),
    remaining: r2(remaining),
    pct:       gebaeudewert > 0 ? r2(erhaltungsaufwand / gebaeudewert * 100) : 0,
    exceeded:  exceeded,
    warnung:   exceeded
      ? 'Erhaltungsaufwand übersteigt 15% des Gebäudewerts. Kosten werden zu Anschaffungskosten (AfA-pflichtig).'
      : null,
  };
}

// ── Steuervorteil (Negative Einkünfte) ────────────────────────

/**
 * Berechne jährlichen Steuervorteil bei Vermietung.
 * Negative Einkünfte = Mieteinnahmen - (Zinsen + AfA + Verwaltung + Instandhaltung)
 * Steuervorteil = |Negative Einkünfte| × Steuersatz (wenn negativ)
 */
export function calcSteuerVorteil(mieteinnahmenJahr, zinsenJahr, afaJahr, verwaltungJahr, steuerSatz) {
  var einkuenfte = mieteinnahmenJahr - zinsenJahr - afaJahr - verwaltungJahr;
  var steuersatz = (steuerSatz || 42) / 100;

  if (einkuenfte >= 0) {
    // Positive Einkünfte: Steuerlast, kein Vorteil
    return { einkuenfte: r2(einkuenfte), steuerlast: r2(einkuenfte * steuersatz), vorteil: 0, isNegativ: false };
  }

  return {
    einkuenfte: r2(einkuenfte),
    steuerlast: 0,
    vorteil:    r2(Math.abs(einkuenfte) * steuersatz),
    isNegativ:  true,
  };
}

// ── 10-Jahres-Haltefrist ──────────────────────────────────────

/**
 * Prüft ob die 10-Jahres-Haltefrist (§ 23 EStG) für steuerfreien Verkauf erfüllt ist.
 */
export function checkHaltefrist(purchaseDate) {
  if (!purchaseDate) return { fulfilled: false, remaining: null, freeFrom: null };
  var kauf = new Date(purchaseDate);
  var freeFrom = new Date(kauf.getFullYear() + 10, kauf.getMonth(), kauf.getDate());
  var today = new Date();
  var diffMs = freeFrom - today;
  var diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  return {
    fulfilled: diffDays <= 0,
    remainingDays: Math.max(0, diffDays),
    remainingYears: Math.max(0, r2(diffDays / 365)),
    freeFrom: freeFrom.toISOString().split('T')[0],
  };
}

// ── Cashflow ──────────────────────────────────────────────────

/**
 * Monatlicher Netto-Cashflow einer vermieteten Immobilie.
 */
export function calcMonthlyCashflow(monthlyRent, monthlyRate, monthlyHausgeld, monthlyMaintenance) {
  return r2((monthlyRent || 0) - (monthlyRate || 0) - (monthlyHausgeld || 0) - (monthlyMaintenance || 0));
}

// ── Zinsbindungs-Warnung ──────────────────────────────────────

export function checkZinsbindung(fixedUntil) {
  if (!fixedUntil) return { active: false, daysRemaining: null, level: 'grey' };
  var end = new Date(fixedUntil);
  var today = new Date();
  var days = Math.ceil((end - today) / (1000 * 60 * 60 * 24));

  return {
    active: true,
    daysRemaining: days,
    level: days < 0 ? 'red' : days < 365 ? 'red' : days < 730 ? 'yellow' : 'grey',
    label: days < 0 ? 'Abgelaufen' : days < 365 ? 'Unter 1 Jahr' : days < 730 ? 'Unter 2 Jahre' : Math.round(days / 365) + ' Jahre',
  };
}

// ── Formatter ─────────────────────────────────────────────────

export function fmtEuro(v, d) {
  if (v == null || isNaN(v)) return '—';
  d = d == null ? 0 : d;
  return Number(v).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' €';
}
