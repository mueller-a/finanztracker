import { useState, useMemo } from 'react';
import {
  Box, Stack, Typography, Button, IconButton, Paper, MenuItem,
  CircularProgress, Alert, LinearProgress, TextField,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CloseIcon from '@mui/icons-material/Close';

import { PageHeader, CurrencyField, ConfirmDialog } from '../components/mui';
import { useFreistellungsauftraege } from '../hooks/useFreistellungsauftraege';

// Sparerpauschbetrag (Single, Stand 2024+). Verheiratete: 2.000 €.
const SPARER_PAUSCH = 1000;

const fmt2 = (n) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (n) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: 0 });

// ─── KPI-Karte (Editorial Surface, leichter Stil) ────────────────────────────
function StatCard({ label, value, accent }) {
  return (
    <Paper variant="outlined" sx={{
      borderRadius: '16px', p: 2.25, position: 'relative',
      borderLeft: '3px solid',
      borderLeftColor: accent || 'divider',
      boxShadow: '0 6px 30px rgba(11, 28, 48, 0.04)',
    }}>
      <Typography variant="overline" sx={{
        color: 'text.secondary', display: 'block',
        fontSize: '0.625rem', letterSpacing: '0.08em', lineHeight: 1.15, mb: 0.5,
      }}>
        {label}
      </Typography>
      <Typography sx={{
        fontFamily: '"Manrope", sans-serif',
        fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1,
        fontSize: { xs: '1.5rem', sm: '1.75rem' },
      }}>
        {value}
      </Typography>
    </Paper>
  );
}

