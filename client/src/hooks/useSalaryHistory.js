import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

// CRUD für `salary_history`. Eindeutiger Eintrag pro (user, year) — wir
// nutzen UPSERT auf der Unique-Constraint, sodass dasselbe Jahr nicht
// mehrfach existieren kann.
export function useSalaryHistory() {
  const { user, loading: authLoading } = useAuth();
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const fetchAll = useCallback(async () => {
    if (!user) { setRows([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    const { data, error: sbError } = await supabase
      .from('salary_history')
      .select('*')
      .order('year', { ascending: true });
    if (sbError) { setError(sbError.message); setLoading(false); return; }
    setRows(data ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    fetchAll();
  }, [authLoading, fetchAll]);

  // UPSERT auf (user_id, year) — kein Race zwischen "exists?"-Check und Insert.
  const upsertYear = useCallback(async ({ year, annual_gross, net_monthly, is_projection }) => {
    if (!user) throw new Error('Nicht eingeloggt.');
    const payload = {
      user_id:       user.id,
      year:          Number(year),
      annual_gross:  Number(annual_gross) || 0,
      net_monthly:   net_monthly == null || net_monthly === '' ? null : Number(net_monthly),
      is_projection: !!is_projection,
      updated_at:    new Date().toISOString(),
    };
    const { data, error: sbError } = await supabase
      .from('salary_history')
      .upsert(payload, { onConflict: 'user_id,year' })
      .select()
      .single();
    if (sbError) throw new Error(sbError.message);
    setRows((prev) => {
      const without = prev.filter((r) => r.year !== data.year);
      return [...without, data].sort((a, b) => a.year - b.year);
    });
    return data;
  }, [user]);

  const deleteYear = useCallback(async (year) => {
    if (!user) throw new Error('Nicht eingeloggt.');
    const { error: sbError } = await supabase
      .from('salary_history')
      .delete()
      .eq('user_id', user.id)
      .eq('year', year);
    if (sbError) throw new Error(sbError.message);
    setRows((prev) => prev.filter((r) => r.year !== year));
  }, [user]);

  // Bulk: erzeugt/überschreibt Prognose-Zeilen ab dem nächsten Jahr nach
  // dem letzten realen Eintrag bis `untilYear`. Bestehende reale Werte
  // werden NICHT überschrieben.
  const bulkProjection = useCallback(async ({ growthPct, untilYear, estimateNet }) => {
    if (!user) throw new Error('Nicht eingeloggt.');
    const reals = rows.filter((r) => !r.is_projection).sort((a, b) => a.year - b.year);
    if (reals.length === 0) throw new Error('Mindestens einen realen Jahres-Eintrag anlegen, bevor projiziert wird.');
    const last = reals[reals.length - 1];
    const fromYear = last.year + 1;
    if (fromYear > untilYear) return [];

    const factor = 1 + (Number(growthPct) || 0) / 100;
    let cursorGross = Number(last.annual_gross);
    const inserts = [];
    for (let y = fromYear; y <= untilYear; y++) {
      cursorGross *= factor;
      const grossRounded = Math.round(cursorGross * 100) / 100;
      const net = typeof estimateNet === 'function' ? estimateNet(grossRounded) : null;
      // Wenn für dieses Jahr bereits ein REALER Eintrag existiert, nicht überschreiben.
      const existingReal = rows.find((r) => r.year === y && !r.is_projection);
      if (existingReal) continue;
      inserts.push({
        user_id:       user.id,
        year:          y,
        annual_gross:  grossRounded,
        net_monthly:   net != null ? Math.round(net * 100) / 100 : null,
        is_projection: true,
        updated_at:    new Date().toISOString(),
      });
    }
    if (inserts.length === 0) return [];

    const { data, error: sbError } = await supabase
      .from('salary_history')
      .upsert(inserts, { onConflict: 'user_id,year' })
      .select();
    if (sbError) throw new Error(sbError.message);

    setRows((prev) => {
      const map = new Map(prev.map((r) => [r.year, r]));
      data.forEach((r) => map.set(r.year, r));
      return Array.from(map.values()).sort((a, b) => a.year - b.year);
    });
    return data;
  }, [user, rows]);

  // Alle Prognosen löschen (Reset-Aktion).
  const clearProjections = useCallback(async () => {
    if (!user) throw new Error('Nicht eingeloggt.');
    const { error: sbError } = await supabase
      .from('salary_history')
      .delete()
      .eq('user_id', user.id)
      .eq('is_projection', true);
    if (sbError) throw new Error(sbError.message);
    setRows((prev) => prev.filter((r) => !r.is_projection));
  }, [user]);

  return { rows, loading, error, upsertYear, deleteYear, bulkProjection, clearProjections, refetch: fetchAll };
}
