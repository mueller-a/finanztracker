import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Box, Stack, Typography, Button, IconButton, TextField, MenuItem,
  Tabs, Tab, Alert, CircularProgress, Chip, Paper, Link as MuiLink,
  LinearProgress, Dialog, DialogTitle, DialogContent, DialogActions,
  Snackbar, Avatar, InputAdornment, AlertTitle, Checkbox, FormControlLabel,
  Table, TableHead, TableBody,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CameraAltOutlinedIcon from '@mui/icons-material/CameraAltOutlined';
import PhotoLibraryOutlinedIcon from '@mui/icons-material/PhotoLibraryOutlined';
import CloseIcon from '@mui/icons-material/Close';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import CardGiftcardIcon from '@mui/icons-material/CardGiftcard';
import { compressImage } from '../utils/imageCompression';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  ComposedChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, Cell, Legend,
} from 'recharts';
import { useElectricity } from '../hooks/useElectricity';
import { useElectricityPeriods } from '../hooks/useElectricityPeriods';
import {
  readingsForYear, buildForecast, buildCostForecast, buildMonthlyChart,
  weightedAvgPrice, effectiveArbeitspreis, derivePeriodRange,
  splitTotalCost, hasSplitConsumption, totalSplitConsumption, totalExtraCosts, totalCredits,
  monthlyInstallmentBreakdown,
} from '../utils/electricityCalc';
import { PageHeader, SectionCard, CurrencyField, DateField } from '../components/mui';

const YEAR  = new Date().getFullYear();
const TODAY = new Date().toISOString().split('T')[0];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n, decimals = 2) {
  return Number(n).toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ─── Forecast Gauge ───────────────────────────────────────────────────────────
function ForecastGauge({ forecast, cost }) {
  const pct      = forecast.yearDays > 0 ? Math.min(100, Math.round((forecast.daysObserved / forecast.yearDays) * 100)) : 0;
  const isGut    = cost?.isGuthaben ?? true;
  const deltaAbs = cost ? Math.abs(cost.delta) : null;

  return (
    <SectionCard
      title={
        <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700 }}>
          Jahresprognose {YEAR}
        </Typography>
      }
    >
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            {forecast.total.toLocaleString('de-DE')} kWh
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {forecast.observed.toLocaleString('de-DE')} kWh gemessen + {forecast.projected.toLocaleString('de-DE')} kWh Prognose
          </Typography>
        </Box>

        {/* Year coverage */}
        <Box>
          <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">Jahresfortschritt</Typography>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>{pct}%</Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={pct}
            sx={{
              height: 10,
              borderRadius: 99,
              bgcolor: 'action.hover',
              // Emerald-Container (#6cf8bb) wie die P.A.-Chips bei Verbindlichkeiten
              '& .MuiLinearProgress-bar': { bgcolor: 'accent.positiveSurface' },
            }}
          />
          <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5 }}>
            <Typography variant="caption" color="text.secondary">{forecast.daysObserved} Tage Daten</Typography>
            <Typography variant="caption" color="text.secondary">{forecast.daysRemaining} Tage verbleibend</Typography>
          </Stack>
        </Box>

        {/* Ø daily + cost */}
        <Stack direction="row" spacing={1.5}>
          <Paper variant="outlined" sx={{ flex: 1, p: 1.5, bgcolor: 'action.hover' }}>
            <Typography variant="caption" sx={{
              display: 'block', color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase',
            }}>
              Ø täglich
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>{fmt(forecast.dailyAvg, 1)} kWh</Typography>
          </Paper>
          <Paper variant="outlined" sx={{ flex: 1, p: 1.5, bgcolor: 'action.hover' }}>
            <Typography variant="caption" sx={{
              display: 'block', color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase',
            }}>
              Prognose Kosten
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>{cost ? `${fmt(cost.totalCost)} €` : '–'}</Typography>
          </Paper>
        </Stack>

        {/* Nachzahlung / Guthaben */}
        {cost && (
          <Alert
            severity={isGut ? 'success' : 'error'}
            variant="outlined"
            icon={
              <Box component="span" className="material-symbols-outlined" sx={{ fontSize: 22 }}>
                {isGut ? 'savings' : 'warning'}
              </Box>
            }
          >
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {isGut ? `Guthaben: +${fmt(deltaAbs)} €` : `Nachzahlung: −${fmt(deltaAbs)} €`}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Abschläge {fmt(cost.advances)} € vs. Kosten {fmt(cost.totalCost)} €
            </Typography>
            {cost.advancesPaid != null && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                YTD bereits gezahlt: {fmt(cost.advancesPaid)} €
                {' '}({Math.min(100, Math.round((cost.advancesPaid / Math.max(1, cost.advances)) * 100))}% des Jahres-Solls)
              </Typography>
            )}
          </Alert>
        )}
      </Stack>
    </SectionCard>
  );
}

