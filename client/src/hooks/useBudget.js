import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { buildRevolvingSchedule } from '../utils/debtCalc';
import { readSalaryNetto } from './useSalarySettings';

// Insurance interval → annual occurrences (German labels)
const INT_MULT = { monatlich: 12, vierteljährlich: 4, halbjährlich: 2, jährlich: 1 };

/**
 * Determine whether an insurance entry falls due in the given month.
 */
function insuranceDueInMonth(entry, month) {
  const interval = entry.payment_interval ?? 'jährlich';
  if (interval === 'monatlich') return true;

  const due = entry.due_month;
  if (!due) return false;

  if (interval === 'jährlich')        return due === month;
  if (interval === 'halbjährlich')    return due === month || ((due + 5) % 12) + 1 === month;
  if (interval === 'vierteljährlich') {
    return [0, 3, 6, 9].some((offset) => ((due - 1 + offset) % 12) + 1 === month);
  }
  return false;
}

/**
 * From a list of insurance entries (all years), pick the best match for a
 * given budget year:
 *  1. Exact year match
 *  2. Latest entry with year < budgetYear (most-recent past value)
 * Groups by category_id; returns one entry per category.
 */
function pickBestInsuranceEntries(allEntries, budgetYear) {
  const byCategory = {};
  allEntries.forEach((e) => {
    const existing = byCategory[e.category_id];
    if (!existing) { byCategory[e.category_id] = e; return; }

    const eYear   = Number(e.year);
    const exYear  = Number(existing.year);
    const budget  = Number(budgetYear);

    // Prefer exact year; otherwise prefer the closest year ≤ budgetYear
    if (eYear === budget) { byCategory[e.category_id] = e; return; }
    if (exYear === budget) return; // existing is exact match, keep it

    // Both are != budgetYear — keep the one closest from below
    if (eYear <= budget && (exYear > budget || eYear > exYear)) {
      byCategory[e.category_id] = e;
    }
  });
  return Object.values(byCategory);
}

/**
 * Build insurance budget candidates for a given month/year.
 * Returns array of candidate objects (not yet persisted).
 */
export function buildInsuranceCandidates(allEntries, month, year, startOrder = 0) {
  const best = pickBestInsuranceEntries(allEntries, year);
  const candidates = [];
  let order = startOrder;

  best
    .filter((e) => insuranceDueInMonth(e, month))
    .forEach((e) => {
      const mult   = INT_MULT[e.payment_interval] ?? 1;
      const amount = e.payment_interval === 'monatlich'
        ? Number(e.premium)
        : Number(e.premium) * mult;
      candidates.push({
        label:         e.name ?? 'Versicherung',
        amount:        Math.round(amount * 100) / 100,
        share_percent: 100,
        type:          'expense',
        source:        'insurance',
        source_id:     e.id,
        note:          e.payment_interval ?? '',
        sort_order:    order++,
        _yearNote:     Number(e.year) !== Number(year) ? `(Wert aus ${e.year})` : null,
      });
    });

  return { candidates, nextOrder: order };
}

