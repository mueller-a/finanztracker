import React, { useEffect, useRef, useState } from 'react';
import {
  Box, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  Tabs, Tab, TextField, Stack, Typography, IconButton, Tooltip,
  CircularProgress, Alert,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CloudDownloadOutlinedIcon from '@mui/icons-material/CloudDownloadOutlined';
import { useEntityLogos, invalidateEntityLogoCache } from '../hooks/useEntityLogos';
import EntityIcon from './EntityIcon';

/**
 * Picker-Dialog für Logos. Bietet drei Tabs:
 *   1. Bibliothek    – existierende Logos auswählen
 *   2. Hochladen     – Datei vom Gerät hochladen
 *   3. Auto-Fetch    – via Google S2 Favicons aus Domain ziehen
 *
 * Props:
 *   open        Steuerung sichtbar/unsichtbar
 *   onClose()   Dialog schließen ohne Änderung
 *   onSelect(logoId | null)  wird mit dem gewählten Logo aufgerufen, "Kein Logo" ⇒ null
 *   currentLogoId  zur Hervorhebung des aktuell zugewiesenen Logos
 *   defaultName    Vorbelegung des Namens (z. B. der Name des Assets)
 */
export default function EntityLogoPicker({
  open,
  onClose,
  onSelect,
  currentLogoId = null,
  defaultName = '',
}) {
  const { logos, loading, uploadLogo, fetchFromDomain, deleteLogo } = useEntityLogos();
  const [tab, setTab] = useState(0);

  // Tab-State: hochladen
  const [file, setFile] = useState(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadDomain, setUploadDomain] = useState('');
  const [uploading, setUploading] = useState(false);

  // Tab-State: auto-fetch
  const [fetchDomain, setFetchDomain] = useState('');
  const [fetchName, setFetchName] = useState('');
  const [fetching, setFetching] = useState(false);

  const [errMsg, setErrMsg] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setTab(0);
    setFile(null);
    setUploadName(defaultName);
    setUploadDomain('');
    setFetchDomain('');
    setFetchName(defaultName);
    setErrMsg('');
  }, [open, defaultName]);

  const handlePickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (!uploadName) {
      const base = (f.name || '').replace(/\.[^.]+$/, '');
      setUploadName(base);
    }
  };

  const handleUpload = async () => {
    if (!file) { setErrMsg('Bitte zuerst eine Datei auswählen.'); return; }
    if (!uploadName.trim()) { setErrMsg('Bitte einen Namen angeben.'); return; }
    setUploading(true);
    setErrMsg('');
    try {
      const row = await uploadLogo(file, { name: uploadName.trim(), domain: uploadDomain.trim() });
      invalidateEntityLogoCache(row.id);
      onSelect(row.id);
    } catch (e) {
      setErrMsg(e.message || 'Upload fehlgeschlagen.');
    } finally {
      setUploading(false);
    }
  };

  const handleAutoFetch = async () => {
    if (!fetchDomain.trim()) { setErrMsg('Bitte eine Domain angeben.'); return; }
    setFetching(true);
    setErrMsg('');
    try {
      const row = await fetchFromDomain(fetchDomain, fetchName);
      invalidateEntityLogoCache(row.id);
      onSelect(row.id);
    } catch (e) {
      setErrMsg(e.message || 'Auto-Fetch fehlgeschlagen.');
    } finally {
      setFetching(false);
    }
  };

  const handleDeleteLogo = async (logoId, evt) => {
    evt.stopPropagation();
    if (!window.confirm('Logo aus Bibliothek löschen? Verknüpfte Einträge zeigen wieder ihr Standard-Icon.')) return;
    try {
      await deleteLogo(logoId);
      invalidateEntityLogoCache(logoId);
      if (logoId === currentLogoId) onSelect(null);
    } catch (e) {
      setErrMsg(e.message || 'Löschen fehlgeschlagen.');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>Logo auswählen</DialogTitle>
      <DialogContent>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
          <Tab label="Bibliothek" />
          <Tab label="Hochladen" />
          <Tab label="Auto-Fetch" />
        </Tabs>

        {errMsg && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErrMsg('')}>
            {errMsg}
          </Alert>
        )}

        {/* ── Tab 0: Bibliothek ────────────────────────────────────────── */}
        {tab === 0 && (
          <Box>
            {loading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={28} />
              </Box>
            )}
            {!loading && logos.length === 0 && (
              <Stack alignItems="center" spacing={1} sx={{ py: 4 }}>
                <Typography variant="body2" color="text.secondary">
                  Noch keine Logos in deiner Bibliothek.
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Lade eines hoch oder ziehe es per Auto-Fetch.
                </Typography>
              </Stack>
            )}
            {!loading && logos.length > 0 && (
              <Box sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                gap: 1.5,
              }}>
                {logos.map((logo) => {
                  const isActive = logo.id === currentLogoId;
                  return (
                    <Box
                      key={logo.id}
                      onClick={() => onSelect(logo.id)}
                      sx={{
                        position: 'relative',
                        cursor: 'pointer',
                        p: 1.5,
                        borderRadius: '12px',
                        border: 2,
                        borderColor: isActive ? 'primary.main' : 'divider',
                        bgcolor: isActive ? 'accent.positiveSurface' : 'background.paper',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 1,
                        transition: (t) => `border-color ${t.transitions.duration.shortest}ms`,
                        '&:hover': { borderColor: 'primary.main' },
                      }}
                    >
                      <EntityIcon logoId={logo.id} fallbackIconName="image" size={48} />
                      <Typography variant="caption" sx={{
                        fontWeight: 600, textAlign: 'center',
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap', maxWidth: '100%',
                      }}>
                        {logo.name}
                      </Typography>
                      <Tooltip title="Aus Bibliothek löschen">
                        <IconButton
                          size="small"
                          onClick={(e) => handleDeleteLogo(logo.id, e)}
                          sx={{ position: 'absolute', top: 2, right: 2 }}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  );
                })}
              </Box>
            )}
          </Box>
        )}

        {/* ── Tab 1: Hochladen ─────────────────────────────────────────── */}
        {tab === 1 && (
          <Stack spacing={2}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              onChange={handlePickFile}
              style={{ display: 'none' }}
            />
            <Stack direction="row" alignItems="center" spacing={2}>
              <Button
                variant="outlined"
                startIcon={<UploadFileIcon />}
                onClick={() => fileInputRef.current?.click()}
              >
                Datei wählen
              </Button>
              <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                {file ? file.name : 'Keine Datei ausgewählt'}
              </Typography>
            </Stack>
            <TextField
              label="Name"
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              fullWidth
              required
              helperText="z. B. ING, DKB, comdirect — eindeutig pro User"
            />
            <TextField
              label="Domain (optional)"
              value={uploadDomain}
              onChange={(e) => setUploadDomain(e.target.value)}
              fullWidth
              placeholder="ing.de"
            />
            <Button
              variant="contained"
              onClick={handleUpload}
              disabled={!file || uploading || !uploadName.trim()}
              startIcon={uploading ? <CircularProgress size={16} /> : null}
            >
              {uploading ? 'Lade hoch …' : 'Logo speichern'}
            </Button>
          </Stack>
        )}

        {/* ── Tab 2: Auto-Fetch ────────────────────────────────────────── */}
        {tab === 2 && (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Holt das Favicon der angegebenen Domain via Google S2 Favicons.
            </Typography>
            <TextField
              label="Domain"
              value={fetchDomain}
              onChange={(e) => setFetchDomain(e.target.value)}
              fullWidth
              required
              placeholder="ing.de"
            />
            <TextField
              label="Name"
              value={fetchName}
              onChange={(e) => setFetchName(e.target.value)}
              fullWidth
              helperText="Anzeigename in der Bibliothek (z. B. ING)"
            />
            <Button
              variant="contained"
              onClick={handleAutoFetch}
              disabled={!fetchDomain.trim() || fetching}
              startIcon={fetching ? <CircularProgress size={16} /> : <CloudDownloadOutlinedIcon />}
            >
              {fetching ? 'Lade Logo …' : 'Logo aus Domain holen'}
            </Button>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={() => onSelect(null)}>
          Kein Logo
        </Button>
        <Button onClick={onClose}>Schließen</Button>
      </DialogActions>
    </Dialog>
  );
}
