// Reine Gehaltshistorie — was bis heute verdient wurde.
//
// Realkaufkraft-Vergleich, Inflations-Anreicherung und Prognose-Funktionen
// sind in den Tab „Forecast & Kaufkraft" gewandert. Hier bleibt nur:
//   - Tabelle der vergangenen Jahre (Brutto, Δ-Steigerung, Netto)
//   - Neuen Eintrag hinzufügen / bearbeiten / löschen
//   - Schlanke Brutto-Verlaufs-Grafik
//
// Projekt-Datensätze (is_projection = true) werden hier nicht mehr
// angezeigt; sie bleiben in der DB unberührt, damit andere Module
// (Forecast-Tab) sie weiterhin nutzen könnten.

import { useMemo, useState } from 'react';
import {
  Box, Stack, Typography, Card, CardContent, Table, TableHead, TableBody,
  TableRow, TableCell, IconButton, TextField, Button, InputAdornment,
  CircularProgress, Alert, Chip, Paper, useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartTooltip,
} from 'recharts';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';

import { useSalaryHistory } from '../hooks/useSalaryHistory';
import { calcGehaltResult } from '../utils/salaryCalculations';
import { enrichWithSteigerung, buildEstimateNet } from '../utils/salaryHistoryCalc';

const fmt0 = (v) => v == null || isNaN(v) ? '–' : Math.round(v).toLocaleString('de-DE') + ' €';
const fmt2 = (v) => v == null || isNaN(v) ? '–' : Number(v).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const fmtPct = (v) => v == null || isNaN(v) ? '–' : (v >= 0 ? '+' : '') + v.toFixed(1).replace('.', ',') + ' %';

const CURRENT_YEAR = new Date().getFullYear();

