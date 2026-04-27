import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

export function useDebts() {
  const [debts,    setDebts]    = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [debtsRes, paymentsRes] = await Promise.all([
      supabase.from('debts').select('*').order('start_date'),
      supabase.from('debt_payments').select('*').order('date', { ascending: false }),
    ]);

    if (debtsRes.error)    { setError(debtsRes.error.message);    setLoading(false); return; }
    if (paymentsRes.error) { setError(paymentsRes.error.message); setLoading(false); return; }

    setDebts(debtsRes.data ?? []);
    setPayments(paymentsRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Debts ──────────────────────────────────────────────────────────────────
  const addDebt = useCallback(async ({ name, total_amount, interest_rate, monthly_rate, start_date, color_code, note, debt_type, credit_limit, logo_id }) => {
    const { data, error: sbError } = await supabase
      .from('debts')
      .insert({
        name,
        total_amount:  Number(total_amount),
        interest_rate: Number(interest_rate),
        monthly_rate:  Number(monthly_rate) || 0,
        start_date,
        color_code:    color_code || '#ef4444',
        note:          note ?? '',
        debt_type:     debt_type ?? 'annuity',
        credit_limit:  credit_limit ? Number(credit_limit) : null,
        logo_id:       logo_id || null,
      })
      .select()
      .single();

    if (sbError) throw new Error(sbError.message);
    setDebts((prev) => [...prev, data].sort((a, b) => new Date(a.start_date) - new Date(b.start_date)));
    return data;
  }, []);

  const updateDebt = useCallback(async (id, fields) => {
    // Alle Felder hier sind aus dem DebtForm — override wird separat gesetzt
    // und bleibt bei einem regulären Debt-Edit unangetastet.
    const row = {
      name:          fields.name,
      total_amount:  Number(fields.total_amount),
      interest_rate: Number(fields.interest_rate),
      monthly_rate:  Number(fields.monthly_rate) || 0,
      start_date:    fields.start_date,
      color_code:    fields.color_code || '#ef4444',
      note:          fields.note ?? '',
      debt_type:     fields.debt_type ?? 'annuity',
      credit_limit:  fields.credit_limit ? Number(fields.credit_limit) : null,
      logo_id:       fields.logo_id || null,
    };
    // Wenn initial_interest_override explizit übergeben wurde, mit patchen.
    // `undefined` → nicht anfassen, `null` → zurücksetzen.
    if (Object.prototype.hasOwnProperty.call(fields, 'initial_interest_override')) {
      row.initial_interest_override = fields.initial_interest_override == null
        ? null
        : Number(fields.initial_interest_override);
    }

    const { data, error: sbError } = await supabase
      .from('debts')
      .update(row)
      .eq('id', id)
      .select()
      .single();

    if (sbError) throw new Error(sbError.message);
    setDebts((prev) => prev.map((d) => (d.id === id ? data : d)));
    return data;
  }, []);

  // ── Spezialisierter Setter für den Override der ersten Zinsrate ───────────
  // `value` = EUR-Betrag (number) oder null (Reset auf Standard-Annuität).
  // Nutzt einen gezielten Patch-Update (nur diese eine Spalte), damit wir
  // die übrigen Felder nicht erneut serialisieren müssen und Race-Conditions
  // mit gleichzeitig offenem DebtForm vermieden werden.
  const setInitialInterestOverride = useCallback(async (id, value) => {
    const payload = {
      initial_interest_override: value == null || value === '' ? null : Number(value),
    };
    const { data, error: sbError } = await supabase
      .from('debts')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (sbError) throw new Error(sbError.message);
    setDebts((prev) => prev.map((d) => (d.id === id ? data : d)));
    return data;
  }, []);

  const deleteDebt = useCallback(async (id) => {
    const { error: sbError } = await supabase.from('debts').delete().eq('id', id);
    if (sbError) throw new Error(sbError.message);
    setDebts((prev) => prev.filter((d) => d.id !== id));
    setPayments((prev) => prev.filter((p) => p.debt_id !== id));
  }, []);

  // ── Extra payments / Withdrawals (debt_payments) ──────────────────────────
  // `type`: 'repayment' (default, senkt Saldo) | 'withdrawal' (erhöht Saldo, nur Rahmenkredit).
  const updatePayment = useCallback(async (id, { date, amount, note, type }) => {
    const row = { date, amount: Number(amount), note: note ?? '' };
    if (type) row.type = type;
    const { data, error: sbError } = await supabase
      .from('debt_payments')
      .update(row)
      .eq('id', id)
      .select()
      .single();

    if (sbError) throw new Error(sbError.message);
    setPayments((prev) => prev.map((p) => (p.id === id ? data : p)));
    return data;
  }, []);

  const addPayment = useCallback(async ({ debt_id, date, amount, note, type }) => {
    const { data, error: sbError } = await supabase
      .from('debt_payments')
      .insert({
        debt_id,
        date,
        amount:           Number(amount),
        is_extra_payment: true,
        note:             note ?? '',
        type:             type ?? 'repayment',
      })
      .select()
      .single();

    if (sbError) throw new Error(sbError.message);
    setPayments((prev) => [data, ...prev].sort((a, b) => new Date(b.date) - new Date(a.date)));
    return data;
  }, []);

  const deletePayment = useCallback(async (id) => {
    const { error: sbError } = await supabase.from('debt_payments').delete().eq('id', id);
    if (sbError) throw new Error(sbError.message);
    setPayments((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return {
    debts, payments, loading, error,
    addDebt, updateDebt, deleteDebt,
    addPayment, updatePayment, deletePayment,
    setInitialInterestOverride,
    refetch: fetchAll,
  };
}
