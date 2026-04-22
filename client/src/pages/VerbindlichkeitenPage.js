import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Box, Stack, Typography, Button, IconButton, TextField, MenuItem,
  Tabs, Tab, Dialog, DialogTitle, DialogContent, DialogActions,
  Alert, CircularProgress, Chip, Paper, LinearProgress,
  Popover, Tooltip as MuiTooltip, InputAdornment, Snackbar,
  ToggleButton, ToggleButtonGroup, FormHelperText,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CloseIcon from '@mui/icons-material/Close';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, Cell,
} from 'recharts';
import { useDebts } from '../hooks/useDebts';
import {
  buildSchedule, buildRevolvingSchedule,
  isRevolving, simulateRevolvingExtraPayment,
  getCurrentBalance, getPayoffDate,
  getTotalInterest, getPaidInterest, buildDebtChart, buildAnnualInterest,
} from '../utils/debtCalc';
import { PageHeader, SectionCard, CurrencyField, DateField, ConfirmDialog } from '../components/mui';

const TODAY = new Date();
const TODAY_KEY = `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, '0')}`;

const fmt2 = (n) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (n) => Math.round(n).toLocaleString('de-DE');
const fmtDate = (iso) => new Date(iso).toLocaleDateString('de-DE', { month: '2-digit', year: 'numeric' });
const fmtDateFull = (iso) => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

// Chart line palette — each debt gets a distinct hue from the Fiscal Gallery
// accent range (coral / amber / emerald / navy) so lines stay distinguishable
// without clashing with the editorial aesthetic.
const DEBT_COLORS = ['#ba1a1a', '#f23d5c', '#b45309', '#006c49', '#131b2e', '#76777d'];

