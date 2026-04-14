/**
 * Pure utility functions for insurance data calculations.
 */

// How many times per year each interval is paid
export const INTERVAL_MULTIPLIER = {
  'monatlich':       12,
  'vierteljährlich':  4,
  'halbjährlich':     2,
  'jährlich':         1,
};

export const INTERVAL_LABELS = {
  'monatlich':       'Monatlich',
  'vierteljährlich': 'Vierteljährlich',
  'halbjährlich':    'Halbjährlich',
  'jährlich':        'Jährlich',
};

/**
 * Convert a stored premium (per-interval amount) to annual value.
 */
export function toAnnual(premium, interval = 'jährlich') {
  return premium * (INTERVAL_MULTIPLIER[interval] ?? 1);
}

/**
 * Convert a stored premium (per-interval amount) to monthly value.
 */
export function toMonthly(premium, interval = 'jährlich') {
  return toAnnual(premium, interval) / 12;
}

/**
 * Return the display value based on the view mode.
 * viewMode: 'jahr' | 'monat'
 */
export function toDisplay(premium, interval = 'jährlich', viewMode = 'jahr') {
  return viewMode === 'monat' ? toMonthly(premium, interval) : toAnnual(premium, interval);
}

/**
 * Returns total annual premiums across all categories, keyed by year.
 */
export function getTotalByYear(categories, viewMode = 'jahr') {
  const totals = {};
  for (const cat of categories) {
    for (const entry of cat.entries) {
      const value = toDisplay(entry.premium, entry.payment_interval, viewMode);
      totals[entry.year] = (totals[entry.year] ?? 0) + value;
    }
  }
  return totals;
}

/**
 * Builds an array of { year, premium } for a single category.
 * premium is already converted to the requested view mode.
 */
export function buildChartData(category, viewMode = 'jahr') {
  return [...category.entries]
    .sort((a, b) => a.year - b.year)
    .map((e) => ({
      year:    e.year,
      premium: toDisplay(e.premium, e.payment_interval, viewMode),
    }));
}

/**
 * Builds stacked area data keyed by category name.
 * Also includes a `total` field summing all categories for that year.
 */
export function buildStackedData(categories, viewMode = 'jahr') {
  const years = Array.from(
    new Set(categories.flatMap((c) => c.entries.map((e) => e.year)))
  ).sort((a, b) => a - b);

  return years.map((year) => {
    const point = { year };
    let total = 0;
    for (const cat of categories) {
      const entry = cat.entries.find((e) => e.year === year);
      const val = entry ? toDisplay(entry.premium, entry.payment_interval, viewMode) : null;
      point[cat.name] = val;
      if (val !== null) total += val;
    }
    point.total = total;
    return point;
  });
}

export function buildDeltaData(category, viewMode = 'jahr') {
  const sorted = [...category.entries].sort((a, b) => a.year - b.year);
  return sorted.map((entry, i) => {
    const prev     = sorted[i - 1];
    const current  = toDisplay(entry.premium, entry.payment_interval, viewMode);
    const previous = prev ? toDisplay(prev.premium, prev.payment_interval, viewMode) : null;
    const delta    = previous !== null ? current - previous : null;
    const deltaPct = previous ? ((delta / previous) * 100).toFixed(1) : null;
    return { year: entry.year, premium: current, delta, deltaPct };
  });
}

export function categoryLifetimeTotal(category, viewMode = 'jahr') {
  return category.entries.reduce(
    (sum, e) => sum + toDisplay(e.premium, e.payment_interval, viewMode),
    0
  );
}
