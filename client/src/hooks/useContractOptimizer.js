import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { computeUrgency, sortByUrgency } from '../utils/contractUrgency';

const INT_MULT = { monatlich: 12, vierteljährlich: 4, halbjährlich: 2, jährlich: 1 };

function toMonthly(premium, interval) {
  const mult = INT_MULT[interval] || 1;
  return (premium * mult) / 12;
}

/**
 * Pick the most recent entry per category_id (latest year).
 */
function latestPerCategory(entries) {
  const map = {};
  entries.forEach(e => {
    const existing = map[e.category_id];
    if (!existing || Number(e.year) > Number(existing.year)) map[e.category_id] = e;
  });
  return Object.values(map);
}

/**
 * Normalize an insurance entry to the unified Contract shape.
 */
function normalizeInsurance(e) {
  return {
    id: e.id,
    source: 'insurance',
    name: e.category?.name ?? 'Versicherung',
    categoryColor: e.category?.color ?? '#7c3aed',
    provider: e.provider_obj?.name ?? e.provider ?? '',
    monthlyCost: toMonthly(e.premium, e.payment_interval),
    notice_period_months: e.notice_period_months ?? 3,
    contract_end_date: e.contract_end_date ?? null,
    is_cancelled: e.is_cancelled ?? false,
    cancellation_date: e.cancellation_date ?? null,
    optimizer_note: e.optimizer_note ?? '',
  };
}

/**
 * Normalize an electricity tariff to the unified Contract shape.
 */
function normalizeElectricity(t) {
  return {
    id: t.id,
    source: 'electricity',
    name: 'Stromtarif',
    categoryColor: '#f59e0b',
    provider: t.provider ?? '',
    monthlyCost: Number(t.monthly_advance) || 0,
    notice_period_months: t.notice_period_months ?? 1,
    contract_end_date: t.contract_end_date ?? null,
    is_cancelled: t.is_cancelled ?? false,
    cancellation_date: t.cancellation_date ?? null,
    optimizer_note: t.optimizer_note ?? '',
  };
}

export function useContractOptimizer() {
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const debounceRef               = useRef({});

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [insRes, elecRes] = await Promise.all([
      supabase.from('insurance_entries')
        .select('*, category:categories(name, color, icon), provider_obj:insurance_providers(name)')
        .order('year', { ascending: false }),
      supabase.from('electricity_tariffs')
        .select('*')
        .order('valid_from', { ascending: false })
        .limit(1),
    ]);

    if (insRes.error) { setError(insRes.error.message); setLoading(false); return; }
    if (elecRes.error) { setError(elecRes.error.message); setLoading(false); return; }

    const insContracts = latestPerCategory(insRes.data ?? []).map(normalizeInsurance);
    const elecContracts = (elecRes.data ?? []).map(normalizeElectricity);

    const all = [...insContracts, ...elecContracts].map(c => ({
      ...c, urgency: computeUrgency(c),
    }));

    setContracts(sortByUrgency(all));
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const updateContract = useCallback(async (source, id, fields) => {
    const table = source === 'electricity' ? 'electricity_tariffs' : 'insurance_entries';

    // Optimistic local update
    setContracts(prev => {
      const updated = prev.map(c => {
        if (c.id !== id) return c;
        const patched = { ...c, ...fields };
        return { ...patched, urgency: computeUrgency(patched) };
      });
      return sortByUrgency(updated);
    });

    const { error: sbErr } = await supabase
      .from(table)
      .update(fields)
      .eq('id', id);

    if (sbErr) { await fetchAll(); throw new Error(sbErr.message); }
  }, [fetchAll]);

  // Debounced note save (600ms)
  const updateNote = useCallback((source, id, note) => {
    // Optimistic
    setContracts(prev => prev.map(c => c.id === id ? { ...c, optimizer_note: note } : c));

    clearTimeout(debounceRef.current[id]);
    debounceRef.current[id] = setTimeout(() => {
      const table = source === 'electricity' ? 'electricity_tariffs' : 'insurance_entries';
      supabase.from(table).update({ optimizer_note: note }).eq('id', id);
    }, 600);
  }, []);

  return { contracts, loading, error, updateContract, updateNote, refetch: fetchAll };
}
