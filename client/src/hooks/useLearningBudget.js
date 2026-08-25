import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

// ── Hook: alle Weiterbildungsbudget-Einträge des Users (CRUD) ─────────────
export function useLearningBudgetItems() {
  const { user } = useAuth();
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('learning_budget_items')
      .select('*')
      .eq('user_id', user.id)
      .order('occurred_at', { ascending: false })
      .order('created_at', { ascending: false });
    if (!error) setItems(data ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const addItem = useCallback(async (item) => {
    if (!user) throw new Error('Not ready');
    const payload = {
      user_id:      user.id,
      amount:       Number(item.amount) || 0,
      category:     item.category,
      description:  item.description || null,
      occurred_at:  item.occurred_at || ymd(new Date()),
    };
    const { data, error } = await supabase
      .from('learning_budget_items')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    setItems((prev) => [data, ...prev]);
    return data;
  }, [user]);

  const updateItem = useCallback(async (id, patch) => {
    const { data, error } = await supabase
      .from('learning_budget_items')
      .update({
        amount:      Number(patch.amount) || 0,
        category:    patch.category,
        description: patch.description || null,
        occurred_at: patch.occurred_at,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    setItems((prev) => prev.map((i) => i.id === id ? data : i));
    return data;
  }, []);

  const deleteItem = useCallback(async (id) => {
    const { error } = await supabase.from('learning_budget_items').delete().eq('id', id);
    if (error) throw error;
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  return { items, loading, addItem, updateItem, deleteItem, refetch: fetchAll };
}

// ── Hook: Berechnung für ein gewähltes Jahr ────────────────────────────────
export function useLearningBudgetStats(items, annualLimit, year) {
  return useMemo(() => {
    const yearItems = items.filter((i) => i.occurred_at?.slice(0, 4) === String(year));
    const spent = yearItems.reduce((sum, i) => sum + Number(i.amount), 0);
    const available = Math.max(0, annualLimit - spent);
    const percentAvailable = annualLimit > 0 ? (available / annualLimit) * 100 : 0;

    const byCategory = yearItems.reduce((acc, i) => {
      acc[i.category] = (acc[i.category] || 0) + Number(i.amount);
      return acc;
    }, {});

    // Ampel-Logik (siehe Skill "domain-haushaltsbuch"):
    //   > 50% verfügbar → grün, 20-50% → gelb, < 20% → rot
    let severity;
    if (percentAvailable > 50)       severity = 'success';
    else if (percentAvailable >= 20) severity = 'warning';
    else                             severity = 'error';

    const availableYears = Array.from(
      new Set([...items.map((i) => Number(i.occurred_at?.slice(0, 4))), new Date().getFullYear()])
    ).sort((a, b) => b - a);

    return { yearItems, spent, available, percentAvailable, percentUsed: 100 - percentAvailable, severity, byCategory, availableYears };
  }, [items, annualLimit, year]);
}
