import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthContext';
import { computeUrgency, countRedContracts } from '../utils/contractUrgency';

const ContractAlertContext = createContext({ redCount: 0 });

export function useContractAlert() { return useContext(ContractAlertContext); }

export function ContractAlertProvider({ children }) {
  const { user } = useAuth();
  const [redCount, setRedCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!user) { setRedCount(0); return; }

    const [insRes, elecRes] = await Promise.all([
      supabase.from('insurance_entries')
        .select('contract_end_date, notice_period_months, is_cancelled'),
      supabase.from('electricity_tariffs')
        .select('contract_end_date, notice_period_months, is_cancelled')
        .order('valid_from', { ascending: false })
        .limit(1),
    ]);

    const all = [...(insRes.data ?? []), ...(elecRes.data ?? [])];
    const withUrgency = all.map(c => ({ ...c, urgency: computeUrgency(c) }));
    setRedCount(countRedContracts(withUrgency));
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <ContractAlertContext.Provider value={{ redCount, refreshAlerts: refresh }}>
      {children}
    </ContractAlertContext.Provider>
  );
}
