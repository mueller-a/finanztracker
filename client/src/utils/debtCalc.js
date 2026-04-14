/**
 * Debt (Annuity loan) calculation utilities.
 *
 * Key concept:
 *   - Regular monthly annuity payments are NOT stored — they are derived from
 *     the loan parameters (total_amount, interest_rate, monthly_rate, start_date).
 *   - Only Sondertilgungen (extra payments) are stored and applied to the schedule.
 *   - Current balance = theoretical amortization position today + impact of extras.
 */

// ─── Core amortization schedule ───────────────────────────────────────────────
/**
 * Build monthly amortization schedule for one debt.
 *
 * Each entry represents the state AFTER that month's payment.
 * month index 0 = first payment month (start_date + 1 month).
 *
 * Override-Modus:
 *   Wenn `debt.initial_interest_override` (EUR) gesetzt ist, wird der Zinsanteil
 *   der ERSTEN regulären Rate auf diesen Wert fixiert. Die Tilgung der ersten
 *   Rate ergibt sich aus `monthly_rate - override`. Der Restplan ab Monat 2
 *   läuft mit dem resultierenden neuen Restdarlehen und dem normalen Monats-
 *   zinssatz weiter.
 *
 * @param {object} debt         – { total_amount, interest_rate, monthly_rate, start_date,
 *                                  initial_interest_override? }
 * @param {Array}  extraPayments – debt_payments rows for this debt
 * @param {number} maxMonths    – safety cap (default 480 = 40 years)
 * @returns {Array} schedule entries
 */
export function buildSchedule(debt, extraPayments = [], maxMonths = 480) {
  let balance = Number(debt.total_amount);
  const monthlyRate    = Number(debt.interest_rate) / 100 / 12;
  const monthlyPayment = Number(debt.monthly_rate);
  const overrideRaw    = debt.initial_interest_override;
  const hasOverride    = overrideRaw != null && overrideRaw !== '' && !isNaN(Number(overrideRaw));
  const overrideValue  = hasOverride ? Math.max(0, Number(overrideRaw)) : null;
  const result = [];

  const startDate = new Date(debt.start_date);
  // First payment month = month after start_date
  let cursor = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1);

  let cumZinsen  = 0;
  let cumTilgung = 0;

  // Apply any Sondertilgungen that fall BEFORE the first schedule month (e.g. in the start month itself)
  const firstKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
  const earlyExtras = extraPayments.filter((p) => {
    const mk = p.date.substring(0, 7);
    return mk < firstKey;
  });
  const earlyAmt = earlyExtras.reduce((s, p) => s + Number(p.amount), 0);
  if (earlyAmt > 0) {
    balance = Math.max(0, balance - earlyAmt);
    cumTilgung += earlyAmt;
  }

  // `regularIdx` zählt nur reguläre Raten (ohne Early-Extras). Die erste
  // reguläre Rate trägt den Override, falls vorhanden.
  let regularIdx = 0;

  for (let i = 0; i < maxMonths && balance > 0.005; i++) {
    const year  = cursor.getFullYear();
    const month = cursor.getMonth(); // 0-indexed
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

    // Apply Sondertilgungen for this calendar month (before regular payment)
    const extrasThisMonth = extraPayments.filter((p) => {
      const d = new Date(p.date);
      return d.getFullYear() === year && d.getMonth() === month;
    });
    const extraAmt = extrasThisMonth.reduce((s, p) => s + Number(p.amount), 0);

    if (extraAmt > 0) {
      balance = Math.max(0, balance - extraAmt);
      cumTilgung += extraAmt;
    }

    if (balance <= 0.005) {
      result.push({ monthKey, date: cursor.toISOString().split('T')[0], balance: 0, zinsen: 0, tilgung: 0, extra: extraAmt, cumZinsen: Math.round(cumZinsen * 100) / 100, cumTilgung: Math.round(cumTilgung * 100) / 100 });
      break;
    }

    // Override greift ausschließlich bei der ersten regulären Rate und
    // ausschließlich, wenn das Ergebnis plausibel bleibt (Override < Monatsrate).
    let zinsen, tilgung, isOverridden = false;
    if (regularIdx === 0 && hasOverride && overrideValue < monthlyPayment) {
      zinsen       = overrideValue;
      tilgung      = Math.min(Math.max(0, monthlyPayment - zinsen), balance);
      isOverridden = true;
    } else {
      zinsen  = balance * monthlyRate;
      tilgung = Math.min(Math.max(0, monthlyPayment - zinsen), balance);
    }
    balance = Math.max(0, balance - tilgung);

    cumZinsen  += zinsen;
    cumTilgung += tilgung;

    result.push({
      monthKey,
      date:      cursor.toISOString().split('T')[0],
      balance:   Math.round(balance   * 100) / 100,
      zinsen:    Math.round(zinsen    * 100) / 100,
      tilgung:   Math.round(tilgung   * 100) / 100,
      extra:     extraAmt,
      cumZinsen:  Math.round(cumZinsen  * 100) / 100,
      cumTilgung: Math.round(cumTilgung * 100) / 100,
      isOverridden,
    });

    regularIdx += 1;
    cursor = new Date(year, month + 1, 1);
  }

  return result;
}