// ─── Advances Progress Chart ──────────────────────────────────────────────────
// Visualisiert die kumulierten gezahlten Abschläge YTD vs. die hochgerechneten
// Gesamtkosten am Jahresende. Quelle: tariff.installments + cost.totalCost.
function AdvancesProgressChart({ tariff, cost }) {
  const theme = useTheme();
  const breakdown = useMemo(
    () => monthlyInstallmentBreakdown(tariff?.installments ?? [], YEAR, new Date()),
    [tariff],
  );

  const totalAdvances    = breakdown.length ? breakdown[breakdown.length - 1].cumulative : 0;
  const paidYTD          = cost?.advancesPaid ?? 0;
  const projectedTotal   = cost?.totalCost ?? 0;
  const isGut            = totalAdvances >= projectedTotal;

  // Chart-Daten: pro Monat kumulierter Abschlag + projizierte Gesamtkosten als Referenzlinie.
  const data = breakdown.map((b) => ({
    month:           b.month,
    kumuliert:       Math.round(b.cumulative * 100) / 100,
    bereitsGezahlt:  b.isPaid ? Math.round(b.cumulative * 100) / 100 : null,
    monatlich:       b.amount,
  }));

  const accent = theme.palette.primary.main;
  const danger = theme.palette.error.main;
  const ok     = theme.palette.success.main;

  return (
    <SectionCard
      title={
        <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700 }}>
          Abschläge {YEAR} · Gezahlt vs. erwartete Kosten
        </Typography>
      }
    >
      <Stack spacing={2}>
        {/* KPI-Reihe analog zum 188px-Grid */}
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fit, minmax(188px, 1fr))' },
          gap: 1.5,
        }}>
          <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'action.hover' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase' }}>
              YTD gezahlt
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
              {fmt(paidYTD)} €
            </Typography>
          </Paper>
          <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'action.hover' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase' }}>
              Jahres-Soll Abschläge
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
              {fmt(totalAdvances)} €
            </Typography>
          </Paper>
          <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'action.hover' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase' }}>
              Hochgerechnete Kosten
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, fontFamily: 'monospace', color: 'primary.main' }}>
              {projectedTotal > 0 ? `${fmt(projectedTotal)} €` : '–'}
            </Typography>
          </Paper>
          <Paper variant="outlined" sx={{
            p: 1.5,
            bgcolor: 'action.hover',
            borderColor: isGut ? 'success.main' : 'error.main',
          }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase' }}>
              Erwartete Differenz
            </Typography>
            <Typography variant="h6" sx={{
              fontWeight: 700, fontFamily: 'monospace',
              color: isGut ? 'success.main' : 'error.main',
            }}>
              {projectedTotal > 0
                ? `${isGut ? '+' : '−'}${fmt(Math.abs(totalAdvances - projectedTotal))} €`
                : '–'}
            </Typography>
          </Paper>
        </Box>

        {/* Chart: Bars für monatliche Beträge, Linie für kumuliert, ReferenceLine für Forecast */}
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
            <XAxis dataKey="month" tick={{ fill: theme.palette.text.secondary, fontSize: 11 }}
              axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: theme.palette.text.secondary, fontSize: 11 }}
              axisLine={false} tickLine={false}
              tickFormatter={(v) => `${v} €`} width={64} />
            <Tooltip
              formatter={(v, name) => {
                const labels = {
                  monatlich:      'Abschlag (Monat)',
                  kumuliert:      'Soll kumuliert',
                  bereitsGezahlt: 'Gezahlt YTD',
                };
                return [
                  v == null ? '–' : `${Number(v).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €`,
                  labels[name] || name,
                ];
              }}
              contentStyle={{
                background: theme.palette.background.paper,
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: 10, fontSize: 12,
              }}
              labelStyle={{ color: theme.palette.text.primary, fontWeight: 700 }}
            />
            <Legend
              iconType="circle" iconSize={8}
              formatter={(v) => v === 'monatlich' ? 'Abschlag (Monat)'
                              : v === 'kumuliert' ? 'Soll kumuliert'
                              : v === 'bereitsGezahlt' ? 'Gezahlt YTD'
                              : v}
              wrapperStyle={{ fontSize: 12, paddingTop: 8, color: theme.palette.text.secondary }}
            />
            <Bar dataKey="monatlich" name="monatlich" fill={accent} fillOpacity={0.35}
              radius={[4, 4, 0, 0]} />
            <Line type="monotone" dataKey="kumuliert" name="kumuliert"
              stroke={accent} strokeDasharray="5 3" strokeWidth={2}
              dot={false} />
            <Line type="monotone" dataKey="bereitsGezahlt" name="bereitsGezahlt"
              stroke={ok} strokeWidth={2.5} connectNulls
              dot={{ fill: ok, r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: theme.palette.background.paper }}
            />
            {projectedTotal > 0 && (
              <ReferenceLine y={projectedTotal}
                stroke={isGut ? ok : danger} strokeDasharray="3 3" strokeWidth={1.5}
                label={{
                  value: `Forecast ${fmt(projectedTotal)} €`,
                  fill: isGut ? ok : danger, fontSize: 10, position: 'insideTopRight',
                }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </Stack>
    </SectionCard>
  );
}

// ─── Reading Upload Dialog ────────────────────────────────────────────────────
// MUI-Dialog mit Kamera-Option, Dateiauswahl, Canvas-Kompression und LinearProgress.
// Bilder werden im Browser auf 1280 px / Q=0.75 komprimiert, dann zu Supabase Storage
// hochgeladen. Fehler werden via `onError` nach oben weitergegeben (Snackbar).

const PROGRESS_PHASES = {
  idle:     { label: '',                       pct: 0,   color: 'primary' },
  compress: { label: 'Bild wird komprimiert…', pct: 30,  color: 'primary' },
  upload:   { label: 'Foto wird hochgeladen…', pct: 65,  color: 'primary' },
  save:     { label: 'Eintrag wird gespeichert…', pct: 90, color: 'primary' },
  done:     { label: 'Fertig',                 pct: 100, color: 'success' },
};

function ReadingUploadDialog({ open, onClose, onSave, onError, editing = null, resolveUrl = null }) {
  const isEdit = !!editing;

  const [date,   setDate]   = useState(TODAY);
  const [value,  setValue]  = useState('');
  const [note,   setNote]   = useState('');
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  // Bild-Workflow — drei Zustände:
  //   1. Edit-Modus, bestehendes Bild (existingImageUrl) und nichts Neues
  //   2. Neues Bild ausgewählt/komprimiert (compressedFile + preview-URL)
  //   3. Kein Bild (entweder noch nie eines gewählt oder clearImage aktiviert)
  const [rawFile, setRawFile]                 = useState(null);
  const [compressedFile, setCompressedFile]   = useState(null);
  const [preview, setPreview]                 = useState(null);      // ObjectURL für neues Bild
  const [existingImageUrl, setExistingImageUrl] = useState(null);     // signed URL bestehendes Bild
  const [clearExistingImage, setClearExistingImage] = useState(false); // Flag: existierendes Bild löschen
  const [compressing, setCompressing]         = useState(false);
  const [phase, setPhase]                     = useState('idle');

  const cameraInputRef = useRef(null);
  const fileInputRef   = useRef(null);

  // Reset / Init beim Öffnen (add vs. edit)
  useEffect(() => {
    if (!open) return;
    if (isEdit && editing) {
      setDate(editing.date || TODAY);
      setValue(editing.value != null ? String(editing.value) : '');
      setNote(editing.note || '');
    } else {
      setDate(TODAY);
      setValue('');
      setNote('');
    }
    setErr('');
    setRawFile(null);
    setCompressedFile(null);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setExistingImageUrl(null);
    setClearExistingImage(false);
    setPhase('idle');
  }, [open, isEdit, editing]);

  // Im Edit-Modus: bestehendes Bild als signed URL lazy laden
  useEffect(() => {
    if (!open || !isEdit || !editing?.image_path || !resolveUrl) return;
    let cancelled = false;
    resolveUrl(editing.image_path)
      .then((u) => { if (!cancelled) setExistingImageUrl(u); })
      .catch(() => { /* best-effort — Fehler ist nicht blockierend */ });
    return () => { cancelled = true; };
  }, [open, isEdit, editing, resolveUrl]);

  // Preview-URL beim Unmount freigeben
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function handleFilePick(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting same file
    if (!file) return;
    setErr('');
    setCompressing(true);
    setPhase('compress');
    try {
      const result = await compressImage(file, { maxSide: 1280, quality: 0.75 });
      setRawFile(file);
      setCompressedFile(result.file);
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(result.file);
      });
      // Wenn neues Bild hochgeladen wird, soll das existierende ersetzt werden
      setClearExistingImage(false);
      setPhase('idle');
    } catch (ex) {
      setErr(ex.message);
      setPhase('idle');
      onError?.(ex.message);
    } finally {
      setCompressing(false);
    }
  }

  function removeImage() {
    // Entfernt neues Bild ODER setzt Flag zum Löschen eines bestehenden Bildes
    if (compressedFile) {
      setRawFile(null);
      setCompressedFile(null);
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    } else if (isEdit && existingImageUrl) {
      setClearExistingImage(true);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErr('');
    const v = parseInt(value, 10);
    if (!date)             { setErr('Datum fehlt.'); return; }
    if (isNaN(v) || v < 0) { setErr('Bitte einen gültigen kWh-Wert eingeben.'); return; }
    setSaving(true);
    try {
      await onSave(
        {
          date,
          value:      v,
          note,
          imageFile:  compressedFile ?? null,
          clearImage: isEdit && clearExistingImage,
        },
        (p) => setPhase(p),
      );
      setPhase('done');
      setTimeout(() => { onClose(); }, 350);
    } catch (ex) {
      setErr(ex.message);
      onError?.(ex.message);
      setPhase('idle');
    } finally {
      setSaving(false);
    }
  }

  const progress     = PROGRESS_PHASES[phase] ?? PROGRESS_PHASES.idle;
  const showProgress = compressing || saving;

  // Welches Bild wird gerade in der Preview-Box angezeigt?
  //   - Neues Bild (compressed + preview)  hat Vorrang
  //   - Sonst: bestehendes Bild aus Storage (solange nicht zum Löschen markiert)
  const showNewImage      = !!preview && !!compressedFile;
  const showExistingImage = !showNewImage && !clearExistingImage && !!existingImageUrl;
  const displayImageUrl   = showNewImage ? preview : showExistingImage ? existingImageUrl : null;
  const displayImageLabel = showNewImage ? 'Neues Foto bereit' : showExistingImage ? 'Bestehendes Foto' : null;

  const sizeInfo = rawFile && compressedFile ? (
    <Typography variant="caption" color="text.secondary">
      Original: {(rawFile.size / 1024).toFixed(0)} KB → Komprimiert: {(compressedFile.size / 1024).toFixed(0)} KB
      {' '}({Math.round((1 - compressedFile.size / rawFile.size) * 100)}% gespart)
    </Typography>
  ) : null;

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      component="form"
      onSubmit={handleSubmit}
    >
      <DialogTitle sx={{ pr: 6 }}>
        {isEdit ? 'Zählerstand bearbeiten' : 'Zählerstand erfassen'}
        <IconButton
          onClick={onClose}
          disabled={saving}
          aria-label="Schließen"
          sx={{ position: 'absolute', right: 12, top: 12 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={1.75}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5 }}>
            <DateField label="Datum" value={date} onChange={(v) => setDate(v)} />
            <TextField
              type="number" label="Zählerstand (kWh)" size="small" fullWidth
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputProps={{ min: 0, style: { fontFamily: 'monospace' } }}
              placeholder="z.B. 12450"
              autoFocus
            />
          </Box>

          <TextField
            label="Notiz (optional)" size="small" fullWidth
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="z.B. Ablesung nach Urlaub"
          />

          {/* Foto-Bereich */}
          <Box>
            <Typography variant="overline" sx={{
              display: 'block', color: 'text.secondary', fontWeight: 700, letterSpacing: '0.08em', mb: 0.75,
            }}>
              Foto des Zählers (optional)
            </Typography>

            {!displayImageUrl ? (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                {/* Kamera-Option — capture="environment" öffnet auf Mobilgeräten direkt die Rückkamera */}
                <Button
                  fullWidth
                  variant="outlined"
                  color="primary"
                  startIcon={<CameraAltOutlinedIcon />}
                  disabled={compressing || saving}
                  onClick={() => cameraInputRef.current?.click()}
                >
                  Foto aufnehmen
                </Button>
                <Button
                  fullWidth
                  variant="outlined"
                  color="inherit"
                  startIcon={<PhotoLibraryOutlinedIcon />}
                  disabled={compressing || saving}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Datei auswählen
                </Button>
              </Stack>
            ) : (
              <Paper
                variant="outlined"
                sx={{
                  p: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  borderRadius: 1,
                }}
              >
                <Box
                  component="img"
                  src={displayImageUrl}
                  alt="Zähler-Vorschau"
                  sx={{
                    width: 72,
                    height: 72,
                    objectFit: 'cover',
                    borderRadius: 1,
                    flexShrink: 0,
                  }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {displayImageLabel}
                  </Typography>
                  {sizeInfo}
                </Box>
                {/* Im Edit-Modus mit bestehendem Bild: "Ersetzen" erlaubt Kamera/File neu zu wählen */}
                {isEdit && showExistingImage && (
                  <>
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={() => cameraInputRef.current?.click()}
                      disabled={compressing || saving}
                      title="Foto ersetzen (Kamera)"
                    >
                      <CameraAltOutlinedIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={compressing || saving}
                      title="Foto ersetzen (Datei)"
                    >
                      <PhotoLibraryOutlinedIcon fontSize="small" />
                    </IconButton>
                  </>
                )}
                <IconButton
                  size="small"
                  color="error"
                  onClick={removeImage}
                  disabled={saving}
                  title="Foto entfernen"
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Paper>
            )}

            {/* Hinweis im Edit-Modus, wenn das bestehende Bild zum Löschen markiert ist */}
            {isEdit && clearExistingImage && !compressedFile && (
              <Alert
                severity="warning"
                variant="outlined"
                sx={{ mt: 1 }}
                action={
                  <Button
                    size="small"
                    color="inherit"
                    onClick={() => setClearExistingImage(false)}
                    disabled={saving}
                  >
                    Rückgängig
                  </Button>
                }
              >
                Bestehendes Foto wird beim Speichern entfernt.
              </Alert>
            )}

            {/* Verstecktes File-Input: Kamera */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={handleFilePick}
            />
            {/* Verstecktes File-Input: Galerie/Upload (ohne capture) */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFilePick}
            />

            {compressing && !displayImageUrl && (
              <Box sx={{ mt: 1 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                  <CircularProgress size={12} />
                  <Typography variant="caption" color="text.secondary">
                    Bild wird komprimiert…
                  </Typography>
                </Stack>
                <LinearProgress />
              </Box>
            )}
          </Box>

          {/* Upload-/Save-Progress */}
          {showProgress && progress.pct > 0 && (
            <Box>
              <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  {progress.label}
                </Typography>
                <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                  {progress.pct}%
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={progress.pct}
                color={progress.color}
                sx={{ height: 6, borderRadius: 99 }}
              />
            </Box>
          )}

          {err && <Alert severity="error">{err}</Alert>}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} color="inherit" disabled={saving}>
          Abbrechen
        </Button>
        <Button
          type="submit"
          variant="contained"
          disabled={saving || compressing}
          startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <AddIcon />}
        >
          {saving ? 'Speichern…' : isEdit ? 'Änderungen speichern' : 'Eintrag speichern'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Reading Form (Trigger + Panel) ───────────────────────────────────────────
// Behält die bisherige "Card mit Erfassen-Button"-Rolle, delegiert das Formular
// aber an den ReadingUploadDialog.
function ReadingForm({ onSave, onError }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <SectionCard
        title={
          <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700 }}>
            Zählerstand erfassen
          </Typography>
        }
      >
        <Stack spacing={1.5} alignItems="flex-start">
          <Typography variant="body2" color="text.secondary">
            Neuen Zählerstand eintragen — optional mit Foto des Zählers (wird automatisch komprimiert).
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setOpen(true)}
          >
            Neuer Zählerstand
          </Button>
        </Stack>
      </SectionCard>

      <ReadingUploadDialog
        open={open}
        onClose={() => setOpen(false)}
        onSave={onSave}
        onError={onError}
      />
    </>
  );
}

