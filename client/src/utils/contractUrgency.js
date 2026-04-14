import dayjs from 'dayjs';

/**
 * Compute the cancellation deadline: contract_end_date minus notice_period_months.
 * @returns {dayjs.Dayjs|null}
 */
export function computeDeadline(contract) {
  if (!contract.contract_end_date) return null;
  return dayjs(contract.contract_end_date).subtract(contract.notice_period_months || 0, 'month');
}

/**
 * Compute urgency level for a single contract.
 * @returns {{ level: 'red'|'yellow'|'grey'|'green', daysRemaining: number|null, deadline: string|null }}
 */
export function computeUrgency(contract) {
  if (contract.is_cancelled) {
    return { level: 'green', daysRemaining: null, deadline: contract.contract_end_date || null };
  }

  const deadline = computeDeadline(contract);
  if (!deadline) {
    return { level: 'grey', daysRemaining: null, deadline: null };
  }

  const days = deadline.diff(dayjs(), 'day');
  const deadlineStr = deadline.format('YYYY-MM-DD');

  if (days < 0)  return { level: 'red',    daysRemaining: days, deadline: deadlineStr };
  if (days < 30) return { level: 'red',    daysRemaining: days, deadline: deadlineStr };
  if (days < 90) return { level: 'yellow', daysRemaining: days, deadline: deadlineStr };
  return { level: 'grey', daysRemaining: days, deadline: deadlineStr };
}

const LEVEL_ORDER = { red: 0, yellow: 1, grey: 2, green: 3 };

/**
 * Sort contracts by urgency: RED first, then YELLOW, GREY, GREEN.
 */
export function sortByUrgency(contracts) {
  return [...contracts].sort((a, b) => {
    const la = LEVEL_ORDER[a.urgency?.level] ?? 2;
    const lb = LEVEL_ORDER[b.urgency?.level] ?? 2;
    if (la !== lb) return la - lb;
    // Within same level: fewer days remaining first
    return (a.urgency?.daysRemaining ?? 9999) - (b.urgency?.daysRemaining ?? 9999);
  });
}

/**
 * Count contracts with RED urgency (for sidebar badge).
 */
export function countRedContracts(contracts) {
  return contracts.filter(c => c.urgency?.level === 'red').length;
}

/**
 * Urgency display config.
 */
export const URGENCY_CONFIG = {
  red:    { label: 'Dringend',            color: '#ef4444', bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.25)' },
  yellow: { label: 'Bald fällig',         color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)' },
  grey:   { label: 'Kein Handlungsbedarf', color: '#9090b0', bg: 'rgba(148,148,180,0.08)', border: 'rgba(148,148,180,0.15)' },
  green:  { label: 'Gekündigt',            color: '#10b981', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.25)' },
};
