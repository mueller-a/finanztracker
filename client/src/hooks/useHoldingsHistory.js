import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

/**
 * Lädt die Holdings-History einer Depot-Police (sortiert chronologisch
 * aufsteigend). Bei jeder Änderung der Holdings wurde ein Eintrag mit
 * dem damaligen Stand und dem invested_value (Σ shares × avg_buy_price)
 * geschrieben — siehe useETFPolicen.savePolicy → maybeWriteHoldingsHistory.
 *
 * @param {string|null} policyId
 * @returns {{ history: Array, loading: boolean, error: string|null, refetch: () => void }}
 */
export function useHoldingsHistory(policyId) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const fetchHistory = useCallback(async () => {
    if (!policyId) { setHistory([]); return; }
    setLoading(true);
    setError(null);
    const { data, error: sbError } = await supabase
      .from('holdings_history')
      .select('*')
      .eq('policy_id', policyId)
      .order('snapshot_at', { ascending: true });
    if (sbError) {
      setError(sbError.message);
      setHistory([]);
    } else {
      setHistory(data ?? []);
    }
    setLoading(false);
  }, [policyId]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  return { history, loading, error, refetch: fetchHistory };
}
