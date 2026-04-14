import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

const BUCKET = 'meter-readings';

export function useElectricity() {
  const [readings, setReadings] = useState([]);
  const [tariff,   setTariff]   = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  // ── Fetch all ──────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [readingsRes, tariffRes] = await Promise.all([
      supabase
        .from('electricity_readings')
        .select('*')
        .order('date', { ascending: false }),
      supabase
        .from('electricity_tariffs')
        .select('*')
        .order('valid_from', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (readingsRes.error) { setError(readingsRes.error.message); setLoading(false); return; }
    if (tariffRes.error)   { setError(tariffRes.error.message);   setLoading(false); return; }

    setReadings(readingsRes.data ?? []);

    // Variable Abschläge nur laden, wenn ein Tarif existiert.
    let tariffData = tariffRes.data ?? null;
    if (tariffData?.id) {
      const insRes = await supabase
        .from('tariff_installments')
        .select('*')
        .eq('tariff_id', tariffData.id)
        .order('valid_from', { ascending: true });
      if (insRes.error) { setError(insRes.error.message); setLoading(false); return; }
      tariffData = { ...tariffData, installments: insRes.data ?? [] };
    }
    setTariff(tariffData);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Add reading (optional mit Foto-Upload) ────────────────────────────────
  // `imageFile` ist optional; wenn gesetzt, wird vor dem DB-Insert hochgeladen.
  // `onProgress(phase, pct)` ist ein optionaler Callback für den UI-Progress:
  //   phase = 'compress' | 'upload' | 'save' | 'done'
  //   pct   = 0–100 (bei 'upload' kommen Echt-Updates, sonst 0/100)
  const addReading = useCallback(async ({ date, value, note = '', imageFile = null }, onProgress) => {
    let imagePath = null;

    if (imageFile) {
      onProgress?.('upload', 0);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nicht authentifiziert.');

      // Pfad-Konvention: {user_id}/{date}-{timestamp}.jpg — passt zur RLS-Policy
      const safeDate = String(date || '').replace(/[^0-9-]/g, '');
      const path = `${user.id}/${safeDate}-${Date.now()}.jpg`;

      const uploadRes = await supabase.storage
        .from(BUCKET)
        .upload(path, imageFile, { contentType: imageFile.type || 'image/jpeg', upsert: false });

      if (uploadRes.error) throw new Error('Upload fehlgeschlagen: ' + uploadRes.error.message);
      imagePath = path;
      onProgress?.('upload', 100);
    }

    onProgress?.('save', 0);
    const row = { date, value: Number(value), note };
    if (imagePath) row.image_path = imagePath;

    const { data, error: sbError } = await supabase
      .from('electricity_readings')
      .upsert(row, { onConflict: 'date' })
      .select()
      .single();

    if (sbError) {
      // Rollback: orphaned Datei löschen wenn DB-Schreiben fehlschlägt
      if (imagePath) {
        await supabase.storage.from(BUCKET).remove([imagePath]).catch(() => {});
      }
      throw new Error(sbError.message);
    }

    setReadings((prev) => {
      const exists = prev.some((r) => r.date === date);
      const updated = exists
        ? prev.map((r) => (r.date === date ? data : r))
        : [data, ...prev];
      return updated.sort((a, b) => new Date(b.date) - new Date(a.date));
    });

    onProgress?.('done', 100);
    return data;
  }, []);

  // ── Update reading (inkl. optionalem Foto-Wechsel / -Entfernung) ──────────
  // `patch` darf enthalten: date, value, note, imageFile (neues Bild),
  //   clearImage (true: bestehendes Bild löschen).
  // Wenn `imageFile` gesetzt ist, wird das alte Bild ersetzt und storage-seitig
  // entfernt. `clearImage: true` ohne `imageFile` löscht das Bild ersatzlos.
  const updateReading = useCallback(async (id, patch, onProgress) => {
    const existing = readings.find((r) => r.id === id);
    if (!existing) throw new Error('Eintrag nicht gefunden.');

    const oldImagePath = existing.image_path ?? null;
    let newImagePath   = oldImagePath;
    let uploadedNewPath = null; // für Rollback

    // ── 1. Neues Foto hochladen (falls vorhanden) ──────────────────────────
    if (patch.imageFile) {
      onProgress?.('upload', 0);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nicht authentifiziert.');

      const effectiveDate = patch.date || existing.date;
      const safeDate = String(effectiveDate).replace(/[^0-9-]/g, '');
      const path = `${user.id}/${safeDate}-${Date.now()}.jpg`;

      const uploadRes = await supabase.storage
        .from(BUCKET)
        .upload(path, patch.imageFile, {
          contentType: patch.imageFile.type || 'image/jpeg',
          upsert: false,
        });
      if (uploadRes.error) throw new Error('Upload fehlgeschlagen: ' + uploadRes.error.message);
      newImagePath    = path;
      uploadedNewPath = path;
      onProgress?.('upload', 100);
    } else if (patch.clearImage) {
      newImagePath = null;
    }

    // ── 2. DB-Update ───────────────────────────────────────────────────────
    onProgress?.('save', 0);
    const row = {};
    if (patch.date  !== undefined) row.date  = patch.date;
    if (patch.value !== undefined) row.value = Number(patch.value);
    if (patch.note  !== undefined) row.note  = patch.note;
    // image_path immer dann schreiben, wenn er sich geändert hat
    if (newImagePath !== oldImagePath) row.image_path = newImagePath;

    if (Object.keys(row).length === 0) {
      onProgress?.('done', 100);
      return existing;
    }

    const { data, error: sbError } = await supabase
      .from('electricity_readings')
      .update(row)
      .eq('id', id)
      .select()
      .single();

    if (sbError) {
      // Rollback: gerade hochgeladenes neues Bild löschen
      if (uploadedNewPath) {
        await supabase.storage.from(BUCKET).remove([uploadedNewPath]).catch(() => {});
      }
      throw new Error(sbError.message);
    }

    // ── 3. Altes Bild aufräumen (best-effort) ──────────────────────────────
    if (oldImagePath && oldImagePath !== newImagePath) {
      supabase.storage.from(BUCKET).remove([oldImagePath]).catch(() => {});
    }

    setReadings((prev) => {
      const updated = prev.map((r) => (r.id === id ? data : r));
      return updated.sort((a, b) => new Date(b.date) - new Date(a.date));
    });

    onProgress?.('done', 100);
    return data;
  }, [readings]);

  // ── Delete reading ─────────────────────────────────────────────────────────
  const deleteReading = useCallback(async (id) => {
    // Zuerst image_path nachschlagen, damit wir auch das Foto aufräumen können
    const reading = readings.find((r) => r.id === id);
    const imagePath = reading?.image_path ?? null;

    const { error: sbError } = await supabase
      .from('electricity_readings')
      .delete()
      .eq('id', id);

    if (sbError) throw new Error(sbError.message);
    setReadings((prev) => prev.filter((r) => r.id !== id));

    if (imagePath) {
      // Best-effort — Fehler beim Aufräumen blockieren den UX-Flow nicht
      supabase.storage.from(BUCKET).remove([imagePath]).catch(() => {});
    }
  }, [readings]);

  // ── Resolve signed URL für ein image_path ──────────────────────────────────
  // Signed URLs sind 10 Minuten gültig — ausreichend für Lightbox-Dauer.
  const getImageUrl = useCallback(async (imagePath) => {
    if (!imagePath) return null;
    const { data, error: e } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(imagePath, 600);
    if (e) throw new Error('Signed URL fehlgeschlagen: ' + e.message);
    return data?.signedUrl ?? null;
  }, []);

  // ── Save/update tariff (inkl. optional variabler Abschläge) ───────────────
  // installments: optionales Array<{ amount, valid_from }>; ersetzt komplett.
  // monthly_advance bleibt als Backward-Compat-Wert; wenn installments übergeben
  // werden, wird hier der erste (frühste) Eintrag eingetragen.
  const saveTariff = useCallback(async ({ valid_from, base_price, unit_price, monthly_advance, provider,
    contract_end_date, notice_period_months, is_cancelled, cancellation_date, installments }, existingId) => {

    const hasInstallments = Array.isArray(installments) && installments.length > 0;
    const firstAdvance = hasInstallments
      ? Number(installments[0].amount) || 0
      : Number(monthly_advance) || 0;

    const row = {
      valid_from, base_price: Number(base_price), unit_price: Number(unit_price),
      monthly_advance: firstAdvance, provider,
      contract_end_date: contract_end_date ?? null,
      notice_period_months: notice_period_months ?? 1,
      is_cancelled: is_cancelled ?? false,
      cancellation_date: cancellation_date ?? null,
    };

    let data, sbError;
    if (existingId) {
      ({ data, error: sbError } = await supabase
        .from('electricity_tariffs')
        .update(row)
        .eq('id', existingId)
        .select()
        .single());
    } else {
      ({ data, error: sbError } = await supabase
        .from('electricity_tariffs')
        .insert(row)
        .select()
        .single());
    }

    if (sbError) throw new Error(sbError.message);

    // Installments delete-then-insert (nur wenn das Form-Array übergeben wurde).
    let savedInstallments = [];
    if (Array.isArray(installments)) {
      const tariffId = data.id;
      const del = await supabase
        .from('tariff_installments')
        .delete()
        .eq('tariff_id', tariffId);
      if (del.error) throw new Error('Abschläge löschen fehlgeschlagen: ' + del.error.message);

      const rows = installments
        .filter((i) => i.amount !== '' && i.amount != null && i.valid_from)
        .map((i) => ({
          tariff_id:  tariffId,
          amount:     Number(i.amount),
          valid_from: i.valid_from,
        }));

      if (rows.length > 0) {
        const ins = await supabase
          .from('tariff_installments')
          .insert(rows)
          .select();
        if (ins.error) throw new Error('Abschläge speichern fehlgeschlagen: ' + ins.error.message);
        savedInstallments = ins.data ?? [];
      }
    } else if (data.id) {
      // Wenn nichts übergeben wurde: bestehende installments beibehalten und neu laden.
      const r = await supabase
        .from('tariff_installments')
        .select('*')
        .eq('tariff_id', data.id)
        .order('valid_from', { ascending: true });
      savedInstallments = r.data ?? [];
    }

    const enriched = { ...data, installments: savedInstallments };
    setTariff(enriched);
    return enriched;
  }, []);

  return {
    readings, tariff, loading, error,
    addReading, updateReading, deleteReading, saveTariff,
    getImageUrl,
    refetch: fetchAll,
  };
}
