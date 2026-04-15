import { useMemo, useState, useCallback } from 'react';
import {
  Box, Stack, Typography, Card, CardContent, Table, TableHead, TableBody,
  TableRow, TableCell, IconButton, TextField, Button, InputAdornment,
  CircularProgress, Alert, Skeleton, Chip, Tooltip as MuiTooltip,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, Cell, ReferenceLine,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartTooltip, Legend,
} from 'recharts';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { useSalaryHistory } from '../hooks/useSalaryHistory';
import { useInflationData } from '../hooks/useInflationData';
import { calcGehaltResult } from '../utils/salaryCalculations';
import { enrichWithSteigerung, enrichWithInflation, buildEstimateNet } from '../utils/salaryHistoryCalc';
import { DEFAULT_FUTURE_INFLATION_PCT } from '../lib/inflationData';

const fmt0 = (v) => v == null || isNaN(v) ? '–' : Math.round(v).toLocaleString('de-DE') + ' €';
const fmt2 = (v) => v == null || isNaN(v) ? '–' : Number(v).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const fmtPct = (v) => v == null || isNaN(v) ? '–' : (v >= 0 ? '+' : '') + v.toFixed(1).replace('.', ',') + ' %';

const CURRENT_YEAR = new Date().getFullYear();

export default function SalaryHistoryTab({ baseParams }) {
  const theme = useTheme();
  const { rows, loading, error, upsertYear, deleteYear, bulkProjection, clearProjections } = useSalaryHistory();
  const { vpi, status: inflStatus, error: inflError } = useInflationData();

  const [editingYear, setEditingYear] = useState(null);
  const [editDraft,   setEditDraft]   = useState({ annual_gross: '', net_monthly: '' });
  const [newRow,      setNewRow]      = useState({ year: CURRENT_YEAR, annual_gross: '' });
  const [showAddRow,  setShowAddRow]  = useState(false);
  const [growthPct,   setGrowthPct]   = useState(3);
  const [untilYear,   setUntilYear]   = useState(2030);
  const [futureInflPct, setFutureInflPct] = useState(DEFAULT_FUTURE_INFLATION_PCT);
  const [busy,        setBusy]        = useState(false);
  const [opError,     setOpError]     = useState('');

  // Brutto → Netto/Monat-Schätzer aus dem aktuellen Rechner-State.
  const estimateNet = useMemo(
    () => buildEstimateNet(baseParams, calcGehaltResult),
    [baseParams],
  );

  // Reihenfolge: erst Steigerung, dann Inflation/Real-Gehalt drüber.
  const enriched = useMemo(() => {
    const withSteig = enrichWithSteigerung(rows);
    return enrichWithInflation(withSteig, vpi, futureInflPct);
  }, [rows, vpi, futureInflPct]);

  // Chart-Daten: Brutto/Jahr nominal vs. realer Kaufkraft (in Basisjahr-€).
  const chartData = useMemo(() => enriched.map((r) => ({
    year:    r.year,
    brutto:  Number(r.annual_gross),
    netto:   r.net_monthly != null ? Number(r.net_monthly) * 12 : null,
    real:    r.realGross != null ? Math.round(r.realGross) : null,
    realPct: r.realPctVsBase,
    isProjection: r.is_projection,
  })), [enriched]);

  // Kaufkraft-Differenz (kumuliert) zwischen erstem und letztem Jahr — für Tooltip-Hint
  const kaufkraftSummary = useMemo(() => {
    if (enriched.length < 2) return null;
    const last = enriched[enriched.length - 1];
    if (last?.realPctVsBase == null) return null;
    return {
      baseYear:   enriched[0].year,
      lastYear:   last.year,
      pctChange:  last.realPctVsBase,
      realDelta:  (last.realGross ?? 0) - Number(enriched[0].annual_gross),
    };
  }, [enriched]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  function startEdit(row) {
    setEditingYear(row.year);
    setEditDraft({
      annual_gross: row.annual_gross ?? '',
      net_monthly:  row.net_monthly ?? '',
    });
  }
  function cancelEdit() {
    setEditingYear(null);
    setEditDraft({ annual_gross: '', net_monthly: '' });
  }
  async function saveEdit(year) {
    setBusy(true); setOpError('');
    try {
      const gross = parseFloat(editDraft.annual_gross);
      if (isNaN(gross) || gross < 0) throw new Error('Bruttojahresgehalt ungültig.');
      let net = editDraft.net_monthly === '' || editDraft.net_monthly == null
        ? null
        : parseFloat(editDraft.net_monthly);
      if (net == null) {
        const est = estimateNet(gross);
        if (est != null) net = est;
      }
      await upsertYear({ year, annual_gross: gross, net_monthly: net, is_projection: false });
      cancelEdit();
    } catch (ex) {
      setOpError(ex.message);
    } finally { setBusy(false); }
  }

  async function handleAddRow() {
    setBusy(true); setOpError('');
    try {
      const gross = parseFloat(newRow.annual_gross);
      const yr    = parseInt(newRow.year, 10);
      if (!Number.isFinite(yr) || yr < 1990 || yr > 2100) throw new Error('Jahr ungültig.');
      if (isNaN(gross) || gross < 0)                       throw new Error('Bruttojahresgehalt ungültig.');
      const net = estimateNet(gross);
      await upsertYear({ year: yr, annual_gross: gross, net_monthly: net, is_projection: false });
      setNewRow({ year: yr + 1, annual_gross: '' });
      setShowAddRow(false);
    } catch (ex) {
      setOpError(ex.message);
    } finally { setBusy(false); }
  }

  async function handleDelete(year) {
    setBusy(true); setOpError('');
    try { await deleteYear(year); }
    catch (ex) { setOpError(ex.message); }
    finally { setBusy(false); }
  }

  async function handleProject() {
    setBusy(true); setOpError('');
    try {
      await bulkProjection({ growthPct, untilYear, estimateNet });
    } catch (ex) {
      setOpError(ex.message);
    } finally { setBusy(false); }
  }

  async function handleClearProjections() {
    setBusy(true); setOpError('');
    try { await clearProjections(); }
    catch (ex) { setOpError(ex.message); }
    finally { setBusy(false); }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Stack spacing={2.5}>
      {/* Toolbar: Prognose-Konfiguration */}
      <Card elevation={2} sx={{ borderRadius: 3 }}>
        <CardContent>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            alignItems={{ xs: 'stretch', md: 'flex-end' }}
          >
            <Stack sx={{ flex: 1, minWidth: 188 }}>
              <Typography variant="caption" sx={{
                color: 'text.secondary', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              }}>
                Prognose
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Erweitert die Tabelle ab dem nächsten Jahr nach dem letzten realen Eintrag.
                Bestehende reale Werte bleiben unberührt.
              </Typography>
            </Stack>
            <TextField
              size="small"
              type="number"
              label="Steigerung p.a."
              value={growthPct}
              onChange={(e) => setGrowthPct(parseFloat(e.target.value) || 0)}
              inputProps={{ step: 0.5, min: 0, max: 20 }}
              InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
              sx={{ width: { xs: '100%', md: 160 } }}
            />
            <TextField
              size="small"
              type="number"
              label="Bis Jahr"
              value={untilYear}
              onChange={(e) => setUntilYear(parseInt(e.target.value, 10) || CURRENT_YEAR)}
              inputProps={{ step: 1, min: CURRENT_YEAR, max: 2100 }}
              sx={{ width: { xs: '100%', md: 120 } }}
            />
            <TextField
              size="small"
              type="number"
              label="Erwartete Inflation p.a."
              value={futureInflPct}
              onChange={(e) => setFutureInflPct(parseFloat(e.target.value) || 0)}
              inputProps={{ step: 0.1, min: -5, max: 20 }}
              InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
              helperText="Für künftige Jahre (Real-Gehalt-Berechnung)"
              sx={{ width: { xs: '100%', md: 200 } }}
            />
            <Button
              variant="contained"
              onClick={handleProject}
              disabled={busy || rows.filter((r) => !r.is_projection).length === 0}
            >
              Prognose erstellen
            </Button>
            <Button
              variant="outlined"
              color="inherit"
              onClick={handleClearProjections}
              disabled={busy || rows.filter((r) => r.is_projection).length === 0}
            >
              Prognose zurücksetzen
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {/* Inflations-Datenquelle: Status-Hinweis (nur wenn Fallback aktiv) */}
      {inflStatus === 'fallback' && (
        <Alert severity="warning" variant="outlined">
          Destatis API nicht erreichbar — verwende Fallback-VPI-Werte (statisch, Stand 2025).
          Real-Gehalt-Berechnung verwendet Default-Inflation von {DEFAULT_FUTURE_INFLATION_PCT} % für unbekannte Jahre.
          {inflError ? ` Details: ${inflError}` : ''}
        </Alert>
      )}

      {(error || opError) && (
        <Alert severity="error" onClose={() => setOpError('')}>
          {opError || error}
        </Alert>
      )}

      {/* Tabelle */}
      <Card elevation={2} sx={{ borderRadius: 3 }}>
        <CardContent sx={{ p: 0 }}>
          {loading ? (
            <Stack spacing={1} sx={{ p: 2 }}>
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} variant="rounded" height={48} />)}
            </Stack>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'text.secondary' } }}>
                  <TableCell>Jahr</TableCell>
                  <TableCell align="right">Jahresgehalt (Brutto)</TableCell>
                  <TableCell align="right">Steigerung</TableCell>
                  <TableCell align="right">Inflation</TableCell>
                  <TableCell align="right">
                    <MuiTooltip title={`Kaufkraft bezogen auf Basisjahr ${enriched[0]?.year ?? '–'}`} arrow>
                      <span>Real-Gehalt</span>
                    </MuiTooltip>
                  </TableCell>
                  <TableCell align="right">Brutto / Monat</TableCell>
                  <TableCell align="right">Netto / Monat</TableCell>
                  <TableCell align="right" sx={{ width: 96 }}>Aktion</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {enriched.length === 0 && !showAddRow && (
                  <TableRow>
                    <TableCell colSpan={8} sx={{ textAlign: 'center', color: 'text.secondary', py: 4 }}>
                      Noch keine Einträge. Klicke unten „Jahr hinzufügen", um zu starten.
                    </TableCell>
                  </TableRow>
                )}
                {enriched.map((row) => {
                  const isEditing = editingYear === row.year;
                  const isProj    = !!row.is_projection;
                  const rowSx = isProj ? {
                    fontStyle: 'italic',
                    bgcolor: theme.palette.mode === 'dark' ? 'rgba(245,158,11,0.06)' : 'rgba(245,158,11,0.05)',
                  } : {};
                  return (
                    <TableRow key={row.year} sx={rowSx} hover>
                      <TableCell sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          {row.year}
                          {isProj && (
                            <Chip label="Prognose" size="small" color="warning" variant="outlined"
                              sx={{ height: 18, fontSize: '0.62rem', fontWeight: 700 }} />
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                        {isEditing ? (
                          <TextField
                            size="small"
                            type="number"
                            value={editDraft.annual_gross}
                            onChange={(e) => setEditDraft((d) => ({ ...d, annual_gross: e.target.value }))}
                            inputProps={{ step: 100, min: 0, style: { textAlign: 'right' } }}
                            InputProps={{ endAdornment: <InputAdornment position="end">€</InputAdornment> }}
                            sx={{ width: 160 }}
                          />
                        ) : (
                          fmt0(row.annual_gross)
                        )}
                      </TableCell>
                      <TableCell align="right" sx={{
                        fontFamily: 'monospace',
                        color: row.steigerungPct == null
                          ? 'text.disabled'
                          : row.steigerungPct >= 0 ? 'success.main' : 'error.main',
                      }}>
                        {fmtPct(row.steigerungPct)}
                      </TableCell>
                      <TableCell align="right" sx={{
                        fontFamily: 'monospace',
                        color: row.inflationPct == null ? 'text.disabled' : 'warning.main',
                      }}>
                        {fmtPct(row.inflationPct)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                        <MuiTooltip
                          title={row.realPctVsBase != null
                            ? `Kaufkraft ggü. ${row.baseYear}: ${fmtPct(row.realPctVsBase)}`
                            : ''}
                          arrow
                          disableHoverListener={row.realPctVsBase == null}
                        >
                          <Box component="span" sx={{
                            color: row.realGross == null ? 'text.disabled'
                                 : row.realPctVsBase >= 0 ? 'success.main'
                                 :                          'error.main',
                            cursor: row.realPctVsBase != null ? 'help' : 'default',
                          }}>
                            {row.realGross != null ? fmt0(row.realGross) : '–'}
                          </Box>
                        </MuiTooltip>
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                        {fmt2(row.grossMonthly)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                        {isEditing ? (
                          <TextField
                            size="small"
                            type="number"
                            placeholder={(() => { const e = estimateNet(parseFloat(editDraft.annual_gross)); return e ? `~${Math.round(e)}` : 'auto'; })()}
                            value={editDraft.net_monthly ?? ''}
                            onChange={(e) => setEditDraft((d) => ({ ...d, net_monthly: e.target.value }))}
                            inputProps={{ step: 10, min: 0, style: { textAlign: 'right' } }}
                            InputProps={{ endAdornment: <InputAdornment position="end">€</InputAdornment> }}
                            sx={{ width: 140 }}
                          />
                        ) : (
                          row.net_monthly != null ? fmt2(row.net_monthly) : (
                            <Typography component="span" variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                              –
                            </Typography>
                          )
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {isEditing ? (
                          <Stack direction="row" justifyContent="flex-end" spacing={0.5}>
                            <IconButton size="small" color="success" onClick={() => saveEdit(row.year)} disabled={busy}>
                              <CheckIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" onClick={cancelEdit} disabled={busy}>
                              <CloseIcon fontSize="small" />
                            </IconButton>
                          </Stack>
                        ) : (
                          <Stack direction="row" justifyContent="flex-end" spacing={0.5}>
                            <IconButton size="small" onClick={() => startEdit(row)} title="Bearbeiten">
                              <EditOutlinedIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" color="error" onClick={() => handleDelete(row.year)} title="Löschen" disabled={busy}>
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Stack>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {showAddRow && (
                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                    <TableCell sx={{ fontWeight: 700 }}>
                      <TextField
                        size="small"
                        type="number"
                        value={newRow.year}
                        onChange={(e) => setNewRow((r) => ({ ...r, year: e.target.value }))}
                        inputProps={{ step: 1, min: 1990, max: 2100 }}
                        sx={{ width: 90 }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <TextField
                        size="small"
                        type="number"
                        autoFocus
                        placeholder="z.B. 60000"
                        value={newRow.annual_gross}
                        onChange={(e) => setNewRow((r) => ({ ...r, annual_gross: e.target.value }))}
                        inputProps={{ step: 100, min: 0, style: { textAlign: 'right' } }}
                        InputProps={{ endAdornment: <InputAdornment position="end">€</InputAdornment> }}
                        sx={{ width: 160 }}
                      />
                    </TableCell>
                    <TableCell colSpan={5} sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
                      Steigerung, Inflation, Real-Gehalt & Brutto/Monat werden automatisch berechnet
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" justifyContent="flex-end" spacing={0.5}>
                        <IconButton size="small" color="success" onClick={handleAddRow} disabled={busy}>
                          <CheckIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => setShowAddRow(false)} disabled={busy}>
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
          {!loading && !showAddRow && (
            <Box sx={{ p: 1.5, borderTop: 1, borderColor: 'divider' }}>
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={() => {
                  // Default: Jahr nach dem letzten Eintrag oder aktuelles Jahr
                  const lastYear = rows.length > 0 ? Math.max(...rows.map((r) => r.year)) : CURRENT_YEAR - 1;
                  setNewRow({ year: lastYear + 1, annual_gross: '' });
                  setShowAddRow(true);
                }}
                sx={{ textTransform: 'none' }}
              >
                Jahr hinzufügen
              </Button>
              {busy && <CircularProgress size={14} sx={{ ml: 1.5 }} />}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Line-Chart unter der Tabelle */}
      {chartData.length >= 2 && (
        <Card elevation={2} sx={{ borderRadius: 3 }}>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
              <Typography variant="caption" sx={{
                display: 'block', color: 'text.secondary', fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase',
              }}>
                Verlauf · Nominal-Brutto vs. Kaufkraft (Real)
              </Typography>
              {kaufkraftSummary && (
                <MuiTooltip
                  title={`Reales Brutto ${kaufkraftSummary.lastYear} ggü. ${kaufkraftSummary.baseYear}: ${
                    kaufkraftSummary.realDelta >= 0 ? '+' : '−'
                  }${fmt0(Math.abs(kaufkraftSummary.realDelta))} (in ${kaufkraftSummary.baseYear}-€)`}
                  arrow
                >
                  <Chip
                    size="small"
                    label={`Kaufkraft: ${fmtPct(kaufkraftSummary.pctChange)}`}
                    color={kaufkraftSummary.pctChange >= 0 ? 'success' : 'error'}
                    variant="outlined"
                  />
                </MuiTooltip>
              )}
            </Stack>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                  axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                  axisLine={false} tickLine={false} width={68}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k €`} />
                <RechartTooltip
                  formatter={(v, name) => {
                    const labels = {
                      brutto: 'Brutto / Jahr (nominal)',
                      netto:  'Netto / Jahr',
                      real:   `Real / Jahr (in ${enriched[0]?.year ?? '–'}-€)`,
                    };
                    return [fmt0(v), labels[name] ?? name];
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
                  formatter={(v) => v === 'brutto' ? 'Brutto (nominal)'
                                : v === 'netto'  ? 'Netto / Jahr'
                                : v === 'real'   ? `Kaufkraft (Basis ${enriched[0]?.year ?? '–'})`
                                :                   v}
                  wrapperStyle={{ fontSize: 12, paddingTop: 8, color: theme.palette.text.secondary }}
                />
                <Line type="monotone" dataKey="brutto"
                  stroke={theme.palette.primary.main} strokeWidth={2.5}
                  dot={{ r: 3, strokeWidth: 0, fill: theme.palette.primary.main }} />
                <Line type="monotone" dataKey="real" connectNulls
                  stroke={theme.palette.warning.main} strokeWidth={2.5}
                  strokeDasharray="6 3"
                  dot={{ r: 3, strokeWidth: 0, fill: theme.palette.warning.main }} />
                <Line type="monotone" dataKey="netto" connectNulls
                  stroke={theme.palette.success.main} strokeWidth={2}
                  dot={{ r: 3, strokeWidth: 0, fill: theme.palette.success.main }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <InflationHistoryChart vpi={vpi} status={inflStatus} />
    </Stack>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Inflations-Verlauf der letzten 20 Jahre (jährliche Veränderungsrate des VPI).
// Quelle ist der `useInflationData`-Status — die Komponente zeigt einen Chip,
// ob die Daten live von Destatis kommen oder aus dem statischen Fallback.
// ─────────────────────────────────────────────────────────────────────────────
function InflationHistoryChart({ vpi, status }) {
  const theme = useTheme();

  // Letzte 20 Jahre der jährlichen Inflation (auf Basis der VPI-Map).
  const data = useMemo(() => {
    const years = Object.keys(vpi).map(Number).sort((a, b) => a - b);
    if (years.length < 2) return [];
    const minYear = Math.max(years[0] + 1, CURRENT_YEAR - 19);
    const out = [];
    for (let y = minYear; y <= CURRENT_YEAR; y++) {
      const cur  = vpi[y];
      const prev = vpi[y - 1];
      if (cur == null || prev == null || prev === 0) continue;
      out.push({
        year: y,
        rate: Math.round(((cur / prev) - 1) * 1000) / 10, // 1 Dezimalstelle
      });
    }
    return out;
  }, [vpi]);

  const avg = useMemo(() => {
    if (data.length === 0) return null;
    return data.reduce((s, d) => s + d.rate, 0) / data.length;
  }, [data]);

  const sourceChip = (() => {
    if (status === 'loading')  return { label: 'Wird geladen…', color: 'default' };
    if (status === 'live')     return { label: 'Live · Destatis',          color: 'success' };
    if (status === 'cached')   return { label: 'Live · gecached (24 h)',   color: 'success' };
    if (status === 'fallback') return { label: 'Fallback · statische Daten', color: 'warning' };
    return { label: status, color: 'default' };
  })();

  return (
    <Card elevation={2} sx={{ borderRadius: 3 }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1.5 }}>
          <Box>
            <Typography variant="caption" sx={{
              color: 'text.secondary', fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>
              Inflation (VPI) · letzte 20 Jahre
            </Typography>
            {avg != null && (
              <Typography variant="body2" color="text.secondary">
                Ø {avg.toFixed(2).replace('.', ',')} % p.a. ·{' '}
                {data.length > 0 ? `${data[0].year}–${data[data.length - 1].year}` : '–'}
              </Typography>
            )}
          </Box>
          <Chip
            size="small"
            label={sourceChip.label}
            color={sourceChip.color}
            variant="outlined"
          />
        </Stack>
        {data.length === 0 ? (
          <Box sx={{ py: 3, textAlign: 'center', color: 'text.secondary' }}>
            <Typography variant="body2">Keine VPI-Daten verfügbar.</Typography>
          </Box>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                axisLine={false} tickLine={false} width={50}
                tickFormatter={(v) => `${v} %`} />
              <RechartTooltip
                formatter={(v) => [`${Number(v).toFixed(1).replace('.', ',')} %`, 'Inflation']}
                contentStyle={{
                  background: theme.palette.background.paper,
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: 10, fontSize: 12,
                }}
                labelStyle={{ color: theme.palette.text.primary, fontWeight: 700 }}
              />
              {avg != null && (
                <ReferenceLine
                  y={avg}
                  stroke={theme.palette.text.secondary}
                  strokeDasharray="4 3"
                  label={{
                    value: `Ø ${avg.toFixed(1).replace('.', ',')} %`,
                    fill: theme.palette.text.secondary,
                    fontSize: 10,
                    position: 'insideTopRight',
                  }}
                />
              )}
              <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
                {data.map((d) => (
                  <Cell
                    key={d.year}
                    // Hohe Inflation rot, niedrige grün, EZB-Ziel ~2 % als Schwelle
                    fill={d.rate >= 4 ? theme.palette.error.main
                        : d.rate >= 2 ? theme.palette.warning.main
                        : theme.palette.success.main}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Quelle: Destatis Tabelle 61111-0001 (Verbraucherpreisindex Deutschland, Basisjahr 2020 = 100).
        </Typography>
      </CardContent>
    </Card>
  );
}
