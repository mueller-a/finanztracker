import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

function cleanGoalPayload({
  name, target_amount, monthly_soll, color_code,
  kategorie, zinssatz, nominalwert, kupon, faelligkeitsdatum, kupon_intervall, etf_id,
  logo_id,
}) {
  return {
    name,
    target_amount:    target_amount  ? Number(target_amount)  : null,
    monthly_soll:     Number(monthly_soll ?? 0),
    color_code:       color_code || '#7c3aed',
    kategorie:        kategorie  || 'rücklagen',
    zinssatz:         zinssatz   ? Number(zinssatz)   : null,
    nominalwert:      nominalwert ? Number(nominalwert) : null,
    kupon:            kupon       ? Number(kupon)       : null,
    faelligkeitsdatum: faelligkeitsdatum || null,
    kupon_intervall:  kupon_intervall || 'jährlich',
    etf_id:           etf_id || null,
    logo_id:          logo_id || null,
  };
}

export function useSavings() {
  const [goals,   setGoals]   = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [goalsRes, entriesRes] = await Promise.all([
      supabase.from('savings_goals').select('*').order('sort_order').order('created_at'),
      supabase.from('savings_entries').select('*').order('date', { ascending: false }).order('created_at', { ascending: false }),
    ]);

    if (goalsRes.error)   { setError(goalsRes.error.message);   setLoading(false); return; }
    if (entriesRes.error) { setError(entriesRes.error.message); setLoading(false); return; }

    setGoals(goalsRes.data ?? []);
    setEntries(entriesRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Goals ──────────────────────────────────────────────────────────────────
  const addGoal = useCallback(async (form) => {
    const maxOrder = goals.reduce((m, g) => Math.max(m, g.sort_order), 0);
    const { data, error: sbError } = await supabase
      .from('savings_goals')
      .insert({ ...cleanGoalPayload(form), sort_order: maxOrder + 1 })
      .select()
      .single();

    if (sbError) throw new Error(sbError.message);
    setGoals((prev) => [...prev, data]);
    return data;
  }, [goals]);

  const updateGoal = useCallback(async (id, form) => {
    const { data, error: sbError } = await supabase
      .from('savings_goals')
      .update(cleanGoalPayload(form))
      .eq('id', id)
      .select()
      .single();

    if (sbError) throw new Error(sbError.message);
    setGoals((prev) => prev.map((g) => (g.id === id ? data : g)));
    return data;
  }, []);

  const deleteGoal = useCallback(async (id) => {
    const { error: sbError } = await supabase
      .from('savings_goals')
      .delete()
      .eq('id', id);

    if (sbError) throw new Error(sbError.message);
    setGoals((prev) => prev.filter((g) => g.id !== id));
    setEntries((prev) => prev.filter((e) => e.goal_id !== id));
  }, []);

  // ── Entries ────────────────────────────────────────────────────────────────
  const addEntry = useCallback(async ({ goal_id, date, amount, type, note }) => {
    const { data, error: sbError } = await supabase
      .from('savings_entries')
      .insert({ goal_id, date, amount: Number(amount), type, note: note ?? '' })
      .select()
      .single();

    if (sbError) throw new Error(sbError.message);
    setEntries((prev) => [data, ...prev].sort(
      (a, b) => new Date(b.date) - new Date(a.date) || new Date(b.created_at) - new Date(a.created_at)
    ));
    return data;
  }, []);

  const deleteEntry = useCallback(async (id) => {
    const { error: sbError } = await supabase
      .from('savings_entries')
      .delete()
      .eq('id', id);

    if (sbError) throw new Error(sbError.message);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  return { goals, entries, loading, error, addGoal, updateGoal, deleteGoal, addEntry, deleteEntry, refetch: fetchAll };
}
