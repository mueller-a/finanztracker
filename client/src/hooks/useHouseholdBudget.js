import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

// ── Wochen-Helfer (Mo–So, ISO-Woche) ──────────────────────────
function startOfISOWeek(date) {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const day = d.getDay();            // 0=So, 1=Mo, …
  const diff = (day + 6) % 7;        // Mo=0, Di=1, …, So=6
  d.setDate(d.getDate() - diff);
  return d;
}
function endOfISOWeek(date) {
  const s = startOfISOWeek(date);
  s.setDate(s.getDate() + 6);
  s.setHours(23, 59, 59, 999);
  return s;
}
function startOfMonth(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  return d;
}
function endOfMonth(date) {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
}
function ymd(d) {
  return d.toISOString().slice(0, 10);
}

// ── Hook: Haushalts-Einstellungen (household_id + Limits) ─────
export function useHouseholdSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState(null);
  const [loading,  setLoading]  = useState(true);

  const fetchSettings = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('user_module_settings')
      .select('household_id, household_weekly_limit, household_monthly_limit')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!error) setSettings(data);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const updateSettings = useCallback(async (patch) => {
    if (!user) return;
    await supabase
      .from('user_module_settings')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
    setSettings((prev) => ({ ...prev, ...patch }));
  }, [user]);

  const createHousehold = useCallback(async () => {
    const newId = crypto.randomUUID();
    await updateSettings({ household_id: newId });
    return newId;
  }, [updateSettings]);

  const joinHousehold = useCallback(async (household_id) => {
    await updateSettings({ household_id });
  }, [updateSettings]);

  const leaveHousehold = useCallback(async () => {
    await updateSettings({ household_id: null });
  }, [updateSettings]);

  return {
    settings, loading,
    householdId:   settings?.household_id ?? null,
    weeklyLimit:   Number(settings?.household_weekly_limit  ?? 150),
    monthlyLimit:  Number(settings?.household_monthly_limit ?? 650),
    updateSettings, createHousehold, joinHousehold, leaveHousehold,
    refetch: fetchSettings,
  };
}

// ── Hook: Transaktionen + Mitglieder ──────────────────────────
export function useHouseholdTransactions(householdId) {
  const [transactions, setTransactions] = useState([]);
  const [members,      setMembers]      = useState([]);
  const [loading,      setLoading]      = useState(true);

  const fetchAll = useCallback(async () => {
    if (!householdId) { setTransactions([]); setMembers([]); setLoading(false); return; }
    setLoading(true);
    const [tx, mem] = await Promise.all([
      supabase.from('household_transactions')
        .select('*')
        .eq('household_id', householdId)
        .order('occurred_at', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.rpc('get_household_members', { p_household_id: householdId }),
    ]);
    if (!tx.error) setTransactions(tx.data ?? []);
    if (!mem.error) setMembers(mem.data ?? []);
    setLoading(false);
  }, [householdId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const addTransaction = useCallback(async (tx) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !householdId) throw new Error('Not ready');
    const payload = {
      household_id: householdId,
      user_id:      user.id,
      amount:       Number(tx.amount),
      type:         tx.type || 'expense',
      category:     tx.category,
      description:  tx.description || null,
      occurred_at:  tx.occurred_at || ymd(new Date()),
    };
    const { data, error } = await supabase
      .from('household_transactions')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    setTransactions((prev) => [data, ...prev]);
    return data;
  }, [householdId]);

  const updateTransaction = useCallback(async (id, patch) => {
    const { data, error } = await supabase
      .from('household_transactions')
      .update({
        amount:      Number(patch.amount),
        type:        patch.type,
        category:    patch.category,
        description: patch.description || null,
        occurred_at: patch.occurred_at,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    setTransactions((prev) => prev.map((t) => t.id === id ? data : t));
    return data;
  }, []);

  const deleteTransaction = useCallback(async (id) => {
    const { error } = await supabase.from('household_transactions').delete().eq('id', id);
    if (error) throw error;
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { transactions, members, loading, addTransaction, updateTransaction, deleteTransaction, refetch: fetchAll };
}

// ── Hook: Budget-Berechnung (Woche/Monat) ─────────────────────
export function useBudgetStats(transactions, weeklyLimit, monthlyLimit, mode = 'week') {
  return useMemo(() => {
    const now = new Date();
    const periodStart = mode === 'week' ? startOfISOWeek(now) : startOfMonth(now);
    const periodEnd   = mode === 'week' ? endOfISOWeek(now)   : endOfMonth(now);
    const limit       = mode === 'week' ? weeklyLimit         : monthlyLimit;

    const startIso = ymd(periodStart);
    const endIso   = ymd(periodEnd);

    let expenses = 0, income = 0;
    for (const t of transactions) {
      if (t.occurred_at < startIso || t.occurred_at > endIso) continue;
      if (t.type === 'expense') expenses += Number(t.amount);
      else                      income   += Number(t.amount);
    }
    const netSpent = Math.max(0, expenses - income);
    const remaining = Math.max(0, limit - netSpent);
    const msPerDay = 86400000;
    const today    = new Date(); today.setHours(0,0,0,0);
    const daysLeft = Math.max(1, Math.ceil((periodEnd - today) / msPerDay) + 1);
    const dailyReserve = remaining / daysLeft;
    const percentAvailable = limit > 0 ? (remaining / limit) * 100 : 0;

    // Ampel-Logik nach SKILL.md:
    //   > 50% verfügbar → grün
    //   20-50%          → gelb
    //   < 20%           → rot
    let severity;
    if (percentAvailable > 50)     severity = 'success';
    else if (percentAvailable >= 20) severity = 'warning';
    else                            severity = 'error';

    return {
      periodStart, periodEnd, limit,
      expenses, income, netSpent, remaining,
      daysLeft, dailyReserve,
      percentAvailable, percentUsed: 100 - percentAvailable,
      severity,
    };
  }, [transactions, weeklyLimit, monthlyLimit, mode]);
}

// Export helpers für UI-Komponenten
export { startOfISOWeek, endOfISOWeek, startOfMonth, endOfMonth, ymd };
