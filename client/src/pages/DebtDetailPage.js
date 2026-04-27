import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Stack, Typography, Button, IconButton, Paper, ToggleButton, ToggleButtonGroup,
  CircularProgress, Alert, Chip, Table, TableHead, TableBody, MenuItem, Menu,
  Dialog, DialogTitle, DialogContent, Tabs, Tab,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useTheme } from '@mui/material/styles';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartTooltip, ResponsiveContainer,
} from 'recharts';

import { useDebts } from '../hooks/useDebts';
import {
  buildSchedule, buildRevolvingSchedule,
  getCurrentBalance, isRevolving,
} from '../utils/debtCalc';
import { ConfirmDialog } from '../components/mui';
import EntityIcon from '../components/EntityIcon';
import { ExtraPaymentModal, DebtForm } from './VerbindlichkeitenPage';

const TODAY = new Date();
const fmt0  = (n) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmt2  = (n) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDateLong  = (iso) => iso ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }) : '–';
const fmtMonth     = (iso) => new Date(iso).toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });

const RANGES = [
  { value: '1m',  label: '1M',  months: 1   },
  { value: 'ytd', label: 'YTD', months: -1  }, // sentinel: from Jan 1 of current year
  { value: '1y',  label: '1J',  months: 12  },
  { value: '3y',  label: '3J',  months: 36  },
  { value: '5y',  label: '5J',  months: 60  },
  { value: 'all', label: 'All', months: 999 },
];

// Datum-Grenzen für ein Range relativ zu heute (oder heute, wenn das Schedule
// vor heute endet, z.B. fertig getilgte Annuität).
function rangeStartIso(range, scheduleStart, scheduleEnd) {
  const now = new Date();
  if (range.value === 'all') return scheduleStart;
  if (range.value === 'ytd') {
    return new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
  }
  // bei zukünftigen Schedules (z.B. Annuität startet erst): von Schedule-Start aus
  const refEnd = new Date(scheduleEnd);
  const ref = refEnd > now ? now : refEnd;
  const cutoff = new Date(ref.getFullYear(), ref.getMonth() - range.months + 1, 1);
  return cutoff.toISOString().split('T')[0];
}

