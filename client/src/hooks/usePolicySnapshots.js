import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

/**
 * Hybrid Tracking: jährliche Snapshots der Police-Stände.
 * Lädt alle Snapshots aller Policen des Users in einem Call.
 */
export function usePolicySnapshots() {
  const [snapshots, setSnapshots] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: e } = await supabase
      .from('policy_snapshots')
      .select('*')
      .order('snapshot_date', { ascending: false });
    if (e) { setError(e.message); setLoading(false); return; }
    setSnapshots(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const addSnapshot = useCallback(async (fields) => {
    const { data, error: e } = await supabase
      .from('policy_snapshots')
      .insert(fields)
      .select()
      .single();
    if (e) throw new Error(e.message);
    setSnapshots((prev) => [data, ...prev].sort((a, b) => new Date(b.snapshot_date) - new Date(a.snapshot_date)));
    return data;
  }, []);

  const updateSnapshot = useCallback(async (id, fields) => {
    const { data, error: e } = await supabase
      .from('policy_snapshots')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (e) throw new Error(e.message);
    setSnapshots((prev) => prev.map((s) => (s.id === id ? data : s)));
    return data;
  }, []);

  const deleteSnapshot = useCallback(async (id) => {
    const { error: e } = await supabase
      .from('policy_snapshots')
      .delete()
      .eq('id', id);
    if (e) throw new Error(e.message);
    setSnapshots((prev) => prev.filter((s) => s.id !== id));
  }, []);

  /**
   * Get the latest snapshot for a specific policy.
   */
  const getLatestForPolicy = useCallback((policyId) => {
    const list = snapshots.filter((s) => s.policy_id === policyId);
    if (list.length === 0) return null;
    return list.reduce((latest, s) =>
      new Date(s.snapshot_date) > new Date(latest.snapshot_date) ? s : latest
    );
  }, [snapshots]);

  /**
   * Get all snapshots for a specific policy, sorted by date ascending.
   */
  const getAllForPolicy = useCallback((policyId) => {
    return snapshots
      .filter((s) => s.policy_id === policyId)
      .sort((a, b) => new Date(a.snapshot_date) - new Date(b.snapshot_date));
  }, [snapshots]);

  return {
    snapshots, loading, error,
    addSnapshot, updateSnapshot, deleteSnapshot,
    getLatestForPolicy, getAllForPolicy,
    refetch: fetchAll,
  };
}