// ─── Tariff Form ──────────────────────────────────────────────────────────────
function TariffForm({ tariff, onSave }) {
  const [open, setOpen]                 = useState(false);
  const [validFrom, setValidFrom]       = useState(TODAY);
  const [basePrice, setBasePrice]       = useState('');
  const [unitPrice, setUnitPrice]       = useState('');
  const [provider, setProvider]         = useState('');
  const [saving, setSaving]             = useState(false);
  const [err, setErr]                   = useState('');
  const [contractEnd, setContractEnd]   = useState('');
  const [noticePeriod, setNoticePeriod] = useState(1);
  const [isCancelled, setIsCancelled]   = useState(false);
  const [cancelDate, setCancelDate]     = useState('');

  // Variable monatliche Abschläge — dynamische Liste
  const [installments, setInstallments] = useState([{ amount: '', valid_from: TODAY }]);

  useEffect(() => {
    if (!tariff) return;
    setValidFrom(tariff.valid_from ?? TODAY);
    setBasePrice(tariff.base_price ?? '');
    setUnitPrice(tariff.unit_price ?? '');
    setProvider(tariff.provider ?? '');
    setContractEnd(tariff.contract_end_date ?? '');
    setNoticePeriod(tariff.notice_period_months ?? 1);
    setIsCancelled(tariff.is_cancelled ?? false);
    setCancelDate(tariff.cancellation_date ?? '');

    // Existierende installments übernehmen oder Fallback aus monthly_advance bauen
    if (Array.isArray(tariff.installments) && tariff.installments.length > 0) {
      setInstallments(tariff.installments.map((i) => ({
        amount:     i.amount     ?? '',
        valid_from: i.valid_from ?? TODAY,
      })));
    } else {
      setInstallments([{
        amount:     tariff.monthly_advance ?? '',
        valid_from: tariff.valid_from ?? TODAY,
      }]);
    }
  }, [tariff]);

  function updateInstallment(idx, key, val) {
    setInstallments((prev) => prev.map((row, i) => (i === idx ? { ...row, [key]: val } : row)));
  }
  function addInstallment() {
    // Default: ein Monat nach dem letzten Eintrag
    const last = installments[installments.length - 1];
    let nextDate = TODAY;
    if (last?.valid_from) {
      const d = new Date(last.valid_from);
      d.setMonth(d.getMonth() + 1);
      nextDate = d.toISOString().split('T')[0];
    }
    setInstallments((prev) => [...prev, { amount: '', valid_from: nextDate }]);
  }
  function removeInstallment(idx) {
    setInstallments((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  function validate() {
    if (!installments || installments.length === 0) return 'Mindestens ein Abschlag erforderlich.';
    const sorted = [...installments].sort((a, b) => new Date(a.valid_from) - new Date(b.valid_from));
    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i];
      if (!r.valid_from) return `Abschlag Zeile ${i + 1}: "Gültig ab" fehlt.`;
      const v = Number(r.amount);
      if (r.amount === '' || isNaN(v) || v < 0) return `Abschlag Zeile ${i + 1}: Betrag ungültig.`;
      if (i > 0 && new Date(r.valid_from).getTime() === new Date(sorted[i - 1].valid_from).getTime()) {
        return `Abschlag Zeile ${i + 1}: "Gültig ab" doppelt.`;
      }
    }
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const vErr = validate();
    if (vErr) { setErr(vErr); return; }
    setErr('');
    setSaving(true);
    try {
      // Sortiere installments aufsteigend nach valid_from beim Speichern
      const sortedInst = [...installments].sort(
        (a, b) => new Date(a.valid_from) - new Date(b.valid_from),
      );
      await onSave({
        valid_from: validFrom, base_price: basePrice, unit_price: unitPrice,
        monthly_advance: sortedInst[0]?.amount ?? 0,    // Backward-Compat
        installments: sortedInst,
        provider,
        contract_end_date: contractEnd || null,
        notice_period_months: Number(noticePeriod) || 1,
        is_cancelled: isCancelled,
        cancellation_date: isCancelled ? (cancelDate || null) : null,
      }, tariff?.id);
      setOpen(false);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setSaving(false);
    }
  }

  // Aktueller Abschlag (für die Read-only Übersicht): jüngster Eintrag mit valid_from <= heute
  const currentAdvance = (() => {
    if (!Array.isArray(tariff?.installments) || tariff.installments.length === 0) {
      return Number(tariff?.monthly_advance) || 0;
    }
    const now = Date.now();
    const sorted = [...tariff.installments]
      .map((i) => ({ amount: Number(i.amount) || 0, ts: new Date(i.valid_from).getTime() }))
      .sort((a, b) => a.ts - b.ts);
    let active = sorted[0]?.amount ?? 0;
    for (const i of sorted) if (i.ts <= now) active = i.amount;
    return active;
  })();

  return (
    <SectionCard
      title={
        <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700 }}>
          Aktueller Tarif
        </Typography>
      }
      action={
        <Button size="small" onClick={() => setOpen((v) => !v)}>
          {open ? 'Schließen' : tariff ? 'Ändern' : 'Hinterlegen'}
        </Button>
      }
    >
      {!open && tariff && (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {tariff.provider || 'Unbekannter Anbieter'} · {fmt(tariff.unit_price, 4)} €/kWh · {fmt(currentAdvance)} €/Monat
            {Array.isArray(tariff.installments) && tariff.installments.length > 1 && (
              <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                ({tariff.installments.length} Abschlags-Stufen)
              </Typography>
            )}
          </Typography>
          {tariff.is_cancelled && (
            <Chip
              label={`✓ Gekündigt${tariff.contract_end_date ? ` zum ${new Date(tariff.contract_end_date).toLocaleDateString('de-DE')}` : ''}`}
              size="small"
              color="success"
              variant="outlined"
              sx={{ mt: 1 }}
            />
          )}
        </Box>
      )}
      {!open && !tariff && (
        <Typography variant="body2" color="text.secondary">Noch kein Tarif hinterlegt</Typography>
      )}
      {open && (
        <Box component="form" onSubmit={handleSubmit}>
          <Stack spacing={2}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5 }}>
              <DateField label="Gültig ab" value={validFrom} onChange={(v) => setValidFrom(v)} />
              <TextField label="Anbieter" size="small" fullWidth value={provider}
                onChange={(e) => setProvider(e.target.value)} placeholder="Stadtwerke…" />
              <CurrencyField label="Grundpreis (€/Jahr)" value={basePrice}
                onChange={(v) => setBasePrice(v === '' ? '' : v)} fullWidth />
              <CurrencyField label="Arbeitspreis (€/kWh)" value={unitPrice}
                onChange={(v) => setUnitPrice(v === '' ? '' : v)} decimals={4} fullWidth />
              <DateField label="Vertragsende" value={contractEnd}
                onChange={(v) => setContractEnd(v)} />
              <TextField type="number" label="Kündigungsfrist (Monate)" size="small" fullWidth
                value={noticePeriod}
                onChange={(e) => setNoticePeriod(parseInt(e.target.value, 10) || 0)}
                inputProps={{ min: 0, max: 24 }} />
            </Box>

            {/* ── Variable monatliche Abschläge ──────────────────────────── */}
            <Paper variant="outlined" sx={{ borderRadius: 1, p: 1.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                  Monatliche Abschläge (variabel)
                </Typography>
              </Stack>

              <Box sx={{
                display: { xs: 'none', sm: 'grid' },
                gridTemplateColumns: '1.2fr 1.2fr 36px',
                gap: 1, px: 0.5, pb: 0.5,
                color: 'text.secondary',
                fontSize: '0.7rem', fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>
                <Box>Gültig ab</Box>
                <Box>Betrag (€/Monat)</Box>
                <Box />
              </Box>

              <Stack spacing={1}>
                {installments.map((row, idx) => (
                  <Box key={idx} sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '1.2fr 1.2fr 36px' },
                    gap: 1, alignItems: 'center',
                  }}>
                    <DateField
                      label={idx === 0 ? 'Gültig ab (Tarifbeginn)' : 'Gültig ab'}
                      value={row.valid_from}
                      onChange={(v) => updateInstallment(idx, 'valid_from', v)}
                    />
                    <CurrencyField
                      label="Abschlag"
                      value={row.amount}
                      onChange={(v) => updateInstallment(idx, 'amount', v === '' ? '' : v)}
                      fullWidth
                    />
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => removeInstallment(idx)}
                      disabled={installments.length <= 1}
                      title={installments.length <= 1 ? 'Mindestens ein Abschlag erforderlich' : 'Entfernen'}
                      sx={{ justifySelf: 'center' }}
                    >
                      <DeleteOutlineIcon fontSize="inherit" />
                    </IconButton>
                  </Box>
                ))}
              </Stack>

              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={addInstallment}
                sx={{ mt: 1, textTransform: 'none' }}
              >
                Abschlags-Anpassung hinzufügen
              </Button>

              {installments.length > 1 && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  Jeder Eintrag gilt ab "Gültig ab" bis zum nächsten Eintrag.
                  Prognose und gezahlte Abschläge werden monatsgenau berechnet.
                </Typography>
              )}
            </Paper>

            <FormControlLabel
              control={
                <Checkbox
                  checked={isCancelled}
                  onChange={(e) => setIsCancelled(e.target.checked)}
                  color="secondary"
                  size="small"
                />
              }
              label={<Typography variant="body2">Bereits gekündigt</Typography>}
            />
            {isCancelled && (
              <Box sx={{ maxWidth: 220 }}>
                <DateField label="Gekündigt am" value={cancelDate}
                  onChange={(v) => setCancelDate(v)} />
              </Box>
            )}

            {err && <Alert severity="error">{err}</Alert>}
            <Button type="submit" variant="contained" disabled={saving} sx={{ alignSelf: 'flex-end' }}>
              {saving ? 'Speichern…' : 'Tarif speichern'}
            </Button>
          </Stack>
        </Box>
      )}
    </SectionCard>
  );
}

// ─── Image Lightbox (Dialog mit vergrößertem Bild) ────────────────────────────
function ImageLightbox({ open, imageUrl, onClose, label }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      PaperProps={{ sx: { bgcolor: 'background.default' } }}
    >
      <DialogTitle sx={{ pr: 6 }}>
        {label || 'Zählerstand-Foto'}
        <IconButton
          onClick={onClose}
          aria-label="Schließen"
          sx={{ position: 'absolute', right: 12, top: 12 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 1, display: 'flex', justifyContent: 'center' }}>
        {imageUrl ? (
          <Box
            component="img"
            src={imageUrl}
            alt="Zählerstand"
            sx={{
              maxWidth: '100%',
              maxHeight: '80vh',
              objectFit: 'contain',
              borderRadius: 1,
            }}
          />
        ) : (
          <Stack alignItems="center" justifyContent="center" sx={{ minHeight: 200, minWidth: 300 }}>
            <CircularProgress size={24} />
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Reading Thumbnail (kleine Vorschau in der Liste) ─────────────────────────
// Lädt die signed URL lazy beim ersten Rendern.
function ReadingThumbnail({ imagePath, resolveUrl, onClick }) {
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!imagePath) { setUrl(null); return; }
    resolveUrl(imagePath)
      .then((u) => { if (!cancelled) setUrl(u); })
      .catch((e) => { if (!cancelled) setErr(e.message); });
    return () => { cancelled = true; };
  }, [imagePath, resolveUrl]);

  if (!imagePath) {
    return (
      <Avatar
        variant="rounded"
        sx={{
          width: 44, height: 44,
          bgcolor: 'action.hover',
          color: 'text.disabled',
        }}
      >
        <ImageOutlinedIcon fontSize="small" />
      </Avatar>
    );
  }

  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      disabled={!url || !!err}
      title={err ? 'Bild konnte nicht geladen werden' : 'Bild vergrößern'}
      sx={{
        width: 44, height: 44,
        border: 0,
        padding: 0,
        borderRadius: 1,
        overflow: 'hidden',
        cursor: url ? 'pointer' : 'default',
        bgcolor: 'action.hover',
        flexShrink: 0,
        transition: 'transform 0.15s',
        '&:hover': url ? { transform: 'scale(1.06)' } : {},
      }}
    >
      {url ? (
        <Box
          component="img"
          src={url}
          alt="Zähler-Thumbnail"
          sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : err ? (
        <ImageOutlinedIcon sx={{ color: 'error.main' }} />
      ) : (
        <CircularProgress size={14} />
      )}
    </Box>
  );
}

