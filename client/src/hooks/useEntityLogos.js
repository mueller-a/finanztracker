import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { compressImage } from '../utils/imageCompression';

const BUCKET = 'entity-logos';
const SIGNED_URL_TTL_S = 600;
const COMPRESS_OPTS = { maxSide: 256, quality: 0.85 };

// Globaler Modul-Cache für Signed URLs — eine Logo-URL kann auf vielen Seiten
// gleichzeitig sichtbar sein (Listen-Card + Form-Picker), wir wollen den
// Round-Trip nicht pro Mount wiederholen. TTL liegt unter 600s,
// damit nach Expiry automatisch neu signiert wird.
const signedUrlCache = new Map(); // imagePath → { url, expiresAt }

async function compressLogoFile(file) {
  // SVGs werden nicht komprimiert; alle anderen image/* via Canvas-Pipeline.
  if (file.type === 'image/svg+xml') return file;
  const { file: out } = await compressImage(file, COMPRESS_OPTS);
  return out;
}

async function blobToFile(blob, filename, type = 'image/jpeg') {
  return new File([blob], filename, { type });
}

export function useEntityLogos() {
  const [logos, setLogos]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  // ── Fetch all ──────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: e } = await supabase
      .from('entity_logos')
      .select('*')
      .order('name', { ascending: true });
    if (e) { setError(e.message); setLoading(false); return; }
    setLogos(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Signed URL (mit TTL-Cache) ────────────────────────────────────────────
  const getSignedUrl = useCallback(async (imagePath) => {
    if (!imagePath) return null;
    const cached = signedUrlCache.get(imagePath);
    const now = Date.now();
    if (cached && cached.expiresAt > now + 30_000) {
      return cached.url;
    }
    const { data, error: e } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(imagePath, SIGNED_URL_TTL_S);
    if (e) throw new Error('Signed URL fehlgeschlagen: ' + e.message);
    const url = data?.signedUrl ?? null;
    if (url) {
      signedUrlCache.set(imagePath, {
        url,
        expiresAt: now + SIGNED_URL_TTL_S * 1000,
      });
    }
    return url;
  }, []);

  // ── Insert-or-Update Helper (Dedup pro user_id+lower(name)) ───────────────
  // Wenn UNIQUE-Index zuschlägt, lesen wir die bestehende Zeile und ersetzen
  // image_path/domain. Storage: alte Datei wird best-effort entfernt.
  const persistLogoRow = useCallback(async ({ name, domain, imagePath, userId }) => {
    const insertRes = await supabase
      .from('entity_logos')
      .insert({ user_id: userId, name, domain: domain || null, image_path: imagePath })
      .select()
      .single();

    if (!insertRes.error) return { row: insertRes.data, replacedOldPath: null };

    // 23505 = unique_violation → es existiert bereits ein Logo mit gleichem Namen
    if (insertRes.error.code !== '23505') {
      throw new Error(insertRes.error.message);
    }

    const existingRes = await supabase
      .from('entity_logos')
      .select('*')
      .eq('user_id', userId)
      .ilike('name', name)
      .maybeSingle();
    if (existingRes.error) throw new Error(existingRes.error.message);
    if (!existingRes.data) throw new Error('Logo konnte nicht gefunden werden.');

    const oldPath = existingRes.data.image_path;
    const updateRes = await supabase
      .from('entity_logos')
      .update({ image_path: imagePath, domain: domain || existingRes.data.domain })
      .eq('id', existingRes.data.id)
      .select()
      .single();
    if (updateRes.error) throw new Error(updateRes.error.message);

    return { row: updateRes.data, replacedOldPath: oldPath !== imagePath ? oldPath : null };
  }, []);

  // ── Upload aus File (manueller Upload) ─────────────────────────────────────
  const uploadLogo = useCallback(async (file, { name, domain }) => {
    if (!file) throw new Error('Keine Datei ausgewählt.');
    const cleanName = (name || '').trim();
    if (!cleanName) throw new Error('Logo-Name fehlt.');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Nicht authentifiziert.');

    const compressed = await compressLogoFile(file);
    const ext = compressed.type === 'image/svg+xml' ? 'svg' : 'jpg';
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

    const up = await supabase.storage
      .from(BUCKET)
      .upload(path, compressed, {
        contentType: compressed.type || 'image/jpeg',
        upsert: false,
      });
    if (up.error) throw new Error('Upload fehlgeschlagen: ' + up.error.message);

    let result;
    try {
      result = await persistLogoRow({
        name: cleanName,
        domain,
        imagePath: path,
        userId: user.id,
      });
    } catch (dbErr) {
      // Rollback: orphaned Datei löschen wenn DB-Schreiben fehlschlägt
      await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
      throw dbErr;
    }

    if (result.replacedOldPath) {
      await supabase.storage.from(BUCKET).remove([result.replacedOldPath]).catch(() => {});
      signedUrlCache.delete(result.replacedOldPath);
    }

    setLogos((prev) => {
      const exists = prev.some((l) => l.id === result.row.id);
      const next = exists
        ? prev.map((l) => (l.id === result.row.id ? result.row : l))
        : [...prev, result.row];
      return next.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    });
    return result.row;
  }, [persistLogoRow]);

  // ── Auto-Fetch via Google S2 Favicons ─────────────────────────────────────
  // Keyless, CORS-permissive. Domain z. B. "ing.de".
  const fetchFromDomain = useCallback(async (domainRaw, nameRaw) => {
    const domain = (domainRaw || '').trim().toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '');
    if (!domain) throw new Error('Domain fehlt.');
    const name = (nameRaw || '').trim() || domain;

    const url = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Logo-Abruf fehlgeschlagen (HTTP ' + res.status + ').');
    const blob = await res.blob();
    if (blob.size < 100) throw new Error('Kein Logo für diese Domain gefunden.');

    const file = await blobToFile(blob, `${domain}.png`, blob.type || 'image/png');
    return uploadLogo(file, { name, domain });
  }, [uploadLogo]);

  // ── Delete ────────────────────────────────────────────────────────────────
  const deleteLogo = useCallback(async (logoId) => {
    const logo = logos.find((l) => l.id === logoId);
    const { error: e } = await supabase
      .from('entity_logos')
      .delete()
      .eq('id', logoId);
    if (e) throw new Error(e.message);

    setLogos((prev) => prev.filter((l) => l.id !== logoId));
    if (logo?.image_path) {
      supabase.storage.from(BUCKET).remove([logo.image_path]).catch(() => {});
      signedUrlCache.delete(logo.image_path);
    }
  }, [logos]);

  return {
    logos,
    loading,
    error,
    uploadLogo,
    fetchFromDomain,
    deleteLogo,
    getSignedUrl,
    refresh: fetchAll,
  };
}

