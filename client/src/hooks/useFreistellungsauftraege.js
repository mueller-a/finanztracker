import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

/**
 * CRUD-Hook für Freistellungsaufträge eines Users.
 * Lädt initial alle Einträge — Filtern nach Jahr passiert im UI, damit
 * der Year-Switch ohne Refetch funktioniert.
 *
 * @returns {{
 *   orders: Array,
 *   loading: boolean,
 *   error: string | null,
 *   addOrder: (row) => Promise<row>,
 *   updateOrder: (id, patch) => Promise<row>,
 *   deleteOrder: (id) => Promise<void>,
 *   refetch: () => Promise<void>,
 * }}
 */
export function useFreistellungsauftraege() {
  const [orders,  setOrders]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: sbError } = await supabase
      .from('freistellungsauftraege')
      .select('*')
      .order('year', { ascending: false })
      .order('created_at', { ascending: true });
    if (sbError) {
      setError(sbError.message);
      setOrders([]);
    } else {
      setOrders(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const addOrder = useCallback(async ({ year, provider, allotted_amount, used_amount, note }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Nicht eingeloggt');
    const row = {
      user_id:         user.id,
      year:            Number(year),
      provider:        String(provider).trim(),
      allotted_amount: Number(allotted_amount) || 0,
      used_amount:     Number(used_amount) || 0,
      note:            note ?? null,
    };
    const { data, error: sbError } = await supabase
      .from('freistellungsauftraege')
      .insert(row)
      .select()
      .single();
    if (sbError) throw new Error(sbError.message);
    setOrders((prev) => [data, ...prev]);
    return data;
  }, []);

  const updateOrder = useCallback(async (id, patch) => {
    const fullPatch = { ...patch, updated_at: new Date().toISOString() };
    if (fullPatch.allotted_amount != null) fullPatch.allotted_amount = Number(fullPatch.allotted_amount) || 0;
    if (fullPatch.used_amount     != null) fullPatch.used_amount     = Number(fullPatch.used_amount) || 0;
    const { data, error: sbError } = await supabase
      .from('freistellungsauftraege')
      .update(fullPatch)
      .eq('id', id)
      .select()
      .single();
    if (sbError) throw new Error(sbError.message);
    setOrders((prev) => prev.map((o) => (o.id === id ? data : o)));
    return data;
  }, []);

  const deleteOrder = useCallback(async (id) => {
    const { error: sbError } = await supabase
      .from('freistellungsauftraege')
      .delete()
      .eq('id', id);
    if (sbError) throw new Error(sbError.message);
    setOrders((prev) => prev.filter((o) => o.id !== id));
  }, []);

  return { orders, loading, error, addOrder, updateOrder, deleteOrder, refetch: fetchAll };
}
