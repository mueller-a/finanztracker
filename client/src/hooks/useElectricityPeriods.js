import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

const BILL_BUCKET = 'electricity-bills';

/**
 * Lädt electricity_periods zusammen mit billing_period_labor_prices.
 *
 * Jedes Period-Objekt bekommt ein zusätzliches Feld `labor_prices`:
 *   Array<{ id, billing_period_id, price_per_kwh, valid_from, consumption_kwh }>
 * sortiert aufsteigend nach valid_from.
 *
 * Save-Operationen (addPeriod / updatePeriod) erwarten im `row`-Parameter
 * optional ein `labor_prices`-Array. Die einzelne `arbeitspreis`-Spalte
 * bleibt als Backward-Compat für Konsumenten erhalten, enthält aber bei
 * Multi-Prices den gewichteten Durchschnitt bzw. den ersten Preis.
 *
 * Für den Datei-Upload der Stromrechnung exponiert der Hook zusätzlich:
 *   uploadBill(periodId, file)   → string (storage path)
 *   removeBill(periodId)         → void
 *   getBillUrl(path)             → signed URL (10 min gültig)
 */
export function useElectricityPeriods() {
  const [periods,  setPeriods]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [periodsRes, pricesRes, extrasRes, creditsRes] = await Promise.all([
      supabase.from('electricity_periods').select('*').order('period', { ascending: false }),
      supabase.from('billing_period_labor_prices').select('*').order('valid_from', { ascending: true }),
      supabase.from('billing_period_extra_costs').select('*').order('created_at', { ascending: true }),
      supabase.from('billing_period_credits').select('*').order('created_at', { ascending: true }),
    ]);

    if (periodsRes.error) { setError(periodsRes.error.message); setLoading(false); return; }
    if (pricesRes.error)  { setError(pricesRes.error.message);  setLoading(false); return; }
    if (extrasRes.error)  { setError(extrasRes.error.message);  setLoading(false); return; }
    if (creditsRes.error) { setError(creditsRes.error.message); setLoading(false); return; }

    // Arbeitspreise pro Periode gruppieren
    const pricesByPeriod = {};
    (pricesRes.data ?? []).forEach((p) => {
      (pricesByPeriod[p.billing_period_id] ??= []).push(p);
    });

    // Außerordentliche Gebühren pro Periode gruppieren
    const extrasByPeriod = {};
    (extrasRes.data ?? []).forEach((e) => {
      (extrasByPeriod[e.billing_period_id] ??= []).push(e);
    });

    // Gutschriften & Boni pro Periode gruppieren
    const creditsByPeriod = {};
    (creditsRes.data ?? []).forEach((c) => {
      (creditsByPeriod[c.billing_period_id] ??= []).push(c);
    });

    const enriched = (periodsRes.data ?? []).map((p) => ({
      ...p,
      labor_prices: pricesByPeriod[p.id]  ?? [],
      extra_costs:  extrasByPeriod[p.id]  ?? [],
      credits:      creditsByPeriod[p.id] ?? [],
    }));

    setPeriods(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Ersetze alle Arbeitspreise einer Periode (delete-then-insert) ─────────
  async function replaceLaborPrices(periodId, laborPrices) {
    if (!Array.isArray(laborPrices)) return [];
    // Alte Preise löschen
    const del = await supabase
      .from('billing_period_labor_prices')
      .delete()
      .eq('billing_period_id', periodId);
    if (del.error) throw new Error('Preise löschen fehlgeschlagen: ' + del.error.message);

    const rows = laborPrices
      .filter((lp) => lp.price_per_kwh !== '' && lp.price_per_kwh != null && lp.valid_from)
      .map((lp) => ({
        billing_period_id: periodId,
        price_per_kwh:     Number(lp.price_per_kwh),
        valid_from:        lp.valid_from,
        consumption_kwh:   lp.consumption_kwh === '' || lp.consumption_kwh == null
                             ? null
                             : Number(lp.consumption_kwh),
      }));

    if (rows.length === 0) return [];

    const ins = await supabase
      .from('billing_period_labor_prices')
      .insert(rows)
      .select();
    if (ins.error) throw new Error('Preise speichern fehlgeschlagen: ' + ins.error.message);
    return ins.data ?? [];
  }

  // ── Ersetze alle Gutschriften einer Periode (delete-then-insert) ──────────
  async function replaceCredits(periodId, credits) {
    if (!Array.isArray(credits)) return [];
    const del = await supabase
      .from('billing_period_credits')
      .delete()
      .eq('billing_period_id', periodId);
    if (del.error) throw new Error('Gutschriften löschen fehlgeschlagen: ' + del.error.message);

    const rows = credits
      .filter((c) => c.amount !== '' && c.amount != null && Number(c.amount) >= 0)
      .map((c) => ({
        billing_period_id: periodId,
        description:       String(c.description ?? '').trim(),
        amount:            Number(c.amount),
      }));

    if (rows.length === 0) return [];

    const ins = await supabase
      .from('billing_period_credits')
      .insert(rows)
      .select();
    if (ins.error) throw new Error('Gutschriften speichern fehlgeschlagen: ' + ins.error.message);
    return ins.data ?? [];
  }

  // ── Ersetze alle Extra-Kosten einer Periode (delete-then-insert) ──────────
  async function replaceExtraCosts(periodId, extraCosts) {
    if (!Array.isArray(extraCosts)) return [];
    const del = await supabase
      .from('billing_period_extra_costs')
      .delete()
      .eq('billing_period_id', periodId);
    if (del.error) throw new Error('Gebühren löschen fehlgeschlagen: ' + del.error.message);

    const rows = extraCosts
      .filter((c) => c.amount !== '' && c.amount != null && Number(c.amount) >= 0)
      .map((c) => ({
        billing_period_id: periodId,
        description:       String(c.description ?? '').trim(),
        amount:            Number(c.amount),
      }));

    if (rows.length === 0) return [];

    const ins = await supabase
      .from('billing_period_extra_costs')
      .insert(rows)
      .select();
    if (ins.error) throw new Error('Gebühren speichern fehlgeschlagen: ' + ins.error.message);
    return ins.data ?? [];
  }

  // ── Bill-Upload Helper ────────────────────────────────────────────────────
  // Pfad-Konvention: {auth.uid()}/{periodId}-{timestamp}.{ext}
  // Das erste Segment ist die User-ID (RLS-Check via storage.foldername(name)[1]).
  const uploadBill = useCallback(async (periodId, file) => {
    if (!file) return null;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Nicht authentifiziert.');

    const ext = (file.name?.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
    const safeExt = ext || 'bin';
    const path = `${user.id}/${periodId}-${Date.now()}.${safeExt}`;

    const { error: upErr } = await supabase.storage
      .from(BILL_BUCKET)
      .upload(path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (upErr) throw new Error('Upload fehlgeschlagen: ' + upErr.message);
    return path;
  }, []);

  const removeBillStorage = async (path) => {
    if (!path) return;
    // Best-effort — Storage-Fehler blockieren den UX-Flow nicht
    await supabase.storage.from(BILL_BUCKET).remove([path]).catch(() => {});
  };

  // Setzt bill_file_path = NULL und löscht die Datei aus dem Storage.
  const removeBill = useCallback(async (periodId) => {
    const period = periods.find((p) => p.id === periodId);
    const oldPath = period?.bill_file_path ?? null;

    const { data, error: sbErr } = await supabase
      .from('electricity_periods')
      .update({ bill_file_path: null })
      .eq('id', periodId)
      .select()
      .single();
    if (sbErr) throw new Error(sbErr.message);

    if (oldPath) await removeBillStorage(oldPath);

    setPeriods((prev) =>
      prev.map((p) => (p.id === periodId ? { ...p, ...data, labor_prices: p.labor_prices } : p))
    );
  }, [periods]);

  const getBillUrl = useCallback(async (path) => {
    if (!path) return null;
    const { data, error: e } = await supabase.storage
      .from(BILL_BUCKET)
      .createSignedUrl(path, 600);
    if (e) throw new Error('Signed URL fehlgeschlagen: ' + e.message);
    return data?.signedUrl ?? null;
  }, []);

  // ── Add Period (inkl. labor_prices + optionaler Bill-Upload) ──────────────
  // `row.bill_file` (File | null): wird nach erfolgreichem Period-Insert hochgeladen.
  const addPeriod = useCallback(async (row) => {
    // Bestimme Backward-Compat Arbeitspreis: ersten aus Liste oder expliziter Wert
    const firstPrice = Array.isArray(row.labor_prices) && row.labor_prices.length > 0
      ? Number(row.labor_prices[0].price_per_kwh) || 0
      : Number(row.arbeitspreis) || 0;

    // Splitted Consumption: Summe der Teilverbräuche bevorzugen, falls vorhanden.
    const splitSum = Array.isArray(row.labor_prices)
      ? row.labor_prices.reduce((s, lp) => s + (Number(lp.consumption_kwh) || 0), 0)
      : 0;
    const verbrauch = splitSum > 0 ? splitSum : Number(row.verbrauch_kwh);

    const { data: periodData, error: sbError } = await supabase
      .from('electricity_periods')
      .insert({
        period:          row.period,
        grundpreis:      Number(row.grundpreis),
        arbeitspreis:    firstPrice,
        verbrauch_kwh:   verbrauch,
        abschlag:        Number(row.abschlag),
        monate:          Number(row.monate),
        anbieter:        row.anbieter    ?? '',
        vertragsnummer:  row.vertragsnummer ?? '',
        serviceportal:   row.serviceportal ?? '',
        period_start:    row.period_start || null,
        period_end:      row.period_end   || null,
      })
      .select()
      .single();

    if (sbError) throw new Error(sbError.message);

    // Labor-Prices anlegen (falls übergeben)
    let laborPrices = [];
    if (Array.isArray(row.labor_prices) && row.labor_prices.length > 0) {
      try {
        laborPrices = await replaceLaborPrices(periodData.id, row.labor_prices);
      } catch (ex) {
        // Rollback: Periode wieder löschen (Cascade entfernt ggf. angelegte Preise)
        await supabase.from('electricity_periods').delete().eq('id', periodData.id).catch(() => {});
        throw ex;
      }
    }

    // Extra-Kosten anlegen (falls übergeben)
    let extraCosts = [];
    if (Array.isArray(row.extra_costs)) {
      try {
        extraCosts = await replaceExtraCosts(periodData.id, row.extra_costs);
      } catch (ex) {
        await supabase.from('electricity_periods').delete().eq('id', periodData.id).catch(() => {});
        throw ex;
      }
    }

    // Gutschriften anlegen (falls übergeben)
    let credits = [];
    if (Array.isArray(row.credits)) {
      try {
        credits = await replaceCredits(periodData.id, row.credits);
      } catch (ex) {
        await supabase.from('electricity_periods').delete().eq('id', periodData.id).catch(() => {});
        throw ex;
      }
    }

    // Optional: Datei hochladen + Pfad in DB schreiben
    let billPath = null;
    if (row.bill_file instanceof File) {
      try {
        billPath = await uploadBill(periodData.id, row.bill_file);
        const upd = await supabase
          .from('electricity_periods')
          .update({ bill_file_path: billPath })
          .eq('id', periodData.id)
          .select()
          .single();
        if (upd.error) throw new Error(upd.error.message);
        Object.assign(periodData, upd.data);
      } catch (ex) {
        // Datei-Fehler darf gespeicherte Periode nicht zerstören → nur Datei-Rollback
        if (billPath) await removeBillStorage(billPath);
        throw ex;
      }
    }

    const enriched = { ...periodData, labor_prices: laborPrices, extra_costs: extraCosts, credits };
    setPeriods((prev) => [enriched, ...prev].sort((a, b) => b.period.localeCompare(a.period)));
    return enriched;
  }, [uploadBill]);

  // ── Update Period (inkl. replace labor_prices + optional Bill-Upload) ─────
  // `row.bill_file` (File): neue Datei → ersetzt alte (alte wird gelöscht).
  // `row.bill_remove` (true): vorhandene Datei entfernen.
  const updatePeriod = useCallback(async (id, row) => {
    const firstPrice = Array.isArray(row.labor_prices) && row.labor_prices.length > 0
      ? Number(row.labor_prices[0].price_per_kwh) || 0
      : Number(row.arbeitspreis) || 0;

    const splitSum = Array.isArray(row.labor_prices)
      ? row.labor_prices.reduce((s, lp) => s + (Number(lp.consumption_kwh) || 0), 0)
      : 0;
    const verbrauch = splitSum > 0 ? splitSum : Number(row.verbrauch_kwh);

    // Aktuellen Pfad merken (für späteres Cleanup beim Replace/Remove)
    const existing = periods.find((p) => p.id === id);
    const oldBillPath = existing?.bill_file_path ?? null;

    // Update-Object für die Period selber
    const update = {
      period:          row.period,
      grundpreis:      Number(row.grundpreis),
      arbeitspreis:    firstPrice,
      verbrauch_kwh:   verbrauch,
      abschlag:        Number(row.abschlag),
      monate:          Number(row.monate),
      anbieter:        row.anbieter    ?? '',
      vertragsnummer:  row.vertragsnummer ?? '',
      serviceportal:   row.serviceportal ?? '',
      period_start:    row.period_start || null,
      period_end:      row.period_end   || null,
    };

    // Soll die Datei gelöscht werden? Dann bill_file_path = NULL setzen.
    if (row.bill_remove) {
      update.bill_file_path = null;
    }

    // Optional: Neue Datei zuerst hochladen, bevor wir DB-Update auslösen
    let newBillPath = null;
    if (row.bill_file instanceof File) {
      newBillPath = await uploadBill(id, row.bill_file);
      update.bill_file_path = newBillPath;
    }

    const { data: periodData, error: sbError } = await supabase
      .from('electricity_periods')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (sbError) {
      // DB-Update fehlgeschlagen → neu hochgeladene Datei wieder entfernen
      if (newBillPath) await removeBillStorage(newBillPath);
      throw new Error(sbError.message);
    }

    let laborPrices = [];
    if (Array.isArray(row.labor_prices)) {
      laborPrices = await replaceLaborPrices(id, row.labor_prices);
    }

    let extraCosts = [];
    if (Array.isArray(row.extra_costs)) {
      extraCosts = await replaceExtraCosts(id, row.extra_costs);
    }

    let credits = [];
    if (Array.isArray(row.credits)) {
      credits = await replaceCredits(id, row.credits);
    }

    // Alte Datei aufräumen, wenn ersetzt oder entfernt
    if (oldBillPath && (newBillPath || row.bill_remove)) {
      await removeBillStorage(oldBillPath);
    }

    const enriched = { ...periodData, labor_prices: laborPrices, extra_costs: extraCosts, credits };
    setPeriods((prev) =>
      prev.map((p) => (p.id === id ? enriched : p)).sort((a, b) => b.period.localeCompare(a.period))
    );
    return enriched;
  }, [periods, uploadBill]);

  const deletePeriod = useCallback(async (id) => {
    // Bill-Pfad merken, damit Storage-Cleanup nach DB-Delete erfolgen kann.
    const period = periods.find((p) => p.id === id);
    const billPath = period?.bill_file_path ?? null;

    // Cascade in billing_period_labor_prices via FK
    const { error: sbError } = await supabase
      .from('electricity_periods')
      .delete()
      .eq('id', id);

    if (sbError) throw new Error(sbError.message);
    setPeriods((prev) => prev.filter((p) => p.id !== id));

    // Best-effort: Storage-Datei aufräumen
    if (billPath) await removeBillStorage(billPath);
  }, [periods]);

  return {
    periods, loading, error,
    addPeriod, updatePeriod, deletePeriod, refetch: fetchAll,
    uploadBill, removeBill, getBillUrl,
  };
}
