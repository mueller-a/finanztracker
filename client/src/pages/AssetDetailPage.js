// Detail-Seite pro Asset (Spar-Goal / Tagesgeld / Anleihe / Private Investment)
// Analog zu DebtDetailPage:
//   - Top-Bar mit Back-Button + Name + Aktionen (Edit, Delete, Zahlung)
//   - Hero mit Saldo-Verlauf-Chart + Time-Range-Toggle
//   - Buchungen-Tabelle (savings_entries) mit Edit/Delete

import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Stack, Typography, Button, IconButton, Paper, ToggleButton, ToggleButtonGroup,
  CircularProgress, Alert, Chip, Table, TableHead, TableBody, MenuItem, Menu,
  Dialog, DialogTitle, DialogContent, LinearProgress,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import CloseIcon from '@mui/icons-material/Close';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartTooltip, ResponsiveContainer,
} from 'recharts';

import { useSavings } from '../hooks/useSavings';
import { useETFPolicen } from '../hooks/useETFPolicen';
import { ConfirmDialog } from '../components/mui';
import EntityIcon from '../components/EntityIcon';
import {
  KATEGORIEN, effectiveBalance, activeEntries,
  GoalForm, EntryModal,
} from './GuthabenPage';

const TODAY = new Date();
const fmt0 = (n) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: 0 });
const fmt2 = (n) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt4 = (n) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const fmtDateLong = (iso) => iso ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }) : '–';
const fmtMonth    = (iso) => new Date(iso).toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });

const RANGES = [
  { value: '1m',  label: '1M',  months: 1   },
  { value: 'ytd', label: 'YTD' },
  { value: '1y',  label: '1J',  months: 12  },
  { value: '3y',  label: '3J',  months: 36  },
  { value: '5y',  label: '5J',  months: 60  },
  { value: 'all', label: 'All' },
];

const TYPE_META = {
  einzahlung: { label: 'Einzahlung', sign: '+', color: 'success' },
  entnahme:   { label: 'Entnahme',   sign: '−', color: 'error'   },
  neustart:   { label: 'Neustart',   sign: '+', color: 'warning' },
};

// Saldo-Verlauf aus Entries rekonstruieren (chronologisch, kumulativ).
// Bei 'neustart' wird der Saldo auf den Eintrag-Betrag gesetzt (nicht addiert),
// analog zu activeEntries-Logik in GuthabenPage.
function buildBalanceSeries(entries) {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.date) - new Date(b.date) || new Date(a.created_at) - new Date(b.created_at),
  );
  let bal = 0;
  const series = [];
  for (const e of sorted) {
    if (e.type === 'neustart')        bal  = Number(e.amount) || 0;
    else if (e.type === 'einzahlung') bal += Number(e.amount) || 0;
    else if (e.type === 'entnahme')   bal -= Number(e.amount) || 0;
    series.push({ date: e.date, balance: Math.round(bal * 100) / 100 });
  }
  return series;
}

function rangeStartIso(range, firstIso) {
  const now = new Date();
  if (range.value === 'all') return firstIso;
  if (range.value === 'ytd') {
    return new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
  }
  const cutoff = new Date(now.getFullYear(), now.getMonth() - range.months + 1, 1);
  return cutoff.toISOString().split('T')[0];
}