// ─── Reading History ──────────────────────────────────────────────────────────
function ReadingHistory({ readings, onDelete, onEdit, resolveUrl, onError }) {
  const last5 = readings.slice(0, 5);
  const [lightbox, setLightbox] = useState({ open: false, url: null, label: '' });

  async function openLightbox(reading) {
    setLightbox({ open: true, url: null, label: fmtDate(reading.date) });
    try {
      const url = await resolveUrl(reading.image_path);
      setLightbox({ open: true, url, label: fmtDate(reading.date) });
    } catch (ex) {
      setLightbox({ open: false, url: null, label: '' });
      onError?.(ex.message);
    }
  }

  return (
    <>
      <SectionCard
        title={
          <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700 }}>
            Letzte Zählerstände
          </Typography>
        }
      >
        {last5.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
            Noch keine Einträge
          </Typography>
        )}
        <Stack spacing={1}>
          {last5.map((r, i) => {
            const next     = last5[i + 1];
            const delta    = next ? r.value - next.value : null;
            const daysDiff = next ? Math.round((new Date(r.date) - new Date(next.date)) / 86400000) : null;
            return (
              <Stack key={r.id} direction="row" alignItems="center" spacing={1.5}
                sx={{ bgcolor: 'action.hover', borderRadius: 1.25, p: '10px 12px' }}>
                <ReadingThumbnail
                  imagePath={r.image_path}
                  resolveUrl={resolveUrl}
                  onClick={() => openLightbox(r)}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" alignItems="baseline" spacing={1}>
                    <Typography variant="body1" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
                      {r.value.toLocaleString('de-DE')} kWh
                    </Typography>
                    {delta !== null && (
                      <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 600 }}>
                        +{delta.toLocaleString('de-DE')} kWh{daysDiff ? ` in ${daysDiff} Tagen` : ''}
                      </Typography>
                    )}
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {fmtDate(r.date)}{r.note ? ` · ${r.note}` : ''}
                  </Typography>
                </Box>
                {onEdit && (
                  <IconButton size="small" onClick={() => onEdit(r)} title="Eintrag bearbeiten">
                    <EditOutlinedIcon fontSize="inherit" />
                  </IconButton>
                )}
                <IconButton size="small" color="error" onClick={() => onDelete(r.id)} title="Eintrag löschen">
                  <DeleteOutlineIcon fontSize="inherit" />
                </IconButton>
              </Stack>
            );
          })}
        </Stack>
      </SectionCard>

      <ImageLightbox
        open={lightbox.open}
        imageUrl={lightbox.url}
        label={lightbox.label}
        onClose={() => setLightbox({ open: false, url: null, label: '' })}
      />
    </>
  );
}

// ─── Monthly Bar Chart ────────────────────────────────────────────────────────
function MonthlyChart({ data }) {
  const theme = useTheme();

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <Box sx={{
        bgcolor: 'background.paper', border: 1, borderColor: 'divider',
        borderRadius: 1.25, p: '10px 14px',
      }}>
        <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>{label}</Typography>
        <Typography variant="caption" sx={{ color: 'warning.main' }}>
          {payload[0].value?.toLocaleString('de-DE') ?? '–'} kWh
        </Typography>
      </Box>
    );
  };

  return (
    <SectionCard
      title={
        <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700 }}>
          Monatsverbrauch {YEAR} (geschätzt)
        </Typography>
      }
    >
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.palette.divider} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
            axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
            axisLine={false} tickLine={false} width={40} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="kwh" radius={[6, 6, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={i}
                fill={entry.kwh ? theme.palette.warning.main : theme.palette.action.hover}
                fillOpacity={entry.kwh ? 1 : 0.4} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </SectionCard>
  );
}

// ─── Period Form ──────────────────────────────────────────────────────────────
const EMPTY_PERIOD = {
  period: '', grundpreis: '', verbrauch_kwh: '',
  abschlag: '', monate: '12', anbieter: '', vertragsnummer: '', serviceportal: '',
  period_start: '', period_end: '',
  // Dynamische Arbeitspreis-Liste: mind. 1 Eintrag, der erste hat valid_from = period_start.
  // Pro Zeile ist auch der Verbrauch (consumption_kwh) für diese Preisphase erfassbar.
  labor_prices: [{ price_per_kwh: '', valid_from: '', consumption_kwh: '' }],
  // Außerordentliche Gebühren (Mahn-, Rücklastschrift-, …). Optional, leer = keine.
  extra_costs: [],
  // Gutschriften & Boni (Neukunden-, Treuebonus, …). Mindern den Saldo.
  credits: [],
};

// Wenn ein bestehendes Period-Objekt in den Form-State übernommen wird, mappen
// wir die labor_prices-Reihen auf den gleichen Shape wie im leeren Form.
function periodToForm(period) {
  if (!period) return EMPTY_PERIOD;
  const existingPrices = Array.isArray(period.labor_prices) && period.labor_prices.length > 0
    ? period.labor_prices.map((lp) => ({
        price_per_kwh:   lp.price_per_kwh   ?? '',
        valid_from:      lp.valid_from      ?? '',
        consumption_kwh: lp.consumption_kwh ?? '',
      }))
    : [{
        // Fallback: alter einzelner Arbeitspreis (vor der Migration).
        // Übernimmt den Periodenverbrauch als consumption_kwh dieser einzigen Phase.
        price_per_kwh:   period.arbeitspreis ?? '',
        valid_from:      period.period_start ?? derivePeriodRange(period).start ?? '',
        consumption_kwh: period.verbrauch_kwh ?? '',
      }];
  return {
    period:          period.period          ?? '',
    grundpreis:      period.grundpreis      ?? '',
    verbrauch_kwh:   period.verbrauch_kwh   ?? '',
    abschlag:        period.abschlag        ?? '',
    monate:          period.monate          ?? '12',
    anbieter:        period.anbieter        ?? '',
    vertragsnummer:  period.vertragsnummer  ?? '',
    serviceportal:   period.serviceportal   ?? '',
    period_start:    period.period_start    ?? derivePeriodRange(period).start ?? '',
    period_end:      period.period_end      ?? derivePeriodRange(period).end   ?? '',
    labor_prices:    existingPrices,
    extra_costs:     Array.isArray(period.extra_costs)
      ? period.extra_costs.map((c) => ({
          description: c.description ?? '',
          amount:      c.amount      ?? '',
        }))
      : [],
    credits:         Array.isArray(period.credits)
      ? period.credits.map((c) => ({
          description: c.description ?? '',
          amount:      c.amount      ?? '',
        }))
      : [],
  };
}

