import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Stack, Typography, Button, IconButton, TextField, MenuItem,
  Tabs, Tab, Dialog, DialogTitle, DialogContent, Alert, CircularProgress,
  Chip, Paper, LinearProgress, ToggleButton, ToggleButtonGroup, Avatar,
  Table, TableHead, TableBody, TableFooter,
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
import EntityIcon from '../components/EntityIcon';
import EntityLogoPicker from '../components/EntityLogoPicker';

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

export const KATEGORIEN = [
  { value: 'rücklagen',           label: 'Rücklagen',          icon: 'savings' },
  { value: 'tagesgeld',           label: 'Tagesgeldkonto',     icon: 'account_balance' },
  { value: 'anleihen',            label: 'Anleihen / Bonds',   icon: 'description' },
  { value: 'private_investments', label: 'Private Investments',icon: 'business_center' },
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
export function activeEntries(goalId, entries) {
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

export function effectiveBalance(goal, entries, etfPolicies) {
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
      borderRadius: '16px',
      p: { xs: 2.5, sm: 3, md: 3.5 },
      display: 'flex',
      flexDirection: { xs: 'column', md: 'row' },
      alignItems: { xs: 'flex-start', md: 'center' },
      justifyContent: 'space-between',
      gap: 2.5,
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
        <Typography variant="overline" sx={{
          color: 'primary.light', display: 'block',
          letterSpacing: '0.08em', lineHeight: 1.15, mb: 0.75,
        }}>
          Net Worth
        </Typography>
        <Typography sx={{
          fontFamily: '"Manrope", sans-serif',
          fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1,
          fontSize: { xs: '2rem', sm: '2.5rem', md: '3rem' },
        }}>
          {fmt2(total)} €
        </Typography>
        <Typography variant="caption" sx={{
          mt: 0.5, display: 'block', color: 'primary.light',
        }}>
          über {goals.length} Asset{goals.length !== 1 ? 's' : ''}
        </Typography>
      </Box>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap
        sx={{ position: 'relative', zIndex: 1 }}>
        {KATEGORIEN.filter(({ value }) => byKat[value] > 0).map(({ value, label }) => (
          <Paper key={value} elevation={0} sx={{
            bgcolor: 'rgba(255,255,255,0.06)',
            color: 'primary.contrastText',
            borderRadius: '16px',
            px: 1.75, py: 1,
            minWidth: 140,
          }}>
            <Typography variant="caption" sx={{
              color: 'primary.light', display: 'block',
              fontSize: '0.625rem', letterSpacing: '0.05em', mb: 0.25,
            }}>
              {label}
            </Typography>
            <Typography sx={{
              fontFamily: '"Manrope", sans-serif',
              fontWeight: 700, fontSize: '1rem', lineHeight: 1.2,
            }}>
              {fmt2(byKat[value])} €
            </Typography>
          </Paper>
        ))}
      </Stack>
    </Paper>
  );
}

// ─── Goal Card ────────────────────────────────────────────────────────────────
function GoalCard({ goal, entries, etfPolicies, onAddEntry, onEdit, onDelete, onOpenDetails, view = 'grid' }) {
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
  const katIcon      = KATEGORIEN.find((k) => k.value === kat)?.icon ?? 'savings';
  const katLabel     = KATEGORIEN.find((k) => k.value === kat)?.label ?? '';

  const monthsLeft     = isAnleihe ? monthsUntilMaturity(goal) : null;
  const maturityAlert  = monthsLeft !== null && monthsLeft <= 12 && monthsLeft >= 0;
  const maturityUrgent = monthsLeft !== null && monthsLeft <= 3 && monthsLeft >= 0;
  const maturityColor  = maturityUrgent ? theme.palette.error.main : maturityAlert ? theme.palette.warning.main : theme.palette.success.main;

  // ── Listenansicht: kompakt, horizontal über volle Breite ──────────────────
  if (view === 'list') {
    return (
      <Paper
        variant="outlined"
        onClick={onOpenDetails ? () => onOpenDetails(goal) : undefined}
        sx={{
          borderRadius: '16px', p: { xs: 2, sm: 2.5 },
          borderColor: isAnleihe && maturityAlert ? `${maturityColor}55` : 'divider',
          cursor: onOpenDetails ? 'pointer' : 'default',
          transition: 'box-shadow 0.15s',
          '&:hover': {
            boxShadow: '0 6px 20px rgba(11,28,48,0.06)',
            '& .goal-list-actions': { opacity: 1 },
          },
        }}
      >
        <Box sx={{
          display: 'grid',
          // Spalte 4 hat fixe Breite (220px), damit Saldo immer rechtsbündig
          // an gleicher Position steht — kein dynamisches Verschieben.
          gridTemplateColumns: { xs: '1fr', md: '1.6fr 1.5fr 1fr 220px' },
          gap: { xs: 2, md: 3 }, alignItems: 'start',
        }}>
          {/* Spalte 1: Icon + Name + Kategorie-Subtitle, darunter Aktionen */}
          <Stack spacing={1.75} sx={{ minWidth: 0 }}>
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0 }}>
              <EntityIcon
                logoId={goal.logo_id}
                fallbackIconName={katIcon}
                size={48}
                bgcolor="accent.positiveSurface"
                color="primary.dark"
                borderRadius="16px"
              />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.25,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {goal.name}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {katLabel}
                  {isEtfLinked && etfPolicy && ` · ${etfPolicy.name}`}
                  {isAnleihe && goal.faelligkeitsdatum && ` · fällig ${fmtDate(goal.faelligkeitsdatum)}`}
                </Typography>
              </Box>
            </Stack>

            {/* Aktionen unter dem Header — Klicks stoppen Propagation */}
            <Stack direction="row" spacing={0.5} alignItems="center"
              onClick={(e) => e.stopPropagation()}>
              <Button
                size="small"
                variant="contained"
                startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                onClick={() => onAddEntry(goal)}
                sx={{ whiteSpace: 'nowrap' }}
              >
                Zahlung
              </Button>
              <Box className="goal-list-actions"
                sx={{ display: 'flex', opacity: { xs: 1, md: 0 }, transition: 'opacity 0.15s' }}>
                <IconButton size="small" onClick={() => onEdit(goal)} title="Bearbeiten"
                  sx={{ color: 'text.disabled', '&:hover': { color: 'text.primary' } }}>
                  <EditOutlinedIcon sx={{ fontSize: 16 }} />
                </IconButton>
                <IconButton size="small" onClick={() => onDelete(goal.id)} title="Löschen"
                  sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}>
                  <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Box>
            </Stack>
          </Stack>

          {/* Spalte 2: Progress + Sub-Caption (oder Inline-Meta) */}
          <Box>
            {hasTarget ? (
              <>
                <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.75 }}>
                  <Typography variant="caption" color="text.secondary">
                    Fortschritt
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>
                    {pct} %
                  </Typography>
                </Stack>
                <LinearProgress variant="determinate" value={pct}
                  sx={{
                    height: 6, borderRadius: 99, bgcolor: 'action.hover',
                    '& .MuiLinearProgress-bar': {
                      bgcolor: pct >= 100 ? 'accent.positiveSurface' : goal.color_code,
                      borderRadius: 99,
                    },
                    mb: 1,
                  }} />
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                  Ziel: {fmt2(goal.target_amount)} €
                </Typography>
              </>
            ) : (
              <Typography variant="caption" color="text.secondary">
                {isTagesgeld && goal.zinssatz > 0 ? `Zinssatz ${fmt4(goal.zinssatz)} % p.a.` : '—'}
              </Typography>
            )}
          </Box>

          {/* Spalte 3: KPIs (Sparrate, Zins) */}
          <Stack spacing={1.25} sx={{ minWidth: 0 }}>
            {Number(goal.monthly_soll) > 0 && (
              <Box>
                <Typography variant="overline" sx={{
                  display: 'block', fontSize: '0.6rem', lineHeight: 1.2,
                  color: 'text.secondary', fontWeight: 700, letterSpacing: '0.06em',
                }}>
                  Sparrate
                </Typography>
                <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.2 }}>
                  {fmt2(goal.monthly_soll)} €
                </Typography>
                {offen > 0 && (
                  <Typography variant="caption" sx={{ color: 'warning.main', fontSize: '0.65rem' }}>
                    offen: {fmt2(offen)} €
                  </Typography>
                )}
              </Box>
            )}
            {isTagesgeld && goal.zinssatz > 0 && (
              <Box>
                <Typography variant="overline" sx={{
                  display: 'block', fontSize: '0.6rem', lineHeight: 1.2,
                  color: 'text.secondary', fontWeight: 700, letterSpacing: '0.06em',
                }}>
                  Zins p.a.
                </Typography>
                <Typography sx={{
                  fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.2,
                  color: 'success.main',
                }}>
                  {fmt4(goal.zinssatz)} %
                </Typography>
              </Box>
            )}
          </Stack>

          {/* Spalte 4: Saldo — fixe Breite, rechtsbündig */}
          <Box sx={{ textAlign: 'right', minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>
              Saldo
            </Typography>
            <Typography sx={{
              fontFamily: '"Manrope", sans-serif',
              fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.05,
              fontSize: { xs: '1.5rem', md: '1.75rem' },
            }}>
              {fmt2(balance)} €
            </Typography>
          </Box>
        </Box>
      </Paper>
    );
  }

  return (
    <Paper
      variant="outlined"
      onClick={onOpenDetails ? () => onOpenDetails(goal) : undefined}
      sx={{
        borderRadius: '16px',
        p: 2.25,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        borderColor: isAnleihe && maturityAlert ? `${maturityColor}55` : 'divider',
        cursor: onOpenDetails ? 'pointer' : 'default',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        '&:hover': {
          boxShadow: '0 6px 20px rgba(11,28,48,0.06)',
          '& .goalcard-actions': { opacity: 1 },
        },
      }}
    >
      {/* Header: Icon + Name/Ziel + Betrag (rechtsbündig) + Aktionen (hover) */}
      <Stack direction="row" alignItems="flex-start" spacing={1.5}>
        <EntityIcon
          logoId={goal.logo_id}
          fallbackIconName={KATEGORIEN.find((k) => k.value === kat)?.icon ?? 'savings'}
          size={40}
          bgcolor="accent.positiveSurface"
          color="primary.dark"
          borderRadius="16px"
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body1" sx={{ fontWeight: 700, lineHeight: 1.25 }}>
            {goal.name}
          </Typography>
          {hasTarget && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Ziel: {fmt2(goal.target_amount)} €
            </Typography>
          )}
          {isEtfLinked && (
            <Typography variant="caption" sx={{ color: 'primary.main', display: 'block' }}>
              projiziert · {etfPolicy?.name ?? goal.etf_id}
            </Typography>
          )}
        </Box>
        <Stack alignItems="flex-end" spacing={0.25}>
          <Typography sx={{
            fontFamily: '"Manrope", sans-serif', fontWeight: 800,
            letterSpacing: '-0.01em', lineHeight: 1.1,
            fontSize: '1.35rem',
          }}>
            {fmt2(balance)} €
          </Typography>
          {hasTarget && (
            <Typography variant="caption" color="text.secondary">{pct}%</Typography>
          )}
        </Stack>
      </Stack>

      {/* Progress bar */}
      {hasTarget && (
        <LinearProgress
          variant="determinate"
          value={pct}
          sx={{
            height: 6, borderRadius: 99,
            bgcolor: 'action.hover',
            '& .MuiLinearProgress-bar': {
              bgcolor: pct >= 100 ? 'accent.positiveSurface' : goal.color_code,
              borderRadius: 99,
            },
          }}
        />
      )}

      {/* Inline meta-row: Tagesgeld-Zins · Monatliche Sparrate · Anleihen-Fälligkeit */}
      {(isTagesgeld && goal.zinssatz > 0) || Number(goal.monthly_soll) > 0 || isAnleihe ? (
        <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ color: 'text.secondary' }}>
          {isTagesgeld && goal.zinssatz > 0 && (
            <MetaChip label="Zins p.a." value={`${fmt4(goal.zinssatz)} %`} accent="success" />
          )}
          {Number(goal.monthly_soll) > 0 && (
            <MetaChip
              label="Sparrate"
              value={`${fmt2(goal.monthly_soll)} € / Mo`}
              accent={offen > 0 ? 'default' : 'success'}
              sub={offen > 0 ? `offen: ${fmt2(offen)} €` : 'erfüllt'}
            />
          )}
          {isAnleihe && goal.kupon > 0 && (
            <MetaChip label="Kupon p.a." value={`${fmt4(goal.kupon)} %`} accent="warning" />
          )}
          {isAnleihe && goal.faelligkeitsdatum && (
            <MetaChip
              label="Fällig"
              value={fmtDate(goal.faelligkeitsdatum)}
              accent={maturityUrgent ? 'error' : maturityAlert ? 'warning' : 'default'}
              sub={monthsLeft !== null && monthsLeft >= 0
                ? `in ${monthsLeft === 0 ? '< 1 Mo' : `${monthsLeft} Mo`}`
                : monthsLeft !== null ? 'abgelaufen' : null}
            />
          )}
        </Stack>
      ) : null}

      {/* Actions: Einzahlung/Entnahme + Edit/Delete (dezent unten) */}
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 'auto', pt: 0.5 }}
        onClick={(e) => e.stopPropagation()}>
        <Button
          size="small"
          variant="text"
          startIcon={<AddIcon sx={{ fontSize: 16 }} />}
          onClick={() => onAddEntry(goal)}
          sx={{ textTransform: 'none', fontWeight: 600, color: 'text.primary' }}
        >
          Zahlung erfassen
        </Button>
        <Box className="goalcard-actions" sx={{
          ml: 'auto',
          opacity: { xs: 1, md: 0 },
          transition: 'opacity 0.15s',
        }}>
          <IconButton size="small" onClick={() => onEdit(goal)} title="Bearbeiten"
            sx={{ color: 'text.disabled', '&:hover': { color: 'text.primary' } }}>
            <EditOutlinedIcon sx={{ fontSize: 16 }} />
          </IconButton>
          <IconButton size="small" onClick={() => onDelete(goal.id)} title="Löschen"
            sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}>
            <DeleteOutlineIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>
      </Stack>
    </Paper>
  );
}

