import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';

/**
 * Holt Live-Quotes für ein Array von Holdings via Supabase Edge Function
 * `get-quote` (CORS-Proxy zu Yahoo Finance, 15-min-Cache server-side).
 *
 * @param {Array<{ isin?: string, symbol?: string }>} items
 * @returns {{
 *   quotes: Record<string, { symbol, isin, name, price, currency, fetched_at, cached }>,
 *   errors: Record<string, string>,
 *   loading: boolean,
 *   refresh: () => void,
 *   lastFetch: number | null,
 * }}
 *
 * Der Lookup-Key in `quotes`/`errors` ist `symbol` (falls gesetzt), sonst `isin`.
 * Items ohne beide Felder werden ignoriert.
 */
export function useQuotes(items) {
  const [quotes,    setQuotes]    = useState({});
  const [errors,    setErrors]    = useState({});
  const [loading,   setLoading]   = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // Stabile Identifier-Liste — verhindert Re-Fetch bei Änderungen, die nicht
  // ISIN/Symbol betreffen (z.B. shares-Update). Wir hashen die geordnete Menge.
  const fetchKey = useMemo(() => {
    if (!Array.isArray(items)) return '';
    return items
      .map((i) => `${i?.isin ?? ''}|${i?.symbol ?? ''}`)
      .filter((s) => s !== '|')
      .sort()
      .join(',');
  }, [items]);

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);

  useEffect(() => {
    if (!fetchKey) {
      setQuotes({});
      setErrors({});
      return;
    }
    const payload = items
      .filter((i) => i && (i.isin || i.symbol))
      .map((i) => ({
        isin:   i.isin   || undefined,
        symbol: i.symbol || undefined,
      }));
    if (payload.length === 0) return;

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-quote', {
          body: { items: payload },
        });
        if (cancelled) return;
        if (error) {
          setErrors({ _function: error.message || 'Edge function failed' });
          setQuotes({});
        } else if (data?.ok) {
          setQuotes(data.quotes ?? {});
          setErrors(data.errors ?? {});
          setLastFetch(Date.now());
        }
      } catch (e) {
        if (!cancelled) setErrors({ _function: e.message ?? String(e) });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // refreshTick bewusst in deps, damit refresh() einen neuen Fetch triggert.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey, refreshTick]);

  return { quotes, errors, loading, refresh, lastFetch };
}
