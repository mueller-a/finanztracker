import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

const POL_COLORS = [
  '#7c3aed','#0ea5e9','#10b981','#f59e0b',
  '#ef4444','#ec4899','#8b5cf6','#06b6d4'
];

const now = () => new Date().toISOString();
const currentYear  = () => new Date().getFullYear();
const currentMonth = () => new Date().getMonth() + 1;

function buildDefaultParams(type) {
  const yr = currentYear();
  const mo = currentMonth();
  if (type === 'avd') {
    return {
      policyType:  'avd',
      sparrate:    100,
      rendite:     7,
      ter:         0.5,
      inflation:   2,
      kinder:      0,
      kinderBis:   18,
      steuerSatz:  20,
      rentenAlter: 67,
      leben:       90,
      vbJahr:      2027,
      vbMonat:     1,
      rentenJahr:  2055,
      rentenMonat: 1,
    };
  }
  if (type === 'depot') {
    return {
      policyType:   'depot',
      sparrate:     150,
      rendite:      7,
      ter:          0.2,
      depotgebuehr: 0,
      inflation:    2,
      steuer:       26.375,
      leben:        22,
      vbJahr:       yr,
      vbMonat:      mo,
      rentenJahr:   yr + 30,
      rentenMonat:  mo,
      // Holdings: Liste von ETF/Aktien-Positionen für Live-Bewertung.
      // Schema pro Eintrag: { id, isin?, symbol?, name, shares, avg_buy_price }
      // Felder isin/symbol bleiben Vorbereitung für die spätere Live-API.
      holdings:     [],
    };
  }
  if (type === 'drv') {
    return {
      policyType:       'drv',
      anwartschaft:     555.70,
      hochgerechnete:   2564.84,
      entgeltpunkte:    13.6234,
      rentenJahr:       yr + 20,
      rentenMonat:      mo,
      rentenAnpassung:  2,
      inflation:        2,
      steuerSatz:       20,
      pkvNettobeitrag:  0,
    };
  }
  if (type === 'bav') {
    return {
      policyType:      'bav',
      sparrate:        200,
      agZuschuss:      30,
      agZuschussTyp:   'eur',
      deckungskapital: 0,
      rentenfaktor:    28,
      payoutStrategy:  'annuity',
      rendite:         7,
      effektivkosten:  1.2,
      inflation:       2,
      grenzsteuersatz: 42,
      steuerImAlter:   27,
      vbJahr:          2021,
      vbMonat:         2,
      rentenJahr:      yr + 29,
      rentenMonat:     mo,
    };
  }
  // insurance (default)
  return {
    policyType:     'insurance',
    sparrate:       200,
    rendite:        7,
    inflation:      2.5,
    leben:          22,
    steuer:         26.4,
    vbJahr:         yr,
    vbMonat:        mo,
    rentenJahr:     yr + 30,
    rentenMonat:    mo,
    dynAktiv:       false,
    dynProzent:     3,
    costMode:       'simple',
    effektivkosten: 1.05,
    alphaPct:       2.5,
    betaPct:        5.0,
    gammaPct:       0.2,
    kappaEur:       36,
    terPct:         0.2,
    payoutStrategy: 'annuity',
    rentenfaktor:   0,
  };
}

function defaultName(type, count) {
  if (type === 'avd')   return 'AVD Depot '   + count;
  if (type === 'depot') return 'ETF Depot '   + count;
  if (type === 'drv')   return 'Gesetzliche Rente';
  if (type === 'bav')   return 'bAV Police '  + count;
  return 'Rentenpolice ' + count;
}

export function useETFPolicen() {
  const [policies, setPolicies] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  // ── Fetch all ────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data, error: sbError } = await supabase
      .from('etf_policen')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: true });

    if (sbError) { setError(sbError.message); setLoading(false); return; }
    setPolicies(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Add policy ───────────────────────────────────────────────────────────────
  const addPolicy = useCallback(async (type) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Nicht eingeloggt');

    const count = policies.length + 1;
    const id    = 'pol' + Date.now();
    const color = POL_COLORS[(policies.length) % POL_COLORS.length];
    const row   = {
      id,
      user_id:    user.id,
      name:       defaultName(type, count),
      color,
      type,
      params:     buildDefaultParams(type),
      updated_at: now(),
    };

    const { data, error: sbError } = await supabase
      .from('etf_policen')
      .insert(row)
      .select()
      .single();

    if (sbError) throw new Error(sbError.message);
    setPolicies(prev => [...prev, data]);
    return data;
  }, [policies.length]);

  // ── Update policy (optimistic) ───────────────────────────────────────────────
  const updatePolicy = useCallback(async (id, patch) => {
    const fullPatch = { ...patch, updated_at: now() };
    // Optimistic update
    setPolicies(prev => prev.map(p => p.id === id ? { ...p, ...fullPatch } : p));

    const { error: sbError } = await supabase
      .from('etf_policen')
      .update(fullPatch)
      .eq('id', id);

    if (sbError) {
      // Roll back on error
      await fetchAll();
      throw new Error(sbError.message);
    }
  }, [fetchAll]);

  // ── Save params (debounce target) ────────────────────────────────────────────
  const savePolicy = useCallback(async (id, params) => {
    await updatePolicy(id, { params });
  }, [updatePolicy]);

  // ── Delete policy ────────────────────────────────────────────────────────────
  const deletePolicy = useCallback(async (id) => {
    setPolicies(prev => prev.filter(p => p.id !== id));

    const { error: sbError } = await supabase
      .from('etf_policen')
      .delete()
      .eq('id', id);

    if (sbError) {
      await fetchAll();
      throw new Error(sbError.message);
    }
  }, [fetchAll]);

  return { policies, loading, error, addPolicy, updatePolicy, savePolicy, deletePolicy };
}
