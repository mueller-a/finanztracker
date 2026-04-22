import { useState, useMemo } from 'react';
import {
  Box, Stack, Typography, Button, IconButton, TextField, MenuItem,
  Tabs, Tab, Dialog, DialogTitle, DialogContent, Alert, CircularProgress,
  Chip, Paper, LinearProgress, ToggleButton, ToggleButtonGroup, Avatar,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { useSavings } from '../hooks/useSavings';
import { useETFPolicen } from '../hooks/useETFPolicen';
import { calcPolicy, calcAVD, calcDepot } from '../utils/etfCalculations';
import { PageHeader, SectionCard, CurrencyField, DateField, ConfirmDialog } from '../components/mui';

// ─── Constants ────────────────────────────────────────────────────────────────
// Data-tagging palette for assets/goals. Kept in Fiscal Gallery hues —
// variants of navy/emerald/amber/coral so all categories feel like parts
// of a single editorial system rather than a rainbow of unrelated colors.
const COLOR_PALETTE = [
  '#131b2e',  // navy (primary_container)
  '#006c49',  // emerald (secondary)
  '#b45309',  // amber
  '#ba1a1a',  // error
  '#3f465c',  // on_primary_fixed_variant
  '#f23d5c',  // on_tertiary_container
  '#00714d',  // on_secondary_container
  '#565e74',  // surface_tint
  '#92002a',  // on_tertiary_fixed_variant
  '#45464d',  // on_surface_variant
];

const KATEGORIEN = [
  { value: 'rücklagen',           label: '🏦 Rücklagen' },
  { value: 'tagesgeld',           label: '💰 Tagesgeldkonto' },
  { value: 'anleihen',            label: '📜 Anleihen / Bonds' },
  { value: 'private_investments', label: '🏢 Private Investments' },
];

const KUPON_INTERVALLE = [
  { value: 'monatlich',       label: 'Monatlich',       factor: 12 },
  { value: 'vierteljährlich', label: 'Vierteljährlich',  factor: 4  },
  { value: 'halbjährlich',    label: 'Halbjährlich',     factor: 2  },
  { value: 'jährlich',        label: 'Jährlich',         factor: 1  },
];

const MONTHS_DE = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const KAT_LABEL = { rücklagen: '🏦', tagesgeld: '💰', anleihen: '📜', private_investments: '🏢' };

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmt2 = (n) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt4 = (n) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–';

// ─── ETF projected value ──────────────────────────────────────────────────────
function getEtfProjectedValue(policy) {
  if (!policy?.params) return 0;
  try {
    let result;
    if (policy.type === 'avd')        result = calcAVD(policy.params);
    else if (policy.type === 'depot') result = calcDepot(policy.params);
    else                              result = calcPolicy(policy.params);
    if (!result?.labels?.length) return 0;
    const currentYear = new Date().getFullYear();
    const idx = result.labels.findIndex((y) => Number(y) >= currentYear);
    return idx >= 0 ? (result.nomArr?.[idx] ?? 0) : 0;
  } catch { return 0; }
}

// ─── Calc helpers ─────────────────────────────────────────────────────────────
function activeEntries(goalId, entries) {
  const forGoal = entries.filter((e) => e.goal_id === goalId);
  const neustarts = forGoal.filter((e) => e.type === 'neustart').sort((a, b) => new Date(b.date) - new Date(a.date));
  if (neustarts.length === 0) return forGoal;
  const cutoff = neustarts[0].date;
  return forGoal.filter((e) => e.date >= cutoff);
}

function goalBalance(goalId, entries) {
  return activeEntries(goalId, entries).reduce((sum, e) => {
    if (e.type === 'neustart')   return sum + Number(e.amount);
    if (e.type === 'einzahlung') return sum + Number(e.amount);
    if (e.type === 'entnahme')   return sum - Number(e.amount);
    return sum;
  }, 0);
}

function monthlyIst(goalId, entries, year, month) {
  return entries
    .filter((e) => {
      if (e.goal_id !== goalId || e.type === 'neustart') return false;
      const d = new Date(e.date);
      return d.getFullYear() === year && d.getMonth() === month;
    })
    .reduce((sum, e) => sum + (e.type === 'einzahlung' ? Number(e.amount) : -Number(e.amount)), 0);
}

function effectiveBalance(goal, entries, etfPolicies) {
  if (goal.etf_id) {
    const policy = etfPolicies.find((p) => p.id === goal.etf_id);
    return getEtfProjectedValue(policy);
  }
  return goalBalance(goal.id, entries);
}

function annualKupon(goal) {
  const base = goal.nominalwert ?? 0;
  return base > 0 && goal.kupon > 0 ? base * (goal.kupon / 100) : 0;
}

function annualZins(goal, entries) {
  const balance = goalBalance(goal.id, entries);
  return balance > 0 && goal.zinssatz > 0 ? balance * (goal.zinssatz / 100) : 0;
}

function monthsUntilMaturity(goal) {
  if (!goal.faelligkeitsdatum) return null;
  const now = new Date();
  const mat = new Date(goal.faelligkeitsdatum);
  return (mat.getFullYear() - now.getFullYear()) * 12 + (mat.getMonth() - now.getMonth());
}

// ─── Interest Preview Box ─────────────────────────────────────────────────────
function InterestPreviewBox({ goals, entries }) {
  const tagesgeldGoals = goals.filter((g) => g.kategorie === 'tagesgeld');
  const anleihenGoals  = goals.filter((g) => g.kategorie === 'anleihen');

  const annualTagesgeld = tagesgeldGoals.reduce((s, g) => s + annualZins(g, entries), 0);
  const annualAnleihen  = anleihenGoals.reduce((s, g) => s + annualKupon(g), 0);
  const totalAnnual     = annualTagesgeld + annualAnleihen;

  const nextBond = anleihenGoals
    .filter((g) => g.faelligkeitsdatum)
    .sort((a, b) => new Date(a.faelligkeitsdatum) - new Date(b.faelligkeitsdatum))
    .find((g) => (monthsUntilMaturity(g) ?? -1) >= 0);

  if (totalAnnual === 0 && !nextBond) return null;

  return (
    <Paper variant="outlined" sx={{
      borderRadius: 1,
      p: '16px 20px',
      display: 'flex',
      gap: 3,
      flexWrap: 'wrap',
      alignItems: 'center',
    }}>
      <Box>
        <Typography variant="overline" sx={{
          color: 'text.secondary', fontWeight: 700, letterSpacing: '0.1em', display: 'block', mb: 0.5,
        }}>
          Passives Einkommen p.a.
        </Typography>
        <Typography sx={{ color: 'success.main', fontWeight: 800, fontSize: '1.4rem', fontFamily: 'monospace' }}>
          {fmt2(totalAnnual)} €
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {fmt2(totalAnnual / 12)} €/Monat
        </Typography>
      </Box>

      {annualTagesgeld > 0 && (
        <Box sx={{ borderLeft: 1, borderColor: 'divider', pl: 2.5 }}>
          <Typography variant="overline" sx={{
            color: 'text.secondary', fontWeight: 700, letterSpacing: '0.08em', display: 'block', mb: 0.5,
          }}>
            💰 Tagesgeld-Zinsen
          </Typography>
          <Typography sx={{ fontWeight: 700, fontSize: '1rem', fontFamily: 'monospace' }}>
            {fmt2(annualTagesgeld)} €/Jahr
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {tagesgeldGoals.length} Konto{tagesgeldGoals.length !== 1 ? 'en' : ''}
          </Typography>
        </Box>
      )}

      {annualAnleihen > 0 && (
        <Box sx={{ borderLeft: 1, borderColor: 'divider', pl: 2.5 }}>
          <Typography variant="overline" sx={{
            color: 'text.secondary', fontWeight: 700, letterSpacing: '0.08em', display: 'block', mb: 0.5,
          }}>
            📜 Kupon-Einnahmen
          </Typography>
          <Typography sx={{ fontWeight: 700, fontSize: '1rem', fontFamily: 'monospace' }}>
            {fmt2(annualAnleihen)} €/Jahr
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {anleihenGoals.length} Anleihe{anleihenGoals.length !== 1 ? 'n' : ''}
          </Typography>
        </Box>
      )}

      {nextBond && (
        <Box sx={{ borderLeft: 1, borderColor: 'divider', pl: 2.5, ml: 'auto' }}>
          <Typography variant="overline" sx={{
            color: 'text.secondary', fontWeight: 700, letterSpacing: '0.08em', display: 'block', mb: 0.5,
          }}>
            Nächste Fälligkeit
          </Typography>
          <Typography sx={{ color: 'warning.main', fontWeight: 700, fontSize: '0.9rem' }}>{nextBond.name}</Typography>
          <Typography variant="caption" color="text.secondary">
            {fmtDate(nextBond.faelligkeitsdatum)} · in {monthsUntilMaturity(nextBond)} Monat
            {monthsUntilMaturity(nextBond) !== 1 ? 'en' : ''}
          </Typography>
        </Box>
      )}
    </Paper>
  );
}

// ─── Net Worth Widget ─────────────────────────────────────────────────────────
function TotalWidget({ goals, entries, etfPolicies }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const byKat = useMemo(() => {
    const map = {};
    KATEGORIEN.forEach(({ value }) => { map[value] = 0; });
    goals.forEach((g) => {
      map[g.kategorie ?? 'rücklagen'] = (map[g.kategorie ?? 'rücklagen'] || 0) + effectiveBalance(g, entries, etfPolicies);
    });
    return map;
  }, [goals, entries, etfPolicies]);

  const total = Object.values(byKat).reduce((s, v) => s + v, 0);

  return (
    <Paper sx={(t) => ({
      position: 'relative',
      overflow: 'hidden',
      bgcolor: 'primary.dark',
      color: 'primary.contrastText',
      borderRadius: 3,
      p: { xs: 4, sm: 5, md: 6 },
      display: 'flex',
      flexDirection: { xs: 'column', md: 'row' },
      alignItems: { xs: 'flex-start', md: 'center' },
      justifyContent: 'space-between',
      gap: 3,
      '&::before': {
        content: '""',
        position: 'absolute',
        inset: 0,
        background: `linear-gradient(135deg, ${t.palette.primary.dark} 0%, ${t.palette.primary.main} 100%)`,
        opacity: 0.5,
        pointerEvents: 'none',
      },
    })}>
      <Box sx={{ position: 'relative', zIndex: 1 }}>
        <Typography variant="overline" sx={{ color: 'primary.light', display: 'block', mb: 2 }}>
          Net Worth — Asset Manager
        </Typography>
        <Typography variant="h2" sx={{ fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1 }}>
          {fmt2(total)} €
        </Typography>
        <Typography variant="body2" sx={{ mt: 1, color: 'primary.light' }}>
          über {goals.length} Asset{goals.length !== 1 ? 's' : ''}
        </Typography>
      </Box>
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap
        sx={{ position: 'relative', zIndex: 1 }}>
        {KATEGORIEN.filter(({ value }) => byKat[value] > 0).map(({ value, label }) => (
          <Paper key={value} sx={{
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            borderRadius: 2,
            px: 2, py: 1,
          }}>
            <Typography variant="caption" sx={{ color: 'primary.light', display: 'block', mb: 0.25 }}>
              {label}
            </Typography>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {fmt2(byKat[value])} €
            </Typography>
          </Paper>
        ))}
      </Stack>
    </Paper>
  );
}

// ─── Goal Card ────────────────────────────────────────────────────────────────
function GoalCard({ goal, entries, etfPolicies, onAddEntry, onEdit, onDelete }) {
  const theme = useTheme();
  const balance      = effectiveBalance(goal, entries, etfPolicies);
  const hasTarget    = goal.target_amount != null;
  const pct          = hasTarget ? Math.min(100, Math.round((balance / goal.target_amount) * 100)) : null;
  const today        = new Date();
  const istThisMonth = monthlyIst(goal.id, entries, today.getFullYear(), today.getMonth());
  const offen        = Math.max(0, (goal.monthly_soll || 0) - istThisMonth);
  const kat          = goal.kategorie ?? 'rücklagen';
  const isAnleihe    = kat === 'anleihen';
  const isTagesgeld  = kat === 'tagesgeld';
  const isEtfLinked  = !!(goal.etf_id);
  const etfPolicy    = isEtfLinked ? etfPolicies.find((p) => p.id === goal.etf_id) : null;

  const monthsLeft     = isAnleihe ? monthsUntilMaturity(goal) : null;
  const maturityAlert  = monthsLeft !== null && monthsLeft <= 12 && monthsLeft >= 0;
  const maturityUrgent = monthsLeft !== null && monthsLeft <= 3 && monthsLeft >= 0;
  const maturityColor  = maturityUrgent ? theme.palette.error.main : maturityAlert ? theme.palette.warning.main : theme.palette.success.main;

  return (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: 1,
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.75,
        borderColor: isAnleihe && maturityAlert ? `${maturityColor}55` : 'divider',
      }}
    >
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
        <Stack direction="row" alignItems="center" spacing={1.25}>
          <Box sx={{
            width: 12, height: 12, borderRadius: '50%',
            backgroundColor: goal.color_code, flexShrink: 0, mt: 0.25,
          }} />
          <Box>
            <Stack direction="row" alignItems="center" spacing={0.75}>
              <Typography variant="body1" sx={{ fontWeight: 700 }}>{goal.name}</Typography>
              <Chip
                label={KAT_LABEL[kat]}
                size="small"
                sx={{ height: 18, fontSize: '0.6rem', bgcolor: 'action.hover' }}
              />
            </Stack>
            {hasTarget && (
              <Typography variant="caption" color="text.secondary">
                Ziel: {fmt2(goal.target_amount)} €
              </Typography>
            )}
          </Box>
        </Stack>
        <Stack direction="row" spacing={0.5}>
          <IconButton size="small" onClick={() => onEdit(goal)} title="Bearbeiten">
            <EditOutlinedIcon fontSize="inherit" />
          </IconButton>
          <IconButton size="small" color="error" onClick={() => onDelete(goal.id)} title="Löschen">
            <DeleteOutlineIcon fontSize="inherit" />
          </IconButton>
        </Stack>
      </Stack>

      {/* Balance */}
      <Box>
        <Typography sx={{ fontSize: '1.6rem', fontWeight: 800, fontFamily: 'monospace' }}>
          {fmt2(balance)} €
        </Typography>
        {isEtfLinked && (
          <Typography variant="caption" sx={{ color: 'primary.main' }}>
            📈 Projizierter Wert · {etfPolicy?.name ?? goal.etf_id}
          </Typography>
        )}
        {hasTarget && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {pct}% von {fmt2(goal.target_amount)} €
          </Typography>
        )}
      </Box>

      {/* Progress bar */}
      {hasTarget && (
        <LinearProgress
          variant="determinate"
          value={pct}
          sx={{
            height: 8, borderRadius: 99,
            bgcolor: 'action.hover',
            '& .MuiLinearProgress-bar': {
              background: `linear-gradient(90deg, ${goal.color_code}cc, ${goal.color_code})`,
            },
          }}
        />
      )}

      {/* Tagesgeld info */}
      {isTagesgeld && goal.zinssatz > 0 && (
        <Paper variant="outlined" sx={{
          bgcolor: 'rgba(16,185,129,0.08)',
          borderColor: 'rgba(16,185,129,0.3)',
          p: '8px 12px',
          display: 'flex',
          gap: 2.5,
        }}>
          <Box>
            <Typography variant="caption" sx={{
              color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block',
            }}>
              Zinssatz p.a.
            </Typography>
            <Typography sx={{ color: 'success.main', fontWeight: 700, fontSize: '0.9rem', fontFamily: 'monospace' }}>
              {fmt4(goal.zinssatz)} %
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" sx={{
              color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block',
            }}>
              Zinsen p.a.
            </Typography>
            <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', fontFamily: 'monospace' }}>
              {fmt2(annualZins(goal, entries))} €
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" sx={{
              color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block',
            }}>
              Pro Monat
            </Typography>
            <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', fontFamily: 'monospace' }}>
              {fmt2(annualZins(goal, entries) / 12)} €
            </Typography>
          </Box>
        </Paper>
      )}

      {/* Anleihen info */}
      {isAnleihe && (
        <Paper
          variant="outlined"
          sx={{
            bgcolor: maturityAlert ? `${maturityColor}10` : 'action.hover',
            borderColor: maturityAlert ? `${maturityColor}40` : 'divider',
            p: '10px 12px',
          }}
        >
          <Box sx={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.25,
            mb: goal.faelligkeitsdatum ? 1 : 0,
          }}>
            {[
              { label: 'Nominalwert', val: goal.nominalwert ? fmt2(goal.nominalwert) + ' €' : '–', color: 'text.primary' },
              { label: 'Kupon p.a.', val: goal.kupon ? fmt4(goal.kupon) + ' %' : '–', color: 'warning.main' },
              { label: 'Kupon p.a. (€)', val: goal.kupon && goal.nominalwert ? fmt2(annualKupon(goal)) + ' €' : '–', color: 'text.primary' },
            ].map(({ label, val, color }) => (
              <Box key={label}>
                <Typography variant="caption" sx={{
                  color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block',
                }}>
                  {label}
                </Typography>
                <Typography sx={{ color, fontWeight: 700, fontSize: '0.85rem', fontFamily: 'monospace' }}>
                  {val}
                </Typography>
              </Box>
            ))}
          </Box>
          {goal.faelligkeitsdatum && (
            <Stack direction="row" alignItems="center" spacing={1} sx={{ pt: 1, borderTop: 1, borderColor: 'divider' }}>
              <Typography>{maturityUrgent ? '🔴' : maturityAlert ? '🟠' : '🟢'}</Typography>
              <Typography variant="caption" sx={{ color: maturityColor, fontWeight: 700 }}>
                Fälligkeit: {fmtDate(goal.faelligkeitsdatum)}
              </Typography>
              {monthsLeft !== null && monthsLeft >= 0 && (
                <Typography variant="caption" color="text.secondary">
                  (in {monthsLeft === 0 ? 'diesem Monat' : `${monthsLeft} Monat${monthsLeft !== 1 ? 'en' : ''}`})
                </Typography>
              )}
              {monthsLeft !== null && monthsLeft < 0 && (
                <Typography variant="caption" color="text.secondary">abgelaufen</Typography>
              )}
            </Stack>
          )}
        </Paper>
      )}

      {/* SOLL/IST grid */}
      {(kat === 'rücklagen' || kat === 'tagesgeld') && Number(goal.monthly_soll) > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
          {[
            { label: 'SOLL/Monat', val: fmt2(goal.monthly_soll) + ' €', color: 'text.primary' },
            { label: 'IST diesen Monat', val: fmt2(istThisMonth) + ' €',
              color: istThisMonth >= goal.monthly_soll ? 'success.main' : 'text.primary' },
            { label: 'OFFEN', val: fmt2(offen) + ' €',
              color: offen > 0 ? 'warning.main' : 'success.main' },
          ].map(({ label, val, color }) => (
            <Box key={label} sx={{ bgcolor: 'action.hover', borderRadius: 1.25, p: '8px 10px' }}>
              <Typography variant="caption" sx={{
                color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                display: 'block', fontSize: '0.6rem',
              }}>
                {label}
              </Typography>
              <Typography sx={{ color, fontWeight: 700, fontSize: '0.85rem', mt: 0.25, fontFamily: 'monospace' }}>
                {val}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      {/* Quick entry button */}
      <Button
        fullWidth
        variant="outlined"
        startIcon={<AddIcon />}
        onClick={() => onAddEntry(goal)}
        sx={{
          borderColor: `${goal.color_code}40`,
          bgcolor: `${goal.color_code}20`,
          color: goal.color_code,
          fontWeight: 600,
          '&:hover': { bgcolor: `${goal.color_code}35`, borderColor: goal.color_code },
        }}
      >
        Einzahlung / Entnahme
      </Button>
    </Paper>
  );
}

// ─── Goal Form ────────────────────────────────────────────────────────────────
function GoalForm({ initial, onSave, onCancel, etfPolicies }) {
  const [name,              setName]              = useState(initial?.name              ?? '');
  const [kat,               setKat]               = useState(initial?.kategorie         ?? 'rücklagen');
  const [target,            setTarget]            = useState(initial?.target_amount     ?? '');
  const [soll,              setSoll]              = useState(initial?.monthly_soll      ?? '');
  const [color,             setColor]             = useState(initial?.color_code        ?? COLOR_PALETTE[0]);
  const [zinssatz,          setZinssatz]          = useState(initial?.zinssatz          ?? '');
  const [nominalwert,       setNominalwert]       = useState(initial?.nominalwert       ?? '');
  const [kupon,             setKupon]             = useState(initial?.kupon             ?? '');
  const [faelligkeitsdatum, setFaelligkeitsdatum] = useState(initial?.faelligkeitsdatum ?? '');
  const [kuponIntervall,    setKuponIntervall]    = useState(initial?.kupon_intervall   ?? 'jährlich');
  const [etfId,             setEtfId]             = useState(initial?.etf_id            ?? '');
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setErr('');
    if (!name.trim()) { setErr('Name fehlt.'); return; }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(), target_amount: target || null, monthly_soll: soll || 0,
        color_code: color, kategorie: kat,
        zinssatz:          kat === 'tagesgeld'           ? (zinssatz || null)          : null,
        nominalwert:       kat === 'anleihen'            ? (nominalwert || null)       : null,
        kupon:             kat === 'anleihen'            ? (kupon || null)             : null,
        faelligkeitsdatum: kat === 'anleihen'            ? (faelligkeitsdatum || null) : null,
        kupon_intervall:   kat === 'anleihen'            ? kuponIntervall              : 'jährlich',
        etf_id:            kat === 'private_investments' ? (etfId || null)             : null,
      });
    } catch (ex) { setErr(ex.message); }
    finally { setSaving(false); }
  }

  return (
    <SectionCard
      title={
        <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700 }}>
          {initial ? 'Asset bearbeiten' : 'Neues Asset'}
        </Typography>
      }
    >
      <Box component="form" onSubmit={handleSubmit}>
        <Stack spacing={1.75}>
          {/* Base fields */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' }, gap: 1.5 }}>
            <TextField label="Name" size="small" fullWidth value={name}
              onChange={(e) => setName(e.target.value)} placeholder="Tagesgeldkonto Consors…" />
            <TextField select label="Kategorie" size="small" fullWidth value={kat}
              onChange={(e) => setKat(e.target.value)}>
              {KATEGORIEN.map((k) => <MenuItem key={k.value} value={k.value}>{k.label}</MenuItem>)}
            </TextField>
          </Box>

          {/* Tagesgeld fields */}
          {kat === 'tagesgeld' && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 1.5 }}>
              <CurrencyField label="Zinssatz p.a." adornment="%" decimals={2} value={zinssatz}
                onChange={(v) => setZinssatz(v === '' ? '' : v)} fullWidth />
              <CurrencyField label="Zielbetrag (opt.)" value={target}
                onChange={(v) => setTarget(v === '' ? '' : v)} fullWidth />
              <CurrencyField label="SOLL/Monat" value={soll}
                onChange={(v) => setSoll(v === '' ? '' : v)} fullWidth />
            </Box>
          )}

          {/* Anleihen fields */}
          {kat === 'anleihen' && (
            <>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 1.5 }}>
                <CurrencyField label="Nominalwert" value={nominalwert}
                  onChange={(v) => setNominalwert(v === '' ? '' : v)} fullWidth />
                <CurrencyField label="Kupon p.a." adornment="%" decimals={4} value={kupon}
                  onChange={(v) => setKupon(v === '' ? '' : v)} fullWidth />
                <DateField label="Fälligkeitsdatum" value={faelligkeitsdatum}
                  onChange={(v) => setFaelligkeitsdatum(v)} />
                <TextField select label="Intervall" size="small" fullWidth value={kuponIntervall}
                  onChange={(e) => setKuponIntervall(e.target.value)}>
                  {KUPON_INTERVALLE.map((k) => <MenuItem key={k.value} value={k.value}>{k.label}</MenuItem>)}
                </TextField>
              </Box>
              {nominalwert > 0 && kupon > 0 && (() => {
                const annualAmt = Number(nominalwert) * (Number(kupon) / 100);
                const intervall = KUPON_INTERVALLE.find((k) => k.value === kuponIntervall);
                const perPayment = annualAmt / (intervall?.factor ?? 1);
                return (
                  <Alert severity="warning" variant="outlined" sx={{ py: 0.5 }}>
                    → {fmt2(perPayment)} € pro Zahlung ({intervall?.label}) · {fmt2(annualAmt)} €/Jahr
                  </Alert>
                );
              })()}
            </>
          )}

          {/* Private Investments / ETF link */}
          {kat === 'private_investments' && (
            <>
              <TextField select label="ETF-Modul verknüpfen (optional)" size="small" fullWidth value={etfId}
                onChange={(e) => setEtfId(e.target.value)}>
                <MenuItem value="">— Keine Verknüpfung —</MenuItem>
                {etfPolicies.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.name} ({p.type === 'depot' ? 'Depot' : p.type === 'avd' ? 'AVD' : 'Rentenpolice'})
                  </MenuItem>
                ))}
              </TextField>
              {etfId && (
                <Typography variant="caption" sx={{ color: 'primary.main' }}>
                  Wert wird dynamisch aus dem ETF-Rechner berechnet.
                </Typography>
              )}
            </>
          )}

          {/* Rücklagen + Private Investment fields */}
          {(kat === 'rücklagen' || kat === 'private_investments') && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 1.5 }}>
              <CurrencyField label="Zielbetrag (opt.)" value={target}
                onChange={(v) => setTarget(v === '' ? '' : v)} fullWidth />
              <CurrencyField label="SOLL/Monat" value={soll}
                onChange={(v) => setSoll(v === '' ? '' : v)} fullWidth />
            </Box>
          )}

          {/* Color picker */}
          <Box>
            <Typography variant="caption" sx={{
              display: 'block', color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.06em', mb: 0.75,
            }}>
              Farbe
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              {COLOR_PALETTE.map((c) => (
                <Box
                  key={c}
                  component="button"
                  type="button"
                  aria-label={`Farbe ${c}`}
                  onClick={() => setColor(c)}
                  sx={{
                    width: 28, height: 28, borderRadius: '50%',
                    backgroundColor: c, border: 'none', cursor: 'pointer',
                    outline: color === c ? `3px solid ${c}` : 'none',
                    outlineOffset: 2,
                    transform: color === c ? 'scale(1.15)' : 'scale(1)',
                    transition: 'transform 0.15s',
                  }}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                style={{ width: 28, height: 28, padding: 0, border: 'none', borderRadius: '50%', cursor: 'pointer' }}
                title="Eigene Farbe"
              />
            </Stack>
          </Box>

          {err && <Alert severity="error">{err}</Alert>}

          <Stack direction="row" spacing={1} justifyContent="flex-end">
            {onCancel && <Button onClick={onCancel} color="inherit">Abbrechen</Button>}
            <Button type="submit" variant="contained" disabled={saving}
              startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <AddIcon />}>
              {saving ? 'Speichern…' : initial ? 'Aktualisieren' : 'Asset erstellen'}
            </Button>
          </Stack>
        </Stack>
      </Box>
    </SectionCard>
  );
}