// ─── Total summary widget ─────────────────────────────────────────────────────
// The Fiscal Gallery — editorial navy block + sidecar progress card
// (DESIGN-SYSTEM.md §2 "Primary container + gradient", reference-screens/verbindlichkeiten.html)
function TotalWidget({ debts, schedulesMap }) {
  const totalDebt     = debts.reduce((s, d) => s + (getCurrentBalance(schedulesMap[d.id] ?? [], TODAY) ?? Number(d.total_amount)), 0);
  const totalOriginal = debts.reduce((s, d) => s + Number(d.total_amount), 0);
  const totalMonthly  = debts.reduce((s, d) => s + Number(d.monthly_rate), 0);
  const totalInterest = debts.reduce((s, d) => s + getTotalInterest(schedulesMap[d.id] ?? []), 0);
  const paidPct       = totalOriginal > 0 ? Math.round(((totalOriginal - totalDebt) / totalOriginal) * 100) : 0;

  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' },
      gap: 3,
    }}>
      {/* Editorial Navy Block — Gesamtverbindlichkeiten (kompakt) */}
      <Paper sx={(t) => ({
        position: 'relative',
        overflow: 'hidden',
        bgcolor: 'primary.dark',
        color: 'primary.contrastText',
        p: { xs: 3, sm: 3.5 },
        borderRadius: 3,
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(135deg, ${t.palette.primary.dark} 0%, ${t.palette.primary.main} 100%)`,
          opacity: 0.5,
          pointerEvents: 'none',
        },
      })}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} alignItems={{ sm: 'center' }}
          justifyContent="space-between" sx={{ position: 'relative', zIndex: 1 }}>
          <Box>
            <Typography variant="overline" sx={{ color: 'primary.light', display: 'block', mb: 0.5 }}>
              Gesamtverbindlichkeiten
            </Typography>
            <Stack direction="row" alignItems="baseline" spacing={1}>
              <Typography sx={{
                fontFamily: 'headline',
                fontWeight: 900,
                letterSpacing: '-0.02em',
                lineHeight: 1,
                fontSize: { xs: '1.75rem', sm: '2rem', md: '2.25rem' },
              }}>
                − {fmt0(totalDebt)} €
              </Typography>
              <Box component="span" className="material-symbols-outlined" sx={{ fontSize: 22, color: 'error.light' }}>
                trending_down
              </Box>
            </Stack>
            <Typography variant="caption" sx={{ color: 'primary.light', mt: 0.25, display: 'block' }}>
              {paidPct}% von {fmt0(totalOriginal)} € abbezahlt · {debts.length} Kredit{debts.length !== 1 ? 'e' : ''}
            </Typography>
          </Box>

          <Stack direction="row" spacing={3}>
            {[
              { label: 'Rate / Monat',   val: totalMonthly },
              { label: 'Zinsen (Proj.)', val: totalInterest },
            ].map(({ label, val }) => (
              <Box key={label}>
                <Typography variant="caption" sx={{ color: 'primary.light', display: 'block', fontSize: '0.625rem' }}>
                  {label}
                </Typography>
                <Typography sx={{
                  fontFamily: 'headline',
                  fontWeight: 700,
                  fontSize: '1.05rem',
                  lineHeight: 1.2,
                  mt: 0.25,
                }}>
                  {fmt2(val)} €
                </Typography>
              </Box>
            ))}
          </Stack>
        </Stack>
      </Paper>

      {/* Side card — Tilgungsfortschritt (kompakt) */}
      <Paper sx={{
        bgcolor: 'background.paper',
        p: { xs: 3, sm: 3.5 },
        borderRadius: 3,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 1.5,
      }}>
        <Stack direction="row" justifyContent="space-between" alignItems="baseline">
          <Typography variant="overline" sx={{ color: 'text.secondary' }}>
            Tilgungsfortschritt
          </Typography>
          <Typography variant="caption" sx={{ color: 'secondary.main', fontWeight: 700 }}>
            {paidPct > 0 ? 'In Bearbeitung' : 'Noch nicht begonnen'}
          </Typography>
        </Stack>
        <Typography sx={{
          fontFamily: 'headline',
          fontWeight: 800,
          fontSize: '2rem',
          lineHeight: 1,
        }}>
          {paidPct}%
        </Typography>
        <LinearProgress
          variant="determinate"
          value={Math.min(100, paidPct)}
          color="secondary"
          sx={{ height: 8, borderRadius: 99, bgcolor: 'action.hover' }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
          {debts.length > 0
            ? `Ø ${fmt0(totalInterest / Math.max(1, debts.length))} € Zinsen pro Kredit`
            : 'Noch keine Kredite angelegt.'}
        </Typography>
      </Paper>
    </Box>
  );
}

// ─── Utilization Bar (revolving) ──────────────────────────────────────────────
function UtilizationBar({ used, limit }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  // Fiscal Gallery functional colors: coral for warning, deeper coral for critical
  const severity = pct > 80 ? 'error' : pct > 50 ? 'warning' : 'secondary';
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Typography variant="overline" sx={{ color: 'text.secondary' }}>
          Ausnutzung
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {fmt2(used)} € / {fmt2(limit)} € ({pct}%)
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={pct}
        color={severity}
        sx={{ height: 6, borderRadius: 99, bgcolor: 'action.hover' }}
      />
    </Box>
  );
}

// ─── Debt Card ────────────────────────────────────────────────────────────────
// The Fiscal Gallery — white card, editorial layout
// (reference-screens/verbindlichkeiten.html §"Multi-Column Grid for Liability Cards")
function DebtCard({ debt, schedule, onEdit, onDelete, onAddPayment, onSimulate }) {
  const rev = isRevolving(debt);

  const currentBalance = (() => {
    if (rev) {
      const last = schedule[schedule.length - 1];
      return last ? last.balance : Number(debt.total_amount);
    }
    return getCurrentBalance(schedule, TODAY) ?? Number(debt.total_amount);
  })();

  const payoffDate    = rev ? null : getPayoffDate(schedule);
  const paidInterest  = rev ? schedule.reduce((s, e) => s + e.zinsen, 0) : getPaidInterest(schedule, TODAY);
  const totalInterest = rev ? paidInterest : getTotalInterest(schedule);
  const pct           = Number(debt.total_amount) > 0
    ? Math.round(((Number(debt.total_amount) - currentBalance) / Number(debt.total_amount)) * 100)
    : 100;
  const monthlyInterest = currentBalance * (Number(debt.interest_rate) / 100 / 12);
  const paidCount = rev ? null : schedule.filter((e) => new Date(e.date) <= TODAY).length;
  const totalCount = rev ? null : schedule.length;

  const currentEntry = rev
    ? schedule.find((e) => e.isCurrent) ?? schedule[schedule.length - 1]
    : null;
  const minRateNext = currentEntry?.minRateNext ?? Math.max(currentBalance * 0.02, 50);

  return (
    <Paper sx={{
      bgcolor: 'background.paper',
      borderRadius: 3,
      p: { xs: 3, sm: 4 },
      transition: (t) => `box-shadow ${t.transitions.duration.standard}ms`,
      '&:hover': { boxShadow: '0 20px 40px -15px rgba(11, 28, 48, 0.06)' },
    }}>
      {/* Header: Icon + Name/Ref + Zinssatz-Chip + Actions */}
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 4 }}>
        <Stack direction="row" alignItems="center" spacing={2} sx={{ minWidth: 0 }}>
          <Box sx={{
            width: 48, height: 48,
            bgcolor: 'surface.highest',
            borderRadius: 2,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Box
              component="span"
              className="material-symbols-outlined"
              sx={{ fontSize: 24, color: 'text.primary' }}
            >
              {rev ? 'credit_card' : 'account_balance'}
            </Box>
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem' }}>
              {debt.name}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: '0.02em' }}>
              {rev ? 'Rahmenkredit' : 'Ratenkredit'} · seit {fmtDate(debt.start_date)}
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
          <Chip
            label={`${fmt2(debt.interest_rate)} % p.a.`}
            size="small"
            color="success"
          />
          <IconButton size="small" onClick={() => onEdit(debt)} title="Bearbeiten">
            <EditOutlinedIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" color="error" onClick={() => onDelete(debt.id)} title="Löschen">
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Stack>

      {/* Open balance — editorial display */}
      <Box sx={{ mb: 5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
          Offener Betrag
        </Typography>
        <Typography variant="h3" sx={{
          fontWeight: 900,
          letterSpacing: '-0.02em',
        }}>
          {fmt2(currentBalance)} €
        </Typography>
      </Box>

      {/* Progress area */}
      <Stack spacing={3} sx={{ mb: 5 }}>
        <Box>
          <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {rev
                ? 'Ausnutzung'
                : `Fortschritt (${paidCount} von ${totalCount} Raten)`}
            </Typography>
            <Typography variant="caption">
              {rev
                ? `Limit ${fmt0(Number(debt.credit_limit) || 0)} €`
                : `${fmt0(debt.total_amount)} € Initial`}
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, pct)}
            color="secondary"
            sx={{ height: 8, borderRadius: 99, bgcolor: 'action.hover' }}
          />
        </Box>

        {/* KPI-Grid — 2 surface-low boxes */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 3 }}>
          {(rev ? [
            { label: 'Zinsen diesen Monat',     val: fmt2(currentEntry?.zinsen ?? monthlyInterest) + ' €', accent: true },
            { label: 'Mindestrate nächst. Mon.', val: fmt2(minRateNext) + ' €' },
          ] : [
            { label: 'Monatliche Rate', val: fmt2(debt.monthly_rate) + ' €' },
            { label: 'Gezahlte Zinsen', val: fmt2(paidInterest) + ' €', accent: true },
          ]).map(({ label, val, accent }) => (
            <Box key={label} sx={{
              bgcolor: 'surface.low',
              borderRadius: 2,
              p: 2,
            }}>
              <Typography variant="overline" sx={{
                display: 'block',
                fontSize: '0.625rem',
                color: 'text.secondary',
                fontWeight: 700,
                letterSpacing: '0.08em',
                mb: 0.5,
              }}>
                {label}
              </Typography>
              <Typography sx={{
                fontFamily: (t) => t.typography.h6.fontFamily,
                fontWeight: 700,
                fontSize: '1.05rem',
                color: accent ? 'accent.negative' : 'text.primary',
              }}>
                {val}
              </Typography>
            </Box>
          ))}
        </Box>

        {!rev && (
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="caption" color="text.secondary">Schuldenfrei</Typography>
            <Typography variant="caption" color="secondary.main" sx={{ fontWeight: 700 }}>
              {payoffDate ? fmtDate(payoffDate) : '–'}
            </Typography>
          </Stack>
        )}
      </Stack>

      {debt.note && (
        <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic', display: 'block', mb: 2 }}>
          {debt.note}
        </Typography>
      )}

      {/* Actions: Primary gradient CTA + Secondary */}
      <Stack direction="row" spacing={1.5}>
        <Button
          fullWidth
          variant="contained"
          color="primary"
          onClick={() => onAddPayment(debt)}
          startIcon={<AddIcon />}
          sx={{ py: 1.5 }}
        >
          {rev ? 'Rückzahlung erfassen' : 'Sondertilgung'}
        </Button>
        {rev && (
          <Button
            variant="outlined"
            color="primary"
            onClick={() => onSimulate(debt)}
            title="Zinssimulation: Was spare ich bei Extrazahlung?"
            sx={{ whiteSpace: 'nowrap', px: 3 }}
          >
            Simulieren
          </Button>
        )}
      </Stack>
    </Paper>
  );
}

// ─── Revolving: Zinssimulations-Modal ────────────────────────────────────────
function RevolvingSimModal({ debt, payments, onClose }) {
  const [amount, setAmount] = useState('500');

  const sim = useMemo(() => {
    const v = parseFloat(amount);
    if (isNaN(v) || v <= 0) return null;
    return simulateRevolvingExtraPayment(debt, payments, v);
  }, [debt, payments, amount]);

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        💡 Zinssimulation
        <IconButton onClick={onClose} aria-label="Schließen"
          sx={{ position: 'absolute', right: 12, top: 12 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Was passiert, wenn du heute eine Extrazahlung tätigst?
        </Typography>
        <CurrencyField
          label="Extrazahlung heute"
          value={amount}
          onChange={(v) => setAmount(v === '' ? '' : String(v))}
          fullWidth
          inputProps={{ step: 10, min: 1 }}
          sx={{ mb: 2 }}
        />
        {sim && (
          <Stack spacing={1.5}>
            <Paper variant="outlined" sx={{ bgcolor: 'action.hover', p: 1.5 }}>
              <Typography variant="caption" sx={{
                color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', display: 'block', mb: 0.75,
              }}>
                Zinsen diesen Monat
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Ohne Zahlung</Typography>
                  <Typography sx={{ color: 'error.main', fontFamily: 'monospace', fontWeight: 700 }}>
                    {fmt2(sim.interestWithout)} €
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Mit Zahlung</Typography>
                  <Typography sx={{ color: 'success.main', fontFamily: 'monospace', fontWeight: 700 }}>
                    {fmt2(sim.interestWith)} €
                  </Typography>
                </Box>
              </Box>
            </Paper>
            <Alert severity={sim.saving > 0 ? 'success' : 'info'} variant="outlined"
              sx={{ '& .MuiAlert-message': { width: '100%' } }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="body2">Zinsersparnis diesen Monat</Typography>
                <Typography sx={{ color: 'success.main', fontFamily: 'monospace', fontWeight: 800, fontSize: '1.1rem' }}>
                  − {fmt2(sim.saving)} €
                </Typography>
              </Stack>
            </Alert>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
              <Paper variant="outlined" sx={{ bgcolor: 'action.hover', p: 1.25 }}>
                <Typography variant="caption" sx={{
                  color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', display: 'block', mb: 0.5,
                }}>
                  Neuer Saldo
                </Typography>
                <Typography sx={{ color: 'error.main', fontFamily: 'monospace', fontWeight: 700 }}>
                  − {fmt2(sim.newBalance)} €
                </Typography>
              </Paper>
              <Paper variant="outlined" sx={{ bgcolor: 'action.hover', p: 1.25 }}>
                <Typography variant="caption" sx={{
                  color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', display: 'block', mb: 0.5,
                }}>
                  Mindestrate nächster Monat
                </Typography>
                <Typography sx={{ color: 'warning.main', fontFamily: 'monospace', fontWeight: 700 }}>
                  {fmt2(sim.newMinRate)} €
                </Typography>
              </Paper>
            </Box>
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Debt Form ────────────────────────────────────────────────────────────────
const EMPTY_DEBT = {
  name: '', total_amount: '', interest_rate: '', monthly_rate: '',
  start_date: '', color_code: '#ef4444', note: '',
  debt_type: 'annuity', credit_limit: '',
};

function DebtForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial ?? EMPTY_DEBT);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }
  const isRev = form.debt_type === 'revolving';

  async function handleSubmit(e) {
    e.preventDefault();
    setErr('');
    if (!form.name.trim())              { setErr('Name fehlt.'); return; }
    if (!form.total_amount)             { setErr('Aktueller Saldo / Darlehensbetrag fehlt.'); return; }
    if (!form.interest_rate)            { setErr('Zinssatz fehlt.'); return; }
    if (!isRev && !form.monthly_rate)   { setErr('Monatsrate fehlt.'); return; }
    if (!form.start_date)               { setErr('Startdatum fehlt.'); return; }
    setSaving(true);
    try { await onSave(form); }
    catch (ex) { setErr(ex.message); }
    finally { setSaving(false); }
  }

  return (
    <SectionCard
      title={
        <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700 }}>
          {initial ? 'Kredit bearbeiten' : 'Neuer Kredit'}
        </Typography>
      }
    >
      <Box component="form" onSubmit={handleSubmit}>
        <Stack spacing={1.5}>
          {/* Name + Kreditart + Farbe */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr 1fr' }, gap: 1.5 }}>
            <TextField label="Bezeichnung" size="small" fullWidth value={form.name}
              onChange={(e) => set('name', e.target.value)} placeholder="ING Rahmenkredit…" />
            <TextField select label="Kreditart" size="small" fullWidth value={form.debt_type}
              onChange={(e) => set('debt_type', e.target.value)}>
              <MenuItem value="annuity">Fixer Ratenkredit</MenuItem>
              <MenuItem value="revolving">Rahmenkredit</MenuItem>
            </TextField>
            <Box>
              <Typography variant="caption" sx={{
                display: 'block', color: 'text.secondary', fontWeight: 600, mb: 0.5, fontSize: '0.7rem',
              }}>
                Farbe
              </Typography>
              <Stack direction="row" spacing={0.75} alignItems="center">
                {DEBT_COLORS.map((c) => (
                  <Box
                    key={c}
                    component="button"
                    type="button"
                    aria-label={`Farbe ${c}`}
                    onClick={() => set('color_code', c)}
                    sx={{
                      width: 24, height: 24, borderRadius: '50%',
                      backgroundColor: c,
                      border: 'none', cursor: 'pointer',
                      outline: form.color_code === c ? `3px solid ${c}` : 'none',
                      outlineOffset: 2,
                      transform: form.color_code === c ? 'scale(1.2)' : 'scale(1)',
                      transition: 'transform 0.15s',
                    }}
                  />
                ))}
                <input
                  type="color"
                  value={form.color_code}
                  onChange={(e) => set('color_code', e.target.value)}
                  style={{ width: 24, height: 24, padding: 0, border: 'none', borderRadius: '50%', cursor: 'pointer' }}
                />
              </Stack>
            </Box>
          </Box>

          {/* Numeric fields — conditional */}
          {isRev ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 1.5 }}>
              <CurrencyField label="Aktueller Saldo" value={form.total_amount}
                onChange={(v) => set('total_amount', v === '' ? '' : v)} fullWidth />
              <CurrencyField label="Kreditrahmen" value={form.credit_limit}
                onChange={(v) => set('credit_limit', v === '' ? '' : v)} fullWidth />
              <CurrencyField label="Zinssatz p.a." adornment="%" decimals={3}
                value={form.interest_rate}
                onChange={(v) => set('interest_rate', v === '' ? '' : v)}
                inputProps={{ step: 0.001, min: 0 }} fullWidth />
            </Box>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 1.5 }}>
              <CurrencyField label="Darlehensbetrag" value={form.total_amount}
                onChange={(v) => set('total_amount', v === '' ? '' : v)} fullWidth />
              <CurrencyField label="Zinssatz p.a." adornment="%" decimals={3}
                value={form.interest_rate}
                onChange={(v) => set('interest_rate', v === '' ? '' : v)}
                inputProps={{ step: 0.001, min: 0 }} fullWidth />
              <CurrencyField label="Monatsrate" value={form.monthly_rate}
                onChange={(v) => set('monthly_rate', v === '' ? '' : v)} fullWidth />
              <DateField label="Erste Rate am" value={form.start_date}
                onChange={(v) => set('start_date', v)} />
            </Box>
          )}

          {isRev && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 3fr' }, gap: 1.5 }}>
              <DateField label="Valutadatum" value={form.start_date}
                onChange={(v) => set('start_date', v)} />
              <Alert severity="error" variant="outlined" sx={{ alignSelf: 'flex-end', py: 0.5 }}>
                Zinsen werden tagesgenau berechnet. Mindestrate = MAX(2% des Saldos, 50 €).
              </Alert>
            </Box>
          )}

          <TextField label="Notiz (optional)" size="small" fullWidth value={form.note}
            onChange={(e) => set('note', e.target.value)} placeholder="z.B. ING Rahmenkredit" />

          {err && <Alert severity="error">{err}</Alert>}

          <Stack direction="row" spacing={1} justifyContent="flex-end">
            {onCancel && <Button onClick={onCancel} color="inherit">Abbrechen</Button>}
            <Button type="submit" variant="contained" disabled={saving}
              startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <AddIcon />}>
              {saving ? 'Speichern…' : initial ? 'Aktualisieren' : 'Kredit hinzufügen'}
            </Button>
          </Stack>
        </Stack>
      </Box>
    </SectionCard>
  );
}

// ─── Extra payment / Withdrawal modal ─────────────────────────────────────────
// Für Rahmenkredite (revolving) unterstützt das Modal zwei Buchungstypen:
//   - repayment  (Tilgung)  → senkt Saldo (Default)
//   - withdrawal (Entnahme) → erhöht Saldo, max. bis credit_limit
// Für Annuitätskredite ist der Typ immer 'repayment' (ToggleGroup wird ausgeblendet).
function ExtraPaymentModal({ debts, schedulesMap, preselected, editPayment, onSave, onUpdate, onClose }) {
  const isEdit = !!editPayment;
  const [debtId, setDebtId] = useState(editPayment?.debt_id ?? preselected?.id ?? debts[0]?.id ?? '');
  const [type,   setType]   = useState(editPayment?.type    ?? 'repayment');
  const [date,   setDate]   = useState(editPayment?.date    ?? TODAY.toISOString().split('T')[0]);
  const [amount, setAmount] = useState(editPayment?.amount != null ? String(editPayment.amount) : '');
  const [note,   setNote]   = useState(editPayment?.note    ?? '');
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  const selectedDebt = debts.find((d) => d.id === debtId);
  const rev          = selectedDebt ? isRevolving(selectedDebt) : false;
  const creditLimit  = rev && selectedDebt?.credit_limit ? Number(selectedDebt.credit_limit) : null;

  // Aktueller Saldo für Validierung der Entnahme (letzter Schedule-Eintrag).
  const currentBalance = (() => {
    if (!rev || !selectedDebt) return 0;
    const sched = schedulesMap?.[selectedDebt.id] ?? [];
    const last  = sched[sched.length - 1];
    return last ? Number(last.balance) : Number(selectedDebt.total_amount || 0);
  })();

  // Validierung Entnahme: (Saldo + Entnahme) darf Kreditrahmen nicht überschreiten.
  const parsedAmount    = parseFloat(amount);
  const hasAmount       = !isNaN(parsedAmount) && parsedAmount > 0;
  const wouldOverLimit  = type === 'withdrawal'
    && creditLimit != null
    && hasAmount
    && (currentBalance + parsedAmount) > creditLimit + 0.005;
  const amountError     = wouldOverLimit
    ? `Entnahme würde den Kreditrahmen von ${fmt2(creditLimit)} € überschreiten (aktuell ${fmt2(currentBalance)} € genutzt).`
    : '';

  async function handleSubmit(e) {
    e.preventDefault();
    setErr('');
    if (!isEdit && !debtId)           { setErr('Kredit wählen.');       return; }
    if (!hasAmount)                    { setErr('Ungültiger Betrag.');    return; }
    if (wouldOverLimit)                { setErr(amountError);             return; }
    setSaving(true);
    try {
      if (isEdit) {
        await onUpdate(editPayment.id, { date, amount: parsedAmount, note, type });
      } else {
        await onSave({ debt_id: debtId, date, amount: parsedAmount, note, type });
      }
      onClose();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setSaving(false);
    }
  }

  const titleLabel = rev
    ? (type === 'withdrawal' ? 'Geldentnahme' : 'Rückzahlung')
    : 'Sondertilgung';

  const submitLabel = isEdit
    ? 'Änderungen speichern'
    : rev && type === 'withdrawal' ? 'Entnahme buchen'
    : rev                          ? 'Rückzahlung buchen'
    : 'Sondertilgung buchen';

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth component="form" onSubmit={handleSubmit}>
      <DialogTitle sx={{ pr: 6 }}>
        {isEdit ? `${titleLabel} bearbeiten` : titleLabel}
        <IconButton onClick={onClose} aria-label="Schließen"
          sx={{ position: 'absolute', right: 12, top: 12 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {!isEdit && !rev && (
          <Alert severity="error" variant="outlined" sx={{ mb: 2 }}>
            Sondertilgungen reduzieren die Restschuld sofort und verkürzen die Laufzeit.
          </Alert>
        )}
        <Stack spacing={1.5}>
          {!isEdit && (
            <Box>
              <Typography variant="caption" sx={{
                display: 'block', color: 'text.secondary', fontWeight: 600, mb: 0.5,
              }}>
                Kredit
              </Typography>
              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                {debts.map((d) => (
                  <Chip
                    key={d.id}
                    label={d.name}
                    size="small"
                    onClick={() => setDebtId(d.id)}
                    sx={{
                      bgcolor: debtId === d.id ? d.color_code : 'transparent',
                      color: debtId === d.id ? '#fff' : 'text.secondary',
                      border: 2,
                      borderColor: debtId === d.id ? d.color_code : 'divider',
                      fontWeight: 600,
                      '&:hover': { bgcolor: debtId === d.id ? d.color_code : 'action.hover' },
                    }}
                  />
                ))}
              </Stack>
            </Box>
          )}

          {/* ToggleButtonGroup nur für Rahmenkredite — Default 'repayment' */}
          {rev && (
            <Box>
              <Typography variant="caption" sx={{
                display: 'block', color: 'text.secondary', fontWeight: 600, mb: 0.5,
              }}>
                Buchungstyp
              </Typography>
              <ToggleButtonGroup
                exclusive
                fullWidth
                size="small"
                color="primary"
                value={type}
                onChange={(_, v) => v && setType(v)}
              >
                <ToggleButton value="repayment">Tilgung</ToggleButton>
                <ToggleButton value="withdrawal" sx={{
                  '&.Mui-selected': {
                    bgcolor: 'error.main',
                    color: 'error.contrastText',
                    '&:hover': { bgcolor: 'error.dark' },
                  },
                }}>
                  Entnahme
                </ToggleButton>
              </ToggleButtonGroup>
              {creditLimit != null && type === 'withdrawal' && (
                <FormHelperText sx={{ mt: 0.75, ml: 0 }}>
                  Kreditrahmen: {fmt2(creditLimit)} € · aktuell genutzt: {fmt2(currentBalance)} €
                  {' '}· verfügbar: <strong>{fmt2(Math.max(0, creditLimit - currentBalance))} €</strong>
                </FormHelperText>
              )}
            </Box>
          )}

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5 }}>
            <DateField label="Datum" value={date} onChange={(v) => setDate(v)} />
            <CurrencyField
              label="Betrag"
              value={amount}
              onChange={(v) => setAmount(v === '' ? '' : String(v))}
              fullWidth
              error={!!amountError}
              helperText={amountError || ' '}
              inputProps={{ step: 0.01, min: 0.01 }}
            />
          </Box>
          <TextField label="Notiz (optional)" size="small" fullWidth value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={type === 'withdrawal' ? 'z.B. Möbelkauf' : 'z.B. Bonuszahlung'} />
          {err && <Alert severity="error">{err}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit" disabled={saving}>Abbrechen</Button>
        <Button
          type="submit"
          variant="contained"
          color={type === 'withdrawal' ? 'error' : 'primary'}
          disabled={saving || wouldOverLimit}
          startIcon={saving ? <CircularProgress size={14} color="inherit" /> : null}
        >
          {saving ? 'Speichern…' : submitLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Initial-Interest-Override Popover ───────────────────────────────────────
// Inline-Edit für den Zins-Override der ERSTEN Rate im Tilgungsplan.
// - `anchorEl`   : DOM-Knoten der Zins-Zelle (für Popover-Positionierung)
// - `debt`       : Kredit (liest `initial_interest_override`)
// - `defaultValue` : aktueller Standard-Zinsbetrag (berechnet) als Vorschlag
// - `onSave(value)` : speichert Override (null = Reset)
function InitialInterestOverridePopover({ anchorEl, open, debt, defaultValue, onClose, onSave, onError }) {
  const currentOverride = debt?.initial_interest_override;
  const hasOverride     = currentOverride != null && currentOverride !== '';

  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);

  // Init beim Öffnen — bestehenden Override oder errechneten Standard-Zins als Vorschlag
  useEffect(() => {
    if (!open) return;
    setInput(
      hasOverride
        ? String(currentOverride)
        : (defaultValue != null ? String(Math.round(defaultValue * 100) / 100) : '')
    );
  }, [open, currentOverride, defaultValue, hasOverride]);

  const monthlyRate = Number(debt?.monthly_rate || 0);
  const parsed = input === '' ? null : Number(input);
  const invalid = parsed != null && (isNaN(parsed) || parsed < 0 || parsed >= monthlyRate);

  async function handleSave() {
    if (invalid) return;
    setSaving(true);
    try {
      await onSave(parsed);
      onClose();
    } catch (ex) {
      onError?.(ex.message || 'Override konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setSaving(true);
    try {
      await onSave(null);
      onClose();
    } catch (ex) {
      onError?.(ex.message || 'Reset fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={saving ? undefined : onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      transformOrigin={{ vertical: 'top',    horizontal: 'center' }}
      slotProps={{ paper: { sx: { p: 2, minWidth: 300, maxWidth: 340 } } }}
    >
      <Stack spacing={1.25}>
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Zinsbetrag erste Rate überschreiben
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Banken buchen die 1. Rate oft mit abweichendem Zins (kürzerer Zeitraum).
            Der Restplan läuft ab Monat 2 mit dem neuen Restdarlehen weiter.
          </Typography>
        </Box>

        <TextField
          label="Zinsbetrag Override"
          size="small"
          fullWidth
          type="number"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          inputProps={{ step: '0.01', min: 0, max: monthlyRate, style: { fontFamily: 'monospace' } }}
          InputProps={{
            endAdornment: <InputAdornment position="end">€</InputAdornment>,
          }}
          error={invalid}
          helperText={
            invalid
              ? `Muss zwischen 0 und ${fmt2(monthlyRate)} € liegen`
              : defaultValue != null
                ? `Standard (berechnet): ${fmt2(defaultValue)} €`
                : ' '
          }
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !invalid && !saving) handleSave();
            if (e.key === 'Escape' && !saving) onClose();
          }}
        />

        <Stack direction="row" spacing={1} justifyContent="flex-end">
          {hasOverride && (
            <Button
              size="small"
              color="inherit"
              onClick={handleReset}
              disabled={saving}
              title="Override entfernen — zurück zur Standard-Berechnung"
            >
              Reset
            </Button>
          )}
          <Button size="small" color="inherit" onClick={onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button
            size="small"
            variant="contained"
            onClick={handleSave}
            disabled={saving || invalid || parsed == null}
            startIcon={saving ? <CircularProgress size={12} color="inherit" /> : null}
          >
            Speichern
          </Button>
        </Stack>
      </Stack>
    </Popover>
  );
}

// ─── Tilgungsplan Tab ─────────────────────────────────────────────────────────
function TilgungsplanTab({ debts, payments, schedulesMap, onAddPayment, onEditPayment, onDeletePayment, onSetOverride, onError }) {
  const theme = useTheme();
  const [selectedDebtId, setSelectedDebtId] = useState(debts[0]?.id ?? null);
  const debt     = debts.find((d) => d.id === selectedDebtId);
  const schedule = debt ? schedulesMap[debt.id] ?? [] : [];
  const debtPayments = payments.filter((p) => p.debt_id === selectedDebtId);

  const todayBg = theme.palette.mode === 'dark' ? 'rgba(245,158,11,0.15)' : '#fef3c7';

  // ── Initial-Interest-Override Popover State ─────────────────────────────
  // Override gilt nur für Annuitätskredite (nicht revolving).
  const isAnnuity   = debt && !isRevolving(debt);
  const firstEntry  = schedule[0] ?? null;
  const overrideRef = useRef(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  // Erwarteter Standard-Zins der ersten Rate (für Popover-Default).
  // Wenn ein Override aktiv ist, rekonstruieren wir den theoretischen Zins
  // aus Ausgangssaldo × monatsrate, sonst lesen wir ihn direkt aus schedule[0].
  const defaultInterest = useMemo(() => {
    if (!debt || !firstEntry) return null;
    if (debt.initial_interest_override != null) {
      const balanceBefore = Number(debt.total_amount);
      const monthlyRate   = Number(debt.interest_rate) / 100 / 12;
      return Math.round(balanceBefore * monthlyRate * 100) / 100;
    }
    return firstEntry.zinsen;
  }, [debt, firstEntry]);

  async function handleSaveOverride(value) {
    if (!debt || !onSetOverride) return;
    await onSetOverride(debt.id, value);
  }

  if (debts.length === 0) {
    return (
      <SectionCard>
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
          Noch keine Kredite erfasst.
        </Typography>
      </SectionCard>
    );
  }

  return (
    <Stack spacing={2}>
      {/* Debt selector */}
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {debts.map((d) => (
          <Chip
            key={d.id}
            label={d.name}
            onClick={() => setSelectedDebtId(d.id)}
            sx={{
              bgcolor: selectedDebtId === d.id ? d.color_code : 'transparent',
              color: selectedDebtId === d.id ? '#fff' : 'text.secondary',
              border: 2,
              borderColor: selectedDebtId === d.id ? d.color_code : 'divider',
              fontWeight: 600,
              '&:hover': { bgcolor: selectedDebtId === d.id ? d.color_code : 'action.hover' },
            }}
          />
        ))}
      </Stack>

      {/* Buchungen (Tilgungen + Entnahmen) */}
      {debtPayments.length > 0 && (() => {
        const totalRepayments  = debtPayments
          .filter((p) => (p.type || 'repayment') === 'repayment')
          .reduce((s, p) => s + Number(p.amount), 0);
        const totalWithdrawals = debtPayments
          .filter((p) => p.type === 'withdrawal')
          .reduce((s, p) => s + Number(p.amount), 0);
        const hasWithdrawals = totalWithdrawals > 0;
        return (
          <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center"
              sx={{ p: '10px 14px', borderBottom: 1, borderColor: 'divider' }}>
              <Typography variant="overline" sx={{
                color: 'text.secondary', fontWeight: 700, letterSpacing: '0.08em',
              }}>
                Buchungen ({debtPayments.length})
              </Typography>
              <Stack direction="row" spacing={2}>
                <Typography variant="body2" sx={{ color: 'success.main', fontWeight: 700, fontFamily: 'monospace' }}>
                  − {fmt2(totalRepayments)} € Tilgung
                </Typography>
                {hasWithdrawals && (
                  <Typography variant="body2" sx={{ color: 'error.main', fontWeight: 700, fontFamily: 'monospace' }}>
                    + {fmt2(totalWithdrawals)} € Entnahme
                  </Typography>
                )}
              </Stack>
            </Stack>
            <Stack>
              {debtPayments
                .slice()
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .map((p) => {
                  const isWithdrawal = p.type === 'withdrawal';
                  return (
                    <Stack key={p.id} direction="row" alignItems="center" spacing={1.25}
                      sx={{ p: '9px 14px', borderBottom: 1, borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', minWidth: 88 }}>
                        {fmtDateFull(p.date)}
                      </Typography>
                      <Chip
                        size="small"
                        label={isWithdrawal ? 'Entnahme' : 'Tilgung'}
                        color={isWithdrawal ? 'error' : 'success'}
                        variant="outlined"
                        sx={{ minWidth: 88, fontWeight: 600 }}
                      />
                      <Typography variant="body2" sx={{
                        color: isWithdrawal ? 'error.main' : 'success.main',
                        fontWeight: 700, fontFamily: 'monospace', minWidth: 90,
                      }}>
                        {isWithdrawal ? '+' : '−'} {fmt2(p.amount)} €
                      </Typography>
                      <Typography variant="caption" sx={{
                        color: 'text.secondary', flex: 1,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {p.note || ''}
                      </Typography>
                      <IconButton size="small" onClick={() => onEditPayment(p)} title="Bearbeiten">
                        <EditOutlinedIcon fontSize="inherit" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => onDeletePayment(p.id)} title="Löschen">
                        <DeleteOutlineIcon fontSize="inherit" />
                      </IconButton>
                    </Stack>
                  );
                })}
            </Stack>
          </Paper>
        );
      })()}

      <Button
        variant="contained"
        color="error"
        onClick={() => onAddPayment(debt)}
        startIcon={<AddIcon />}
        sx={{ alignSelf: 'flex-end' }}
      >
        Sondertilgung
      </Button>

      {/* Amortization table */}
      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <Box sx={{ overflow: 'auto', maxHeight: 480 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Monat', 'Rate (€)', 'Zinsen (€)', 'Tilgung (€)', 'Sondertilgung (€)', 'Restschuld (€)'].map((h, i) => (
                  <th key={h} style={{
                    background: theme.palette.action.hover,
                    color: theme.palette.text.secondary,
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    padding: '8px 12px',
                    textAlign: i === 0 ? 'left' : 'right',
                    whiteSpace: 'nowrap',
                    position: 'sticky',
                    top: 0,
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schedule.map((entry, i) => {
                const isToday = entry.monthKey === TODAY_KEY;
                const isPast  = entry.monthKey < TODAY_KEY;
                const isFirst = i === 0 && isAnnuity;
                const rowBg   = isToday ? todayBg : (i % 2 === 1 ? theme.palette.action.hover : 'transparent');
                return (
                  <tr
                    key={entry.monthKey}
                    className={isFirst ? 'tilgungsplan-first-row' : undefined}
                    style={{ background: rowBg, opacity: isPast && !isToday ? 0.55 : 1 }}
                  >
                    <td style={{ padding: '8px 12px', textAlign: 'left', whiteSpace: 'nowrap' }}>
                      <span style={{
                        color: isToday ? theme.palette.warning.main : theme.palette.text.primary,
                        fontWeight: isToday ? 700 : 400,
                        fontSize: '0.82rem',
                      }}>
                        {isToday ? '► ' : ''}{fmtDate(entry.date)}
                      </span>
                    </td>
                    <td style={{
                      padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.82rem',
                      color: theme.palette.text.secondary,
                    }}>
                      {entry.balance === 0 && entry.tilgung === 0 ? '–' : fmt2(Number(debt.monthly_rate))}
                    </td>
                    {/* Zins-Zelle: bei erster Zeile mit Hover-Edit-Icon */}
                    <td
                      ref={isFirst ? overrideRef : undefined}
                      style={{
                        padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.82rem',
                        color: theme.palette.error.main,
                        position: 'relative',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <Box
                        sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 0.5,
                          // Hover-Edit-Icon nur bei erster Zeile sichtbar machen
                          ...(isFirst && {
                            '& .override-edit-btn': { opacity: entry.isOverridden ? 1 : 0, transition: 'opacity 0.15s' },
                            '&:hover .override-edit-btn': { opacity: 1 },
                          }),
                        }}
                      >
                        {fmt2(entry.zinsen)}
                        {isFirst && entry.isOverridden && (
                          <MuiTooltip title="Override aktiv — Standard-Zins überschrieben" arrow>
                            <Chip
                              label="OR"
                              size="small"
                              color="warning"
                              sx={{ height: 16, fontSize: '0.55rem', fontWeight: 700, ml: 0.5 }}
                            />
                          </MuiTooltip>
                        )}
                        {isFirst && (
                          <MuiTooltip title="Zinsbetrag der ersten Rate überschreiben" arrow>
                            <IconButton
                              size="small"
                              className="override-edit-btn"
                              onClick={() => setOverrideOpen(true)}
                              sx={{ p: 0.25, ml: 0.25 }}
                            >
                              <EditOutlinedIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </MuiTooltip>
                        )}
                      </Box>
                    </td>
                    <td style={{
                      padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.82rem',
                      color: theme.palette.success.main,
                    }}>
                      {fmt2(entry.tilgung)}
                    </td>
                    <td style={{
                      padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.82rem',
                      color: theme.palette.warning.main,
                    }}>
                      {entry.extra > 0 ? `− ${fmt2(entry.extra)}` : ''}
                    </td>
                    <td style={{
                      padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.85rem',
                      fontWeight: 600,
                      color: entry.balance === 0 ? theme.palette.success.main : theme.palette.text.primary,
                    }}>
                      {entry.balance === 0 ? '✓ Abbezahlt' : fmt2(entry.balance)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Box>
        <Stack direction="row" spacing={0.5}
          sx={{ p: '8px 12px', borderTop: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
          <Typography variant="caption" color="text.secondary">
            {schedule.length} Monate Laufzeit gesamt ·
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Gesamtzinsen: {fmt2(getTotalInterest(schedule))} €
          </Typography>
        </Stack>
      </Paper>

      {/* Override-Popover: steuert Zinsbetrag der ersten Rate */}
      {isAnnuity && debt && (
        <InitialInterestOverridePopover
          anchorEl={overrideRef.current}
          open={overrideOpen}
          debt={debt}
          defaultValue={defaultInterest}
          onClose={() => setOverrideOpen(false)}
          onSave={handleSaveOverride}
          onError={onError}
        />
      )}
    </Stack>
  );
}

// ─── Zins-Analyse Tab ─────────────────────────────────────────────────────────
function ZinsAnalyseTab({ debts, schedulesMap }) {
  const theme = useTheme();
  const chartData = useMemo(() => buildDebtChart(debts, schedulesMap, TODAY), [debts, schedulesMap]);
  const todayYear = String(TODAY.getFullYear());

  const annualByDebt = useMemo(() =>
    Object.fromEntries(debts.map((d) => [d.id, buildAnnualInterest(schedulesMap[d.id] ?? [])])),
    [debts, schedulesMap]
  );

  const allYears = useMemo(() => {
    const yset = new Set();
    debts.forEach((d) => (annualByDebt[d.id] ?? []).forEach((r) => yset.add(r.year)));
    return [...yset].sort();
  }, [debts, annualByDebt]);

  const interestChartData = useMemo(() => allYears.map((year) => {
    const row = { year };
    debts.forEach((d) => {
      const entry = (annualByDebt[d.id] ?? []).find((r) => r.year === year);
      row[d.id] = entry?.zinsen ?? 0;
    });
    row.total = debts.reduce((s, d) => s + (row[d.id] ?? 0), 0);
    return row;
  }), [allYears, debts, annualByDebt]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <Box sx={{
        bgcolor: 'background.paper', border: 1, borderColor: 'divider',
        borderRadius: 1.25, p: '10px 14px', minWidth: 160,
      }}>
        <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.75 }}>{label}</Typography>
        {payload.map((p) => (
          <Typography key={p.dataKey} variant="caption" sx={{ display: 'block', color: p.color }}>
            {p.name}: {fmt0(p.value)} €
          </Typography>
        ))}
      </Box>
    );
  };

  if (debts.length === 0) {
    return (
      <SectionCard>
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
          Noch keine Kredite erfasst.
        </Typography>
      </SectionCard>
    );
  }

  const totalPaid      = debts.reduce((s, d) => s + getPaidInterest(schedulesMap[d.id] ?? [], TODAY), 0);
  const totalRemaining = debts.reduce((s, d) => s + (getTotalInterest(schedulesMap[d.id] ?? []) - getPaidInterest(schedulesMap[d.id] ?? [], TODAY)), 0);

  return (
    <Stack spacing={2.5}>
      {/* KPI row */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
        {[
          { label: 'Zinsen bereits gezahlt', val: `${fmt0(totalPaid)} €`,                 color: 'accent.negative' },
          { label: 'Zinsen noch offen',      val: `${fmt0(totalRemaining)} €`,             color: 'warning.main' },
          { label: 'Gesamtzinslast',         val: `${fmt0(totalPaid + totalRemaining)} €`, color: 'error.main' },
        ].map(({ label, val, color }) => (
          <Paper key={label} sx={{ borderRadius: 3, p: 3, textAlign: 'center', bgcolor: 'surface.low' }}>
            <Typography variant="overline" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
              {label}
            </Typography>
            <Typography variant="h5" sx={{ color, fontWeight: 800 }}>
              {val}
            </Typography>
          </Paper>
        ))}
      </Box>

      {/* Restschuldverlauf */}
      <SectionCard
        title={
          <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700 }}>
            Restschuldverlauf (alle Kredite)
          </Typography>
        }
      >
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.palette.divider} />
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
              axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
              axisLine={false} tickLine={false} width={60}
              tickFormatter={(v) => `${fmt0(v / 1000)}k`} />
            <Tooltip content={<CustomTooltip />} formatter={(v) => [`${fmt2(v)} €`]} />
            <ReferenceLine x={todayYear} stroke={theme.palette.warning.main} strokeDasharray="4 3"
              label={{ value: 'Heute', fill: theme.palette.warning.main, fontSize: 11 }} />
            {debts.map((d) => (
              <Line key={d.id} type="monotone" dataKey={d.id} name={d.name}
                stroke={d.color_code} strokeWidth={2} dot={false} />
            ))}
            <Line type="monotone" dataKey="total" name="Gesamt"
              stroke={theme.palette.primary.main} strokeWidth={3} dot={false} strokeDasharray="5 3" />
            <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
          </LineChart>
        </ResponsiveContainer>
      </SectionCard>

      {/* Annual interest bar chart */}
      <SectionCard
        title={
          <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700 }}>
            Zinszahlungen pro Jahr
          </Typography>
        }
        subheader={`Insgesamt zahlst du ${fmt0(totalPaid + totalRemaining)} € Zinsen — ${fmt0(totalRemaining)} € davon noch vor dir.`}
      >
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={interestChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.palette.divider} />
            <XAxis dataKey="year" tick={{ fontSize: 10, fill: theme.palette.text.secondary }}
              axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: theme.palette.text.secondary }}
              axisLine={false} tickLine={false} width={48} tickFormatter={(v) => `${fmt0(v)} €`} />
            <Tooltip content={<CustomTooltip />} formatter={(v) => [`${fmt2(v)} €`]} />
            {debts.map((d) => (
              <Bar key={d.id} dataKey={d.id} name={d.name} stackId="a" fill={d.color_code}>
                {interestChartData.map((entry, i) => (
                  <Cell key={i} fill={d.color_code} fillOpacity={entry.year < todayYear ? 0.4 : 1} />
                ))}
              </Bar>
            ))}
            <ReferenceLine x={todayYear} stroke={theme.palette.warning.main} strokeDasharray="4 3" />
            <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
          </BarChart>
        </ResponsiveContainer>
      </SectionCard>
    </Stack>
  );
}

// ─── VerbindlichkeitenPage ────────────────────────────────────────────────────
export default function VerbindlichkeitenPage() {
  const {
    debts, payments, loading, error,
    addDebt, updateDebt, deleteDebt,
    addPayment, updatePayment, deletePayment,
    setInitialInterestOverride,
  } = useDebts();

  const [activeTab, setActiveTab]               = useState('uebersicht');
  const [showDebtForm, setShowDebtForm]         = useState(false);
  const [editDebt, setEditDebt]                 = useState(null);
  const [paymentModal, setPaymentModal]         = useState(null);
  const [editPaymentModal, setEditPaymentModal] = useState(null);
  const [simModal, setSimModal]                 = useState(null);
  const [confirmDelete, setConfirmDelete]       = useState(null);
  const [snackbar, setSnackbar]                 = useState({ open: false, message: '' });
  const notifyError = (message) => setSnackbar({ open: true, message });

  const schedulesMap = useMemo(() => {
    return Object.fromEntries(
      debts.map((d) => {
        const debtPayments = payments.filter((p) => p.debt_id === d.id);
        const schedule = isRevolving(d)
          ? buildRevolvingSchedule(d, debtPayments)
          : buildSchedule(d, debtPayments);
        return [d.id, schedule];
      })
    );
  }, [debts, payments]);

  async function handleSaveDebt(form) {
    if (editDebt) {
      await updateDebt(editDebt.id, form);
      setEditDebt(null);
    } else {
      await addDebt(form);
    }
    setShowDebtForm(false);
  }

  async function handleConfirmDeleteDebt() {
    if (!confirmDelete) return;
    await deleteDebt(confirmDelete.id);
    setConfirmDelete(null);
  }

  if (loading) {
    return (
      <Stack alignItems="center" justifyContent="center" sx={{ minHeight: 200, color: 'text.secondary' }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <CircularProgress size={20} />
          <Typography variant="body2">Wird geladen…</Typography>
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
        title="🏦 Verbindlichkeiten"
        subtitle="Kredite & Darlehen tracken, Tilgungsplan einsehen, Zinslast analysieren."
      />

      <Stack spacing={2.5}>
        {/* Total widget */}
        {debts.length > 0 && <TotalWidget debts={debts} schedulesMap={schedulesMap} />}

        {/* Tab bar */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} textColor="error" indicatorColor="primary">
            <Tab value="uebersicht" label="Übersicht" />
            <Tab value="tilgungsplan" label="Tilgungsplan" />
            <Tab value="zinsen" label="Zins-Analyse" />
          </Tabs>
        </Box>

        {/* Übersicht */}
        {activeTab === 'uebersicht' && (
          <Stack spacing={2.5}>
            {(showDebtForm || editDebt) ? (
              <DebtForm
                initial={editDebt ? {
                  name: editDebt.name, total_amount: editDebt.total_amount,
                  interest_rate: editDebt.interest_rate, monthly_rate: editDebt.monthly_rate ?? '',
                  start_date: editDebt.start_date, color_code: editDebt.color_code,
                  note: editDebt.note, debt_type: editDebt.debt_type ?? 'annuity',
                  credit_limit: editDebt.credit_limit ?? '',
                } : null}
                onSave={handleSaveDebt}
                onCancel={() => { setShowDebtForm(false); setEditDebt(null); }}
              />
            ) : (
              <Stack direction="row" justifyContent="flex-end">
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => setShowDebtForm(true)}>
                  Kredit hinzufügen
                </Button>
              </Stack>
            )}

            {debts.length === 0 && !showDebtForm && (
              <SectionCard>
                <Box sx={{ textAlign: 'center', py: 5 }}>
                  <Typography sx={{ fontSize: '2rem', mb: 1.5 }}>🏦</Typography>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
                    Keine Kredite erfasst
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Klicke auf "Kredit hinzufügen" um loszulegen.
                  </Typography>
                </Box>
              </SectionCard>
            )}

            <Box sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 2,
            }}>
              {debts.map((d) => (
                <DebtCard
                  key={d.id} debt={d} schedule={schedulesMap[d.id] ?? []}
                  onEdit={(debt) => {
                    setEditDebt(debt);
                    setShowDebtForm(false);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  onDelete={(id) => {
                    const debt = debts.find((x) => x.id === id);
                    setConfirmDelete(debt);
                  }}
                  onAddPayment={(debt) => setPaymentModal(debt)}
                  onSimulate={(debt) => setSimModal(debt)}
                />
              ))}
            </Box>
          </Stack>
        )}

        {/* Tilgungsplan */}
        {activeTab === 'tilgungsplan' && (
          <TilgungsplanTab
            debts={debts}
            payments={payments}
            schedulesMap={schedulesMap}
            onAddPayment={(d) => setPaymentModal(d)}
            onEditPayment={(p) => setEditPaymentModal(p)}
            onDeletePayment={(id) => deletePayment(id)}
            onSetOverride={setInitialInterestOverride}
            onError={notifyError}
          />
        )}

        {/* Zins-Analyse */}
        {activeTab === 'zinsen' && (
          <ZinsAnalyseTab debts={debts} schedulesMap={schedulesMap} />
        )}
      </Stack>

      {/* Add payment modal */}
      {paymentModal !== null && (
        <ExtraPaymentModal
          debts={debts} schedulesMap={schedulesMap} preselected={paymentModal}
          onSave={addPayment} onUpdate={updatePayment}
          onClose={() => setPaymentModal(null)}
        />
      )}

      {/* Edit payment modal */}
      {editPaymentModal !== null && (
        <ExtraPaymentModal
          debts={debts} schedulesMap={schedulesMap} editPayment={editPaymentModal}
          onSave={addPayment} onUpdate={updatePayment}
          onClose={() => setEditPaymentModal(null)}
        />
      )}

      {/* Revolving simulation modal */}
      {simModal !== null && (
        <RevolvingSimModal
          debt={simModal}
          payments={payments.filter((p) => p.debt_id === simModal.id)}
          onClose={() => setSimModal(null)}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!confirmDelete}
        title="Kredit löschen?"
        message={`Der Kredit „${confirmDelete?.name ?? ''}" und alle zugehörigen Sondertilgungen werden unwiderruflich gelöscht.`}
        onConfirm={handleConfirmDeleteDebt}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* Snackbar für Override-Fehler */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ open: false, message: '' })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity="error"
          variant="filled"
          onClose={() => setSnackbar({ open: false, message: '' })}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
