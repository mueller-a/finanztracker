import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

export function useInsuranceProviders() {
  const { user } = useAuth();
  const [providers, setProviders] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    const { data, error: sbError } = await supabase
      .from('insurance_providers')
      .select('*')
      .order('name', { ascending: true });
    if (sbError) { setError(sbError.message); setLoading(false); return; }
    setProviders(data ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const addProvider = useCallback(async ({ name, website_url = '', portal_login_url = '' }) => {
    const { data, error: sbError } = await supabase
      .from('insurance_providers')
      .insert({ user_id: user.id, name: name.trim(), website_url: website_url.trim(), portal_login_url: portal_login_url.trim() })
      .select()
      .single();
    if (sbError) throw new Error(sbError.message);
    setProviders((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    return data;
  }, [user]);

  const updateProvider = useCallback(async (id, patch) => {
    const clean = {
      name:             patch.name?.trim(),
      website_url:      patch.website_url?.trim() ?? '',
      portal_login_url: patch.portal_login_url?.trim() ?? '',
    };
    const { data, error: sbError } = await supabase
      .from('insurance_providers')
      .update(clean)
      .eq('id', id)
      .select()
      .single();
    if (sbError) throw new Error(sbError.message);
    setProviders((prev) => prev.map((p) => (p.id === id ? data : p)).sort((a, b) => a.name.localeCompare(b.name)));
    return data;
  }, []);

  const deleteProvider = useCallback(async (id) => {
    const { error: sbError } = await supabase
      .from('insurance_providers')
      .delete()
      .eq('id', id);
    if (sbError) throw new Error(sbError.message);
    setProviders((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return { providers, loading, error, addProvider, updateProvider, deleteProvider, refetch: fetchAll };
}