function BalanceChart({ goal, series, range }) {
  const theme = useTheme();

  const data = useMemo(() => {
    if (series.length === 0) return [];
    const start = rangeStartIso(range, series[0].date);
    return series
      .filter((e) => e.date >= start)
      .map((e) => ({
        date:    e.date,
        label:   fmtMonth(e.date),
        balance: e.balance,
      }));
  }, [series, range]);

  if (data.length === 0) {
    return (
      <Box sx={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Keine Buchungen im gewählten Zeitraum.
        </Typography>
      </Box>
    );
  }

  const accent = goal.color_code || theme.palette.primary.main;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`asset-grad-${goal.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor={accent} stopOpacity={0.35} />
            <stop offset="100%" stopColor={accent} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
        <XAxis dataKey="label"
          tick={{ fill: theme.palette.text.secondary, fontSize: 11 }}
          axisLine={false} tickLine={false} minTickGap={32} />
        <YAxis tick={{ fill: theme.palette.text.secondary, fontSize: 11 }}
          axisLine={false} tickLine={false}
          tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}K €` : `${v} €`}
          width={60} />
        <RechartTooltip
          formatter={(v) => [`${fmt2(v)} €`, 'Saldo']}
          labelFormatter={(label, payload) => payload?.[0]?.payload?.date
            ? fmtDateLong(payload[0].payload.date) : label}
          contentStyle={{
            background: theme.palette.background.paper,
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 8, fontSize: 12,
          }}
        />
        <Area type="monotone" dataKey="balance"
          stroke={accent} strokeWidth={2}
          fill={`url(#asset-grad-${goal.id})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function EntriesTable({ entries, onDelete }) {
  const theme = useTheme();

  if (entries.length === 0) {
    return (
      <Paper variant="outlined" sx={{ borderRadius: '16px', p: 4, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Noch keine Buchungen erfasst.
        </Typography>
      </Paper>
    );
  }

  const TH = ({ children, align = 'left' }) => (
    <th style={{
      padding: '10px 14px', textAlign: align,
      color: theme.palette.text.secondary,
      fontSize: '0.65rem', fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.08em',
      background: theme.palette.action.hover,
      whiteSpace: 'nowrap',
    }}>{children}</th>
  );

  return (
    <Paper variant="outlined" sx={{ borderRadius: '16px', overflow: 'hidden' }}>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ borderCollapse: 'collapse' }}>
          <TableHead>
            <tr>
              <TH>Datum</TH>
              <TH>Typ</TH>
              <TH>Notiz</TH>
              <TH align="right">Betrag</TH>
              <TH align="right">Aktion</TH>
            </tr>
          </TableHead>
          <TableBody>
            {entries.map((e, i) => {
              const meta = TYPE_META[e.type] ?? { label: e.type, sign: '', color: 'default' };
              const valueColor = e.type === 'entnahme' ? theme.palette.error.main
                              : e.type === 'einzahlung' ? theme.palette.success.main
                              : theme.palette.warning.main;
              return (
                <tr key={e.id} style={{
                  borderTop: `1px solid ${theme.palette.divider}`,
                  background: i % 2 === 1 ? theme.palette.action.hover : 'transparent',
                }}>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    {fmtDateLong(e.date)}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <Chip label={meta.label} size="small" color={meta.color}
                      variant="outlined"
                      sx={{ height: 22, fontSize: '0.65rem', fontWeight: 700 }} />
                  </td>
                  <td style={{
                    padding: '10px 14px', color: theme.palette.text.secondary,
                    fontSize: '0.85rem', maxWidth: 360,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {e.note || '—'}
                  </td>
                  <td style={{
                    padding: '10px 14px', textAlign: 'right',
                    fontFamily: 'monospace', fontWeight: 700, fontSize: '0.95rem',
                    color: valueColor, whiteSpace: 'nowrap',
                  }}>
                    {meta.sign} {fmt2(e.amount)} €
                  </td>
                  <td style={{ padding: '6px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <IconButton size="small" color="error" onClick={() => onDelete(e)}
                      title="Buchung löschen">
                      <DeleteOutlineIcon sx={{ fontSize: 16 }} />
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

export default function AssetDetailPage() {
  const { goalId } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const {
    goals, entries, loading, error,
    updateGoal, deleteGoal, addEntry, deleteEntry,
  } = useSavings();
  const { policies: etfPolicies } = useETFPolicen();

  const [range, setRange]                       = useState(RANGES[5]); // All-time
  const [moreMenuAnchor, setMoreMenuAnchor]     = useState(null);
  const [editGoalOpen, setEditGoalOpen]         = useState(false);
  const [confirmDeleteGoal, setConfirmDeleteGoal] = useState(false);
  const [confirmDeleteEntry, setConfirmDeleteEntry] = useState(null);
  const [entryModalOpen, setEntryModalOpen]     = useState(false);

  const goal = useMemo(() => goals.find((g) => g.id === goalId), [goals, goalId]);
  const goalEntries = useMemo(
    () => activeEntries(goalId, entries)
            .sort((a, b) => new Date(b.date) - new Date(a.date)
                          || new Date(b.created_at) - new Date(a.created_at)),
    [goalId, entries],
  );
  const balance = useMemo(
    () => goal ? effectiveBalance(goal, entries, etfPolicies ?? []) : 0,
    [goal, entries, etfPolicies],
  );
  const series = useMemo(
    () => activeEntries(goalId, entries).length > 0
      ? buildBalanceSeries(activeEntries(goalId, entries))
      : [],
    [goalId, entries],
  );

  const katMeta = goal ? KATEGORIEN.find((k) => k.value === goal.kategorie) : null;
  const hasTarget = goal?.target_amount != null && Number(goal.target_amount) > 0;
  const targetPct = hasTarget ? Math.min(100, (balance / Number(goal.target_amount)) * 100) : 0;
  const done = hasTarget && targetPct >= 100;

  if (loading) {
    return (
      <Stack alignItems="center" justifyContent="center" sx={{ minHeight: 240, color: 'text.secondary' }}>
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

  if (!goal) {
    return (
      <Box sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
          <IconButton onClick={() => navigate('/guthaben')} aria-label="Zurück">
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Asset nicht gefunden</Typography>
        </Stack>
        <Alert severity="warning">
          Dieses Asset existiert nicht (mehr). Zurück zum <strong>Asset Manager</strong>.
        </Alert>
      </Box>
    );
  }

  async function handleDeleteGoal() {
    await deleteGoal(goal.id);
    setConfirmDeleteGoal(false);
    navigate('/guthaben');
  }

  async function handleDeleteEntry() {
    if (!confirmDeleteEntry) return;
    await deleteEntry(confirmDeleteEntry.id);
    setConfirmDeleteEntry(null);
  }

  async function handleSaveGoal(form) {
    await updateGoal(goal.id, form);
    setEditGoalOpen(false);
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Top bar */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0 }}>
          <IconButton onClick={() => navigate('/guthaben')} aria-label="Zurück">
            <ArrowBackIcon />
          </IconButton>
          <EntityIcon
            logoId={goal.logo_id}
            fallbackIconName={katMeta?.icon ?? 'savings'}
            size={48}
            bgcolor="accent.positiveSurface"
            color="primary.dark"
            borderRadius="12px"
          />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.15 }}>
              {goal.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {katMeta?.label ?? goal.kategorie}
              {goal.faelligkeitsdatum && ` · fällig ${fmtDateLong(goal.faelligkeitsdatum)}`}
              {done && ' · Ziel erreicht'}
            </Typography>
          </Box>
        </Stack>

        <Stack direction="row" spacing={1}>
          <Button variant="contained" startIcon={<AddIcon />}
            onClick={() => setEntryModalOpen(true)}>
            Zahlung erfassen
          </Button>
          <IconButton onClick={(e) => setMoreMenuAnchor(e.currentTarget)} aria-label="Mehr">
            <MoreVertIcon />
          </IconButton>
          <Menu
            anchorEl={moreMenuAnchor}
            open={!!moreMenuAnchor}
            onClose={() => setMoreMenuAnchor(null)}
          >
            <MenuItem onClick={() => { setMoreMenuAnchor(null); setEditGoalOpen(true); }}>
              <EditOutlinedIcon sx={{ fontSize: 18, mr: 1 }} /> Asset bearbeiten
            </MenuItem>
            <MenuItem onClick={() => { setMoreMenuAnchor(null); setConfirmDeleteGoal(true); }} sx={{ color: 'error.main' }}>
              <DeleteOutlineIcon sx={{ fontSize: 18, mr: 1 }} /> Asset löschen
            </MenuItem>
          </Menu>
        </Stack>
      </Stack>

      {/* Hero card: balance + range filter + chart */}
      <Paper variant="outlined" sx={{ borderRadius: '16px', p: { xs: 2, sm: 3 } }}>
        <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }}
          justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
          <Box>
            <Typography sx={{
              fontFamily: '"Manrope", sans-serif',
              fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.05,
              fontSize: { xs: '2rem', sm: '2.5rem' },
            }}>
              {fmt2(balance)} €
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              Aktueller Saldo
              {goal.zinssatz > 0 && ` · ${fmt4(goal.zinssatz)} % p.a.`}
            </Typography>
            {hasTarget && (
              <Box sx={{ mt: 1.5, maxWidth: 320 }}>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    Ziel: {fmt2(goal.target_amount)} €
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>
                    {Math.round(targetPct)} %
                  </Typography>
                </Stack>
                <LinearProgress variant="determinate" value={targetPct}
                  sx={{
                    height: 6, borderRadius: 99, bgcolor: 'action.hover',
                    '& .MuiLinearProgress-bar': {
                      bgcolor: done ? 'accent.positiveSurface' : (goal.color_code || 'primary.main'),
                      borderRadius: 99,
                    },
                  }} />
              </Box>
            )}
          </Box>
          <ToggleButtonGroup
            size="small" exclusive
            value={range.value}
            onChange={(_, v) => { if (v) setRange(RANGES.find((r) => r.value === v)); }}
            sx={{ flexShrink: 0 }}
          >
            {RANGES.map((r) => (
              <ToggleButton key={r.value} value={r.value} sx={{
                px: 1.5, py: 0.5, fontSize: '0.7rem', fontWeight: 700, lineHeight: 1.4,
              }}>
                {r.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Stack>
        <BalanceChart goal={goal} series={series} range={range} />
      </Paper>

      {/* Buchungen */}
      <Box>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: '-0.01em' }}>
            Buchungen
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {goalEntries.length} {goalEntries.length === 1 ? 'Eintrag' : 'Einträge'}
          </Typography>
        </Stack>
        <EntriesTable
          entries={goalEntries}
          onDelete={(e) => setConfirmDeleteEntry(e)}
        />
      </Box>

      {/* Edit-Goal Dialog */}
      <Dialog open={editGoalOpen} onClose={() => setEditGoalOpen(false)}
        maxWidth="sm" fullWidth scroll="paper">
        <DialogTitle sx={{ pr: 6 }}>
          Asset bearbeiten
          <IconButton
            onClick={() => setEditGoalOpen(false)}
            aria-label="Schließen"
            sx={{ position: 'absolute', right: 12, top: 12 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 2.5 }}>
          <GoalForm
            initial={{
              name:              goal.name,
              target_amount:     goal.target_amount,
              monthly_soll:      goal.monthly_soll,
              color_code:        goal.color_code,
              kategorie:         goal.kategorie,
              zinssatz:          goal.zinssatz,
              nominalwert:       goal.nominalwert,
              kupon:             goal.kupon,
              faelligkeitsdatum: goal.faelligkeitsdatum,
              kupon_intervall:   goal.kupon_intervall,
              etf_id:            goal.etf_id,
            }}
            onSave={handleSaveGoal}
            onCancel={() => setEditGoalOpen(false)}
            etfPolicies={etfPolicies ?? []}
          />
        </DialogContent>
      </Dialog>

      {/* Entry-Modal (Add Buchung) */}
      {entryModalOpen && (
        <EntryModal
          goals={[goal]}
          preselectedGoal={goal}
          onSave={addEntry}
          onClose={() => setEntryModalOpen(false)}
        />
      )}

      {/* Confirm dialogs */}
      <ConfirmDialog
        open={confirmDeleteGoal}
        title="Asset löschen?"
        message={`Asset „${goal.name}" und alle Buchungen werden unwiderruflich gelöscht.`}
        onConfirm={handleDeleteGoal}
        onCancel={() => setConfirmDeleteGoal(false)}
      />
      <ConfirmDialog
        open={!!confirmDeleteEntry}
        title="Buchung löschen?"
        message={confirmDeleteEntry
          ? `Buchung vom ${fmtDateLong(confirmDeleteEntry.date)} (${TYPE_META[confirmDeleteEntry.type]?.sign ?? ''}${fmt2(confirmDeleteEntry.amount)} €) wird gelöscht.`
          : ''}
        onConfirm={handleDeleteEntry}
        onCancel={() => setConfirmDeleteEntry(null)}
      />
    </Box>
  );
}