// Kleines Meta-Chip für Zinssatz, Sparrate, Kupon, Fälligkeit.
function MetaChip({ label, value, sub, accent = 'default' }) {
  const accentColor = {
    success: 'success.main',
    warning: 'warning.main',
    error:   'error.main',
    default: 'text.primary',
  }[accent];
  return (
    <Box sx={{
      bgcolor: 'background.default',
      borderRadius: '10px',
      px: 1.25, py: 0.75,
      minWidth: 0,
      flex: '1 1 auto',
    }}>
      <Typography variant="caption" sx={{
        color: 'text.secondary', display: 'block',
        fontSize: '0.6rem', fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.2,
      }}>
        {label}
      </Typography>
      <Typography sx={{
        fontWeight: 700, fontSize: '0.85rem', lineHeight: 1.25,
        color: accentColor,
      }}>
        {value}
      </Typography>
      {sub && (
        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
          {sub}
        </Typography>
      )}
    </Box>
  );
}

// ─── Compact Goal Card (Sidebar-Variante für Private Investments) ────────────
function CompactGoalCard({ goal, entries, etfPolicies, onEdit, onDelete }) {
  const balance   = effectiveBalance(goal, entries, etfPolicies);
  const hasTarget = goal.target_amount != null && goal.target_amount > 0;
  const pct       = hasTarget ? Math.min(100, Math.round((balance / goal.target_amount) * 100)) : null;
  const done      = hasTarget && pct >= 100;

  return (
    <Paper
      elevation={0}
      sx={{
        position: 'relative',
        borderRadius: '16px',
        p: 1.75,
        bgcolor: 'background.paper',
        display: 'flex', flexDirection: 'column', gap: 1,
        boxShadow: '0 4px 12px rgba(11, 28, 48, 0.04)',
        transition: 'box-shadow 0.15s',
        '&:hover': {
          boxShadow: '0 6px 20px rgba(11, 28, 48, 0.08)',
          '& .compact-actions': { opacity: 1 },
        },
      }}
    >
      {/* Top-right corner: Abgeschlossen-Badge + Actions */}
      <Stack direction="row" spacing={0.5} alignItems="center"
        sx={{ position: 'absolute', top: 12, right: 12 }}>
        {done && (
          <Box sx={{
            px: 1, py: 0.25, borderRadius: 99,
            bgcolor: 'accent.positiveSurface', color: 'primary.dark',
            fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.02em',
            lineHeight: 1.4,
          }}>
            Abgeschlossen
          </Box>
        )}
        <Box className="compact-actions" sx={{
          display: 'flex',
          opacity: { xs: 1, md: 0 },
          transition: 'opacity 0.15s',
        }}>
          <IconButton size="small" onClick={() => onEdit(goal)} title="Bearbeiten"
            sx={{ color: 'text.disabled', p: 0.5, '&:hover': { color: 'text.primary' } }}>
            <EditOutlinedIcon sx={{ fontSize: 14 }} />
          </IconButton>
          <IconButton size="small" onClick={() => onDelete(goal.id)} title="Löschen"
            sx={{ color: 'text.disabled', p: 0.5, '&:hover': { color: 'error.main' } }}>
            <DeleteOutlineIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Box>
      </Stack>

      {/* Icon */}
      <Box sx={{
        width: 36, height: 36, borderRadius: '10px',
        bgcolor: 'accent.positiveSurface',
        color: 'primary.dark',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        mb: 0.5,
      }}>
        <Box component="span" className="material-symbols-outlined" sx={{ fontSize: 20 }}>
          business_center
        </Box>
      </Box>

      {/* Name + Betrag */}
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.2, mb: 0.25 }}>
          {goal.name}
        </Typography>
        <Typography sx={{
          fontFamily: '"Manrope", sans-serif',
          fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.1,
          fontSize: '1.25rem',
        }}>
          {fmt2(balance)} €
        </Typography>
      </Box>

      {/* Progress-Bar */}
      {hasTarget && (
        <LinearProgress
          variant="determinate"
          value={pct}
          sx={{
            height: 6, borderRadius: 99,
            bgcolor: 'action.hover',
            '& .MuiLinearProgress-bar': {
              bgcolor: done ? 'accent.positiveSurface' : goal.color_code,
              borderRadius: 99,
            },
          }}
        />
      )}
    </Paper>
  );
}

