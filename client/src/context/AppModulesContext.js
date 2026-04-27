import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthContext';
import { useModules } from './ModuleContext';

// Globale Feature-Toggles (Admin-gesteuert, für alle Nutzer gleich).
// Tabelle: public.app_modules. Siehe migrations/35_app_modules.sql.
//
// Sichtbarkeits-Matrix (siehe Skill "architecture", Sektion "Sichtbarkeits-Matrix"):
//   isVisible = module.is_active || currentUser.role === 'admin'
// → Admins sehen IMMER alle Module (auch deaktivierte) als Vorschau.
//
// Unterschied zu `ModuleContext.modules`:
//   - AppModules    = globaler An/Aus-Schalter (Admin-Entscheidung)
//   - ModuleContext = persönliche Sidebar-Präferenz des Users
// Ein Modul ist für normale User sichtbar, wenn BEIDE aktiv sind.
// Admins umgehen den globalen Schalter; die User-Präferenz greift bei Admins
// weiterhin (sie können es für sich selbst trotzdem ausblenden).

const AppModulesContext = createContext({
  modules:              [],
  loading:              true,
  error:                null,
  isModuleEnabled:      () => true,
  isHiddenFromUsers:    () => false,
  setModuleActive:      async () => {},
  refetch:              () => {},
});

export function useAppModules() { return useContext(AppModulesContext); }

export function AppModulesProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin } = useModules();
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
  // Admin-Bypass (siehe Skill "architecture"): Admins sehen IMMER alle Module.
  const isModuleEnabled = useCallback((key) => {
    if (!key)                         return true;
    if (isAdmin)                      return true;
    if (activeMap[key] === undefined) return true;
    return activeMap[key];
  }, [activeMap, isAdmin]);

  // Helfer für UI-Markierung: true, wenn das Modul für normale User
  // ausgeblendet ist, der Admin es aber als Vorschau sieht.
  // → "Hidden"-Badge in Sidebar/Dashboard etc.
  const isHiddenFromUsers = useCallback((key) => {
    if (!key || !isAdmin)             return false;
    if (activeMap[key] === undefined) return false;
    return !activeMap[key];
  }, [activeMap, isAdmin]);

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
      modules, loading, error, isModuleEnabled, isHiddenFromUsers,
      setModuleActive, refetch: fetchAll,
    }}>
      {children}
    </AppModulesContext.Provider>
  );
}