/** Returns current month key string "YYYY-MM". */
function todayKey(today = new Date()) {
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Current balance from schedule (entry matching today's month, or latest past entry).
 * Returns null if loan hasn't started yet.
 */
export function getCurrentBalance(schedule, today = new Date()) {
  const key  = todayKey(today);
  const past = schedule.filter((e) => e.monthKey <= key);
  if (past.length === 0) return Number(schedule[0]?.balance ?? null); // not started yet
  return past[past.length - 1].balance;
}

/** Date string of the last schedule entry (= projected payoff date). */
export function getPayoffDate(schedule) {
  if (schedule.length === 0) return null;
  return schedule[schedule.length - 1].date;
}

/** Total interest ever paid (to end of loan). */
export function getTotalInterest(schedule) {
  if (schedule.length === 0) return 0;
  return schedule[schedule.length - 1].cumZinsen;
}

/** Interest paid up to and including today's month. */
export function getPaidInterest(schedule, today = new Date()) {
  const key  = todayKey(today);
  const past = schedule.filter((e) => e.monthKey <= key);
  return past.length > 0 ? past[past.length - 1].cumZinsen : 0;
}

/**
 * Yearly total-debt chart data for all debts combined.
 * Returns [{ year: '2024', total: 320000, perDebt: { id: balance } }, ...]
 */
export function buildDebtChart(debts, schedulesMap, today = new Date()) {
  if (debts.length === 0) return [];

  const currentYear = today.getFullYear();
  const maxYear = Math.max(
    ...debts.map((d) => {
      const s = schedulesMap[d.id];
      return s && s.length > 0 ? new Date(s[s.length - 1].date).getFullYear() : currentYear;
    })
  );

  const result = [];
  for (let y = currentYear; y <= maxYear + 1; y++) {
    const janKey = `${y}-01`;
    const perDebt = {};
    let total = 0;

    debts.forEach((d) => {
      const schedule = schedulesMap[d.id] ?? [];
      const past = schedule.filter((e) => e.monthKey <= janKey);
      const balance = past.length > 0
        ? past[past.length - 1].balance
        : (janKey < (schedule[0]?.monthKey ?? '9999') ? Number(d.total_amount) : 0);
      perDebt[d.id] = Math.round(balance);
      total += balance;
    });

    result.push({ year: String(y), total: Math.round(total), ...perDebt });
  }

  return result;
}

/**
 * Per-year interest totals for a single schedule (for the "depressing" bar chart).
 */
export function buildAnnualInterest(schedule) {
  const byYear = {};
  schedule.forEach((e) => {
    const y = e.monthKey.split('-')[0];
    byYear[y] = (byYear[y] ?? 0) + e.zinsen;
  });
  return Object.entries(byYear).map(([year, zinsen]) => ({
    year,
    zinsen: Math.round(zinsen * 100) / 100,
  }));
}

// ─── Revolving Credit (Rahmenkredit) ─────────────────────────────────────────

/**
 * True if the debt is a revolving credit line.
 */
export function isRevolving(debt) {
  return debt.debt_type === 'revolving';
}

/**
 * Day-accurate interest for one calendar month, given a starting balance and
 * an array of payment objects (each with a `.date` ISO string and `.amount`).
 *
 * Formula: Σ (balance_i × annualRate/365 × days_i)
 *
 * @param {number}   startBalance – balance at start of period (day `firstDay`)
 * @param {Array}    payments     – payments in this month, each { date, amount }
 * @param {number}   year
 * @param {number}   month        – 0-indexed
 * @param {number}   firstDay     – day-of-month to start from (1 for full month)
 * @param {number}   lastDay      – last day to include (daysInMonth for full month)
 * @param {number}   annualRate   – e.g. 0.12 for 12 %
 * @returns {{ interest, balanceEnd }}
 */
function calcMonthlyInterest(startBalance, payments, year, month, firstDay, lastDay, annualRate) {
  // Sort payments by day-of-month. Jedes Payment kennt einen Typ
  // ('repayment' senkt Saldo, 'withdrawal' erhöht Saldo). Default = repayment.
  const sorted = payments
    .map((p) => ({
      day:    new Date(p.date).getDate(),
      amount: Number(p.amount),
      type:   p.type || 'repayment',
    }))
    .sort((a, b) => a.day - b.day);

  let interest = 0;
  let balance  = startBalance;
  let prevDay  = firstDay;

  for (const pay of sorted) {
    const payDay = Math.min(pay.day, lastDay);
    const days   = Math.max(0, payDay - prevDay); // days BEFORE this payment
    interest += balance * (annualRate / 365) * days;
    if (pay.type === 'withdrawal') {
      balance = balance + pay.amount;
    } else {
      balance = Math.max(0, balance - pay.amount);
    }
    prevDay = payDay;
  }

  // Remaining days after last payment (or full segment if no payments)
  const remainDays = Math.max(0, lastDay - prevDay + 1);
  interest += balance * (annualRate / 365) * remainDays;

  return {
    interest:   Math.round(interest * 100) / 100,
    balanceEnd: Math.round(balance  * 100) / 100,
  };
}

/**
 * Build a month-by-month revolving credit schedule from start_date to today.
 *
 * Unlike annuity loans, the balance only changes when explicit payments are
 * made — there is no fixed monthly rate. Interest is computed day-accurately.
 *
 * Each result entry represents one calendar month.
 *
 * @param {object} debt      – { total_amount, interest_rate, start_date, debt_type }
 * @param {Array}  payments  – debt_payments rows for this debt
 * @returns {Array}          – schedule entries
 */
export function buildRevolvingSchedule(debt, payments = []) {
  const annualRate = Number(debt.interest_rate) / 100;
  const startDate  = new Date(debt.start_date);
  const today      = new Date();

  let balance       = Number(debt.total_amount);
  let cumZinsen     = 0;
  let cumTilgung    = 0;
  let cumWithdrawal = 0;
  const result      = [];

  // Has any withdrawal in this debt? Wenn ja, dürfen wir die Iteration NICHT
  // bei balance=0 abbrechen, da ein späterer withdrawal den Saldo wieder
  // hochbringen kann. Ansonsten bleibt die Performance-Bremse (Abbruch bei 0).
  const hasFutureWithdrawal = payments.some((p) => (p.type || 'repayment') === 'withdrawal');

  // Start from the month of start_date, end at the current month (inclusive)
  let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const endMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1); // exclusive

  while (cursor < endMonth && (hasFutureWithdrawal || balance > 0.005)) {
    const year     = cursor.getFullYear();
    const month    = cursor.getMonth(); // 0-indexed
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // For the first month: start counting from start_date's day
    const firstDay = (year === startDate.getFullYear() && month === startDate.getMonth())
      ? startDate.getDate()
      : 1;

    // For the current month: count only up to today's date (projected full month)
    // We use the full month for projection; label it accordingly in UI.
    const lastDay = daysInMonth;

    // All payments in this month
    const monthPayments = payments.filter((p) => {
      const d = new Date(p.date);
      return d.getFullYear() === year && d.getMonth() === month;
    });

    const { interest, balanceEnd } = calcMonthlyInterest(
      balance, monthPayments, year, month, firstDay, lastDay, annualRate
    );

    // Summen pro Monat — nach Typ aufgeteilt
    const repaymentTotal = monthPayments
      .filter((p) => (p.type || 'repayment') === 'repayment')
      .reduce((s, p) => s + Number(p.amount), 0);
    const withdrawalTotal = monthPayments
      .filter((p) => p.type === 'withdrawal')
      .reduce((s, p) => s + Number(p.amount), 0);

    balance = balanceEnd;

    cumZinsen     += interest;
    cumTilgung    += repaymentTotal;
    cumWithdrawal += withdrawalTotal;

    // Min rate for the NEXT month (ING: MAX(2% of remaining balance, 50 €))
    const minRateNext = Math.round(Math.max(balance * 0.02, 50) * 100) / 100;

    const isCurrent = (year === today.getFullYear() && month === today.getMonth());

    result.push({
      monthKey,
      date:           cursor.toISOString().split('T')[0],
      balance:        Math.round(balance          * 100) / 100,
      zinsen:         interest,
      tilgung:        Math.round(repaymentTotal   * 100) / 100,
      withdrawal:     Math.round(withdrawalTotal  * 100) / 100,
      extra:          0,           // all revolving payments are stored as payments
      minRateNext,
      isCurrent,                   // flag for the current (partial) month
      cumZinsen:      Math.round(cumZinsen     * 100) / 100,
      cumTilgung:     Math.round(cumTilgung    * 100) / 100,
      cumWithdrawal:  Math.round(cumWithdrawal * 100) / 100,
      daysInMonth,
    });

    cursor = new Date(year, month + 1, 1);
  }

  return result;
}

/**
 * Simulate the interest savings for the current calendar month if an extra
 * payment of `extraAmount` is made today.
 *
 * Returns:
 *  interestWithout – projected interest this month without extra payment
 *  interestWith    – projected interest this month with extra payment
 *  saving          – difference (≥ 0)
 *  newBalance      – balance end-of-month with extra payment
 *  newMinRate      – min rate for next month with extra payment
 *
 * @param {object} debt        – the revolving debt
 * @param {Array}  payments    – all existing debt_payments for this debt
 * @param {number} extraAmount – proposed extra payment amount
 */
export function simulateRevolvingExtraPayment(debt, payments, extraAmount) {
  const annualRate = Number(debt.interest_rate) / 100;
  const today      = new Date();
  const year       = today.getFullYear();
  const month      = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Build schedule up to previous month to get current start balance
  const schedule = buildRevolvingSchedule(debt, payments);
  const prevEntries = schedule.filter((e) => e.monthKey < `${year}-${String(month + 1).padStart(2, '0')}`);
  const startBalance = prevEntries.length > 0
    ? prevEntries[prevEntries.length - 1].balance
    : Number(debt.total_amount);

  const startDate = new Date(debt.start_date);
  const firstDay  = (year === startDate.getFullYear() && month === startDate.getMonth())
    ? startDate.getDate()
    : 1;

  const thisMonthPayments = payments.filter((p) => {
    const d = new Date(p.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  // Without extra payment
  const without = calcMonthlyInterest(
    startBalance, thisMonthPayments, year, month, firstDay, daysInMonth, annualRate
  );

  // With extra payment added today
  const withPayments = [
    ...thisMonthPayments,
    { date: today.toISOString().split('T')[0], amount: extraAmount },
  ];
  const withResult = calcMonthlyInterest(
    startBalance, withPayments, year, month, firstDay, daysInMonth, annualRate
  );

  return {
    startBalance,
    interestWithout: without.interest,
    interestWith:    withResult.interest,
    saving:          Math.round((without.interest - withResult.interest) * 100) / 100,
    newBalance:      withResult.balanceEnd,
    newMinRate:      Math.round(Math.max(withResult.balanceEnd * 0.02, 50) * 100) / 100,
  };
}
