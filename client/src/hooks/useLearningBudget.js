import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

// Standard-Jahreslimit, falls für ein Jahr (und alle Vorjahre) noch nie ein
// Wert gesetzt wurde — siehe Skill "domain-weiterbildungsbudget".
export const DEFAULT_ANNUAL_LIMIT = 1200;

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

// ── Hook: Jahres-spezifische Limits (CRUD) ─────────────────────────────────
// Ein Limit-Wert pro Jahr. Ein Jahr ohne eigenen Eintrag übernimmt den Wert
// des zuletzt gesetzten Vorjahres (siehe effectiveLimitForYear) — Änderungen
// an einem Jahr wirken sich NIE auf andere Jahre aus, weil pro Jahr eine
// eigene Zeile geschrieben wird.
export function useLearningBudgetYearLimits() {
  const { user } = useAuth();
  const [yearLimits, setYearLimits] = useState([]); // [{ year, annual_limit }], absteigend sortiert
  const [loading,    setLoading]    = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user) { setYearLimits([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('learning_budget_year_limits')
      .select('year, annual_limit')
      .eq('user_id', user.id)
      .order('year', { ascending: false });
    if (!error) setYearLimits(data ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const setYearLimit = useCallback(async (year, value) => {
    if (!user) throw new Error('Not ready');
    const annual_limit = Number(value) || 0;
    const { error } = await supabase
      .from('learning_budget_year_limits')
      .upsert({ user_id: user.id, year, annual_limit }, { onConflict: 'user_id,year' });
    if (error) throw error;
    setYearLimits((prev) => {
      const next = prev.filter((r) => r.year !== year);
      next.push({ year, annual_limit });
      return next.sort((a, b) => b.year - a.year);
    });
  }, [user]);

  return { yearLimits, loading, setYearLimit, refetch: fetchAll };
}

/** Effektives Limit für `year`: eigener Eintrag, sonst rückwärts das nächste
 *  gesetzte Vorjahr, sonst DEFAULT_ANNUAL_LIMIT. `yearLimits` muss absteigend
 *  nach Jahr sortiert sein (Standard-Rückgabe von useLearningBudgetYearLimits). */
export function effectiveLimitForYear(year, yearLimits) {
  const match = yearLimits.find((r) => r.year <= year);
  return match ? Number(match.annual_limit) : DEFAULT_ANNUAL_LIMIT;
}

/** true, wenn für `year` explizit ein Wert gesetzt wurde (kein Vorjahres-Fallback). */
export function hasExplicitLimit(year, yearLimits) {
  return yearLimits.some((r) => r.year === year);
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
