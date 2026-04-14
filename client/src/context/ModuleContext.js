import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthContext';

const DEFAULTS = {
  show_insurance:       true,
  show_electricity:     true,
  show_debts:           true,
  show_budget:          true,
  show_salary:          true,
  show_pkv_calc:        true,
  show_retirement_plan: true,
  show_savings:         true,
  show_real_estate:     true,
};

const ModuleContext = createContext({
  modules: DEFAULTS, setModule: () => {}, loading: true,
  darkMode: null, setDarkMode: () => {},
  isAdmin: false, birthday: null, setBirthday: () => {},
  isPkv: true, setIsPkv: () => {},
  steuerSatzAlter: 25, setSteuerSatzAlter: () => {},
});

export function useModules() { return useContext(ModuleContext); }

/** Calculate age from birthday string (YYYY-MM-DD). */
export function calculateAge(birthday) {
  if (!birthday) return null;
  const bd    = new Date(birthday);
  const today = new Date();
  let age = today.getFullYear() - bd.getFullYear();
  if (today.getMonth() < bd.getMonth() || (today.getMonth() === bd.getMonth() && today.getDate() < bd.getDate())) age--;
  return age;
}

export function ModuleProvider({ children }) {
  const { user } = useAuth();
  const [modules, setModules]     = useState(DEFAULTS);
  const [darkMode, setDarkModeState] = useState(null);
  const [birthday, setBirthdayState] = useState(null);
  const [isPkv, setIsPkvState]       = useState(true);
  const [steuerSatzAlter, setSteuerSatzAlterState] = useState(25);
  const [isAdmin, setIsAdmin]     = useState(false);
  const [loading, setLoading]     = useState(true);
  const debounceRef               = useRef(null);
  const latestRef                 = useRef(modules);

  // ── Fetch on user change ──────────────────────────────────────────────────
  useEffect(() => {
    if (!user) { setModules(DEFAULTS); setDarkModeState(null); setBirthdayState(null); setIsPkvState(true); setSteuerSatzAlterState(25); setIsAdmin(false); setLoading(false); return; }
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_module_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!error && data) {
        const { user_id, updated_at, dark_mode, role, birthday: bd, is_pkv, steuer_satz_alter, ...flags } = data;
        setModules({ ...DEFAULTS, ...flags });
        if (dark_mode != null) setDarkModeState(dark_mode);
        if (bd) setBirthdayState(bd);
        if (is_pkv != null) setIsPkvState(is_pkv);
        if (steuer_satz_alter != null) setSteuerSatzAlterState(steuer_satz_alter);
        setIsAdmin(role === 'admin');
      }
      setLoading(false);
    })();
  }, [user]);

  // ── Debounced auto-save ───────────────────────────────────────────────────
  const persistToDb = useCallback(async (flags, dm) => {
    if (!user) return;
    const { user_id: _u, updated_at: _t, dark_mode: _d, role: _r, birthday: _b, ...rest } = flags;
    await supabase
      .from('user_module_settings')
      .update({ ...rest, dark_mode: dm, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
  }, [user]);

  const setModule = useCallback((key, value) => {
    setModules(prev => {
      const next = { ...prev, [key]: value };
      latestRef.current = next;
      return next;
    });
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => persistToDb(latestRef.current, darkMode), 600);
  }, [persistToDb, darkMode]);

  const setDarkMode = useCallback((value) => {
    setDarkModeState(value);
    if (!user) return;
    supabase
      .from('user_module_settings')
      .update({ dark_mode: value, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .then();
  }, [user]);

  const setBirthday = useCallback((value) => {
    setBirthdayState(value);
    if (!user) return;
    supabase.from('user_module_settings').update({ birthday: value || null, updated_at: new Date().toISOString() }).eq('user_id', user.id).then();
  }, [user]);

  const setIsPkv = useCallback((value) => {
    setIsPkvState(value);
    if (!user) return;
    supabase.from('user_module_settings').update({ is_pkv: value, updated_at: new Date().toISOString() }).eq('user_id', user.id).then();
  }, [user]);

  const setSteuerSatzAlter = useCallback((value) => {
    setSteuerSatzAlterState(value);
    if (!user) return;
    supabase.from('user_module_settings').update({ steuer_satz_alter: value, updated_at: new Date().toISOString() }).eq('user_id', user.id).then();
  }, [user]);

  return (
    <ModuleContext.Provider value={{
      modules, setModule, loading, darkMode, setDarkMode, isAdmin,
      birthday, setBirthday, isPkv, setIsPkv, steuerSatzAlter, setSteuerSatzAlter,
    }}>
      {children}
    </ModuleContext.Provider>
  );
}
