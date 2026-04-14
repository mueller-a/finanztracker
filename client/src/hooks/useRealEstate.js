import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

export function useRealEstate() {
  const [properties, setProperties] = useState([]);
  const [mortgages,  setMortgages]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [propRes, mortRes] = await Promise.all([
      supabase.from('properties').select('*').order('created_at'),
      supabase.from('mortgages').select('*').order('created_at'),
    ]);
    if (propRes.error) { setError(propRes.error.message); setLoading(false); return; }
    if (mortRes.error) { setError(mortRes.error.message); setLoading(false); return; }
    setProperties(propRes.data ?? []);
    setMortgages(mortRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Properties CRUD ────────────────────────────────────────────────────────
  const addProperty = useCallback(async (fields) => {
    const { data, error: e } = await supabase.from('properties').insert(fields).select().single();
    if (e) throw new Error(e.message);
    setProperties(prev => [...prev, data]);
    return data;
  }, []);

  const updateProperty = useCallback(async (id, fields) => {
    const { data, error: e } = await supabase.from('properties').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (e) throw new Error(e.message);
    setProperties(prev => prev.map(p => p.id === id ? data : p));
    return data;
  }, []);

  const deleteProperty = useCallback(async (id) => {
    const { error: e } = await supabase.from('properties').delete().eq('id', id);
    if (e) throw new Error(e.message);
    setProperties(prev => prev.filter(p => p.id !== id));
    setMortgages(prev => prev.filter(m => m.property_id !== id));
  }, []);

  // ── Mortgages CRUD ─────────────────────────────────────────────────────────
  const addMortgage = useCallback(async (fields) => {
    const { data, error: e } = await supabase.from('mortgages').insert(fields).select().single();
    if (e) throw new Error(e.message);
    setMortgages(prev => [...prev, data]);
    return data;
  }, []);

  const updateMortgage = useCallback(async (id, fields) => {
    const { data, error: e } = await supabase.from('mortgages').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (e) throw new Error(e.message);
    setMortgages(prev => prev.map(m => m.id === id ? data : m));
    return data;
  }, []);

  const deleteMortgage = useCallback(async (id) => {
    const { error: e } = await supabase.from('mortgages').delete().eq('id', id);
    if (e) throw new Error(e.message);
    setMortgages(prev => prev.filter(m => m.id !== id));
  }, []);

  return {
    properties, mortgages, loading, error,
    addProperty, updateProperty, deleteProperty,
    addMortgage, updateMortgage, deleteMortgage,
    refetch: fetchAll,
  };
}