// ─── Entry Modal ──────────────────────────────────────────────────────────────
function EntryModal({ goals, preselectedGoal, onSave, onClose }) {
  const TODAY_ISO = new Date().toISOString().split('T')[0];
  const [goalId, setGoalId] = useState(preselectedGoal?.id ?? goals[0]?.id ?? '');
  const [date,   setDate]   = useState(TODAY_ISO);
  const [amount, setAmount] = useState('');
  const [type,   setType]   = useState('einzahlung');
  const [note,   setNote]   = useState('');
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setErr('');
    const v = parseFloat(amount);
    if (!goalId)            { setErr('Asset wählen.'); return; }
    if (isNaN(v) || v <= 0) { setErr('Ungültiger Betrag.'); return; }
    setSaving(true);
    try {
      await onSave({ goal_id: goalId, date, amount: v, type, note });
      onClose();
    } catch (ex) { setErr(ex.message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth component="form" onSubmit={handleSubmit}>
      <DialogTitle sx={{ pr: 6 }}>
        Transaktion erfassen
        <IconButton onClick={onClose} aria-label="Schließen"
          sx={{ position: 'absolute', right: 12, top: 12 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          <ToggleButtonGroup
            value={type}
            exclusive
            onChange={(_, v) => v && setType(v)}
            size="small"
            fullWidth
          >
            <ToggleButton value="einzahlung" sx={{ color: 'success.main' }}>
              <ArrowUpwardIcon fontSize="small" sx={{ mr: 0.5 }} /> Einzahlung
            </ToggleButton>
            <ToggleButton value="entnahme" sx={{ color: 'error.main' }}>
              <ArrowDownwardIcon fontSize="small" sx={{ mr: 0.5 }} /> Entnahme
            </ToggleButton>
            <ToggleButton value="neustart" sx={{ color: 'warning.main' }}>
              <RestartAltIcon fontSize="small" sx={{ mr: 0.5 }} /> Neustart
            </ToggleButton>
          </ToggleButtonGroup>

          {type === 'neustart' && (
            <Alert severity="warning" variant="outlined">
              Neustart setzt den Verlauf zurück. Der eingegebene Betrag wird als neuer Startsaldo verwendet.
            </Alert>
          )}

          <Box>
            <Typography variant="caption" sx={{
              display: 'block', color: 'text.secondary', fontWeight: 600, mb: 0.5,
            }}>
              Asset
            </Typography>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
              {goals.map((g) => (
                <Chip
                  key={g.id}
                  label={g.name}
                  size="small"
                  onClick={() => setGoalId(g.id)}
                  sx={{
                    bgcolor: goalId === g.id ? g.color_code : 'transparent',
                    color: goalId === g.id ? 'common.white' : 'text.secondary',
                    border: 2,
                    borderColor: goalId === g.id ? g.color_code : 'divider',
                    fontWeight: 600,
                    '&:hover': { bgcolor: goalId === g.id ? g.color_code : 'action.hover' },
                  }}
                />
              ))}
            </Stack>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5 }}>
            <DateField label="Datum" value={date} onChange={(v) => setDate(v)} />
            <CurrencyField
              label={type === 'neustart' ? 'Neuer Startsaldo' : 'Betrag'}
              value={amount}
              onChange={(v) => setAmount(v === '' ? '' : String(v))}
              fullWidth
              inputProps={{ step: 0.01, min: 0.01 }}
            />
          </Box>
          <TextField label="Notiz (optional)" size="small" fullWidth value={note}
            onChange={(e) => setNote(e.target.value)} placeholder="z.B. Monatlicher Transfer…" />
          {err && <Alert severity="error">{err}</Alert>}
          <Button type="submit" variant="contained" disabled={saving}
            startIcon={saving ? <CircularProgress size={14} color="inherit" /> : null}>
            {saving ? 'Speichern…' : 'Transaktion speichern'}
          </Button>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

// ─── Anleihen Ladder ──────────────────────────────────────────────────────────
function AnleihenLadder({ goals }) {
  const theme = useTheme();
  const bonds = goals
    .filter((g) => g.kategorie === 'anleihen')
    .sort((a, b) => {
      if (!a.faelligkeitsdatum) return 1;
      if (!b.faelligkeitsdatum) return -1;
      return new Date(a.faelligkeitsdatum) - new Date(b.faelligkeitsdatum);
    });

  if (bonds.length === 0) {
    return (
      <SectionCard>
        <Box sx={{ textAlign: 'center', py: 5 }}>
          <Typography sx={{ fontSize: '2rem', mb: 1.5 }}>📜</Typography>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>Noch keine Anleihen erfasst</Typography>
          <Typography variant="body2" color="text.secondary">
            Lege eine Anleihe im Tab Übersicht an, um die Fälligkeitsleiter zu sehen.
          </Typography>
        </Box>
      </SectionCard>
    );
  }

  const totalNominal   = bonds.reduce((s, g) => s + (g.nominalwert ?? 0), 0);
  const totalKuponYear = bonds.reduce((s, g) => s + annualKupon(g), 0);

  const headStyle = {
    background: theme.palette.action.hover,
    color: theme.palette.text.secondary,
    fontSize: '0.65rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    padding: '8px 14px',
    whiteSpace: 'nowrap',
  };

  return (
    <Stack spacing={2}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 1.5 }}>
        {[
          { label: 'Anleihen gesamt', val: bonds.length + ' Positionen', color: 'text.primary' },
          { label: 'Nominalwert gesamt', val: fmt2(totalNominal) + ' €', color: 'text.primary' },
          { label: 'Kupon-Einnahmen p.a.', val: fmt2(totalKuponYear) + ' €', color: 'warning.main' },
        ].map(({ label, val, color }) => (
          <Paper key={label} variant="outlined" sx={{ borderRadius: 1, p: '14px 18px' }}>
            <Typography variant="caption" sx={{
              color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
              display: 'block', mb: 0.75,
            }}>
              {label}
            </Typography>
            <Typography sx={{ color, fontWeight: 800, fontSize: '1.1rem', fontFamily: 'monospace' }}>
              {val}
            </Typography>
          </Paper>
        ))}
      </Box>

      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <Box sx={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...headStyle, textAlign: 'left' }}>Name</th>
                <th style={{ ...headStyle, textAlign: 'right' }}>Nominalwert</th>
                <th style={{ ...headStyle, textAlign: 'right' }}>Kupon p.a.</th>
                <th style={{ ...headStyle, textAlign: 'right' }}>Kupon (€/Jahr)</th>
                <th style={{ ...headStyle, textAlign: 'right' }}>Intervall</th>
                <th style={{ ...headStyle, textAlign: 'right' }}>Fälligkeit</th>
                <th style={{ ...headStyle, textAlign: 'right' }}>Restlaufzeit</th>
              </tr>
            </thead>
            <tbody>
              {bonds.map((g, i) => {
                const ml = monthsUntilMaturity(g);
                const alert = ml !== null && ml <= 12 && ml >= 0;
                const urgent = ml !== null && ml <= 3 && ml >= 0;
                const rowBg = urgent ? 'rgba(239,68,68,0.08)'
                  : alert ? 'rgba(245,158,11,0.08)'
                  : i % 2 === 1 ? theme.palette.action.hover : 'transparent';
                return (
                  <tr key={g.id} style={{ background: rowBg }}>
                    <td style={{ padding: '10px 14px' }}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: g.color_code }} />
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{g.name}</Typography>
                      </Stack>
                    </td>
                    <td style={{
                      padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.82rem',
                      color: theme.palette.text.primary,
                    }}>
                      {g.nominalwert ? fmt2(g.nominalwert) + ' €' : '–'}
                    </td>
                    <td style={{
                      padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.82rem',
                      color: theme.palette.warning.main,
                    }}>
                      {g.kupon ? fmt4(g.kupon) + ' %' : '–'}
                    </td>
                    <td style={{
                      padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.82rem',
                      color: theme.palette.text.primary,
                    }}>
                      {g.kupon && g.nominalwert ? fmt2(annualKupon(g)) + ' €' : '–'}
                    </td>
                    <td style={{
                      padding: '10px 14px', textAlign: 'right', fontSize: '0.82rem',
                      color: theme.palette.text.secondary,
                    }}>
                      {KUPON_INTERVALLE.find((k) => k.value === g.kupon_intervall)?.label ?? '–'}
                    </td>
                    <td style={{
                      padding: '10px 14px', textAlign: 'right', fontSize: '0.82rem',
                      color: alert ? (urgent ? theme.palette.error.main : theme.palette.warning.main) : theme.palette.text.primary,
                      fontWeight: alert ? 700 : 400,
                    }}>
                      {g.faelligkeitsdatum ? fmtDate(g.faelligkeitsdatum) : '–'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: '0.82rem' }}>
                      {ml === null ? <span style={{ color: theme.palette.text.secondary }}>–</span>
                        : ml < 0   ? <span style={{ color: theme.palette.text.secondary }}>Abgelaufen</span>
                        : ml === 0 ? <span style={{ color: theme.palette.error.main, fontWeight: 700 }}>Diesen Monat!</span>
                        : <span style={{
                            color: urgent ? theme.palette.error.main : alert ? theme.palette.warning.main : theme.palette.success.main,
                            fontWeight: alert ? 700 : 400,
                          }}>
                            {urgent ? '🔴' : alert ? '🟠' : '🟢'} {ml} Monat{ml !== 1 ? 'e' : ''}
                          </span>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Box>
      </Paper>
    </Stack>
  );
}

// ─── Monats Tracker ───────────────────────────────────────────────────────────
function MonatsTracker({ goals, entries, onAddEntry }) {
  const theme = useTheme();
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const savingsGoals = goals.filter((g) => g.kategorie === 'rücklagen' || g.kategorie === 'tagesgeld');

  function prevMonth() { if (month === 0) { setMonth(11); setYear((y) => y - 1); } else setMonth((m) => m - 1); }
  function nextMonth() { if (month === 11) { setMonth(0); setYear((y) => y + 1); } else setMonth((m) => m + 1); }

  const totalSoll  = savingsGoals.reduce((s, g) => s + Number(g.monthly_soll), 0);
  const totalIst   = savingsGoals.reduce((s, g) => s + monthlyIst(g.id, entries, year, month), 0);
  const totalOffen = Math.max(0, totalSoll - totalIst);

  const headStyle = {
    background: theme.palette.action.hover,
    color: theme.palette.text.secondary,
    fontSize: '0.65rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    padding: '8px 14px',
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <IconButton size="small" onClick={prevMonth}><ChevronLeftIcon /></IconButton>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, minWidth: 160, textAlign: 'center' }}>
          {MONTHS_DE[month]} {year}
        </Typography>
        <IconButton size="small" onClick={nextMonth}><ChevronRightIcon /></IconButton>
      </Stack>

      {savingsGoals.length === 0 ? (
        <SectionCard>
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
            Keine Spar-Assets (Rücklagen/Tagesgeld) vorhanden.
          </Typography>
        </SectionCard>
      ) : (
        <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...headStyle, textAlign: 'left' }}>Asset</th>
                <th style={{ ...headStyle, textAlign: 'right' }}>SOLL (€)</th>
                <th style={{ ...headStyle, textAlign: 'right' }}>IST (€)</th>
                <th style={{ ...headStyle, textAlign: 'right' }}>OFFEN (€)</th>
                <th style={{ ...headStyle, textAlign: 'right' }}>Erfüllt</th>
                <th style={headStyle} aria-label="Aktionen">
                  <span style={{ position: 'absolute', left: -9999 }}>Aktionen</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {savingsGoals.map((g, i) => {
                const ist   = monthlyIst(g.id, entries, year, month);
                const offen = Math.max(0, Number(g.monthly_soll) - ist);
                const done  = ist >= Number(g.monthly_soll);
                const rowBg = i % 2 === 1 ? theme.palette.action.hover : 'transparent';
                const pct = Math.min(100, Number(g.monthly_soll) > 0 ? Math.round((ist / Number(g.monthly_soll)) * 100) : 0);
                return (
                  <tr key={g.id} style={{ background: rowBg }}>
                    <td style={{ padding: '10px 14px' }}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: g.color_code }} />
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{g.name}</Typography>
                      </Stack>
                    </td>
                    <td style={{
                      padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.85rem',
                      color: theme.palette.text.secondary,
                    }}>
                      {fmt2(g.monthly_soll)}
                    </td>
                    <td style={{
                      padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.85rem',
                      color: ist > 0 ? theme.palette.success.main : theme.palette.text.primary,
                    }}>
                      {fmt2(ist)}
                    </td>
                    <td style={{
                      padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.85rem',
                      color: offen > 0 ? theme.palette.warning.main : theme.palette.success.main,
                      fontWeight: offen > 0 ? 700 : 400,
                    }}>
                      {offen > 0 ? fmt2(offen) : '✓'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <Box sx={{
                        height: 6, width: 80, bgcolor: 'action.hover',
                        borderRadius: 99, overflow: 'hidden', ml: 'auto',
                      }}>
                        <Box sx={{
                          height: '100%', borderRadius: 99,
                          width: `${pct}%`,
                          backgroundColor: done ? 'success.main' : g.color_code,
                          transition: 'width 0.4s ease',
                        }} />
                      </Box>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <IconButton size="small" onClick={() => onAddEntry(g)} title="Einzahlung">
                        <AddIcon fontSize="inherit" />
                      </IconButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: `2px solid ${theme.palette.divider}` }}>
                <td style={{
                  padding: '10px 14px', color: theme.palette.text.secondary,
                  fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
                }}>
                  Gesamt
                </td>
                <td style={{
                  padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace',
                  fontWeight: 700, color: theme.palette.text.primary, fontSize: '0.85rem',
                }}>
                  {fmt2(totalSoll)}
                </td>
                <td style={{
                  padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace',
                  fontWeight: 700, color: theme.palette.success.main, fontSize: '0.85rem',
                }}>
                  {fmt2(totalIst)}
                </td>
                <td style={{
                  padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace',
                  fontWeight: 700,
                  color: totalOffen > 0 ? theme.palette.warning.main : theme.palette.success.main,
                  fontSize: '0.85rem',
                }}>
                  {totalOffen > 0 ? fmt2(totalOffen) : '✓'}
                </td>
                <td /><td />
              </tr>
            </tfoot>
          </table>
        </Paper>
      )}
    </Stack>
  );
}

