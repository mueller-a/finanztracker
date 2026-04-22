import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { readingsForYear, buildForecast, buildCostForecast, installmentForMonth } from '../utils/electricityCalc';
import { buildSchedule, getCurrentBalance, getPayoffDate } from '../utils/debtCalc';

const YEAR  = new Date().getFullYear();
const TODAY = new Date();

// Insurance interval → annual multiplier
const INT_MULT = { monatlich: 12, vierteljährlich: 4, halbjährlich: 2, jährlich: 1 };

// Savings goal balance (mirrors GuthabenPage logic)
function calcGoalBalance(goalId, entries) {
  const forGoal   = entries.filter((e) => e.goal_id === goalId);
  const neustarts = forGoal
    .filter((e) => e.type === 'neustart')
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const cutoff = neustarts.length > 0 ? neustarts[0].date : null;
  const active = cutoff ? forGoal.filter((e) => e.date >= cutoff) : forGoal;
  return active.reduce((sum, e) => {
    if (e.type === 'neustart')   return sum + Number(e.amount);
    if (e.type === 'einzahlung') return sum + Number(e.amount);
    if (e.type === 'entnahme')   return sum - Number(e.amount);
    return sum;
  }, 0);
}

export function useDashboard() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    const currMonth = TODAY.getMonth() + 1;
    const currYear  = TODAY.getFullYear();

    const [
      insRes, readingsRes, tariffRes,
      savingsGoalsRes, savingsEntriesRes,
      debtsRes, debtPaymentsRes,
      budgetIncomeRes,
      etfPolicenRes,
    ] = await Promise.all([
      supabase.from('insurance_entries').select('*'),
      supabase.from('electricity_readings').select('*').order('date', { ascending: true }),
      supabase.from('electricity_tariffs').select('*').order('valid_from', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('savings_goals').select('*').order('sort_order'),
      supabase.from('savings_entries').select('*'),
      supabase.from('debts').select('*').order('start_date'),
      supabase.from('debt_payments').select('*'),
      supabase.from('custom_budget_items')
        .select('amount, share_percent')
        .eq('month', currMonth)
        .eq('year',  currYear)
        .eq('type',  'income'),
      // Ruhestandsplanung: ETF-Policen liefern params.rentenJahr → nächste Rentenstart-Info.
      // Die ausführliche Projektion (possibleRente) wird in den Modul-Seiten berechnet;
      // hier reichen Anzahl + frühestes Rentenbeginn-Jahr für die Kachel.
      supabase.from('etf_policen').select('id, name, type, params'),
    ]);

    for (const res of [insRes, readingsRes, tariffRes, savingsGoalsRes, savingsEntriesRes, debtsRes, debtPaymentsRes, budgetIncomeRes, etfPolicenRes]) {
      if (res.error) { setError(res.error.message); setLoading(false); return; }
    }

    // ── Versicherungen ─────────────────────────────────────────────────────
    const insEntries = insRes.data ?? [];
    const insJahr    = insEntries.reduce((s, e) => s + Number(e.premium) * (INT_MULT[e.payment_interval] ?? 1), 0);
    const insMonat   = insJahr / 12;

    // ── Strom ──────────────────────────────────────────────────────────────
    // WICHTIG: `tariff_installments` ist eine separate Tabelle. Ohne sie würde
    // buildCostForecast auf monthly_advance × 12 zurückfallen — und
    // monthly_advance speichert aus Backward-Compat nur den FRÜHSTEN Abschlag
    // (siehe useElectricity.saveTariff). Nachträgliche Abschlagsänderungen
    // würden im Dashboard sonst ignoriert.
    let tariff = tariffRes.data ?? null;
    if (tariff?.id) {
      const installmentsRes = await supabase
        .from('tariff_installments')
        .select('*')
        .eq('tariff_id', tariff.id)
        .order('valid_from', { ascending: true });
      if (installmentsRes.error) { setError(installmentsRes.error.message); setLoading(false); return; }
      tariff = { ...tariff, installments: installmentsRes.data ?? [] };
    }
    const yearReads   = readingsForYear(readingsRes.data ?? [], YEAR);
    const firstRead   = yearReads[0]  ?? null;
    const latestRead  = yearReads[yearReads.length - 1] ?? null;
    const forecast    = buildForecast(firstRead, latestRead);
    const stromCost   = buildCostForecast(forecast.total, tariff);
    // Aktuell gültiger Abschlag: jüngster Installment mit valid_from ≤ heute.
    // Fallback auf monthly_advance, wenn keine Installments existieren.
    const stromAbschlag = Array.isArray(tariff?.installments) && tariff.installments.length > 0
      ? installmentForMonth(tariff.installments, currYear, currMonth)
      : (tariff?.monthly_advance ?? 0);

    // ── Guthaben ───────────────────────────────────────────────────────────
    const goals          = savingsGoalsRes.data  ?? [];
    const savingsEntries = savingsEntriesRes.data ?? [];
    const savingsTotal   = goals.reduce((s, g) => s + calcGoalBalance(g.id, savingsEntries), 0);
    const savingsMonthlySoll = goals.reduce((s, g) => s + Number(g.monthly_soll), 0);

    // ── Verbindlichkeiten ──────────────────────────────────────────────────
    const debts       = debtsRes.data  ?? [];
    const debtPayments = debtPaymentsRes.data ?? [];

    // Pro-Kredit-Schedule bauen, daraus Balance + Payoff ziehen.
    const debtBreakdown = debts.map((d) => {
      const sched = buildSchedule(d, debtPayments.filter((p) => p.debt_id === d.id));
      const balance = getCurrentBalance(sched, TODAY) ?? Number(d.total_amount);
      return {
        id:      d.id,
        name:    d.name,
        balance,
        initial: Number(d.total_amount),
        payoff:  getPayoffDate(sched),
      };
    });

    const debtTotal   = debtBreakdown.reduce((s, d) => s + d.balance, 0);
    const debtInitial = debtBreakdown.reduce((s, d) => s + d.initial, 0);
    const debtMonthly = debts.reduce((s, d) => s + Number(d.monthly_rate), 0);
    // Tilgungsfortschritt: wie viel Prozent der ursprünglichen Summe sind getilgt?
    const debtProgressPct = debtInitial > 0
      ? Math.max(0, Math.min(100, ((debtInitial - debtTotal) / debtInitial) * 100))
      : 0;
    // Spätestes Schuldenfrei-Datum (max. payoff über alle Kredite)
    const debtPayoffDate = debtBreakdown.reduce((latest, d) => {
      if (!d.payoff) return latest;
      if (!latest)   return d.payoff;
      return new Date(d.payoff) > new Date(latest) ? d.payoff : latest;
    }, null);

    // ── Monthly chart data ─────────────────────────────────────────────────
    const MONTHS = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
    const chartData = MONTHS.map((month, i) => ({
      month,
      monthIndex: i,
      versicherungen: Math.round(insMonat * 100) / 100,
      strom:          Math.round(stromAbschlag * 100) / 100,
      sparen:         Math.round(savingsMonthlySoll * 100) / 100,
      kredite:        Math.round(debtMonthly * 100) / 100,
      total:          Math.round((insMonat + stromAbschlag + savingsMonthlySoll + debtMonthly) * 100) / 100,
    }));

    // ── Netto ──────────────────────────────────────────────────────────────
    const monthlyOut = insMonat + stromAbschlag + debtMonthly;

    // ── Finanzielle Insights ───────────────────────────────────────────────
    // 1. Netto-Vermögen
    const nettoVermoegen = savingsTotal - debtTotal;

    // 2. Liquiditätsreichweite: wie viele Monate reicht das Guthaben bei aktuellen Ausgaben
    const totalMonthlyObligations = monthlyOut + savingsMonthlySoll;
    const liquiditaetsreichweite = totalMonthlyObligations > 0
      ? savingsTotal / totalMonthlyObligations
      : null;

    // 3. Sparquote: Sparziele-SOLL / Gesamteinnahmen (aus Budget-Modul aktueller Monat)
    const budgetIncome = (budgetIncomeRes.data ?? []).reduce((s, row) => {
      const amt   = parseFloat(row.amount);
      const share = parseFloat(row.share_percent);
      if (isNaN(amt) || isNaN(share)) return s;
      return s + amt * share / 100;
    }, 0);
    const sparquote = budgetIncome > 0
      ? (savingsMonthlySoll / budgetIncome) * 100
      : null;

    // ── Ruhestand (ETF-Policen) ────────────────────────────────────────────
    // Wir summieren Anzahl + nehmen frühestes rentenJahr aus den Params.
    const policen = etfPolicenRes.data ?? [];
    const rentenJahre = policen
      .map((p) => Number(p.params?.rentenJahr))
      .filter((y) => Number.isFinite(y) && y >= currYear);
    const nextRentenbeginn = rentenJahre.length > 0 ? Math.min(...rentenJahre) : null;

    // ── Wealth Progress Zeitreihe (letzte 12 Monate) ───────────────────────
    // Monatlicher Schnitt zum Monatsende: kumulierte Savings-Entries bis Monatsende
    // minus kumulierte Schulden (via Schedule-Eintrag des passenden Monats).
    const wealthSeries = [];
    for (let offset = 11; offset >= 0; offset--) {
      const d = new Date(currYear, TODAY.getMonth() - offset + 1, 0); // Monatsletzter
      const ts  = d.getTime();
      const key = d.toISOString().slice(0, 7); // YYYY-MM

      // Vermögen: Summe aller Savings-Entries (neustart/einzahlung/entnahme) bis d
      let assets = 0;
      for (const g of goals) {
        const entries = (savingsEntriesRes.data ?? [])
          .filter((e) => e.goal_id === g.id && new Date(e.date).getTime() <= ts);
        // Gleiche Logik wie calcGoalBalance: aktueller Neustart oder Anfang
        const neustarts = entries.filter((e) => e.type === 'neustart')
          .sort((a, b) => new Date(b.date) - new Date(a.date));
        const cutoff = neustarts.length > 0 ? neustarts[0].date : null;
        const active = cutoff ? entries.filter((e) => e.date >= cutoff) : entries;
        assets += active.reduce((s, e) => {
          if (e.type === 'entnahme') return s - Number(e.amount);
          return s + Number(e.amount);
        }, 0);
      }

      // Schulden: aus jedem Schedule den Eintrag für diesen Monat holen
      let liabilities = 0;
      for (const d2 of debts) {
        const sched = buildSchedule(d2, debtPayments.filter((p) => p.debt_id === d2.id));
        const entry = sched.find((e) => e.monthKey === key);
        if (entry) liabilities += Number(entry.balance);
        else if (new Date(d2.start_date) > d) liabilities += 0; // Vor Start
        else liabilities += Number(d2.total_amount); // Fallback (selten)
      }

      wealthSeries.push({
        label:       d.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' }),
        assets:      Math.round(assets),
        liabilities: Math.round(liabilities),
        net:         Math.round(assets - liabilities),
      });
    }

    setData({
      ins:      {
        jahr: insJahr, monat: insMonat, count: insEntries.length,
        entries: insEntries,
      },
      strom:    { forecast, cost: stromCost, tariff, abschlag: stromAbschlag },
      savings:  { total: savingsTotal, monthlySoll: savingsMonthlySoll, goalCount: goals.length },
      debts:    {
        total: debtTotal, initial: debtInitial, monthly: debtMonthly,
        count: debts.length, progressPct: debtProgressPct, payoffDate: debtPayoffDate,
      },
      retirement: {
        count: policen.length,
        nextRentenbeginn, // Jahr (Number) oder null
      },
      monthly:  { out: monthlyOut, sparen: savingsMonthlySoll, total: monthlyOut + savingsMonthlySoll },
      insights: { nettoVermoegen, liquiditaetsreichweite, sparquote, budgetIncome },
      chartData,
      wealthSeries,
    });
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return { data, loading, error, refetch: fetchAll };
}
