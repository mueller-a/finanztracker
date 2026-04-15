import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthContext';

// Globale Feature-Toggles (Admin-gesteuert, für alle Nutzer gleich).
// Tabelle: public.app_modules. Siehe migrations/35_app_modules.sql.
//
// Unterschied zu `ModuleContext.modules`:
//   - AppModules       = globaler An/Aus-Schalter (Admin-Entscheidung)
//   - ModuleContext    = persönliche Sidebar-Präferenz des Users
// Ein Modul ist nur dann für den Nutzer sichtbar, wenn BEIDE aktiv sind.

const AppModulesContext = createContext({
  modules:         [],
  loading:         true,
  error:           null,
  isModuleEnabled: () => true,
  setModuleActive: async () => {},
  refetch:         () => {},
});

export function useAppModules() { return useContext(AppModulesContext); }

export function AppModulesProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const fetchAll = useCallback(async () => {
    if (!user) { setModules([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    const { data, error: sbError } = await supabase
      .from('app_modules')
      .select('*')
      .order('sort_order', { ascending: true });
    if (sbError) { setError(sbError.message); setLoading(false); return; }
    setModules(data ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    fetchAll();
  }, [authLoading, fetchAll]);

  // O(1) Lookup-Map für isModuleEnabled
  const activeMap = useMemo(() => {
    const m = {};
    modules.forEach((row) => { m[row.module_key] = !!row.is_active; });
    return m;
  }, [modules]);

  // Default: true (wenn Tabelle leer oder Key unbekannt → nicht versehentlich
  // alles ausblenden; dein Admin-UI listet, was es kennt).
  const isModuleEnabled = useCallback((key) => {
    if (!key)                     return true;
    if (activeMap[key] === undefined) return true;
    return activeMap[key];
  }, [activeMap]);

  const setModuleActive = useCallback(async (key, isActive) => {
    // Optimistic update
    setModules((prev) => prev.map((m) => (m.module_key === key ? { ...m, is_active: isActive } : m)));
    const { error: sbError } = await supabase
      .from('app_modules')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('module_key', key);
    if (sbError) {
      // Rollback
      await fetchAll();
      throw new Error(sbError.message);
    }
  }, [fetchAll]);

  return (
    <AppModulesContext.Provider value={{
      modules, loading, error, isModuleEnabled, setModuleActive, refetch: fetchAll,
    }}>
      {children}
    </AppModulesContext.Provider>
  );
}
