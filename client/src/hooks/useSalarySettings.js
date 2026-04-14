import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

const LS_KEY = 'insuretrack_salary_netto';

/** Write netto + full params to localStorage (consumed by Budget + PKV GKV-Tab). */
function publishSalary(params, netto) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      netto: Math.round(netto * 100) / 100,
      params,
      savedAt: new Date().toISOString(),
    }));
  } catch {}
}

/** Read the last-published salary data (called from Budget + PKV module). */
export function readSalaryNetto() {
  try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export function useSalarySettings() {
  const [settings, setSettings] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data, error } = await supabase
      .from('salary_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!error && data) {
      setSettings(data.params);
      if (data.netto != null) publishSalary(data.params, data.netto);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  // ── Save (upsert) ─────────────────────────────────────────────────────────
  const saveSettings = useCallback(async (params, netto) => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); throw new Error('Nicht eingeloggt'); }

    const { error } = await supabase
      .from('salary_settings')
      .upsert({
        user_id:    user.id,
        params,
        netto:      Math.round(netto * 100) / 100,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) { setSaving(false); throw new Error(error.message); }
    setSettings(params);
    publishSalary(params, netto);
    setSaving(false);
  }, []);

  return { settings, loading, saving, saveSettings, fetchSettings };
}