export default function SalaryHistoryTab({ baseParams }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { rows, loading, error, upsertYear, deleteYear } = useSalaryHistory();

  const [editingYear, setEditingYear] = useState(null);
  const [editDraft,   setEditDraft]   = useState({ annual_gross: '', net_monthly: '' });
  const [newRow,      setNewRow]      = useState({ year: CURRENT_YEAR, annual_gross: '' });
  const [showAddRow,  setShowAddRow]  = useState(false);
  const [busy,        setBusy]        = useState(false);
  const [opError,     setOpError]     = useState('');

  // Brutto → Netto/Monat Schätzer aus dem aktuellen Rechner-State.
  const estimateNet = useMemo(
    () => buildEstimateNet(baseParams, calcGehaltResult),
    [baseParams],
  );

  // Nur reale Einträge (keine Projektionen) — chronologisch absteigend
  // anzeigen. Steigerung wird zwischen aufsteigenden Jahren berechnet.
  const realRows = useMemo(
    () => (rows || []).filter((r) => !r.is_projection),
    [rows],
  );

  const enriched = useMemo(() => {
    const withSteig = enrichWithSteigerung(realRows); // aufsteigend sortiert
    return [...withSteig].reverse();                   // neueste oben
  }, [realRows]);

  const chartData = useMemo(() => enrichWithSteigerung(realRows).map((r) => ({
    year:   r.year,
    brutto: Number(r.annual_gross),
    netto:  r.net_monthly != null ? Number(r.net_monthly) * 12 : null,
  })), [realRows]);

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
        const est = estimateNet(gross, year);
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
      if (!Number.isFinite(yr) || yr < 1990 || yr > CURRENT_YEAR + 1) {
        throw new Error('Jahr ungültig (max. ' + (CURRENT_YEAR + 1) + ').');
      }
      if (isNaN(gross) || gross < 0) throw new Error('Bruttojahresgehalt ungültig.');
      const net = estimateNet(gross, yr);
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Stack spacing={2.5}>
      {/* Header + Add-Button */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1.5}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            Gehaltshistorie
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Bisheriges Jahresgehalt — Forecast & Kaufkraft im eigenen Tab nebenan.
          </Typography>
        </Box>
        <Button variant="contained" size="small" startIcon={<AddIcon />}
          onClick={() => setShowAddRow(true)} disabled={showAddRow || busy}>
          Jahr hinzufügen
        </Button>
      </Stack>

      {opError && <Alert severity="error" onClose={() => setOpError('')}>{opError}</Alert>}
      {error   && <Alert severity="error">Daten konnten nicht geladen werden: {error}</Alert>}

      {/* Add-Row */}
      {showAddRow && (
        <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1, bgcolor: 'action.hover' }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="center">
            <TextField size="small" type="number" label="Jahr"
              value={newRow.year}
              onChange={(e) => setNewRow((r) => ({ ...r, year: e.target.value }))}
              inputProps={{ inputMode: 'numeric', min: 1990, max: CURRENT_YEAR + 1 }}
              sx={{ width: { xs: '100%', sm: 110 } }}
            />
            <TextField size="small" type="number" label="Bruttojahresgehalt" fullWidth
              value={newRow.annual_gross}
              onChange={(e) => setNewRow((r) => ({ ...r, annual_gross: e.target.value }))}
              inputProps={{ inputMode: 'decimal' }}
              InputProps={{ endAdornment: <InputAdornment position="end">€</InputAdornment> }}
            />
            <Stack direction="row" spacing={0.5} sx={{ alignSelf: { xs: 'flex-end', sm: 'auto' } }}>
              <IconButton size="small" color="success" onClick={handleAddRow} disabled={busy}>
                <CheckIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={() => setShowAddRow(false)} disabled={busy}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Stack>
        </Paper>
      )}

      {/* Loading-State */}
      {loading && (
        <Stack direction="row" alignItems="center" justifyContent="center" spacing={1.5}
          sx={{ py: 4, color: 'text.secondary' }}>
          <CircularProgress size={20} />
          <Typography variant="body2">Lade Gehaltshistorie…</Typography>
        </Stack>
      )}

      {/* Empty-State */}
      {!loading && enriched.length === 0 && !showAddRow && (
        <Paper variant="outlined" sx={{ borderRadius: '16px', p: 4, textAlign: 'center' }}>
          <Box component="span" className="material-symbols-outlined"
            sx={{ fontSize: 48, color: 'accent.positiveSurface' }}>
            history
          </Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 1 }}>
            Noch keine Jahre erfasst
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Trage dein Bruttojahresgehalt für vergangene Jahre ein, um die Steigerung sichtbar zu machen.
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />}
            onClick={() => setShowAddRow(true)}>
            Erstes Jahr hinzufügen
          </Button>
        </Paper>
      )}

      {/* Tabelle / Karten */}
      {!loading && enriched.length > 0 && (
        isMobile ? (
          <Stack spacing={1.25}>
            {enriched.map((row) => (
              <MobileSalaryRow
                key={row.year}
                row={row}
                isEditing={editingYear === row.year}
                editDraft={editDraft}
                setEditDraft={setEditDraft}
                startEdit={startEdit}
                cancelEdit={cancelEdit}
                saveEdit={saveEdit}
                handleDelete={handleDelete}
                busy={busy}
                estimateNet={estimateNet}
              />
            ))}
          </Stack>
        ) : (
          <Card elevation={1} sx={{ borderRadius: 1, overflow: 'hidden' }}>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Jahr</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Brutto / Jahr</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Brutto / Monat</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Δ Steigerung</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Netto / Monat</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, width: 90 }}>Aktionen</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {enriched.map((row) => {
                    const isEditing = editingYear === row.year;
                    if (isEditing) {
                      return (
                        <TableRow key={row.year} sx={{ bgcolor: 'action.hover' }}>
                          <TableCell sx={{ fontWeight: 700, fontFamily: 'monospace' }}>{row.year}</TableCell>
                          <TableCell align="right">
                            <TextField size="small" type="number"
                              value={editDraft.annual_gross}
                              onChange={(e) => setEditDraft((d) => ({ ...d, annual_gross: e.target.value }))}
                              inputProps={{ inputMode: 'decimal', style: { textAlign: 'right' } }}
                              InputProps={{ endAdornment: <InputAdornment position="end">€</InputAdornment> }}
                              sx={{ width: 160 }}
                            />
                          </TableCell>
                          <TableCell align="right" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                            {fmt0((parseFloat(editDraft.annual_gross) || 0) / 12)}
                          </TableCell>
                          <TableCell align="right" />
                          <TableCell align="right">
                            <TextField size="small" type="number"
                              placeholder={(() => { const e = estimateNet(parseFloat(editDraft.annual_gross), row.year); return e ? `~${Math.round(e)}` : 'auto'; })()}
                              value={editDraft.net_monthly ?? ''}
                              onChange={(e) => setEditDraft((d) => ({ ...d, net_monthly: e.target.value }))}
                              inputProps={{ inputMode: 'decimal', style: { textAlign: 'right' } }}
                              InputProps={{ endAdornment: <InputAdornment position="end">€</InputAdornment> }}
                              sx={{ width: 140 }}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <IconButton size="small" color="success" onClick={() => saveEdit(row.year)} disabled={busy}>
                              <CheckIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" onClick={cancelEdit} disabled={busy}>
                              <CloseIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      );
                    }
                    return (
                      <TableRow key={row.year} hover
                        sx={{ ...(row.year === CURRENT_YEAR ? { bgcolor: 'action.selected' } : {}) }}>
                        <TableCell sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
                          {row.year}
                          {row.year === CURRENT_YEAR && (
                            <Chip label="aktuell" size="small" variant="outlined"
                              sx={{ height: 16, fontSize: '0.55rem', ml: 0.75 }} />
                          )}
                        </TableCell>
                        <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                          {fmt0(row.annual_gross)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                          {fmt0(row.grossMonthly)}
                        </TableCell>
                        <TableCell align="right" sx={{
                          fontFamily: 'monospace', fontWeight: 600,
                          color: row.steigerungPct == null ? 'text.disabled'
                               : row.steigerungPct >= 0 ? 'success.main'
                               : 'error.main',
                        }}>
                          {fmtPct(row.steigerungPct)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                          {row.net_monthly != null ? fmt2(row.net_monthly) : '–'}
                        </TableCell>
                        <TableCell align="right">
                          <IconButton size="small" onClick={() => startEdit(row)}>
                            <EditOutlinedIcon fontSize="small" />
                          </IconButton>
                          <IconButton size="small" color="error" onClick={() => handleDelete(row.year)} disabled={busy}>
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          </Card>
        )
      )}

      {/* Brutto-Verlaufs-Chart */}
      {!loading && chartData.length >= 2 && (
        <Card elevation={1} sx={{ borderRadius: 1 }}>
          <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
            <Typography variant="overline" sx={{
              color: 'text.secondary', letterSpacing: '0.08em', display: 'block', mb: 1,
            }}>
              Brutto-Verlauf
            </Typography>
            <Box sx={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
                  <XAxis dataKey="year"
                    tick={{ fill: theme.palette.text.secondary, fontSize: 11 }}
                    axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: theme.palette.text.secondary, fontSize: 11 }}
                    axisLine={false} tickLine={false}
                    tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v}
                    width={60} />
                  <RechartTooltip
                    formatter={(v) => [fmt0(v), 'Brutto/Jahr']}
                    labelFormatter={(l) => `Jahr ${l}`}
                    contentStyle={{
                      background: theme.palette.background.paper,
                      border: `1px solid ${theme.palette.divider}`,
                      borderRadius: 8, fontSize: 12,
                    }}
                  />
                  <Line type="monotone" dataKey="brutto"
                    stroke={theme.palette.primary.main} strokeWidth={2.5}
                    dot={{ r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </Box>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}

// ─── Mobile Row ──────────────────────────────────────────────────────────────
function MobileSalaryRow({ row, isEditing, editDraft, setEditDraft, startEdit, cancelEdit, saveEdit, handleDelete, busy, estimateNet }) {
  if (isEditing) {
    return (
      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1, bgcolor: 'action.hover' }}>
        <Stack spacing={1.5}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>{row.year}</Typography>
            <Stack direction="row" spacing={0.5}>
              <IconButton size="small" color="success" onClick={() => saveEdit(row.year)} disabled={busy}>
                <CheckIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={cancelEdit} disabled={busy}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Stack>
          <TextField size="small" fullWidth type="number" label="Jahresgehalt (Brutto)"
            value={editDraft.annual_gross}
            onChange={(e) => setEditDraft((d) => ({ ...d, annual_gross: e.target.value }))}
            inputProps={{ inputMode: 'decimal' }}
            InputProps={{ endAdornment: <InputAdornment position="end">€</InputAdornment> }}
          />
          <TextField size="small" fullWidth type="number" label="Netto / Monat"
            placeholder={(() => { const e = estimateNet(parseFloat(editDraft.annual_gross), row.year); return e ? `~${Math.round(e)}` : 'auto'; })()}
            value={editDraft.net_monthly ?? ''}
            onChange={(e) => setEditDraft((d) => ({ ...d, net_monthly: e.target.value }))}
            inputProps={{ inputMode: 'decimal' }}
            InputProps={{ endAdornment: <InputAdornment position="end">€</InputAdornment> }}
          />
        </Stack>
      </Paper>
    );
  }

  return (
    <Paper variant="outlined" sx={{
      p: 1.5, borderRadius: 1,
      ...(row.year === CURRENT_YEAR ? { borderLeft: '3px solid', borderLeftColor: 'primary.main' } : {}),
    }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.75 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>{row.year}</Typography>
          {row.year === CURRENT_YEAR && (
            <Chip label="aktuell" size="small" variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />
          )}
        </Stack>
        <Stack direction="row" spacing={0.5}>
          <IconButton size="small" onClick={() => startEdit(row)}>
            <EditOutlinedIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" color="error" onClick={() => handleDelete(row.year)} disabled={busy}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Stack>
      <Stack direction="row" spacing={2}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="caption" color="text.secondary">Brutto/Jahr</Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
            {fmt0(row.annual_gross)}
          </Typography>
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="caption" color="text.secondary">Netto/Monat</Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
            {row.net_monthly != null ? fmt2(row.net_monthly) : '–'}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">Steigerung</Typography>
          <Typography variant="body2" sx={{
            fontFamily: 'monospace', fontWeight: 600,
            color: row.steigerungPct == null ? 'text.disabled'
                 : row.steigerungPct >= 0 ? 'success.main'
                 : 'error.main',
          }}>
            {fmtPct(row.steigerungPct)}
          </Typography>
        </Box>
      </Stack>
    </Paper>
  );
}