// ─── Chart-Komponente ─────────────────────────────────────────────────────────
function BalanceChart({ debt, schedule, range }) {
  const theme = useTheme();

  const data = useMemo(() => {
    if (!schedule || schedule.length === 0) return [];
    // Initial-Punkt am Kreditstart: Auszahlung der vollen Kreditsumme.
    // Ohne diesen Punkt zeigt der Chart erst die erste Rate (Monat nach Start).
    const initialPoint = {
      date: debt.start_date,
      label: fmtMonth(debt.start_date),
      balance: Number(debt.total_amount),
    };
    const points = [initialPoint, ...schedule.map((e) => ({
      date: e.date,
      label: fmtMonth(e.date),
      balance: e.balance,
    }))];
    const start = rangeStartIso(range, points[0].date, points[points.length - 1].date);
    return points.filter((p) => p.date >= start);
  }, [debt, schedule, range]);

  if (data.length === 0) {
    return (
      <Box sx={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" color="text.secondary">Keine Daten im gewählten Zeitraum.</Typography>
      </Box>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor={theme.palette.primary.main} stopOpacity={0.35} />
            <stop offset="100%" stopColor={theme.palette.primary.main} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: theme.palette.text.secondary, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          minTickGap={32}
        />
        <YAxis
          tick={{ fill: theme.palette.text.secondary, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}K €` : `${v} €`}
          width={60}
        />
        <RechartTooltip
          formatter={(v) => [`${fmt2(v)} €`, 'Restschuld']}
          labelFormatter={(label, payload) => payload?.[0]?.payload?.date
            ? fmtDateLong(payload[0].payload.date) : label}
          contentStyle={{
            background: theme.palette.background.paper,
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 8, fontSize: 12,
          }}
        />
        <Area
          type="monotone" dataKey="balance"
          stroke={theme.palette.primary.main} strokeWidth={2}
          fill="url(#balanceGrad)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Buchungen-Tabelle ────────────────────────────────────────────────────────
// Zeigt zusammengeführt: reguläre Tilgungsraten aus dem Schedule (vergangen,
// nicht editierbar) + alle debt_payments (Sondertilgung / Abbuchung, editierbar).
function BookingsTable({ rows, onEdit, onDelete }) {
  const theme = useTheme();
  if (rows.length === 0) {
    return (
      <Paper variant="outlined" sx={{ borderRadius: '16px', p: 4, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Noch keine Buchungen für diesen Kredit.
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

  const typeMeta = {
    schedule:    { label: 'Reguläre Rate', color: 'default' },
    repayment:   { label: 'Sondertilgung', color: 'success' },
    withdrawal:  { label: 'Abbuchung',     color: 'warning' },
  };

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
              <TH align="right">Aktionen</TH>
            </tr>
          </TableHead>
          <TableBody>
            {rows.map((r, i) => {
              const meta = typeMeta[r.kind];
              const editable = r.kind !== 'schedule';
              const isOutflow = r.kind === 'repayment' || r.kind === 'schedule';
              const valueColor = r.kind === 'withdrawal' ? theme.palette.warning.main
                              : r.kind === 'schedule'   ? theme.palette.text.primary
                              :                            theme.palette.success.main;
              return (
                <tr key={r.key} style={{
                  borderTop: `1px solid ${theme.palette.divider}`,
                  background: i % 2 === 1 ? theme.palette.action.hover : 'transparent',
                }}>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    {fmtDateLong(r.date)}
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
                    {r.note || '—'}
                  </td>
                  <td style={{
                    padding: '10px 14px', textAlign: 'right',
                    fontFamily: 'monospace', fontWeight: 700, fontSize: '0.95rem',
                    color: valueColor, whiteSpace: 'nowrap',
                  }}>
                    {isOutflow ? '−' : '+'} {fmt2(r.amount)} €
                  </td>
                  <td style={{ padding: '6px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {editable ? (
                      <>
                        <IconButton size="small" onClick={() => onEdit(r.payment)} title="Bearbeiten">
                          <EditOutlinedIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => onDelete(r.payment)} title="Löschen">
                          <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </>
                    ) : (
                      <Typography variant="caption" color="text.disabled" sx={{ pr: 1 }}>auto</Typography>
                    )}
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

// ─── Tilgungsplan-Tabelle (alle Schedule-Einträge, Vergangenheit + Zukunft) ──
function ScheduleTable({ schedule }) {
  const theme = useTheme();
  if (!schedule || schedule.length === 0) {
    return (
      <Paper variant="outlined" sx={{ borderRadius: '16px', p: 4, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Kein Tilgungsplan verfügbar.
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
      position: 'sticky', top: 0,
    }}>{children}</th>
  );

  const todayKey = new Date().toISOString().slice(0, 7);

  return (
    <Paper variant="outlined" sx={{ borderRadius: '16px', overflow: 'hidden' }}>
      <Box sx={{ overflow: 'auto', maxHeight: 480 }}>
        <Table size="small" sx={{ borderCollapse: 'collapse' }}>
          <TableHead>
            <tr>
              <TH>Monat</TH>
              <TH align="right">Rate</TH>
              <TH align="right">Zinsen</TH>
              <TH align="right">Tilgung</TH>
              <TH align="right">Sondertilgung</TH>
              <TH align="right">Restschuld</TH>
            </tr>
          </TableHead>
          <TableBody>
            {schedule.map((e, i) => {
              const isPast    = e.date <= new Date().toISOString().slice(0, 10);
              const isCurrent = e.monthKey === todayKey || e.date.slice(0, 7) === todayKey;
              const rate      = (Number(e.zinsen) || 0) + (Number(e.tilgung) || 0);
              return (
                <tr key={i} style={{
                  borderTop: `1px solid ${theme.palette.divider}`,
                  background: isCurrent
                    ? (theme.palette.mode === 'dark' ? 'rgba(245,158,11,0.15)' : '#fef3c7')
                    : (i % 2 === 1 ? theme.palette.action.hover : 'transparent'),
                  opacity: isPast ? 1 : 0.85,
                }}>
                  <td style={{ padding: '8px 14px', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                    {fmtDateLong(e.date)}
                  </td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                    {fmt2(rate)} €
                  </td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.85rem',
                    color: theme.palette.error.main }}>
                    {fmt2(e.zinsen)} €
                  </td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.85rem',
                    color: theme.palette.success.main }}>
                    {fmt2(e.tilgung)} €
                  </td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.85rem',
                    color: e.extra > 0 ? theme.palette.success.main : theme.palette.text.disabled }}>
                    {e.extra > 0 ? `${fmt2(e.extra)} €` : '–'}
                  </td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.9rem',
                    fontWeight: 700,
                    color: e.balance === 0 ? theme.palette.success.main : theme.palette.text.primary }}>
                    {e.balance === 0 ? '✓ Abbezahlt' : fmt2(e.balance)}
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

// ─── DebtDetailPage ───────────────────────────────────────────────────────────
export default function DebtDetailPage() {
  const { debtId } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const {
    debts, payments, loading, error,
    updateDebt, deleteDebt, deletePayment,
    addPayment, updatePayment,
  } = useDebts();

  const [range, setRange]                 = useState(RANGES[5]); // All-time
  const [confirmDeleteDebt,    setConfirmDeleteDebt]    = useState(false);
  const [confirmDeletePayment, setConfirmDeletePayment] = useState(null);
  const [moreMenuAnchor, setMoreMenuAnchor] = useState(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [editPayment,      setEditPayment]      = useState(null);
  const [editDebtOpen,     setEditDebtOpen]     = useState(false);
  const [activeTab,        setActiveTab]        = useState('buchungen');

  const debt = useMemo(() => debts.find((d) => d.id === debtId), [debts, debtId]);
  const debtPayments = useMemo(
    () => payments.filter((p) => p.debt_id === debtId)
                  .sort((a, b) => new Date(b.date) - new Date(a.date)),
    [payments, debtId],
  );

  const schedule = useMemo(() => {
    if (!debt) return [];
    return isRevolving(debt)
      ? buildRevolvingSchedule(debt, debtPayments)
      : buildSchedule(debt, debtPayments.filter((p) => p.type !== 'withdrawal'));
  }, [debt, debtPayments]);

  const currentBalance = useMemo(() => {
    if (!schedule || schedule.length === 0) return Number(debt?.total_amount ?? 0);
    if (isRevolving(debt)) return schedule[schedule.length - 1].balance;
    return getCurrentBalance(schedule, TODAY) ?? Number(debt.total_amount);
  }, [schedule, debt]);

  // Buchungen: reguläre Tilgungs-Raten aus Schedule (nur vergangene) +
  // alle debt_payments. Neueste oben.
  const bookingRows = useMemo(() => {
    if (!debt) return [];
    const todayIso = new Date().toISOString().slice(0, 10);
    const rev = isRevolving(debt);
    const rows = [];

    // Reguläre Tilgungen nur für Annuitätskredite — Rahmenkredite haben keine
    // fixe Monatsrate, dort sind alle Bewegungen explizit erfasst.
    if (!rev) {
      schedule.forEach((e) => {
        if (e.date > todayIso) return;
        const rate = (Number(e.zinsen) || 0) + (Number(e.tilgung) || 0);
        if (rate <= 0) return;
        rows.push({
          key:    `s:${e.date}`,
          kind:   'schedule',
          date:   e.date,
          amount: rate,
          note:   `Zinsen ${fmt2(e.zinsen)} € · Tilgung ${fmt2(e.tilgung)} €`,
          payment: null,
        });
      });
    }

    // Alle gespeicherten Buchungen (Sondertilgungen + Abbuchungen)
    debtPayments.forEach((p) => {
      rows.push({
        key:    `p:${p.id}`,
        kind:   p.type === 'withdrawal' ? 'withdrawal' : 'repayment',
        date:   p.date,
        amount: Number(p.amount),
        note:   p.note ?? '',
        payment: p,
      });
    });

    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [debt, schedule, debtPayments]);

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

  if (!debt) {
    return (
      <Box sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
          <IconButton onClick={() => navigate('/verbindlichkeiten')} aria-label="Zurück">
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Kredit nicht gefunden</Typography>
        </Stack>
        <Alert severity="warning">
          Dieser Kredit existiert nicht (mehr). Zurück zur <strong>Übersicht</strong>.
        </Alert>
      </Box>
    );
  }

  const rev = isRevolving(debt);

  async function handleDeleteDebt() {
    await deleteDebt(debt.id);
    setConfirmDeleteDebt(false);
    navigate('/verbindlichkeiten');
  }

  async function handleDeletePayment() {
    if (!confirmDeletePayment) return;
    await deletePayment(confirmDeletePayment.id);
    setConfirmDeletePayment(null);
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Top bar — back + title + actions */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0 }}>
          <IconButton onClick={() => navigate('/verbindlichkeiten')} aria-label="Zurück">
            <ArrowBackIcon />
          </IconButton>
          <EntityIcon
            logoId={debt.logo_id}
            fallbackIconName={rev ? 'credit_card' : 'account_balance'}
            size={48}
            bgcolor="surface.highest"
            color="text.primary"
            borderRadius="12px"
          />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h5" sx={{
              fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.15,
            }}>
              {debt.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {rev ? 'Rahmenkredit' : 'Ratenkredit'} · {fmt2(debt.interest_rate)} % p.a. · seit {fmtDateLong(debt.start_date)}
            </Typography>
          </Box>
        </Stack>

        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => { setEditPayment(null); setPaymentModalOpen(true); }}
          >
            {rev ? 'Zahlung erfassen' : 'Sondertilgung'}
          </Button>
          <IconButton onClick={(e) => setMoreMenuAnchor(e.currentTarget)} aria-label="Mehr">
            <MoreVertIcon />
          </IconButton>
          <Menu
            anchorEl={moreMenuAnchor}
            open={!!moreMenuAnchor}
            onClose={() => setMoreMenuAnchor(null)}
          >
            <MenuItem onClick={() => {
              setMoreMenuAnchor(null);
              setEditDebtOpen(true);
            }}>
              <EditOutlinedIcon sx={{ fontSize: 18, mr: 1 }} /> Kredit bearbeiten
            </MenuItem>
            <MenuItem onClick={() => { setMoreMenuAnchor(null); setConfirmDeleteDebt(true); }} sx={{ color: 'error.main' }}>
              <DeleteOutlineIcon sx={{ fontSize: 18, mr: 1 }} /> Kredit löschen
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
              color: currentBalance > 0 ? 'error.main' : 'success.main',
            }}>
              {currentBalance > 0 ? '−' : ''} {fmt2(Math.abs(currentBalance))} €
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              Aktueller Kontostand
            </Typography>
          </Box>
          <ToggleButtonGroup
            size="small"
            exclusive
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

        <BalanceChart debt={debt} schedule={schedule} range={range} />
      </Paper>

      {/* Tabs: Buchungen / Tilgungsplan */}
      <Box>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
            <Tab value="buchungen" label={`Buchungen (${bookingRows.length})`} />
            <Tab value="tilgungsplan" label={`Tilgungsplan${schedule.length > 0 ? ` (${schedule.length})` : ''}`} />
          </Tabs>
        </Box>

        {activeTab === 'buchungen' && (
          <BookingsTable
            rows={bookingRows}
            onEdit={(p) => { setEditPayment(p); setPaymentModalOpen(true); }}
            onDelete={(p) => setConfirmDeletePayment(p)}
          />
        )}

        {activeTab === 'tilgungsplan' && (
          <ScheduleTable schedule={schedule} />
        )}
      </Box>

      {/* Add/Edit Payment Modal */}
      {paymentModalOpen && (
        <ExtraPaymentModal
          debts={[debt]}
          schedulesMap={{ [debt.id]: schedule }}
          preselected={debt}
          editPayment={editPayment}
          onSave={async (payload) => {
            await addPayment({ ...payload, debt_id: debt.id });
            setPaymentModalOpen(false);
          }}
          onUpdate={async (id, fields) => {
            await updatePayment(id, fields);
            setPaymentModalOpen(false);
            setEditPayment(null);
          }}
          onClose={() => { setPaymentModalOpen(false); setEditPayment(null); }}
        />
      )}

      {/* Edit-Kredit Dialog */}
      <Dialog
        open={editDebtOpen}
        onClose={() => setEditDebtOpen(false)}
        maxWidth="sm"
        fullWidth
        scroll="paper"
      >
        <DialogTitle sx={{ pr: 6 }}>
          Kredit bearbeiten
          <IconButton
            onClick={() => setEditDebtOpen(false)}
            aria-label="Schließen"
            sx={{ position: 'absolute', right: 12, top: 12 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 2.5 }}>
          <DebtForm
            initial={{
              name: debt.name, total_amount: debt.total_amount,
              interest_rate: debt.interest_rate, monthly_rate: debt.monthly_rate ?? '',
              start_date: debt.start_date, color_code: debt.color_code,
              note: debt.note, debt_type: debt.debt_type ?? 'annuity',
              credit_limit: debt.credit_limit ?? '',
            }}
            onSave={async (form) => {
              await updateDebt(debt.id, form);
              setEditDebtOpen(false);
            }}
            onCancel={() => setEditDebtOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Confirm dialogs */}
      <ConfirmDialog
        open={confirmDeleteDebt}
        title="Kredit löschen?"
        message={`„${debt.name}" und alle zugehörigen Buchungen werden unwiderruflich gelöscht.`}
        onConfirm={handleDeleteDebt}
        onCancel={() => setConfirmDeleteDebt(false)}
      />
      <ConfirmDialog
        open={!!confirmDeletePayment}
        title="Buchung löschen?"
        message={confirmDeletePayment ? `Buchung vom ${fmtDateLong(confirmDeletePayment.date)} (${fmt2(confirmDeletePayment.amount)} €) wird gelöscht.` : ''}
        onConfirm={handleDeletePayment}
        onCancel={() => setConfirmDeletePayment(null)}
      />
    </Box>
  );
}
