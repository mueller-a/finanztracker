import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { VPI_FALLBACK } from '../lib/inflationData';

const CACHE_KEY  = 'inflation_vpi_v1';
const CACHE_TTL  = 24 * 60 * 60 * 1000; // 24 Stunden

// Liefert eine Map { year: vpi } für historische Inflationsdaten.
// Quellen-Reihenfolge:
//   1. localStorage-Cache (max. 24h alt)
//   2. Supabase Edge Function `destatis-vpi`
//   3. statische VPI_FALLBACK-Werte
//
// `status` zeigt dem UI an, woher die Daten kommen — relevant für die
// Fallback-Alert-Box (SKILL/Anforderungs-Punkt 5).
export function useInflationData() {
  const [vpi,    setVpi]    = useState(VPI_FALLBACK);
  const [status, setStatus] = useState('loading'); // 'loading' | 'live' | 'cached' | 'fallback'
  const [error,  setError]  = useState(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);

    // 1. Cache-Check
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached?.savedAt && Date.now() - cached.savedAt < CACHE_TTL && cached.vpi) {
          setVpi(cached.vpi);
          setStatus('cached');
          return;
        }
      }
    } catch {}

    // 2. Edge Function aufrufen
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('destatis-vpi');
      if (fnErr) throw new Error(fnErr.message);
      if (!data?.ok || !data.vpi || Object.keys(data.vpi).length === 0) {
        throw new Error(data?.error || 'Leere Antwort von destatis-vpi.');
      }
      setVpi(data.vpi);
      setStatus('live');
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), vpi: data.vpi }));
      } catch {}
      return;
    } catch (ex) {
      // 3. Fallback auf statische Werte
      setVpi(VPI_FALLBACK);
      setStatus('fallback');
      setError(ex.message || 'Destatis nicht erreichbar.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { vpi, status, error, refetch: load };
}