export function useBudget(month, year) {
  const [items,     setItems]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [importing, setImporting] = useState(false);

  // ── Fetch items for this month/year ──────────────────────────────────────
  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: sbError } = await supabase
      .from('custom_budget_items')
      .select('*')
      .eq('month', month)
      .eq('year',  year)
      .order('sort_order')
      .order('created_at');

    if (sbError) { setError(sbError.message); setLoading(false); return; }
    setItems(data ?? []);
    setLoading(false);
  }, [month, year]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // ── Add item ──────────────────────────────────────────────────────────────
  const addItem = useCallback(async ({ label, amount, share_percent, type, source, source_id, note, category }) => {
    const maxOrder = items.reduce((m, i) => Math.max(m, i.sort_order), 0);
    const { data, error: sbError } = await supabase
      .from('custom_budget_items')
      .insert({
        month, year,
        label,
        amount:        Number(amount) || 0,
        share_percent: Number(share_percent) ?? 100,
        type:          type     ?? 'expense',
        source:        source   ?? 'custom',
        source_id:     source_id ?? null,
        note:          note     ?? '',
        category:      category ?? 'sonstiges',
        sort_order:    maxOrder + 1,
      })
      .select()
      .single();

    if (sbError) throw new Error(sbError.message);
    setItems((prev) => [...prev, data]);
    return data;
  }, [month, year, items]);

  // ── Update item ───────────────────────────────────────────────────────────
  const updateItem = useCallback(async (id, patch) => {
    const { data, error: sbError } = await supabase
      .from('custom_budget_items')
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    if (sbError) throw new Error(sbError.message);
    setItems((prev) => prev.map((i) => (i.id === id ? data : i)));
    return data;
  }, []);

  // ── Reorder items ─────────────────────────────────────────────────────────
  // newOrder may be a partial list (e.g. only expense items). Items not present
  // in newOrder are preserved unchanged so the other section is never wiped.
  const reorderItems = useCallback(async (newOrder) => {
    const reorderedSet = new Set(newOrder);
    setItems((prev) => {
      const map = Object.fromEntries(prev.map((i) => [i.id, i]));
      const unchanged = prev.filter((i) => !reorderedSet.has(i.id));
      const reordered = newOrder
        .map((id, idx) => (map[id] ? { ...map[id], sort_order: idx } : null))
        .filter(Boolean);
      return [...unchanged, ...reordered].sort((a, b) => a.sort_order - b.sort_order);
    });
    await Promise.all(
      newOrder.map((id, idx) =>
        supabase.from('custom_budget_items').update({ sort_order: idx }).eq('id', id)
      )
    );
  }, []);

  // ── Delete item ───────────────────────────────────────────────────────────
  const deleteItem = useCallback(async (id) => {
    const { error: sbError } = await supabase
      .from('custom_budget_items')
      .delete()
      .eq('id', id);

    if (sbError) throw new Error(sbError.message);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  // ── Reset month (alle Items des gewählten Monats löschen) ─────────────────
  const resetMonth = useCallback(async () => {
    const { error: sbError } = await supabase
      .from('custom_budget_items')
      .delete()
      .eq('month', month)
      .eq('year',  year);
    if (sbError) throw new Error(sbError.message);
    setItems([]);
  }, [month, year]);

  // ── Fetch all import candidates (for selective import modal) ──────────────
  const fetchImportCandidates = useCallback(async () => {
    const [insRes, tariffRes, debtsRes, savingsRes, debtPaysRes] = await Promise.all([
      supabase.from('insurance_entries').select('*'),
      supabase.from('electricity_tariffs').select('*').order('valid_from', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('debts').select('*'),
      supabase.from('savings_goals').select('*').order('sort_order'),
      supabase.from('debt_payments').select('debt_id, date, amount'),
    ]);

    const allEntries = insRes.data ?? [];
    const debtPaymentsData = debtPaysRes.data ?? [];

    // ── Insurance ────────────────────────────────────────────────────────
    const { candidates: insuranceCandidates } = buildInsuranceCandidates(allEntries, month, year, 0);

    // ── Strom ─────────────────────────────────────────────────────────────
    const stromCandidates = [];
    if (tariffRes.data) {
      stromCandidates.push({
        label:         `Strom – ${tariffRes.data.provider || 'Abschlag'}`,
        amount:        Number(tariffRes.data.monthly_advance),
        share_percent: 50,
        type:          'expense',
        source:        'strom',
        source_id:     tariffRes.data.id,
        note:          '',
      });
    }

    // ── Kredite ───────────────────────────────────────────────────────────
    const kreditCandidates = [];
    (debtsRes.data ?? []).forEach((d) => {
      if (d.debt_type === 'revolving') {
        const debtPays = debtPaymentsData.filter((p) => p.debt_id === d.id);
        const schedule = buildRevolvingSchedule(d, debtPays);
        const curEntry = schedule.find((e) => e.isCurrent) ?? schedule[schedule.length - 1];
        const interest = curEntry?.zinsen ?? 0;
        const minRate  = curEntry?.minRateNext ?? Math.max(Number(d.total_amount) * 0.02, 50);

        if (interest > 0) {
          kreditCandidates.push({
            label:         `${d.name} – Zinsen`,
            amount:        Math.round(interest * 100) / 100,
            share_percent: 100,
            type:          'expense',
            source:        'kredit',
            source_id:     d.id,
            note:          `${d.interest_rate} % p.a. · tagesgenau`,
          });
        }
        kreditCandidates.push({
          label:         `${d.name} – Mindestrate`,
          amount:        Math.round(minRate * 100) / 100,
          share_percent: 100,
          type:          'expense',
          source:        'kredit',
          source_id:     d.id,
          note:          'MAX(2% Saldo, 50 €)',
        });
      } else {
        kreditCandidates.push({
          label:         d.name,
          amount:        Number(d.monthly_rate),
          share_percent: 100,
          type:          'expense',
          source:        'kredit',
          source_id:     d.id,
          note:          `${d.interest_rate} % p.a.`,
        });
      }
    });

    // ── Sparziele ─────────────────────────────────────────────────────────
    const sparZielCandidates = (savingsRes.data ?? [])
      .filter((g) => Number(g.monthly_soll) > 0)
      .map((g) => ({
        label:         g.name,
        amount:        Number(g.monthly_soll),
        share_percent: 100,
        type:          'expense',
        source:        'sparziel',
        source_id:     g.id,
        note:          'Sparziel',
      }));

    // ── Gehalt (from SalaryPage via localStorage) ─────────────────────────
    const salaryCandidates = [];
    const salaryData = readSalaryNetto();
    if (salaryData?.netto > 0) {
      salaryCandidates.push({
        label:         'Nettogehalt',
        amount:        salaryData.netto,
        share_percent: 100,
        type:          'income',
        source:        'salary',
        source_id:     'salary_netto',
        note:          'Aus Gehaltsrechner',
      });
    }

    return {
      insurance: insuranceCandidates,
      strom:     stromCandidates,
      kredit:    kreditCandidates,
      sparziel:  sparZielCandidates,
      salary:    salaryCandidates,
    };
  }, [month, year]);

  // ── Import selected candidates (deduplication via source + source_id + label) ──
  function sourceToCategory(source) {
    const map = { insurance: 'versicherung', kredit: 'versicherung', strom: 'wohnen', sparziel: 'sparen' };
    return map[source] ?? 'sonstiges';
  }

  const importSelected = useCallback(async (candidates) => {
    if (candidates.length === 0) return;
    setImporting(true);
    try {
      // Deduplicate: skip any candidate that already has a matching row
      const existing = items;
      const toInsert = candidates.filter((c) => {
        if (!c.source_id) return true; // custom items always allowed
        return !existing.some(
          (e) => e.source === c.source && e.source_id === c.source_id && e.label === c.label
        );
      });

      if (toInsert.length === 0) return;

      const maxOrder = items.reduce((m, i) => Math.max(m, i.sort_order), 0);
      const rows = toInsert.map((c, idx) => ({
        month, year,
        label:         c.label,
        amount:        c.amount,
        share_percent: c.share_percent,
        type:          c.type,
        source:        c.source,
        source_id:     c.source_id ?? null,
        note:          c.note ?? '',
        category:      c.category ?? sourceToCategory(c.source),
        sort_order:    maxOrder + 1 + idx,
      }));

      const { data, error: sbError } = await supabase
        .from('custom_budget_items')
        .insert(rows)
        .select();

      if (sbError) throw new Error(sbError.message);
      setItems((prev) => [...prev, ...(data ?? [])]);
    } finally {
      setImporting(false);
    }
  }, [month, year, items]);

  // ── Auto-Import (imports everything, with deduplication) ─────────────────
  const autoImport = useCallback(async () => {
    setImporting(true);
    try {
      const candidates = await fetchImportCandidates();
      const all = [
        ...candidates.insurance,
        ...candidates.strom,
        ...candidates.kredit,
        ...candidates.sparziel,
        ...candidates.salary,
      ];
      await importSelected(all);
    } finally {
      setImporting(false);
    }
  }, [fetchImportCandidates, importSelected]);

  // ── Copy previous month (preserves source/source_id for dedup) ───────────
  const copyFromPrevMonth = useCallback(async () => {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear  = month === 1 ? year - 1 : year;

    const { data: prev, error: sbError } = await supabase
      .from('custom_budget_items')
      .select('*')
      .eq('month', prevMonth)
      .eq('year',  prevYear)
      .order('sort_order');

    if (sbError) throw new Error(sbError.message);
    if (!prev || prev.length === 0) throw new Error('Vormonat enthält keine Einträge.');

    // Deduplicate: skip items whose source_id already exists in the current month
    const existing = items;
    const toInsert = prev
      .filter(({ id: _id, created_at: _c, ...rest }) => {
        if (!rest.source_id) return true; // custom items always copy
        return !existing.some(
          (e) => e.source === rest.source && e.source_id === rest.source_id && e.label === rest.label
        );
      })
      .map(({ id: _id, created_at: _c, ...rest }) => ({
        ...rest,
        month,
        year,
      }));

    if (toInsert.length === 0) throw new Error('Alle Einträge des Vormonats sind bereits vorhanden.');

    const { data: inserted, error: sbError2 } = await supabase
      .from('custom_budget_items')
      .insert(toInsert)
      .select();

    if (sbError2) throw new Error(sbError2.message);
    setItems((prev) => [...prev, ...(inserted ?? [])]);
  }, [month, year, items]);

  const isEmpty = !loading && items.length === 0;

  return {
    items, loading, error, importing, isEmpty,
    addItem, updateItem, deleteItem, reorderItems, resetMonth,
    autoImport, copyFromPrevMonth,
    fetchImportCandidates, importSelected,
    refetch: fetchItems,
  };
}