function PeriodForm({ initial, onSave, onCancel, onOpenBill, onRemoveExistingBill }) {
  const [form, setForm] = useState(() => periodToForm(initial));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // ── Bill Upload State ────────────────────────────────────────────────────
  // Drei Zustände:
  //   1. Bestehende Datei vom Server (initial.bill_file_path) ist da, kein neuer Upload   → "show existing"
  //   2. Nutzer wählt neue Datei (newFile gesetzt) → vor Speichern als Replace markiert
  //   3. Nutzer entfernt bestehende Datei (removeExisting = true) → bei Save: bill_file_path=NULL
  const existingBillPath = initial?.bill_file_path ?? null;
  const [newFile, setNewFile]               = useState(null);
  const [removeExisting, setRemoveExisting] = useState(false);
  const [dragOver, setDragOver]             = useState(false);
  const fileInputRef = useRef(null);

  const acceptTypes = '.pdf,image/*';
  const maxBytes = 10 * 1024 * 1024; // 10 MB

  function pickFile(file) {
    if (!file) return;
    if (file.size > maxBytes) {
      setErr(`Datei zu groß (max. ${Math.round(maxBytes / 1024 / 1024)} MB).`);
      return;
    }
    setErr('');
    setNewFile(file);
    setRemoveExisting(false); // neue Datei überschreibt
  }

  function clearNewFile() {
    setNewFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function markExistingForRemoval() {
    setRemoveExisting(true);
    clearNewFile();
  }

  function fmtBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  const billDisplay = newFile
    ? { kind: 'new', name: newFile.name, size: newFile.size, isPdf: newFile.type === 'application/pdf' }
    : (existingBillPath && !removeExisting)
      ? { kind: 'existing', name: existingBillPath.split('/').pop(), isPdf: existingBillPath.toLowerCase().endsWith('.pdf') }
      : null;

  function set(key, val) { setForm((f) => ({ ...f, [key]: val })); }

  // Preis-Liste Hilfs-Operationen
  function updatePrice(idx, key, val) {
    setForm((f) => ({
      ...f,
      labor_prices: f.labor_prices.map((lp, i) => (i === idx ? { ...lp, [key]: val } : lp)),
    }));
  }
  function addPrice() {
    setForm((f) => ({
      ...f,
      labor_prices: [...f.labor_prices, { price_per_kwh: '', valid_from: '', consumption_kwh: '' }],
    }));
  }
  function removePrice(idx) {
    setForm((f) => {
      if (f.labor_prices.length <= 1) return f; // mind. 1 Preis bleibt
      const next = f.labor_prices.filter((_, i) => i !== idx);
      return { ...f, labor_prices: next };
    });
  }

  // ── Extra-Kosten Hilfs-Operationen ───────────────────────────────────────
  function updateExtra(idx, key, val) {
    setForm((f) => ({
      ...f,
      extra_costs: f.extra_costs.map((c, i) => (i === idx ? { ...c, [key]: val } : c)),
    }));
  }
  function addExtra() {
    setForm((f) => ({
      ...f,
      extra_costs: [...f.extra_costs, { description: '', amount: '' }],
    }));
  }
  function removeExtra(idx) {
    setForm((f) => ({
      ...f,
      extra_costs: f.extra_costs.filter((_, i) => i !== idx),
    }));
  }

  // Live-Summe der Extra-Kosten (für UI-Anzeige)
  const extraCostSum = useMemo(
    () => form.extra_costs.reduce((s, c) => s + (Number(c.amount) || 0), 0),
    [form.extra_costs],
  );

  // ── Gutschriften Hilfs-Operationen ───────────────────────────────────────
  function updateCredit(idx, key, val) {
    setForm((f) => ({
      ...f,
      credits: f.credits.map((c, i) => (i === idx ? { ...c, [key]: val } : c)),
    }));
  }
  function addCredit() {
    setForm((f) => ({
      ...f,
      credits: [...f.credits, { description: '', amount: '' }],
    }));
  }
  function removeCredit(idx) {
    setForm((f) => ({
      ...f,
      credits: f.credits.filter((_, i) => i !== idx),
    }));
  }

  // Live-Summe der Gutschriften (für UI-Anzeige; mindert Saldo)
  const creditSum = useMemo(
    () => form.credits.reduce((s, c) => s + (Number(c.amount) || 0), 0),
    [form.credits],
  );

  // Ersten Preis auto-sync mit period_start
  // (wenn User period_start ändert, wird valid_from des ersten Preises automatisch gesetzt)
  useEffect(() => {
    if (!form.period_start) return;
    setForm((f) => {
      if (f.labor_prices.length === 0) return f;
      if (f.labor_prices[0].valid_from === form.period_start) return f;
      const next = [...f.labor_prices];
      next[0] = { ...next[0], valid_from: form.period_start };
      return { ...f, labor_prices: next };
    });
  }, [form.period_start]);

  // Vorschau: gewichteter Durchschnitt der aktuellen Preisliste
  const weighted = useMemo(() => {
    if (!form.period_start || !form.period_end) return null;
    const valid = form.labor_prices.filter((lp) => lp.price_per_kwh !== '' && lp.valid_from);
    if (valid.length === 0) return null;
    return weightedAvgPrice(valid, form.period_start, form.period_end);
  }, [form.labor_prices, form.period_start, form.period_end]);

  // Splitted Consumption: Summe aller Teilverbräuche (Read-only Gesamtverbrauch).
  const consumptionSum = useMemo(() => {
    return form.labor_prices.reduce(
      (s, lp) => s + (Number(lp.consumption_kwh) || 0),
      0,
    );
  }, [form.labor_prices]);

  // Sind ALLE Phasen mit Verbrauch befüllt? Nur dann gilt Splitted-Berechnung.
  const allPhasesHaveConsumption = useMemo(
    () => form.labor_prices.length > 0
      && form.labor_prices.every((lp) => Number(lp.consumption_kwh) > 0),
    [form.labor_prices],
  );

  // Exakte Energiekosten Σ(pᵢ × vᵢ) als Live-Vorschau, sobald alle Werte vorhanden sind.
  const splitEnergyCostPreview = useMemo(() => {
    if (!allPhasesHaveConsumption) return null;
    return form.labor_prices.reduce(
      (s, lp) => s + Number(lp.price_per_kwh || 0) * Number(lp.consumption_kwh || 0),
      0,
    );
  }, [form.labor_prices, allPhasesHaveConsumption]);

  // Plausibilitäts-Warnung: weicht die Summe der Teilverbräuche stark vom
  // explizit eingegebenen Gesamtverbrauch ab? (>5 % Abweichung → Hinweis)
  const consumptionMismatch = useMemo(() => {
    const total = Number(form.verbrauch_kwh);
    if (!allPhasesHaveConsumption || !total || total <= 0) return null;
    const diff = consumptionSum - total;
    const relPct = Math.abs(diff) / total * 100;
    if (relPct < 5) return null; // < 5 % → ok
    return {
      diff,
      relPct,
      sum: consumptionSum,
      total,
    };
  }, [allPhasesHaveConsumption, consumptionSum, form.verbrauch_kwh]);

  // Validierung
  function validate() {
    if (!form.period.trim()) return 'Periode fehlt (z.B. "2024" oder "2023/2024").';
    if (!form.period_start || !form.period_end) return 'Start- und Enddatum der Abrechnungsperiode eintragen.';
    if (new Date(form.period_end) < new Date(form.period_start)) return 'Enddatum liegt vor Startdatum.';
    if (form.labor_prices.length === 0) return 'Mindestens ein Arbeitspreis erforderlich.';

    for (let i = 0; i < form.labor_prices.length; i++) {
      const lp = form.labor_prices[i];
      if (lp.price_per_kwh === '' || isNaN(Number(lp.price_per_kwh)) || Number(lp.price_per_kwh) <= 0) {
        return `Arbeitspreis Zeile ${i + 1}: ungültiger Wert.`;
      }
      if (lp.consumption_kwh !== '' && lp.consumption_kwh != null) {
        const v = Number(lp.consumption_kwh);
        if (isNaN(v) || v < 0) {
          return `Preisphase Zeile ${i + 1}: Verbrauch ist ungültig.`;
        }
      }
      if (!lp.valid_from) return `Arbeitspreis Zeile ${i + 1}: "Gültig ab" fehlt.`;
      if (i === 0) {
        if (lp.valid_from !== form.period_start) {
          return 'Erster Preis muss am Startdatum der Abrechnungsperiode beginnen.';
        }
      } else {
        if (new Date(lp.valid_from) <= new Date(form.labor_prices[i - 1].valid_from)) {
          return `Arbeitspreis Zeile ${i + 1}: "Gültig ab" muss nach dem vorherigen Preis liegen.`;
        }
        if (new Date(lp.valid_from) < new Date(form.period_start) || new Date(lp.valid_from) > new Date(form.period_end)) {
          return `Arbeitspreis Zeile ${i + 1}: "Gültig ab" muss innerhalb der Abrechnungsperiode liegen.`;
        }
      }
    }
    // Extra-Kosten: Beschreibung darf leer sein, Betrag muss numerisch ≥ 0 sein
    for (let i = 0; i < form.extra_costs.length; i++) {
      const c = form.extra_costs[i];
      const v = Number(c.amount);
      if (c.amount === '' || isNaN(v) || v < 0) {
        return `Zusätzliche Kosten Zeile ${i + 1}: Betrag ungültig.`;
      }
    }
    // Gutschriften: Beschreibung darf leer sein, Betrag muss numerisch ≥ 0 sein
    for (let i = 0; i < form.credits.length; i++) {
      const c = form.credits[i];
      const v = Number(c.amount);
      if (c.amount === '' || isNaN(v) || v < 0) {
        return `Gutschriften Zeile ${i + 1}: Betrag ungültig.`;
      }
    }
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const vErr = validate();
    if (vErr) { setErr(vErr); return; }
    setErr('');
    setSaving(true);
    try {
      await onSave({
        ...form,
        bill_file:   newFile,                       // File | null
        bill_remove: removeExisting && !newFile,    // bool: explizit löschen
      });
      setForm(EMPTY_PERIOD);
      clearNewFile();
      setRemoveExisting(false);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      title={
        <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700 }}>
          {initial ? 'Abrechnungsperiode bearbeiten' : 'Neue Abrechnungsperiode'}
        </Typography>
      }
    >
      <Box component="form" onSubmit={handleSubmit}>
        <Stack spacing={1.75}>
          {/* Basisdaten */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 1.5 }}>
            <TextField label="Periode" size="small" fullWidth value={form.period}
              onChange={(e) => set('period', e.target.value)} placeholder="z.B. 2024 oder 2023/2024" />
            <TextField label="Anbieter" size="small" fullWidth value={form.anbieter}
              onChange={(e) => set('anbieter', e.target.value)} placeholder="Idealenergie…" />
            <TextField label="Vertragsnummer" size="small" fullWidth value={form.vertragsnummer}
              onChange={(e) => set('vertragsnummer', e.target.value)} placeholder="123456789" />
          </Box>

          {/* Zeitraum der Abrechnungsperiode */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 1.5 }}>
            <DateField label="Periode beginnt am" value={form.period_start}
              onChange={(v) => set('period_start', v)} />
            <DateField label="Periode endet am" value={form.period_end}
              onChange={(v) => set('period_end', v)} />
          </Box>

          {/* Zahlen: Grundpreis, Verbrauch (Soll lt. Rechnung), Abschlag, Monate */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 1.5 }}>
            <CurrencyField label="Grundpreis (€/Jahr)" value={form.grundpreis}
              onChange={(v) => set('grundpreis', v === '' ? '' : v)} fullWidth />
            <TextField
              type="number"
              label="Verbrauch (laut Rechnung)"
              size="small"
              fullWidth
              value={form.verbrauch_kwh}
              onChange={(e) => set('verbrauch_kwh', e.target.value)}
              inputProps={{ step: 0.01, min: 0, lang: 'de-DE' }}
              placeholder="3450,00"
              InputProps={{ endAdornment: <InputAdornment position="end">kWh</InputAdornment> }}
              helperText="Optional. Wird mit Σ Preisphasen abgeglichen."
            />
            <CurrencyField label="Abschlag (€/Mon.)" value={form.abschlag}
              onChange={(v) => set('abschlag', v === '' ? '' : v)} fullWidth />
            <TextField type="number" label="Monate" size="small" fullWidth
              value={form.monate}
              onChange={(e) => set('monate', e.target.value)}
              inputProps={{ step: 1, min: 1, max: 24 }} />
          </Box>

          {/* Dynamische Arbeitspreis-Liste mit Verbrauchsaufteilung (1:N, SKILL.md §296ff.) */}
          <Paper variant="outlined" sx={{ borderRadius: 1, p: 1.5 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                Preisphasen (Verbrauch + Arbeitspreis)
              </Typography>
              {weighted != null && (
                <Typography variant="caption" color="text.secondary">
                  Ø Preis:{' '}
                  <Typography component="strong" variant="caption"
                    sx={{ color: 'primary.main', fontFamily: 'monospace', fontWeight: 700 }}>
                    {weighted.toLocaleString('de-DE', { minimumFractionDigits: 4, maximumFractionDigits: 6 })} €/kWh
                  </Typography>
                </Typography>
              )}
            </Stack>

            {/* Spalten-Header (nur Desktop) */}
            <Box
              sx={{
                display: { xs: 'none', md: 'grid' },
                gridTemplateColumns: '1.2fr 1.2fr 1.2fr 36px',
                gap: 1,
                px: 0.5,
                pb: 0.5,
                color: 'text.secondary',
                fontSize: '0.7rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              <Box>Gültig ab</Box>
              <Box>Verbrauch</Box>
              <Box>Arbeitspreis</Box>
              <Box />
            </Box>

            <Stack spacing={1}>
              {form.labor_prices.map((lp, idx) => {
                const isFirst = idx === 0;
                const lineCost = (Number(lp.price_per_kwh) || 0) * (Number(lp.consumption_kwh) || 0);
                return (
                  <Box key={idx}>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: '1.2fr 1.2fr 1.2fr 36px' },
                        gap: 1,
                        alignItems: 'center',
                      }}
                    >
                      <DateField
                        label={isFirst ? 'Gültig ab (Periodenstart)' : 'Gültig ab'}
                        value={lp.valid_from}
                        onChange={(v) => updatePrice(idx, 'valid_from', v)}
                        disabled={isFirst}
                      />
                      <TextField
                        type="number"
                        size="small"
                        fullWidth
                        label="Verbrauch"
                        value={lp.consumption_kwh}
                        onChange={(e) => updatePrice(idx, 'consumption_kwh', e.target.value)}
                        inputProps={{ step: 0.01, min: 0, lang: 'de-DE' }}
                        placeholder="z.B. 2140,55"
                        InputProps={{
                          endAdornment: <InputAdornment position="end">kWh</InputAdornment>,
                        }}
                      />
                      <CurrencyField
                        label="Preis"
                        value={lp.price_per_kwh}
                        onChange={(v) => updatePrice(idx, 'price_per_kwh', v === '' ? '' : v)}
                        decimals={6}
                        fullWidth
                        placeholder="z.B. 0,284100"
                        inputProps={{ lang: 'de-DE' }}
                      />
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => removePrice(idx)}
                        disabled={form.labor_prices.length <= 1}
                        title={form.labor_prices.length <= 1 ? 'Mindestens ein Preis erforderlich' : 'Preis entfernen'}
                        sx={{ justifySelf: 'center' }}
                      >
                        <DeleteOutlineIcon fontSize="inherit" />
                      </IconButton>
                    </Box>
                    {lineCost > 0 && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block', pl: 0.5, pt: 0.25, fontFamily: 'monospace' }}
                      >
                        = {lineCost.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € Energiekosten
                      </Typography>
                    )}
                  </Box>
                );
              })}
            </Stack>

            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={addPrice}
              sx={{ mt: 1, textTransform: 'none' }}
            >
              Weitere Preisphase hinzufügen
            </Button>

            {/* Read-only Summary: Σ Verbrauch + Σ Energiekosten */}
            <Box sx={{
              mt: 1.5, pt: 1.5, borderTop: 1, borderColor: 'divider',
              display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5,
            }}>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Σ Verbrauch (Splitted)
                </Typography>
                <Typography variant="h6" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                  {consumptionSum.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kWh
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Σ Energiekosten
                </Typography>
                <Typography variant="h6" sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'primary.main' }}>
                  {splitEnergyCostPreview != null
                    ? `${splitEnergyCostPreview.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
                    : '—'}
                </Typography>
                {splitEnergyCostPreview == null && (
                  <Typography variant="caption" color="text.secondary">
                    Verbrauch in jeder Phase eintragen für exakte Σ(pᵢ·vᵢ)-Berechnung.
                  </Typography>
                )}
              </Box>
            </Box>

            {/* Plausibilitäts-Warnung */}
            {consumptionMismatch && (
              <Alert severity="warning" sx={{ mt: 1.5 }}>
                <AlertTitle>Verbrauchsabweichung</AlertTitle>
                Σ Teilverbräuche ({consumptionMismatch.sum.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kWh) weicht
                um {consumptionMismatch.diff > 0 ? '+' : '−'}
                {Math.abs(consumptionMismatch.diff).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kWh
                ({consumptionMismatch.relPct.toFixed(1)} %) vom Gesamtverbrauch laut Rechnung
                ({consumptionMismatch.total.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kWh) ab.
                Bitte Zählerstände prüfen.
              </Alert>
            )}

            {form.labor_prices.length > 1 && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                Bei aufgeteiltem Verbrauch werden Gesamtkosten exakt als Σ(pᵢ·vᵢ) berechnet. Ohne Verbrauchsangabe in einzelnen Phasen
                wird der gewichtete Ø-Preis × Gesamtverbrauch verwendet.
              </Typography>
            )}
          </Paper>

          {/* ── Außerordentliche Gebühren (Mahn-, Rücklastschrift-, …) ──── */}
          <Paper variant="outlined" sx={{ borderRadius: 1, p: 1.5 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Stack>
                <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                  Zusätzliche Kosten & Gebühren
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Mahn-, Rücklastschrift- oder Sperrgebühren. Beeinflussen den Saldo, nicht die kWh-Statistik.
                </Typography>
              </Stack>
              {extraCostSum > 0 && (
                <Typography variant="caption" color="text.secondary">
                  Σ:{' '}
                  <Typography
                    component="strong"
                    variant="caption"
                    sx={{ color: 'error.main', fontFamily: 'monospace', fontWeight: 700 }}
                  >
                    {extraCostSum.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                  </Typography>
                </Typography>
              )}
            </Stack>

            {form.extra_costs.length === 0 ? (
              <Stack
                alignItems="center"
                spacing={1}
                sx={{ py: 1.5, color: 'text.secondary', textAlign: 'center' }}
              >
                <Typography variant="body2">
                  Keine zusätzlichen Kosten erfasst.
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={addExtra}
                  sx={{ textTransform: 'none' }}
                >
                  Gebühr hinzufügen
                </Button>
              </Stack>
            ) : (
              <>
                {/* Spalten-Header (Desktop) */}
                <Box
                  sx={{
                    display: { xs: 'none', md: 'grid' },
                    gridTemplateColumns: '2.4fr 1fr 36px',
                    gap: 1,
                    px: 0.5,
                    pb: 0.5,
                    color: 'text.secondary',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  <Box>Beschreibung</Box>
                  <Box>Betrag</Box>
                  <Box />
                </Box>

                <Stack spacing={1}>
                  {form.extra_costs.map((c, idx) => (
                    <Box
                      key={idx}
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: '2.4fr 1fr 36px' },
                        gap: 1,
                        alignItems: 'center',
                      }}
                    >
                      <TextField
                        size="small"
                        fullWidth
                        label="Beschreibung"
                        value={c.description}
                        onChange={(e) => updateExtra(idx, 'description', e.target.value)}
                        placeholder="z.B. Mahngebühr 10/2024"
                      />
                      <CurrencyField
                        label="Betrag"
                        value={c.amount}
                        onChange={(v) => updateExtra(idx, 'amount', v === '' ? '' : v)}
                        fullWidth
                      />
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => removeExtra(idx)}
                        title="Gebühr entfernen"
                        sx={{ justifySelf: 'center' }}
                      >
                        <DeleteOutlineIcon fontSize="inherit" />
                      </IconButton>
                    </Box>
                  ))}
                </Stack>

                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={addExtra}
                  sx={{ mt: 1, textTransform: 'none' }}
                >
                  Weitere Gebühr hinzufügen
                </Button>
              </>
            )}
          </Paper>

          {/* ── Gutschriften & Boni (Neukunden-, Treuebonus, …) ──────────── */}
          <Paper variant="outlined" sx={{ borderRadius: 1, p: 1.5 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <CardGiftcardIcon sx={{ color: 'success.main', fontSize: 20 }} />
                <Stack>
                  <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                    Gutschriften & Boni
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Neukunden-, Treue-, Sofort-Bonus. Mindern den Saldo, nicht die kWh-Statistik.
                  </Typography>
                </Stack>
              </Stack>
              {creditSum > 0 && (
                <Typography variant="caption" color="text.secondary">
                  Σ:{' '}
                  <Typography
                    component="strong"
                    variant="caption"
                    sx={{ color: 'success.main', fontFamily: 'monospace', fontWeight: 700 }}
                  >
                    − {creditSum.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                  </Typography>
                </Typography>
              )}
            </Stack>

            {form.credits.length === 0 ? (
              <Stack
                alignItems="center"
                spacing={1}
                sx={{ py: 1.5, color: 'text.secondary', textAlign: 'center' }}
              >
                <Typography variant="body2">
                  Keine Gutschriften erfasst.
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  color="success"
                  startIcon={<CardGiftcardIcon />}
                  onClick={addCredit}
                  sx={{ textTransform: 'none' }}
                >
                  Gutschrift hinzufügen
                </Button>
              </Stack>
            ) : (
              <>
                <Box
                  sx={{
                    display: { xs: 'none', md: 'grid' },
                    gridTemplateColumns: '2.4fr 1fr 36px',
                    gap: 1,
                    px: 0.5,
                    pb: 0.5,
                    color: 'text.secondary',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  <Box>Beschreibung</Box>
                  <Box>Betrag (Gutschrift)</Box>
                  <Box />
                </Box>

                <Stack spacing={1}>
                  {form.credits.map((c, idx) => (
                    <Box
                      key={idx}
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: '2.4fr 1fr 36px' },
                        gap: 1,
                        alignItems: 'center',
                      }}
                    >
                      <TextField
                        size="small"
                        fullWidth
                        label="Beschreibung"
                        value={c.description}
                        onChange={(e) => updateCredit(idx, 'description', e.target.value)}
                        placeholder="z.B. Neukundenbonus"
                      />
                      <CurrencyField
                        label="Betrag"
                        value={c.amount}
                        onChange={(v) => updateCredit(idx, 'amount', v === '' ? '' : v)}
                        fullWidth
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <CardGiftcardIcon sx={{ color: 'success.main', fontSize: 16 }} />
                            </InputAdornment>
                          ),
                        }}
                        sx={{
                          // Eingabe-Text grün, um die mindernde Wirkung optisch zu zeigen.
                          '& input': { color: 'success.main', fontWeight: 600 },
                        }}
                      />
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => removeCredit(idx)}
                        title="Gutschrift entfernen"
                        sx={{ justifySelf: 'center' }}
                      >
                        <DeleteOutlineIcon fontSize="inherit" />
                      </IconButton>
                    </Box>
                  ))}
                </Stack>

                <Button
                  size="small"
                  color="success"
                  startIcon={<CardGiftcardIcon />}
                  onClick={addCredit}
                  sx={{ mt: 1, textTransform: 'none' }}
                >
                  Weitere Gutschrift hinzufügen
                </Button>
              </>
            )}
          </Paper>

          {/* ── Datei-Upload-Zone für die Stromrechnung ─────────────────── */}
          <Paper
            variant="outlined"
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer?.files?.[0];
              if (f) pickFile(f);
            }}
            sx={{
              borderRadius: 1,
              p: 2,
              borderStyle: 'dashed',
              borderColor: dragOver ? 'primary.main' : 'divider',
              bgcolor: dragOver ? 'action.hover' : 'transparent',
              transition: 'border-color 120ms ease, background-color 120ms ease',
            }}
          >
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                Stromrechnung (PDF / Bild, max. 10 MB)
              </Typography>
            </Stack>

            {!billDisplay ? (
              <Stack
                alignItems="center"
                spacing={1}
                sx={{ py: 2, color: 'text.secondary', textAlign: 'center' }}
              >
                <UploadFileOutlinedIcon sx={{ fontSize: 36, opacity: 0.6 }} />
                <Typography variant="body2">
                  Datei hier ablegen oder
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<UploadFileOutlinedIcon />}
                  onClick={() => fileInputRef.current?.click()}
                  sx={{ textTransform: 'none' }}
                >
                  Datei auswählen
                </Button>
              </Stack>
            ) : (
              <Stack
                direction="row"
                spacing={1.5}
                alignItems="center"
                sx={{
                  p: 1.25,
                  borderRadius: 1,
                  bgcolor: 'action.hover',
                }}
              >
                <Avatar
                  variant="rounded"
                  sx={{
                    bgcolor: billDisplay.isPdf ? 'error.main' : 'primary.main',
                    width: 36, height: 36,
                  }}
                >
                  {billDisplay.isPdf ? <PictureAsPdfIcon /> : <InsertDriveFileOutlinedIcon />}
                </Avatar>
                <Stack sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap title={billDisplay.name}>
                    {billDisplay.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {billDisplay.kind === 'new'
                      ? `Neue Datei · ${fmtBytes(billDisplay.size)} · wird beim Speichern hochgeladen`
                      : 'Bereits gespeicherte Rechnung'}
                  </Typography>
                </Stack>
                {billDisplay.kind === 'existing' && onOpenBill && (
                  <Button
                    size="small"
                    startIcon={<OpenInNewIcon />}
                    onClick={() => onOpenBill(existingBillPath)}
                    sx={{ textTransform: 'none' }}
                  >
                    Öffnen
                  </Button>
                )}
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<UploadFileOutlinedIcon />}
                  onClick={() => fileInputRef.current?.click()}
                  sx={{ textTransform: 'none' }}
                >
                  Ersetzen
                </Button>
                <IconButton
                  size="small"
                  color="error"
                  onClick={billDisplay.kind === 'new' ? clearNewFile : markExistingForRemoval}
                  title={billDisplay.kind === 'new' ? 'Auswahl entfernen' : 'Rechnung löschen'}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Stack>
            )}

            {removeExisting && !newFile && existingBillPath && (
              <Alert severity="info" sx={{ mt: 1.5 }} action={
                <Button color="inherit" size="small" onClick={() => setRemoveExisting(false)}>
                  Rückgängig
                </Button>
              }>
                Die gespeicherte Rechnung wird beim Speichern entfernt.
              </Alert>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept={acceptTypes}
              onChange={(e) => pickFile(e.target.files?.[0])}
              style={{ display: 'none' }}
            />
          </Paper>

          <TextField type="url" label="Serviceportal-Link (optional)" size="small" fullWidth
            value={form.serviceportal}
            onChange={(e) => set('serviceportal', e.target.value)}
            placeholder="https://…" />
          {err && <Alert severity="error">{err}</Alert>}
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            {onCancel && <Button onClick={onCancel} color="inherit">Abbrechen</Button>}
            <Button type="submit" variant="contained" disabled={saving}
              startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <AddIcon />}>
              {saving ? 'Speichern…' : 'Periode speichern'}
            </Button>
          </Stack>
        </Stack>
      </Box>
    </SectionCard>
  );
}

// ─── Periods Table ────────────────────────────────────────────────────────────
function PeriodsTable({ periods, onEdit, onDelete, onOpenBill }) {
  const theme = useTheme();

  // Effektiver Arbeitspreis = gewichteter Durchschnitt aller labor_prices einer Periode
  // (fällt auf p.arbeitspreis zurück, falls keine labor_prices vorhanden sind).
  const apEff = (p) => effectiveArbeitspreis(p, p.labor_prices);
  // Gesamtkosten: bevorzugt Σ(pᵢ·vᵢ) — exakt, wenn jede Phase einen Verbrauch hat.
  // Sonst: Grundpreis + Ø-Preis × Periodenverbrauch (Fallback).
  const gesamtkosten = (p) => splitTotalCost(p, p.labor_prices, p.extra_costs, p.credits);
  const vorauszahlung = (p) => Number(p.abschlag) * Number(p.monate);
  const delta = (p) => vorauszahlung(p) - gesamtkosten(p);

  const fmt2 = (n) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmt4 = (n) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 4, maximumFractionDigits: 6 });

  if (periods.length === 0) {
    return (
      <SectionCard>
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
          Noch keine Perioden erfasst. Füge oben eine neue Periode hinzu.
        </Typography>
      </SectionCard>
    );
  }

  const headStyle = {
    background: theme.palette.action.hover,
    color: theme.palette.text.secondary,
    fontSize: '0.65rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    padding: '8px 12px',
    whiteSpace: 'nowrap',
  };
  const cellStyle = {
    padding: '10px 12px',
    fontSize: '0.82rem',
    whiteSpace: 'nowrap',
    color: theme.palette.text.primary,
  };

  return (
    <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ borderCollapse: 'collapse' }}>
          <TableHead>
            <tr>
              <th style={{ ...headStyle, textAlign: 'left' }}>Periode</th>
              <th style={{ ...headStyle, textAlign: 'left' }}>Anbieter</th>
              <th style={{ ...headStyle, textAlign: 'right' }}>GP (€/J)</th>
              <th style={{ ...headStyle, textAlign: 'right' }}>AP (€/kWh)</th>
              <th style={{ ...headStyle, textAlign: 'right' }}>Verbrauch</th>
              <th style={{ ...headStyle, textAlign: 'right' }}>Abschlag</th>
              <th style={{ ...headStyle, textAlign: 'right' }}>Monate</th>
              <th style={{ ...headStyle, textAlign: 'right' }}>Gesamtkosten</th>
              <th style={{ ...headStyle, textAlign: 'right' }}>Vorauszahlung</th>
              <th style={{ ...headStyle, textAlign: 'right' }}>Nachz./Guth.</th>
              <th style={{ ...headStyle, textAlign: 'left' }}>Vertrag</th>
              <th style={{ ...headStyle, textAlign: 'right' }}>Portal</th>
              <th style={{ ...headStyle, textAlign: 'center' }}>Rechnung</th>
              <th style={headStyle} aria-label="Aktionen"><span style={{ position: 'absolute', left: -9999 }}>Aktionen</span></th>
            </tr>
          </TableHead>
          <TableBody>
            {periods.map((p, i) => {
              const gk    = gesamtkosten(p);
              const vz    = vorauszahlung(p);
              const dlt   = delta(p);
              const isGut = dlt >= 0;
              const rowBg = i % 2 === 1 ? theme.palette.action.hover : 'transparent';
              return (
                <tr
                  key={p.id}
                  style={{ background: rowBg, cursor: 'pointer' }}
                  onClick={() => onEdit(p)}
                >
                  <td style={cellStyle}>
                    <strong>{p.period}</strong>
                  </td>
                  <td style={cellStyle}>{p.anbieter || <span style={{ color: theme.palette.text.secondary }}>–</span>}</td>
                  <td style={{ ...cellStyle, fontFamily: 'monospace', textAlign: 'right' }}>{fmt2(p.grundpreis)}</td>
                  <td style={{ ...cellStyle, fontFamily: 'monospace', textAlign: 'right' }}>
                    {fmt4(apEff(p))}
                    {Array.isArray(p.labor_prices) && p.labor_prices.length > 1 && (
                      <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                        (Ø {p.labor_prices.length})
                      </Typography>
                    )}
                  </td>
                  <td style={{ ...cellStyle, fontFamily: 'monospace', textAlign: 'right' }}>
                    {(hasSplitConsumption(p.labor_prices)
                      ? totalSplitConsumption(p.labor_prices)
                      : Number(p.verbrauch_kwh)
                    ).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kWh
                    {hasSplitConsumption(p.labor_prices) && (
                      <Typography component="span" variant="caption" color="success.main"
                        sx={{ ml: 0.5, fontWeight: 600 }}
                        title="Verbrauch nach Preisphasen aufgeteilt — Kosten exakt berechnet">
                        ✓
                      </Typography>
                    )}
                  </td>
                  <td style={{ ...cellStyle, fontFamily: 'monospace', textAlign: 'right' }}>{fmt2(p.abschlag)} €</td>
                  <td style={{ ...cellStyle, fontFamily: 'monospace', textAlign: 'right' }}>{p.monate}</td>
                  <td style={{ ...cellStyle, fontFamily: 'monospace', textAlign: 'right', color: theme.palette.primary.main }}>
                    {fmt2(gk)} €
                    {Array.isArray(p.extra_costs) && p.extra_costs.length > 0 && (() => {
                      const extras = totalExtraCosts(p.extra_costs);
                      return extras > 0 ? (
                        <Typography
                          component="span"
                          variant="caption"
                          color="error.main"
                          sx={{ display: 'block', fontFamily: 'monospace', fontWeight: 600 }}
                          title={`Inkl. ${p.extra_costs.length} außerordentliche Gebühr(en)`}
                        >
                          + {fmt2(extras)} € Gebühren
                        </Typography>
                      ) : null;
                    })()}
                    {Array.isArray(p.credits) && p.credits.length > 0 && (() => {
                      const credits = totalCredits(p.credits);
                      return credits > 0 ? (
                        <Typography
                          component="span"
                          variant="caption"
                          color="success.main"
                          sx={{ display: 'block', fontFamily: 'monospace', fontWeight: 600 }}
                          title={`Inkl. ${p.credits.length} Gutschrift(en)`}
                        >
                          − {fmt2(credits)} € Gutschriften
                        </Typography>
                      ) : null;
                    })()}
                  </td>
                  <td style={{ ...cellStyle, fontFamily: 'monospace', textAlign: 'right' }}>{fmt2(vz)} €</td>
                  <td style={{
                    ...cellStyle, fontFamily: 'monospace', textAlign: 'right',
                    color: isGut ? theme.palette.success.main : theme.palette.error.main,
                  }}>
                    {isGut ? '+' : '−'}{fmt2(Math.abs(dlt))} €
                  </td>
                  <td style={cellStyle}>
                    <Typography variant="caption" color="text.secondary">{p.vertragsnummer || '–'}</Typography>
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>
                    {p.serviceportal ? (
                      <MuiLink
                        href={p.serviceportal}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        sx={{ fontSize: '0.75rem' }}
                      >
                        <OpenInNewIcon sx={{ fontSize: 14 }} />
                      </MuiLink>
                    ) : <span style={{ color: theme.palette.text.secondary }}>–</span>}
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'center' }}>
                    {p.bill_file_path ? (
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={(e) => { e.stopPropagation(); onOpenBill?.(p.bill_file_path); }}
                        title={`Rechnung öffnen (${p.bill_file_path.split('/').pop()})`}
                      >
                        <PictureAsPdfIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    ) : <span style={{ color: theme.palette.text.secondary }}>–</span>}
                  </td>
                  <td style={cellStyle}>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={(e) => { e.stopPropagation(); onDelete(p.id); }}
                      title="Löschen"
                    >
                      <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </td>
                </tr>
              );
            })}
          </TableBody>
        </Table>
      </Box>
    </Paper>
  );
}

// ─── History Charts ───────────────────────────────────────────────────────────
// Gesamtkosten: bevorzugt Σ(pᵢ·vᵢ) wenn Verbräuche pro Preisphase erfasst sind.
// Sonst Fallback auf Ø-Preis × Periodenverbrauch (alte Daten ohne Splitted-Werte).
const apEffOf = (p) => effectiveArbeitspreis(p, p.labor_prices);
const gesamtkostenOf = (p) => splitTotalCost(p, p.labor_prices, p.extra_costs, p.credits);
// Verbrauch in Charts: aus Splitted ableiten, falls vorhanden — sonst aus Periodenfeld.
const verbrauchOf = (p) =>
  hasSplitConsumption(p.labor_prices)
    ? totalSplitConsumption(p.labor_prices)
    : Number(p.verbrauch_kwh) || 0;
const vorauszahlungOf = (p) => Number(p.abschlag) * Number(p.monate);

function ChartCard({ title, subtitle, children }) {
  return (
    <SectionCard
      title={<Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{title}</Typography>}
      subheader={subtitle}
    >
      {children}
    </SectionCard>
  );
}

function VerbrauchChart({ periods }) {
  const theme = useTheme();
  const accent      = theme.palette.primary.main;
  const accentLight = theme.palette.mode === 'dark' ? 'rgba(124,58,237,0.4)' : 'rgba(124,58,237,0.25)';

  const data = periods.map((p) => ({ period: p.period, kwh: verbrauchOf(p) }));
  const avg  = data.length ? Math.round(data.reduce((s, d) => s + d.kwh, 0) / data.length) : 0;

  return (
    <ChartCard title="Verbrauchsentwicklung" subtitle="kWh pro Abrechnungsperiode + Durchschnitt">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
          <XAxis dataKey="period" tick={{ fill: theme.palette.text.secondary, fontSize: 11 }}
            axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: theme.palette.text.secondary, fontSize: 11 }}
            axisLine={false} tickLine={false}
            tickFormatter={(v) => `${v.toLocaleString('de-DE')} kWh`} width={78} />
          <Tooltip
            formatter={(v) => [`${Number(v).toLocaleString('de-DE')} kWh`, 'Verbrauch']}
            contentStyle={{
              background: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 10, fontSize: 12,
            }}
            labelStyle={{ color: theme.palette.text.primary, fontWeight: 700 }}
          />
          {avg > 0 && (
            <ReferenceLine y={avg} stroke={accent} strokeDasharray="5 3" strokeWidth={1.5}
              label={{ value: `Ø ${avg.toLocaleString('de-DE')} kWh`, fill: accent, fontSize: 10, position: 'insideTopRight' }} />
          )}
          <Bar dataKey="kwh" name="Verbrauch" radius={[5, 5, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.kwh > avg ? accent : accentLight} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function PreisspiegelChart({ periods }) {
  const theme = useTheme();
  const data = periods.map((p) => {
    const ap = apEffOf(p);
    return {
      period: p.period,
      ap: ap > 0 ? Math.round(ap * 10000) / 100 : null,
    };
  });

  return (
    <ChartCard title="Preisspiegel" subtitle="Arbeitspreis in Cent/kWh pro Periode">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
          <XAxis dataKey="period" tick={{ fill: theme.palette.text.secondary, fontSize: 11 }}
            axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: theme.palette.text.secondary, fontSize: 11 }}
            axisLine={false} tickLine={false}
            tickFormatter={(v) => `${v} ct`} width={52} />
          <Tooltip
            formatter={(v) => [`${Number(v).toLocaleString('de-DE', { minimumFractionDigits: 2 })} ct/kWh`, 'Arbeitspreis']}
            contentStyle={{
              background: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 10, fontSize: 12,
            }}
            labelStyle={{ color: theme.palette.text.primary, fontWeight: 700 }}
          />
          <Line type="monotone" dataKey="ap" name="Arbeitspreis" connectNulls
            stroke={theme.palette.warning.main} strokeWidth={2.5}
            dot={{ fill: theme.palette.warning.main, r: 4, strokeWidth: 0 }}
            activeDot={{ r: 6, strokeWidth: 2, stroke: theme.palette.background.paper }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function KostentrendChart({ periods }) {
  const theme = useTheme();
  const data = periods.map((p) => ({
    period: p.period,
    gesamtkosten: Math.round(gesamtkostenOf(p) * 100) / 100,
    vorauszahlung: Math.round(vorauszahlungOf(p) * 100) / 100,
  }));

  return (
    <ChartCard title="Kostentrend" subtitle="Gesamtkosten vs. Vorauszahlungen pro Periode">
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="gradKosten" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={theme.palette.primary.main} stopOpacity={theme.palette.mode === 'dark' ? 0.5 : 0.35} />
              <stop offset="95%" stopColor={theme.palette.primary.main} stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
          <XAxis dataKey="period" tick={{ fill: theme.palette.text.secondary, fontSize: 11 }}
            axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: theme.palette.text.secondary, fontSize: 11 }}
            axisLine={false} tickLine={false}
            tickFormatter={(v) => `${v} €`} width={64} />
          <Tooltip
            formatter={(v, name) => [
              `${Number(v).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €`,
              name === 'gesamtkosten' ? 'Gesamtkosten' : 'Vorauszahlung',
            ]}
            contentStyle={{
              background: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 10, fontSize: 12,
            }}
            labelStyle={{ color: theme.palette.text.primary, fontWeight: 700 }}
          />
          <Legend
            iconType="circle" iconSize={8}
            formatter={(v) => v === 'gesamtkosten' ? 'Gesamtkosten' : 'Vorauszahlung'}
            wrapperStyle={{ fontSize: 12, paddingTop: 8, color: theme.palette.text.secondary }}
          />
          <Area type="monotone" dataKey="gesamtkosten" fill="url(#gradKosten)"
            stroke={theme.palette.primary.main} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="vorauszahlung"
            stroke={theme.palette.success.main} strokeWidth={2} strokeDasharray="6 3"
            dot={{ fill: theme.palette.success.main, r: 3, strokeWidth: 0 }}
            activeDot={{ r: 5, strokeWidth: 2, stroke: theme.palette.background.paper }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ─── Jahreshistorie tab ───────────────────────────────────────────────────────
function JahreshistorieTab() {
  const {
    periods, loading, error,
    addPeriod, updatePeriod, deletePeriod,
    getBillUrl,
  } = useElectricityPeriods();
  const [editRow, setEditRow]   = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [openErr, setOpenErr]   = useState('');

  async function handleSave(form) {
    if (editRow) {
      await updatePeriod(editRow.id, form);
      setEditRow(null);
      setShowForm(false);
    } else {
      await addPeriod(form);
      setShowForm(false);
    }
  }

  function handleEdit(p) {
    setEditRow(p);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Öffnet die hochgeladene Rechnung in einem neuen Tab via Signed URL (10 min).
  async function handleOpenBill(path) {
    if (!path) return;
    try {
      const url = await getBillUrl(path);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch (ex) {
      setOpenErr(ex.message || 'Konnte Rechnung nicht öffnen.');
    }
  }

  if (loading) {
    return (
      <Stack alignItems="center" justifyContent="center" sx={{ minHeight: 180, color: 'text.secondary' }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <CircularProgress size={18} />
          <Typography variant="body2">Wird geladen…</Typography>
        </Stack>
      </Stack>
    );
  }
  if (error) {
    return <Alert severity="error"><strong>Fehler:</strong> {error}</Alert>;
  }

  return (
    <Stack spacing={2.5}>
      {showForm ? (
        <PeriodForm
          initial={editRow}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditRow(null); }}
          onOpenBill={handleOpenBill}
        />
      ) : (
        <Stack direction="row" justifyContent="flex-end">
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => { setEditRow(null); setShowForm(true); }}
          >
            Neue Periode
          </Button>
        </Stack>
      )}

      {periods.length >= 2 && (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 2 }}>
            <VerbrauchChart periods={periods} />
            <PreisspiegelChart periods={periods} />
          </Box>
          <KostentrendChart periods={periods} />
        </>
      )}

      <PeriodsTable
        periods={periods}
        onEdit={handleEdit}
        onDelete={deletePeriod}
        onOpenBill={handleOpenBill}
      />

      <Snackbar
        open={!!openErr}
        autoHideDuration={5000}
        onClose={() => setOpenErr('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => setOpenErr('')}>{openErr}</Alert>
      </Snackbar>
    </Stack>
  );
}

// ─── StromPage ────────────────────────────────────────────────────────────────
export default function StromPage() {
  const {
    readings, tariff, loading, error,
    addReading, updateReading, deleteReading, saveTariff, getImageUrl,
  } = useElectricity();
  const [activeTab, setActiveTab] = useState('aktuell');

  // Editing state — Reading das gerade im Edit-Dialog bearbeitet wird
  const [editingReading, setEditingReading] = useState(null);

  // Global Error-Snackbar (für Upload/Kompression-Fehler)
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'error' });
  const notifyError   = useCallback((message) => setSnackbar({ open: true, message, severity: 'error' }),   []);
  const closeSnackbar = useCallback(() => setSnackbar((s) => ({ ...s, open: false })), []);

  // Delete mit Fehler-Handling (Foto wird best-effort mitgelöscht)
  const handleDeleteReading = useCallback(async (id) => {
    try { await deleteReading(id); }
    catch (ex) { notifyError('Löschen fehlgeschlagen: ' + ex.message); }
  }, [deleteReading, notifyError]);

  // Update-Wrapper für den Edit-Dialog: ruft updateReading mit der aktuellen ID auf
  const handleUpdateReading = useCallback(async (patch, onProgress) => {
    if (!editingReading) return;
    return updateReading(editingReading.id, patch, onProgress);
  }, [editingReading, updateReading]);

  const yearReadings  = useMemo(() => readingsForYear(readings, YEAR), [readings]);
  const firstReading  = yearReadings[0] ?? null;
  const latestReading = yearReadings[yearReadings.length - 1] ?? null;

  const forecast    = useMemo(() => buildForecast(firstReading, latestReading), [firstReading, latestReading]);
  const cost        = useMemo(() => buildCostForecast(forecast.total, tariff), [forecast, tariff]);
  const monthlyData = useMemo(() => buildMonthlyChart(readings, YEAR), [readings]);

  if (loading) {
    return (
      <Stack alignItems="center" justifyContent="center" sx={{ minHeight: 200, color: 'text.secondary' }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <CircularProgress size={20} />
          <Typography variant="body2">Daten werden geladen…</Typography>
        </Stack>
      </Stack>
    );
  }
  if (error) {
    return (
      <Box sx={{ p: { xs: 2, sm: 3 } }}>
        <Alert severity="error"><strong>Fehler:</strong> {error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <PageHeader
        title="Stromübersicht" icon="bolt"
        subtitle="Zählerstände erfassen, Jahresverbrauch prognostizieren, historische Abrechnungen verwalten."
      />

      {/* Tab bar */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2.5 }}>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
          <Tab value="aktuell" label={`Aktuelles Jahr (${YEAR})`} />
          <Tab value="jahreshistorie" label="Jahreshistorie" />
        </Tabs>
      </Box>

      {/* Tab: Aktuell */}
      {activeTab === 'aktuell' && (
        <Stack spacing={2.5}>
          {readings.length === 0 && (
            <Alert severity="warning" variant="outlined">
              Noch keine Zählerstände vorhanden. Erfasse deinen ersten Stand unten, um die Prognose zu starten.
            </Alert>
          )}

          <TariffForm tariff={tariff} onSave={saveTariff} />

          <Box sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.2fr) minmax(0, 1fr)' },
            gap: 2.5,
          }}>
            {readings.length > 0 ? (
              <ForecastGauge forecast={forecast} cost={cost} />
            ) : (
              <SectionCard>
                <Box sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}>
                  <Typography variant="body2">Prognose erscheint sobald Zählerstände vorhanden sind.</Typography>
                </Box>
              </SectionCard>
            )}
            <Stack spacing={2}>
              <ReadingForm onSave={addReading} onError={notifyError} />
              <ReadingHistory
                readings={readings}
                onDelete={handleDeleteReading}
                onEdit={(r) => setEditingReading(r)}
                resolveUrl={getImageUrl}
                onError={notifyError}
              />
            </Stack>
          </Box>

          <MonthlyChart data={monthlyData} />

          {/* Variable Abschläge: Verlauf YTD vs. Forecast — nur sinnvoll wenn Tarif hinterlegt */}
          {tariff && Array.isArray(tariff.installments) && tariff.installments.length > 0 && (
            <AdvancesProgressChart tariff={tariff} cost={cost} />
          )}
        </Stack>
      )}

      {/* Tab: Jahreshistorie */}
      {activeTab === 'jahreshistorie' && <JahreshistorieTab />}

      {/* Edit-Dialog — shares ReadingUploadDialog im Edit-Modus */}
      <ReadingUploadDialog
        open={!!editingReading}
        editing={editingReading}
        onClose={() => setEditingReading(null)}
        onSave={handleUpdateReading}
        onError={notifyError}
        resolveUrl={getImageUrl}
      />

      {/* Global Snackbar für Upload-/Kompression-Fehler */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={closeSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={closeSnackbar}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
