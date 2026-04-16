import { useState, useMemo } from 'react';
import {
  Box, Stack, Typography, Button, IconButton, TextField, MenuItem, Avatar,
  LinearProgress, Chip, Alert, ToggleButton, ToggleButtonGroup,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Fab, Divider, CircularProgress,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import AddIcon                  from '@mui/icons-material/Add';
import DeleteOutlineIcon        from '@mui/icons-material/DeleteOutline';
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined';
import DirectionsCarOutlinedIcon from '@mui/icons-material/DirectionsCarOutlined';
import HomeOutlinedIcon         from '@mui/icons-material/HomeOutlined';
import RestaurantOutlinedIcon   from '@mui/icons-material/RestaurantOutlined';
import CelebrationOutlinedIcon  from '@mui/icons-material/CelebrationOutlined';
import CheckroomOutlinedIcon    from '@mui/icons-material/CheckroomOutlined';
import LocalHospitalOutlinedIcon from '@mui/icons-material/LocalHospitalOutlined';
import MoreHorizOutlinedIcon    from '@mui/icons-material/MoreHorizOutlined';
import TrendingUpOutlinedIcon   from '@mui/icons-material/TrendingUpOutlined';
import { PageHeader, SectionCard } from '../components/mui';
import {
  useHouseholdSettings, useHouseholdTransactions, useBudgetStats, ymd,
} from '../hooks/useHouseholdBudget';

// ── Kategorien ───────────────────────────────────────────────
const CATEGORIES = [
  { key: 'grocery',   label: 'Lebensmittel', icon: ShoppingCartOutlinedIcon },
  { key: 'transport', label: 'Verkehr',      icon: DirectionsCarOutlinedIcon },
  { key: 'household', label: 'Haushalt',     icon: HomeOutlinedIcon },
  { key: 'dining',    label: 'Restaurant',   icon: RestaurantOutlinedIcon },
  { key: 'leisure',   label: 'Freizeit',     icon: CelebrationOutlinedIcon },
  { key: 'clothing',  label: 'Kleidung',     icon: CheckroomOutlinedIcon },
  { key: 'health',    label: 'Gesundheit',   icon: LocalHospitalOutlinedIcon },
  { key: 'other',     label: 'Sonstiges',    icon: MoreHorizOutlinedIcon },
];
const CAT_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

// Stable pastel color per user_id for avatars
function colorFromId(id = '') {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h}, 45%, 55%)`;
}
function initials(nameOrEmail = '?') {
  const parts = nameOrEmail.split(/[\s.@]+/).filter(Boolean);
  return (parts[0]?.[0] + (parts[1]?.[0] || '')).toUpperCase() || '?';
}
function fmtEur(v, d = 2) {
  return Number(v || 0).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' €';
}

// ═══════════════════════════════════════════════════════════
export default function HouseholdBudgetPage() {
  const theme = useTheme();
  const { householdId, weeklyLimit, monthlyLimit, loading: settingsLoading,
          createHousehold, joinHousehold, leaveHousehold, updateSettings } = useHouseholdSettings();
  const { transactions, members, loading: txLoading, addTransaction, deleteTransaction }
    = useHouseholdTransactions(householdId);

  const [mode, setMode]         = useState('week');        // 'week' | 'month'
  const [dialogOpen, setDialogOpen] = useState(false);
  const stats = useBudgetStats(transactions, weeklyLimit, monthlyLimit, mode);

  // ── Setup-Screen (kein Household konfiguriert) ─────────────
  if (settingsLoading) {
    return (
      <Box sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
        <CircularProgress size={20} />
        <Typography variant="body2" color="text.secondary">Lade Haushaltsdaten…</Typography>
      </Box>
    );
  }

  if (!householdId) {
    return <SetupScreen onCreate={createHousehold} onJoin={joinHousehold} />;
  }

  // ── Haupt-Screen ───────────────────────────────────────────
  const memberMap = Object.fromEntries(members.map((m) => [m.user_id, m]));
  const periodTransactions = transactions.filter(
    (t) => t.occurred_at >= ymd(stats.periodStart) && t.occurred_at <= ymd(stats.periodEnd)
  );
  const grouped = groupByDay(periodTransactions);

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 960, pb: 10 }}>
      <PageHeader
        title="Gemeinschaftsbudget"
        subtitle="Wochen- und Monatsbudget für das Gemeinschaftskonto"
        action={
          <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, v) => v && setMode(v)}>
            <ToggleButton value="week">Diese Woche</ToggleButton>
            <ToggleButton value="month">Diesen Monat</ToggleButton>
          </ToggleButtonGroup>
        }
      />

      <Stack spacing={2}>
        <BudgetProgressCard stats={stats} mode={mode} />

        <Box sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(188px, 1fr))',
          gap: 2,
        }}>
          <KpiTile label="Ausgaben"       value={fmtEur(stats.expenses)} color="error.main" />
          <KpiTile label="Einnahmen"      value={fmtEur(stats.income)}   color="success.main" />
          <KpiTile label="Tages-Reserve"  value={fmtEur(stats.dailyReserve)} sub={`${stats.daysLeft} Tage übrig`} color="primary.main" />
          <KpiTile label="Verbleibend"    value={fmtEur(stats.remaining)} color={`${stats.severity}.main`} />
        </Box>

        <SectionCard
          title={`Transaktionen (${mode === 'week' ? 'diese Woche' : 'dieser Monat'})`}
          action={
            <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
              Erfassen
            </Button>
          }
        >
          {periodTransactions.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              Noch keine Transaktionen. Klicke auf „Erfassen".
            </Typography>
          ) : (
            <Stack spacing={2}>
              {grouped.map(([day, items]) => (
                <Box key={day}>
                  <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                    {formatDayHeader(day)}
                  </Typography>
                  <Stack divider={<Divider flexItem />}>
                    {items.map((t) => (
                      <TransactionRow
                        key={t.id}
                        tx={t}
                        member={memberMap[t.user_id]}
                        onDelete={() => deleteTransaction(t.id)}
                      />
                    ))}
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}
        </SectionCard>

        <HouseholdManagement
          householdId={householdId}
          weeklyLimit={weeklyLimit}
          monthlyLimit={monthlyLimit}
          members={members}
          onUpdate={updateSettings}
          onLeave={leaveHousehold}
        />
      </Stack>

      {/* Quick-Add FAB (mobile) */}
      <Fab
        color="primary"
        onClick={() => setDialogOpen(true)}
        sx={{ position: 'fixed', bottom: 24, right: 24, display: { xs: 'flex', sm: 'none' } }}
      >
        <AddIcon />
      </Fab>

      <QuickAddDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={async (tx) => { await addTransaction(tx); setDialogOpen(false); }}
      />
    </Box>
  );
}

// ─── Progress-Card mit Ampel ───────────────────────────────────
function BudgetProgressCard({ stats, mode }) {
  const label = mode === 'week' ? 'Noch für diese Woche' : 'Noch für diesen Monat';
  const periodLabel = `${stats.periodStart.toLocaleDateString('de-DE')} – ${stats.periodEnd.toLocaleDateString('de-DE')}`;
  const barPct = Math.min(100, stats.percentUsed);

  return (
    <SectionCard>
      <Stack spacing={1.5}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-end">
          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {label}
            </Typography>
            <Typography variant="h3" sx={{ color: `${stats.severity}.main`, fontWeight: 700, fontFamily: 'monospace', lineHeight: 1 }}>
              {fmtEur(stats.remaining)}
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary">{periodLabel}</Typography>
        </Stack>

        <LinearProgress
          variant="determinate"
          value={barPct}
          color={stats.severity}
          sx={{ height: 12, borderRadius: 99, bgcolor: 'action.hover' }}
        />

        <Stack direction="row" justifyContent="space-between">
          <Typography variant="caption" color="text.secondary">
            {fmtEur(stats.netSpent)} von {fmtEur(stats.limit)} ausgegeben ({stats.percentUsed.toFixed(0)} %)
          </Typography>
          <Chip
            icon={<TrendingUpOutlinedIcon fontSize="small" />}
            size="small"
            color={stats.severity}
            variant="outlined"
            label={`Heute noch ${fmtEur(stats.dailyReserve)}`}
          />
        </Stack>
      </Stack>
    </SectionCard>
  );
}

function KpiTile({ label, value, sub, color }) {
  return (
    <Box sx={(t) => ({
      minWidth: 188,
      border: 1, borderColor: 'divider',
      borderLeft: `3px solid ${t.palette[color?.split('.')[0]]?.main || t.palette.primary.main}`,
      borderRadius: 1, p: 1.5,
      bgcolor: 'background.paper',
    })}>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </Typography>
      <Typography variant="h6" sx={{ color, fontWeight: 700, fontFamily: 'monospace', lineHeight: 1.2, mt: 0.5 }}>
        {value}
      </Typography>
      {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
    </Box>
  );
}

// ─── Quick-Add-Dialog (Mobile first) ───────────────────────────
function QuickAddDialog({ open, onClose, onSave }) {
  const [amount,      setAmount]      = useState('');
  const [category,    setCategory]    = useState('grocery');
  const [type,        setType]        = useState('expense');
  const [description, setDescription] = useState('');
  const [occurredAt,  setOccurredAt]  = useState(ymd(new Date()));
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState(null);

  function reset() {
    setAmount(''); setCategory('grocery'); setType('expense');
    setDescription(''); setOccurredAt(ymd(new Date())); setError(null);
  }
  async function handleSave() {
    const n = parseFloat(String(amount).replace(',', '.'));
    if (!n || n <= 0) { setError('Betrag fehlt'); return; }
    setSaving(true); setError(null);
    try {
      await onSave({ amount: n, category, type, description, occurred_at: occurredAt });
      reset();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" onTransitionExited={reset}>
      <DialogTitle sx={{ pb: 1 }}>Neue Buchung</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <ToggleButtonGroup fullWidth exclusive size="small" value={type} onChange={(_, v) => v && setType(v)}>
            <ToggleButton value="expense" color="error">Ausgabe</ToggleButton>
            <ToggleButton value="income"  color="success">Einnahme</ToggleButton>
          </ToggleButtonGroup>

          <TextField
            autoFocus fullWidth
            label="Betrag" type="number" value={amount}
            onChange={(e) => setAmount(e.target.value)}
            InputProps={{ endAdornment: <Typography color="text.secondary">€</Typography> }}
            inputProps={{ step: 0.01, min: 0, inputMode: 'decimal' }}
          />

          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mb: 1 }}>
              Kategorie
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1 }}>
              {CATEGORIES.map((c) => {
                const Icon = c.icon;
                const selected = category === c.key;
                return (
                  <IconButton
                    key={c.key}
                    onClick={() => setCategory(c.key)}
                    sx={(t) => ({
                      flexDirection: 'column', gap: 0.25, borderRadius: 1,
                      border: 1, borderColor: selected ? 'primary.main' : 'divider',
                      bgcolor: selected ? 'action.selected' : 'background.paper',
                      color: selected ? 'primary.main' : 'text.primary',
                      py: 1,
                    })}
                  >
                    <Icon fontSize="small" />
                    <Typography variant="caption" sx={{ fontSize: '0.65rem', fontWeight: 600 }}>{c.label}</Typography>
                  </IconButton>
                );
              })}
            </Box>
          </Box>

          <TextField
            fullWidth label="Beschreibung (optional)" value={description}
            onChange={(e) => setDescription(e.target.value)} size="small"
          />
          <TextField
            fullWidth label="Datum" type="date" value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)} size="small"
            InputLabelProps={{ shrink: true }}
          />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Abbrechen</Button>
        <Button onClick={handleSave} variant="contained" disabled={saving}>
          {saving ? 'Speichern…' : 'Speichern'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Transaction-Row ──────────────────────────────────────────
function TransactionRow({ tx, member, onDelete }) {
  const cat = CAT_BY_KEY[tx.category] ?? CAT_BY_KEY.other;
  const CatIcon = cat.icon;
  const isIncome = tx.type === 'income';
  const name = member?.display_name || member?.email || '?';

  return (
    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ py: 1 }}>
      <Avatar sx={{ width: 32, height: 32, bgcolor: colorFromId(tx.user_id), fontSize: '0.75rem', fontWeight: 700 }}>
        {initials(name)}
      </Avatar>
      <CatIcon fontSize="small" sx={{ color: 'text.secondary' }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
          {tx.description || cat.label}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {cat.label} · {name}
        </Typography>
      </Box>
      <Typography variant="body2" sx={{ color: isIncome ? 'success.main' : 'error.main', fontWeight: 700, fontFamily: 'monospace' }}>
        {isIncome ? '+' : '−'} {fmtEur(tx.amount)}
      </Typography>
      <IconButton size="small" onClick={onDelete} sx={{ color: 'text.disabled' }}>
        <DeleteOutlineIcon fontSize="small" />
      </IconButton>
    </Stack>
  );
}

// ─── Haushalts-Einstellungen (Limits + Partner-Join) ──────────
function HouseholdManagement({ householdId, weeklyLimit, monthlyLimit, members, onUpdate, onLeave }) {
  const [copied, setCopied] = useState(false);
  const [wl, setWl] = useState(weeklyLimit);
  const [ml, setMl] = useState(monthlyLimit);

  async function copyId() {
    try { await navigator.clipboard.writeText(householdId); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  }
  function saveLimit(patch) { onUpdate(patch); }

  return (
    <SectionCard title="Haushalts-Einstellungen">
      <Stack spacing={2}>
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 600, mb: 0.5 }}>
            Haushalts-ID (an Partner weitergeben, damit er beitreten kann)
          </Typography>
          <Stack direction="row" spacing={1}>
            <TextField size="small" fullWidth value={householdId} InputProps={{ readOnly: true, sx: { fontFamily: 'monospace', fontSize: '0.75rem' } }} />
            <Button variant="outlined" size="small" onClick={copyId}>{copied ? '✓ Kopiert' : 'Kopieren'}</Button>
          </Stack>
        </Box>

        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 600, mb: 0.5 }}>
            Mitglieder ({members.length})
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {members.map((m) => (
              <Chip key={m.user_id}
                avatar={<Avatar sx={{ bgcolor: colorFromId(m.user_id) + ' !important' }}>{initials(m.display_name || m.email)}</Avatar>}
                label={m.display_name || m.email} variant="outlined" />
            ))}
          </Stack>
        </Box>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            fullWidth size="small" label="Wochenlimit" type="number"
            value={wl} onChange={(e) => setWl(e.target.value)}
            onBlur={() => saveLimit({ household_weekly_limit: Number(wl) || 0 })}
            InputProps={{ endAdornment: <Typography color="text.secondary">€</Typography> }}
          />
          <TextField
            fullWidth size="small" label="Monatslimit" type="number"
            value={ml} onChange={(e) => setMl(e.target.value)}
            onBlur={() => saveLimit({ household_monthly_limit: Number(ml) || 0 })}
            InputProps={{ endAdornment: <Typography color="text.secondary">€</Typography> }}
          />
        </Stack>

        <Button color="error" size="small" variant="text" onClick={onLeave} sx={{ alignSelf: 'flex-start' }}>
          Haushalt verlassen
        </Button>
      </Stack>
    </SectionCard>
  );
}

// ─── Setup-Screen (erstmalige Konfig) ─────────────────────────
function SetupScreen({ onCreate, onJoin }) {
  const [joinId, setJoinId] = useState('');
  const [busy,   setBusy]   = useState(false);
  const [error,  setError]  = useState(null);

  async function handleCreate() {
    setBusy(true); setError(null);
    try { await onCreate(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function handleJoin() {
    if (!joinId.trim()) { setError('Bitte Haushalts-ID eingeben'); return; }
    setBusy(true); setError(null);
    try { await onJoin(joinId.trim()); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 640 }}>
      <PageHeader title="Gemeinschaftsbudget" subtitle="Haushalt einrichten" />
      <Stack spacing={2}>
        <SectionCard title="Neuen Haushalt anlegen">
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Erstelle einen neuen Haushalt und teile die ID mit deinem Partner,
            damit er beitreten kann. Alle Transaktionen sind dann für beide sichtbar.
          </Typography>
          <Button variant="contained" onClick={handleCreate} disabled={busy} startIcon={<AddIcon />}>
            Neuen Haushalt anlegen
          </Button>
        </SectionCard>

        <SectionCard title="Bestehendem Haushalt beitreten">
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Dein Partner hat bereits einen Haushalt angelegt? Lass dir die ID geben
            und füge sie hier ein.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField fullWidth size="small" placeholder="Haushalts-ID (UUID)" value={joinId} onChange={(e) => setJoinId(e.target.value)} />
            <Button variant="outlined" onClick={handleJoin} disabled={busy}>Beitreten</Button>
          </Stack>
        </SectionCard>

        {error && <Alert severity="error">{error}</Alert>}
      </Stack>
    </Box>
  );
}

// ─── Helpers ──────────────────────────────────────────────────
function groupByDay(txs) {
  const map = {};
  for (const t of txs) {
    (map[t.occurred_at] ??= []).push(t);
  }
  return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
}
function formatDayHeader(iso) {
  const d = new Date(iso + 'T00:00');
  const today = ymd(new Date());
  if (iso === today) return `Heute · ${d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}`;
  return d.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'short' });
}
