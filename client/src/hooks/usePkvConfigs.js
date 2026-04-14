import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

export function usePkvConfigs() {
  const { user } = useAuth();
  const [configs,  setConfigs]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [saving,   setSaving]   = useState(false);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    const { data, error: sbError } = await supabase
      .from('pkv_configs')
      .select('id, name, updated_at')
      .order('updated_at', { ascending: false });

    if (sbError) { setError(sbError.message); setLoading(false); return; }
    setConfigs(data ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Load full data for a specific config
  const loadConfig = useCallback(async (id) => {
    const { data, error: sbError } = await supabase
      .from('pkv_configs')
      .select('*')
      .eq('id', id)
      .single();
    if (sbError) throw new Error(sbError.message);
    return data;
  }, []);

  // Save (upsert) a config — creates new if no id, updates existing otherwise
  const saveConfig = useCallback(async (id, name, configData) => {
    setSaving(true);
    try {
      if (id) {
        // Update existing
        const { data, error: sbError } = await supabase
          .from('pkv_configs')
          .update({ name, data: configData, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select('id, name, updated_at')
          .single();
        if (sbError) throw new Error(sbError.message);
        setConfigs((prev) => prev.map((c) => (c.id === id ? data : c)));
        return data;
      } else {
        // Insert new
        const { data, error: sbError } = await supabase
          .from('pkv_configs')
          .insert({ name, data: configData, user_id: user.id })
          .select('id, name, updated_at')
          .single();
        if (sbError) throw new Error(sbError.message);
        setConfigs((prev) => [data, ...prev]);
        return data;
      }
    } finally {
      setSaving(false);
    }
  }, [user]);

  const deleteConfig = useCallback(async (id) => {
    const { error: sbError } = await supabase
      .from('pkv_configs')
      .delete()
      .eq('id', id);
    if (sbError) throw new Error(sbError.message);
    setConfigs((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const renameConfig = useCallback(async (id, name) => {
    const { data, error: sbError } = await supabase
      .from('pkv_configs')
      .update({ name })
      .eq('id', id)
      .select('id, name, updated_at')
      .single();
    if (sbError) throw new Error(sbError.message);
    setConfigs((prev) => prev.map((c) => (c.id === id ? data : c)));
    return data;
  }, []);

  return { configs, loading, error, saving, saveConfig, loadConfig, deleteConfig, renameConfig, refetch: fetchAll };
}