// ─── Goal Form ────────────────────────────────────────────────────────────────
export function GoalForm({ initial, onSave, onCancel, etfPolicies }) {
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
  const [logoId,            setLogoId]            = useState(initial?.logo_id           ?? null);
  const [logoPickerOpen, setLogoPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  const fallbackIcon = KATEGORIEN.find((k) => k.value === kat)?.icon ?? 'savings';

  async function handleSubmit(e) {
    e.preventDefault();
    setErr('');
    if (!name.trim()) { setErr('Name fehlt.'); return; }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(), target_amount: target || null, monthly_soll: soll || 0,
        color_code: color, kategorie: kat,
        logo_id:           logoId || null,
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

          {/* Logo */}
          <Box>
            <Typography variant="caption" sx={{
              display: 'block', color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.06em', mb: 0.75,
            }}>
              Logo
            </Typography>
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <EntityIcon
                logoId={logoId}
                fallbackIconName={fallbackIcon}
                size={48}
                bgcolor="accent.positiveSurface"
                color="primary.dark"
                borderRadius="12px"
              />
              <Button variant="outlined" size="small" onClick={() => setLogoPickerOpen(true)}>
                {logoId ? 'Logo ändern' : 'Logo wählen'}
              </Button>
              {logoId && (
                <Button size="small" color="inherit" onClick={() => setLogoId(null)}>
                  Entfernen
                </Button>
              )}
            </Stack>
            <EntityLogoPicker
              open={logoPickerOpen}
              onClose={() => setLogoPickerOpen(false)}
              onSelect={(id) => { setLogoId(id); setLogoPickerOpen(false); }}
              currentLogoId={logoId}
              defaultName={name}
            />
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
export function EntryModal({ goals, preselectedGoal, onSave, onClose }) {
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
          <Table size="small" sx={{ borderCollapse: 'collapse' }}>
            <TableHead>
              <tr>
                <th style={{ ...headStyle, textAlign: 'left' }}>Name</th>
                <th style={{ ...headStyle, textAlign: 'right' }}>Nominalwert</th>
                <th style={{ ...headStyle, textAlign: 'right' }}>Kupon p.a.</th>
                <th style={{ ...headStyle, textAlign: 'right' }}>Kupon (€/Jahr)</th>
                <th style={{ ...headStyle, textAlign: 'right' }}>Intervall</th>
                <th style={{ ...headStyle, textAlign: 'right' }}>Fälligkeit</th>
                <th style={{ ...headStyle, textAlign: 'right' }}>Restlaufzeit</th>
              </tr>
            </TableHead>
            <TableBody>
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
            </TableBody>
          </Table>
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
          <Table size="small" sx={{ borderCollapse: 'collapse' }}>
            <TableHead>
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
            </TableHead>
            <TableBody>
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
            </TableBody>
            <TableFooter>
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
            </TableFooter>
          </Table>
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
  const navigate = useNavigate();
  const { goals, entries, loading, error, addGoal, updateGoal, deleteGoal, addEntry, deleteEntry } = useSavings();
  const { policies: etfPolicies } = useETFPolicen();

  const [activeTab, setActiveTab]       = useState('uebersicht');
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editGoal, setEditGoal]         = useState(null);
  const [entryModal, setEntryModal]     = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Filter-Kategorie & Layout-Modus (analog Verbindlichkeiten)
  const [katFilter, setKatFilter] = useState('all');
  const [cardView,  setCardView]  = useState(() => {
    try { return localStorage.getItem('assetCardView') ?? 'grid'; }
    catch { return 'grid'; }
  });
  function changeCardView(v) {
    if (!v) return;
    setCardView(v);
    try { localStorage.setItem('assetCardView', v); } catch {}
  }

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
        title="Asset Manager" icon="savings"
        subtitle="Rücklagen · Tagesgeld · Anleihen · Private Investments"
        actions={
          !(showGoalForm || editGoal) && activeTab === 'uebersicht' ? (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setShowGoalForm(true)}>
              Neues Asset
            </Button>
          ) : null
        }
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
            <Tab value="anleihen" label="Anleihen" />
            <Tab value="monatstracker" label="Monatstracker" />
            <Tab value="verlauf" label="Verlauf" />
          </Tabs>
        </Box>

        {/* Übersicht */}
        {activeTab === 'uebersicht' && (
          <Stack spacing={3}>
            {(showGoalForm || editGoal) && (
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

            {/* Filter-Chips + Raster/Liste-Toggle (analog Verbindlichkeiten) */}
            {goals.length > 0 && (() => {
              const onEdit = (goal) => {
                setEditGoal(goal);
                setShowGoalForm(false);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              };
              const onDelete = (id) => {
                const target = goals.find((x) => x.id === id);
                setConfirmDelete(target);
              };

              const filteredGoals = katFilter === 'all'
                ? goals
                : goals.filter((g) => (g.kategorie ?? 'rücklagen') === katFilter);

              const katCounts = KATEGORIEN.reduce((acc, { value }) => {
                acc[value] = (grouped[value] ?? []).length;
                return acc;
              }, {});

              return (
                <Stack spacing={2}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between"
                    spacing={1.5} flexWrap="wrap" useFlexGap>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <Chip
                        label={`Alle (${goals.length})`}
                        onClick={() => setKatFilter('all')}
                        color={katFilter === 'all' ? 'primary' : 'default'}
                        variant={katFilter === 'all' ? 'filled' : 'outlined'}
                        sx={{ fontWeight: 600 }}
                      />
                      {KATEGORIEN.map(({ value, label, icon }) => (
                        katCounts[value] > 0 && (
                          <Chip
                            key={value}
                            icon={
                              <Box component="span" className="material-symbols-outlined"
                                sx={{ fontSize: 16, ml: 0.5 }}>
                                {icon}
                              </Box>
                            }
                            label={`${label} (${katCounts[value]})`}
                            onClick={() => setKatFilter(value)}
                            color={katFilter === value ? 'primary' : 'default'}
                            variant={katFilter === value ? 'filled' : 'outlined'}
                            sx={{ fontWeight: 600 }}
                          />
                        )
                      ))}
                    </Stack>
                    <ToggleButtonGroup
                      size="small"
                      value={cardView}
                      exclusive
                      onChange={(_, v) => changeCardView(v)}
                      aria-label="Kachel-Layout"
                    >
                      <ToggleButton value="grid" aria-label="Raster">
                        <Box component="span" className="material-symbols-outlined"
                          sx={{ fontSize: 18, mr: 0.5 }}>
                          view_module
                        </Box>
                        Raster
                      </ToggleButton>
                      <ToggleButton value="list" aria-label="Liste">
                        <Box component="span" className="material-symbols-outlined"
                          sx={{ fontSize: 18, mr: 0.5 }}>
                          view_list
                        </Box>
                        Liste
                      </ToggleButton>
                    </ToggleButtonGroup>
                  </Stack>

                  {filteredGoals.length === 0 ? (
                    <SectionCard>
                      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                        Keine Assets in dieser Kategorie.
                      </Typography>
                    </SectionCard>
                  ) : (
                    <Box sx={cardView === 'list' ? {
                      display: 'flex', flexDirection: 'column', gap: 1.5,
                      '& > *': { width: '100%', maxWidth: 'none' },
                    } : {
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                      gap: 1.5,
                    }}>
                      {filteredGoals.map((g) => (
                        <GoalCard
                          key={g.id} goal={g} entries={entries} etfPolicies={etfPolicies ?? []}
                          view={cardView}
                          onAddEntry={(goal) => setEntryModal(goal)}
                          onEdit={onEdit}
                          onDelete={onDelete}
                          onOpenDetails={(goal) => navigate(`/guthaben/asset/${goal.id}`)}
                        />
                      ))}
                    </Box>
                  )}
                </Stack>
              );
            })()}
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