// ─── Transaction History ──────────────────────────────────────────────────────
function TransactionHistory({ goals, entries, onDelete }) {
  const [filter, setFilter] = useState('all');
  const goalMap = Object.fromEntries(goals.map((g) => [g.id, g]));
  const filtered = filter === 'all' ? entries : entries.filter((e) => e.goal_id === filter);
  const TYPE_STYLE = {
    einzahlung: { color: 'success.main', label: 'Einzahlung', icon: <ArrowUpwardIcon fontSize="small" /> },
    entnahme:   { color: 'error.main',   label: 'Entnahme',   icon: <ArrowDownwardIcon fontSize="small" /> },
    neustart:   { color: 'warning.main', label: 'Neustart',   icon: <RestartAltIcon fontSize="small" /> },
  };

  return (
    <Stack spacing={1.75}>
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
        <Chip
          label="Alle"
          size="small"
          onClick={() => setFilter('all')}
          color={filter === 'all' ? 'primary' : 'default'}
          variant={filter === 'all' ? 'filled' : 'outlined'}
          sx={{ fontWeight: 600 }}
        />
        {goals.map((g) => (
          <Chip
            key={g.id}
            label={g.name}
            size="small"
            onClick={() => setFilter(g.id)}
            sx={{
              bgcolor: filter === g.id ? g.color_code : 'transparent',
              color: filter === g.id ? 'common.white' : 'text.secondary',
              border: 2,
              borderColor: filter === g.id ? g.color_code : 'divider',
              fontWeight: 600,
              '&:hover': { bgcolor: filter === g.id ? g.color_code : 'action.hover' },
            }}
          />
        ))}
      </Stack>

      {filtered.length === 0 && (
        <SectionCard>
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
            Noch keine Transaktionen.
          </Typography>
        </SectionCard>
      )}

      <Stack spacing={0.75}>
        {filtered.slice(0, 50).map((e) => {
          const goal = goalMap[e.goal_id];
          const ts   = TYPE_STYLE[e.type] ?? TYPE_STYLE.einzahlung;
          return (
            <Paper key={e.id} variant="outlined" sx={{ borderRadius: 1, p: '10px 14px' }}>
              <Stack direction="row" alignItems="center" spacing={1.5}>
                <Avatar sx={{
                  width: 34, height: 34,
                  bgcolor: 'transparent',
                  color: ts.color,
                  border: 2,
                  borderColor: ts.color,
                }}>
                  {ts.icon}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" alignItems="center" spacing={0.75}>
                    {goal && (
                      <Box sx={{
                        width: 8, height: 8, borderRadius: '50%',
                        backgroundColor: goal.color_code, flexShrink: 0,
                      }} />
                    )}
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{goal?.name ?? '–'}</Typography>
                    <Typography variant="caption" color="text.secondary">· {ts.label}</Typography>
                  </Stack>
                  {e.note && (
                    <Typography variant="caption" sx={{
                      color: 'text.secondary', display: 'block',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {e.note}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {fmtDate(e.date)}
                  </Typography>
                </Box>
                <Typography sx={{
                  color: ts.color, fontWeight: 700, fontFamily: 'monospace', fontSize: '0.95rem',
                }}>
                  {e.type === 'entnahme' ? '−' : e.type === 'neustart' ? '' : '+'}{fmt2(e.amount)} €
                </Typography>
                <IconButton size="small" color="error" onClick={() => onDelete(e.id)} title="Löschen">
                  <DeleteOutlineIcon fontSize="inherit" />
                </IconButton>
              </Stack>
            </Paper>
          );
        })}
      </Stack>
      {filtered.length > 50 && (
        <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', display: 'block' }}>
          Zeige die letzten 50 von {filtered.length} Transaktionen.
        </Typography>
      )}
    </Stack>
  );
}

// ─── GuthabenPage ─────────────────────────────────────────────────────────────
export default function GuthabenPage() {
  const { goals, entries, loading, error, addGoal, updateGoal, deleteGoal, addEntry, deleteEntry } = useSavings();
  const { policies: etfPolicies } = useETFPolicen();

  const [activeTab, setActiveTab]       = useState('uebersicht');
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editGoal, setEditGoal]         = useState(null);
  const [entryModal, setEntryModal]     = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  async function handleSaveGoal(form) {
    if (editGoal) {
      await updateGoal(editGoal.id, form);
      setEditGoal(null);
    } else {
      await addGoal(form);
    }
    setShowGoalForm(false);
  }

  async function handleConfirmDelete() {
    if (!confirmDelete) return;
    await deleteGoal(confirmDelete.id);
    setConfirmDelete(null);
  }

  // Group goals by category
  const grouped = useMemo(() => {
    const map = {};
    KATEGORIEN.forEach(({ value }) => { map[value] = []; });
    goals.forEach((g) => { (map[g.kategorie ?? 'rücklagen'] ??= []).push(g); });
    return map;
  }, [goals]);

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
        title="💼 Asset Manager"
        subtitle="Rücklagen · Tagesgeld · Anleihen · Private Investments"
      />

      <Stack spacing={2.5}>
        {/* Net Worth widget */}
        {goals.length > 0 && (
          <TotalWidget goals={goals} entries={entries} etfPolicies={etfPolicies ?? []} />
        )}

        {/* Interest Preview */}
        {goals.length > 0 && <InterestPreviewBox goals={goals} entries={entries} />}

        {/* Tab bar */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
            <Tab value="uebersicht" label="Übersicht" />
            <Tab value="anleihen" label="📜 Anleihen" />
            <Tab value="monatstracker" label="Monatstracker" />
            <Tab value="verlauf" label="Verlauf" />
          </Tabs>
        </Box>

        {/* Übersicht */}
        {activeTab === 'uebersicht' && (
          <Stack spacing={3}>
            {(showGoalForm || editGoal) ? (
              <GoalForm
                initial={editGoal ? {
                  name: editGoal.name, target_amount: editGoal.target_amount,
                  monthly_soll: editGoal.monthly_soll, color_code: editGoal.color_code,
                  kategorie: editGoal.kategorie, zinssatz: editGoal.zinssatz,
                  nominalwert: editGoal.nominalwert, kupon: editGoal.kupon,
                  faelligkeitsdatum: editGoal.faelligkeitsdatum,
                  kupon_intervall: editGoal.kupon_intervall, etf_id: editGoal.etf_id,
                } : null}
                onSave={handleSaveGoal}
                onCancel={() => { setShowGoalForm(false); setEditGoal(null); }}
                etfPolicies={etfPolicies ?? []}
              />
            ) : (
              <Stack direction="row" justifyContent="flex-end">
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => setShowGoalForm(true)}>
                  Neues Asset
                </Button>
              </Stack>
            )}

            {goals.length === 0 && !showGoalForm && (
              <SectionCard>
                <Box sx={{ textAlign: 'center', py: 5 }}>
                  <Typography sx={{ fontSize: '2rem', mb: 1.5 }}>💼</Typography>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
                    Noch keine Assets angelegt
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Klicke auf "Neues Asset" um loszulegen.
                  </Typography>
                </Box>
              </SectionCard>
            )}

            {/* Category sections */}
            {KATEGORIEN.map(({ value, label }) => {
              const katGoals = grouped[value] ?? [];
              if (katGoals.length === 0) return null;
              const katTotal = katGoals.reduce((s, g) => s + effectiveBalance(g, entries, etfPolicies ?? []), 0);
              return (
                <Box key={value}>
                  <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 1.5 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{label}</Typography>
                    <Box sx={{ flex: 1, height: 1, bgcolor: 'divider' }} />
                    <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                      {fmt2(katTotal)} €
                    </Typography>
                  </Stack>
                  <Box sx={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                    gap: 2,
                  }}>
                    {katGoals.map((g) => (
                      <GoalCard
                        key={g.id} goal={g} entries={entries} etfPolicies={etfPolicies ?? []}
                        onAddEntry={(goal) => setEntryModal(goal)}
                        onEdit={(goal) => {
                          setEditGoal(goal);
                          setShowGoalForm(false);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        onDelete={(id) => {
                          const target = goals.find((x) => x.id === id);
                          setConfirmDelete(target);
                        }}
                      />
                    ))}
                  </Box>
                </Box>
              );
            })}
          </Stack>
        )}

        {/* Anleihen */}
        {activeTab === 'anleihen' && <AnleihenLadder goals={goals} />}

        {/* Monatstracker */}
        {activeTab === 'monatstracker' && (
          <MonatsTracker goals={goals} entries={entries} onAddEntry={(goal) => setEntryModal(goal)} />
        )}

        {/* Verlauf */}
        {activeTab === 'verlauf' && (
          <TransactionHistory goals={goals} entries={entries} onDelete={deleteEntry} />
        )}
      </Stack>

      {/* Entry modal */}
      {entryModal !== null && (
        <EntryModal
          goals={goals}
          preselectedGoal={entryModal}
          onSave={addEntry}
          onClose={() => setEntryModal(null)}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!confirmDelete}
        title="Asset löschen?"
        message={`Das Asset „${confirmDelete?.name ?? ''}" und alle Transaktionen werden unwiderruflich gelöscht.`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </Box>
  );
}