// ─── Add/Edit-Dialog ──────────────────────────────────────────────────────────
function OrderDialog({ open, year, initial, onClose, onSave }) {
  const isEdit = !!initial?.id;
  const [provider,        setProvider]        = useState(initial?.provider ?? '');
  const [allottedAmount,  setAllottedAmount]  = useState(initial?.allotted_amount ?? '');
  const [usedAmount,      setUsedAmount]      = useState(initial?.used_amount ?? '');
  const [note,            setNote]            = useState(initial?.note ?? '');
  const [busy,            setBusy]            = useState(false);
  const [err,             setErr]             = useState('');

  function reset() {
    setProvider(initial?.provider ?? '');
    setAllottedAmount(initial?.allotted_amount ?? '');
    setUsedAmount(initial?.used_amount ?? '');
    setNote(initial?.note ?? '');
    setErr('');
  }

  async function submit(e) {
    e.preventDefault();
    if (!provider.trim()) { setErr('Anbieter fehlt.'); return; }
    const all = Number(allottedAmount);
    if (!Number.isFinite(all) || all <= 0) { setErr('Erteilter Betrag muss > 0 sein.'); return; }
    const used = Number(usedAmount) || 0;
    if (used < 0 || used > all) { setErr('Ausgeschöpft muss zwischen 0 und erteiltem Betrag liegen.'); return; }
    setBusy(true); setErr('');
    try {
      await onSave({
        year,
        provider:        provider.trim(),
        allotted_amount: all,
        used_amount:     used,
        note:            note.trim() || null,
      });
      reset();
      onClose();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth
      component="form" onSubmit={submit}>
      <DialogTitle sx={{ pr: 6 }}>
        Freistellungsauftrag {year}
        <IconButton onClick={onClose} aria-label="Schließen"
          sx={{ position: 'absolute', right: 12, top: 12 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ pt: 2 }}>
        <Stack spacing={2}>
          <TextField
            label="Anbieter / Bank"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            fullWidth size="small" autoFocus required
            placeholder="z.B. comdirect, Trade Republic, ING"
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <CurrencyField
              label="Erteilter Freistellungsauftrag"
              value={allottedAmount}
              onChange={(v) => setAllottedAmount(v === '' ? '' : v)}
              fullWidth required size="small"
              decimals={2}
              helperText="Der Anbieter darf bis zu diesem Betrag steuerfrei stellen"
            />
            <CurrencyField
              label="Bereits ausgeschöpft"
              value={usedAmount}
              onChange={(v) => setUsedAmount(v === '' ? '' : v)}
              fullWidth size="small"
              decimals={2}
              helperText="Bisher YTD steuerfrei vereinnahmte Erträge"
            />
          </Stack>
          <TextField
            label="Notiz (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            fullWidth size="small" multiline rows={2}
          />
          {err && <Alert severity="error">{err}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy}>Abbrechen</Button>
        <Button type="submit" variant="contained" disabled={busy}>
          {busy ? '…' : isEdit ? 'Speichern' : 'Hinzufügen'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Hauptseite ──────────────────────────────────────────────────────────────
export default function FreistellungsauftraegePage() {
  const { orders, loading, error, addOrder, updateOrder, deleteOrder } = useFreistellungsauftraege();
  const currentYear = new Date().getFullYear();
  const [year, setYear]               = useState(currentYear);
  const [dialogOpen, setDialogOpen]   = useState(false);
  const [editing, setEditing]         = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const yearOrders = useMemo(
    () => orders.filter((o) => o.year === year),
    [orders, year],
  );

  const totalAllotted = yearOrders.reduce((s, o) => s + Number(o.allotted_amount || 0), 0);
  const totalUsed     = yearOrders.reduce((s, o) => s + Number(o.used_amount || 0), 0);
  const verfuegbar    = Math.max(0, SPARER_PAUSCH - totalAllotted);
  const overAllotted  = totalAllotted > SPARER_PAUSCH + 0.01;

  // Jahresliste: aktuelles Jahr + 2 vergangene + 1 zukünftiges + alle in DB existierenden Jahre
  const yearOptions = useMemo(() => {
    const set = new Set([
      currentYear - 2, currentYear - 1, currentYear, currentYear + 1,
      ...orders.map((o) => o.year),
    ]);
    return Array.from(set).sort((a, b) => b - a);
  }, [orders, currentYear]);

  async function handleSave(payload) {
    if (editing?.id) {
      await updateOrder(editing.id, payload);
      setEditing(null);
    } else {
      await addOrder(payload);
    }
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <PageHeader
        title="Freistellungsaufträge"
        icon="receipt_long"
        subtitle={`Sparerpauschbetrag ${fmt0(SPARER_PAUSCH)} € pro Jahr aufteilen`}
        actions={
          <Button variant="contained" startIcon={<AddIcon />}
            onClick={() => { setEditing(null); setDialogOpen(true); }}>
            Hinzufügen
          </Button>
        }
      />

      {loading ? (
        <Stack alignItems="center" justifyContent="center" sx={{ minHeight: 200, color: 'text.secondary' }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <CircularProgress size={20} />
            <Typography variant="body2">Wird geladen…</Typography>
          </Stack>
        </Stack>
      ) : error ? (
        <Alert severity="error"><strong>Fehler:</strong> {error}</Alert>
      ) : (
        <Stack spacing={2.5}>
          {/* KPI-Row */}
          <Box sx={{
            display: 'grid', gap: 2,
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
          }}>
            <StatCard label="Freibetrag" value={`${fmt2(SPARER_PAUSCH)} €`} accent="primary.main" />
            <StatCard label="Erteilt" value={`${fmt2(totalAllotted)} €`}
              accent={overAllotted ? 'error.main' : 'warning.main'} />
            <StatCard label="Verfügbar" value={`${fmt2(verfuegbar)} €`} accent="success.main" />
          </Box>

          {/* Year-Section */}
          <Paper variant="outlined" sx={{ borderRadius: '16px', p: { xs: 2, sm: 2.5 } }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }} spacing={1.5}>
              <Stack direction="row" alignItems="baseline" spacing={1.5}>
                <TextField
                  select size="small"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  sx={{ minWidth: 150 }}
                >
                  {yearOptions.map((y) => (
                    <MenuItem key={y} value={y}>Freistellungsauftrag {y}</MenuItem>
                  ))}
                </TextField>
                <Typography variant="caption" color="text.secondary">
                  01.01. – 31.12.
                </Typography>
              </Stack>
              <Button variant="outlined" size="small" startIcon={<AddIcon />}
                onClick={() => { setEditing(null); setDialogOpen(true); }}>
                Hinzufügen
              </Button>
            </Stack>

            <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
              <Typography variant="caption" color="text.secondary">
                {fmt2(totalAllotted)} € von {fmt2(SPARER_PAUSCH)} €
              </Typography>
              <Typography variant="caption" sx={{
                fontWeight: 700,
                color: overAllotted ? 'error.main' : 'text.secondary',
              }}>
                {Math.round((totalAllotted / SPARER_PAUSCH) * 100)} %
                {overAllotted && ' · überzeichnet'}
              </Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={Math.min(100, (totalAllotted / SPARER_PAUSCH) * 100)}
              sx={{
                height: 8, borderRadius: 99,
                bgcolor: 'action.hover', mb: 2.5,
                '& .MuiLinearProgress-bar': {
                  bgcolor: overAllotted ? 'error.main' : 'accent.positiveSurface',
                  borderRadius: 99,
                },
              }}
            />

            {/* Orders-Liste */}
            {yearOrders.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 5 }}>
                <Box component="span" className="material-symbols-outlined"
                  sx={{ fontSize: 56, color: 'accent.positiveSurface' }}>
                  receipt_long
                </Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 1 }}>
                  Du hast noch keinen Freistellungsauftrag hinterlegt
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
                  Richte Freistellungsaufträge ein, um deinen Sparerpauschbetrag optimal zu nutzen.
                </Typography>
                <Button variant="contained" startIcon={<AddIcon />}
                  onClick={() => { setEditing(null); setDialogOpen(true); }}>
                  Hinzufügen
                </Button>
              </Box>
            ) : (
              <Stack spacing={1}>
                {yearOrders.map((o) => {
                  const allot = Number(o.allotted_amount) || 0;
                  const used  = Number(o.used_amount) || 0;
                  const usedPct = allot > 0 ? Math.min(100, (used / allot) * 100) : 0;
                  return (
                    <Paper key={o.id} variant="outlined" sx={{
                      borderRadius: '12px', p: 1.75,
                      transition: 'box-shadow 0.15s',
                      '&:hover': {
                        boxShadow: '0 4px 12px rgba(11,28,48,0.06)',
                        '& .fa-actions': { opacity: 1 },
                      },
                    }}>
                      <Stack direction="row" alignItems="center" spacing={2}>
                        <Box sx={{
                          width: 40, height: 40, borderRadius: '10px',
                          bgcolor: 'accent.positiveSurface', color: 'primary.dark',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          <Box component="span" className="material-symbols-outlined" sx={{ fontSize: 22 }}>
                            account_balance
                          </Box>
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                            {o.provider}
                          </Typography>
                          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: 0.5 }}>
                            <Box sx={{
                              flex: 1, height: 5, borderRadius: 99,
                              bgcolor: 'action.hover', overflow: 'hidden', maxWidth: 220,
                            }}>
                              <Box sx={{
                                width: `${usedPct}%`, height: '100%',
                                bgcolor: usedPct >= 100 ? 'error.main' : 'accent.positiveSurface',
                              }} />
                            </Box>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                              {Math.round(usedPct)} % genutzt
                            </Typography>
                          </Stack>
                          {o.note && (
                            <Typography variant="caption" color="text.secondary" sx={{
                              display: 'block', fontStyle: 'italic', mt: 0.5, fontSize: '0.7rem',
                            }}>
                              {o.note}
                            </Typography>
                          )}
                        </Box>
                        <Box sx={{ textAlign: 'right', minWidth: 130 }}>
                          <Typography sx={{
                            fontFamily: '"Manrope", sans-serif',
                            fontWeight: 800, fontSize: '1.05rem', lineHeight: 1.1,
                          }}>
                            {fmt2(allot)} €
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                            davon {fmt2(used)} € ausgeschöpft
                          </Typography>
                        </Box>
                        <Box className="fa-actions"
                          sx={{ display: 'flex', opacity: { xs: 1, md: 0 }, transition: 'opacity 0.15s' }}>
                          <IconButton size="small" onClick={() => { setEditing(o); setDialogOpen(true); }}
                            sx={{ color: 'text.disabled', '&:hover': { color: 'text.primary' } }}>
                            <EditOutlinedIcon sx={{ fontSize: 18 }} />
                          </IconButton>
                          <IconButton size="small" onClick={() => setConfirmDelete(o)}
                            sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}>
                            <DeleteOutlineIcon sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Box>
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            )}
          </Paper>
        </Stack>
      )}

      <OrderDialog
        open={dialogOpen}
        year={year}
        initial={editing}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        onSave={handleSave}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        title="Freistellungsauftrag löschen?"
        message={confirmDelete
          ? `Eintrag „${confirmDelete.provider}" (${fmt2(confirmDelete.allotted_amount)} €, ${confirmDelete.year}) wird unwiderruflich gelöscht.`
          : ''}
        onConfirm={async () => {
          await deleteOrder(confirmDelete.id);
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </Box>
  );
}
