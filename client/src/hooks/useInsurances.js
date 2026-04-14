import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

export function useInsurances() {
  const [categories, setCategories] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);

  // ── Fetch all ──────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: sbError } = await supabase
      .from('categories')
      .select('*, entries:insurance_entries(*, provider_obj:insurance_providers(id, name, website_url, portal_login_url))')
      .order('name', { ascending: true });

    if (sbError) { setError(sbError.message); setLoading(false); return; }

    const normalized = (data ?? []).map((cat) => ({
      ...cat,
      entries: (cat.entries ?? []).sort((a, b) => a.year - b.year),
    }));

    setCategories(normalized);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Add category ───────────────────────────────────────────────────────────
  const addCategory = useCallback(async ({ name, icon = 'tag', color = '#6366f1', description = '' }) => {
    const { data, error: sbError } = await supabase
      .from('categories')
      .insert({ name, icon, color, description })
      .select()
      .single();

    if (sbError) throw new Error(sbError.message);

    const newCategory = { ...data, entries: [] };
    setCategories((prev) => [...prev, newCategory].sort((a, b) => a.name.localeCompare(b.name)));
    return newCategory;
  }, []);

  // ── Delete category (cascade deletes all entries via FK) ──────────────────
  const deleteCategory = useCallback(async (categoryId) => {
    const { error: sbError } = await supabase
      .from('categories')
      .delete()
      .eq('id', categoryId);

    if (sbError) throw new Error(sbError.message);

    setCategories((prev) => prev.filter((c) => c.id !== categoryId));
  }, []);

  // ── Upsert entry ───────────────────────────────────────────────────────────
  const upsertEntry = useCallback(async (categoryId, { year, premium, provider, provider_id, payment_interval = 'jährlich',
    contract_end_date, notice_period_months, is_cancelled, cancellation_date }) => {
    const { data, error: sbError } = await supabase
      .from('insurance_entries')
      .upsert(
        {
          category_id: categoryId, year, premium, provider,
          provider_id: provider_id ?? null, payment_interval,
          contract_end_date: contract_end_date ?? null,
          notice_period_months: notice_period_months ?? 3,
          is_cancelled: is_cancelled ?? false,
          cancellation_date: cancellation_date ?? null,
        },
        { onConflict: 'category_id,year' }
      )
      .select('*, provider_obj:insurance_providers(id, name, website_url, portal_login_url)')
      .single();

    if (sbError) throw new Error(sbError.message);

    setCategories((prev) =>
      prev.map((cat) => {
        if (cat.id !== categoryId) return cat;
        const exists = cat.entries.some((e) => e.year === year);
        const updatedEntries = exists
          ? cat.entries.map((e) => (e.year === year ? data : e))
          : [...cat.entries, data].sort((a, b) => a.year - b.year);
        return { ...cat, entries: updatedEntries };
      })
    );

    return data;
  }, []);

  // ── Delete single year entry ───────────────────────────────────────────────
  const deleteEntry = useCallback(async (categoryId, year) => {
    const { error: sbError } = await supabase
      .from('insurance_entries')
      .delete()
      .eq('category_id', categoryId)
      .eq('year', year);

    if (sbError) throw new Error(sbError.message);

    setCategories((prev) =>
      prev.map((cat) => {
        if (cat.id !== categoryId) return cat;
        return { ...cat, entries: cat.entries.filter((e) => e.year !== year) };
      })
    );
  }, []);

  return { categories, loading, error, addCategory, deleteCategory, upsertEntry, deleteEntry, refetch: fetchAll };
}