// ─── Standalone Signed-URL Loader ──────────────────────────────────────────
// Für Komponenten wie `<EntityIcon>`, die nur eine URL für ein gegebenes
// `image_path` brauchen, ohne den vollen Hook (mit Liste, Loading-State,
// CRUD-Actions) zu instanziieren. Teilt sich den globalen Cache mit dem Hook.
export async function getEntityLogoSignedUrl(imagePath) {
  if (!imagePath) return null;
  const cached = signedUrlCache.get(imagePath);
  const now = Date.now();
  if (cached && cached.expiresAt > now + 30_000) return cached.url;
  const { data, error: e } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(imagePath, SIGNED_URL_TTL_S);
  if (e) return null;
  const url = data?.signedUrl ?? null;
  if (url) {
    signedUrlCache.set(imagePath, {
      url,
      expiresAt: now + SIGNED_URL_TTL_S * 1000,
    });
  }
  return url;
}

// Hilfsmittel für `<EntityIcon>` — lädt eine einzelne entity_logos-Row,
// ohne den User-weiten Hook zu nutzen. Ergebnis wird ebenfalls memoized
// pro logoId, damit gleiche IDs in Listen nicht hundert Calls machen.
const logoRowCache = new Map(); // logoId → Promise<row | null>

export function fetchEntityLogo(logoId) {
  if (!logoId) return Promise.resolve(null);
  if (logoRowCache.has(logoId)) return logoRowCache.get(logoId);
  const p = (async () => {
    const { data } = await supabase
      .from('entity_logos')
      .select('*')
      .eq('id', logoId)
      .maybeSingle();
    return data ?? null;
  })();
  logoRowCache.set(logoId, p);
  // Bei Fehler aus dem Cache entfernen, damit ein Retry möglich ist
  p.catch(() => logoRowCache.delete(logoId));
  return p;
}

export function invalidateEntityLogoCache(logoId) {
  if (logoId) logoRowCache.delete(logoId);
}
