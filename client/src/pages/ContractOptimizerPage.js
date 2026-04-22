import { useState } from 'react';
import {
  Box, Stack, Typography, Card, CardContent, CircularProgress, Alert,
  Chip, FormControlLabel, Checkbox, Button, Collapse, TextField,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import dayjs from 'dayjs';
import { useContractOptimizer } from '../hooks/useContractOptimizer';
import { URGENCY_CONFIG } from '../utils/contractUrgency';
import { PageHeader, DateField } from '../components/mui';

function fmtEuro(v) {
  if (v == null || isNaN(v)) return '—';
  return Number(v).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function fmtDate(iso) {
  return iso ? dayjs(iso).format('DD.MM.YYYY') : '–';
}

// Map URGENCY_CONFIG level → MUI color name
const URGENCY_CHIP_COLOR = {
  red:    'error',
  yellow: 'warning',
  grey:   'default',
  green:  'success',
};

// ── Summary card ──────────────────────────────────────────────────────────────
function SummaryCard({ label, value, sub, accent }) {
  return (
    <Box sx={(theme) => ({
      backgroundColor: 'background.paper',
      borderTop: `1px solid ${theme.palette.divider}`,
      borderRight: `1px solid ${theme.palette.divider}`,
      borderBottom: `1px solid ${theme.palette.divider}`,
      borderLeft: `3px solid ${accent}`,
      borderRadius: 1,
      p: '16px 18px',
      height: '100%',
    })}>
      <Typography variant="caption" sx={{
        display: 'block', color: 'text.secondary', fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.08em', mb: 0.75,
      }}>
        {label}
      </Typography>
      <Typography variant="h6" sx={{ color: accent, fontWeight: 700, lineHeight: 1.2 }}>
        {value}
      </Typography>
      {sub && (
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.5 }}>
          {sub}
        </Typography>
      )}
    </Box>
  );
}

// ── Contract card ─────────────────────────────────────────────────────────────
function ContractCard({ contract, onUpdate, onUpdateNote }) {
  const c = contract;
  const u = c.urgency;
  const cfg = URGENCY_CONFIG[u.level];
  const [showDetails, setShowDetails] = useState(false);

  function handleCancelledToggle(checked) {
    onUpdate(c.source, c.id, {
      is_cancelled: checked,
      cancellation_date: checked ? dayjs().format('YYYY-MM-DD') : null,
    });
  }

  const chipLabel = cfg.label + (u.daysRemaining != null && u.level !== 'green' ? ` (${u.daysRemaining}d)` : '');

  return (
    <Card sx={{ display: 'flex', overflow: 'hidden', p: 0 }}>
      {/* Urgency stripe */}
      <Box sx={{ width: 4, backgroundColor: cfg.color, flexShrink: 0 }} />

      <CardContent sx={{ flex: 1, p: '16px 20px', '&:last-child': { pb: '16px' } }}>
        {/* Header row */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.25 }}>
          <Stack direction="row" alignItems="center" spacing={1.25}>
            <Box sx={{
              width: 10, height: 10, borderRadius: '50%',
              backgroundColor: c.categoryColor, flexShrink: 0,
            }} />
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>{c.name}</Typography>
              <Typography variant="caption" color="text.secondary">
                {c.provider || 'Kein Anbieter'}
              </Typography>
            </Box>
          </Stack>
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
              {fmtEuro(c.monthlyCost)}/Monat
            </Typography>
            <Chip
              label={chipLabel}
              size="small"
              color={URGENCY_CHIP_COLOR[u.level] || 'default'}
              variant="outlined"
              sx={{ mt: 0.5, height: 20, fontSize: '0.62rem', fontWeight: 700 }}
            />
          </Box>
        </Stack>

        {/* Contract details */}
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 1.25, mb: 1.25,
        }}>
          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', display: 'block' }}>
              Vertragsende
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
              {c.contract_end_date ? fmtDate(c.contract_end_date) : '– nicht gesetzt –'}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', display: 'block' }}>
              Kündigungsfrist
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
              {c.notice_period_months} {c.notice_period_months === 1 ? 'Monat' : 'Monate'}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', display: 'block' }}>
              Deadline
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace', color: cfg.color }}>
              {u.deadline ? fmtDate(u.deadline) : '–'}
            </Typography>
          </Box>
        </Box>

        {/* Actions row */}
        <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap" useFlexGap>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={c.is_cancelled}
                onChange={(e) => handleCancelledToggle(e.target.checked)}
                color="success"
              />
            }
            label={<Typography variant="body2">Bereits gekündigt</Typography>}
          />

          {c.is_cancelled && (
            <Box sx={{ width: 180 }}>
              <DateField
                label="Gekündigt am"
                value={c.cancellation_date || ''}
                onChange={(v) => onUpdate(c.source, c.id, { cancellation_date: v || null })}
              />
            </Box>
          )}

          <Button
            size="small"
            onClick={() => setShowDetails((v) => !v)}
            sx={{ ml: 'auto', textTransform: 'none' }}
            endIcon={showDetails ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          >
            {showDetails ? 'Notiz ausblenden' : 'Notiz anzeigen'}
          </Button>
        </Stack>

        {/* Optimizer note */}
        <Collapse in={showDetails} timeout="auto" unmountOnExit>
          <TextField
            label="Neuer Ziel-Tarif / Notiz"
            value={c.optimizer_note ?? ''}
            placeholder="z.B. Wechsel zu Anbieter X ab 01.01.2027"
            onChange={(e) => onUpdateNote(c.source, c.id, e.target.value)}
            fullWidth
            size="small"
            sx={{ mt: 1.5 }}
          />
        </Collapse>
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ContractOptimizerPage() {
  const { contracts, loading, error, updateContract, updateNote } = useContractOptimizer();

  if (loading) {
    return (
      <Stack alignItems="center" justifyContent="center" sx={{ minHeight: 200, color: 'text.secondary' }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <CircularProgress size={20} />
          <Typography variant="body2">Lade Verträge…</Typography>
        </Stack>
      </Stack>
    );
  }
  if (error) {
    return (
      <Box sx={{ p: { xs: 2, sm: 3 } }}>
        <Alert severity="error">Fehler: {error}</Alert>
      </Box>
    );
  }

  const totalMonthly = contracts.reduce((s, c) => s + (c.monthlyCost || 0), 0);
  const needsAction  = contracts.filter((c) => c.urgency.level === 'red' || c.urgency.level === 'yellow').length;
  const cancelled    = contracts.filter((c) => c.is_cancelled).length;

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 960 }}>
      <PageHeader
        title="Spar-Radar" icon="radar"
        subtitle={`${contracts.length} Verträge im Blick — Kündigungsfristen & Optimierungspotenzial`}
      />

      {/* Summary cards */}
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fit, minmax(188px, 1fr))' },
        gap: 2, mb: 3,
      }}>
        <SummaryCard label="Monatskosten gesamt" value={fmtEuro(totalMonthly)} sub="alle Verträge" accent="#0ea5e9" />
        <SummaryCard
          label="Handlungsbedarf"
          value={needsAction}
          sub={needsAction > 0 ? 'Verträge mit Deadline' : 'Alles im Griff'}
          accent={needsAction > 0 ? '#ef4444' : '#10b981'}
        />
        <SummaryCard label="Bereits gekündigt" value={cancelled} sub={`von ${contracts.length} Verträgen`} accent="#10b981" />
      </Box>

      {/* Contract list */}
      {contracts.length === 0 ? (
        <Card>
          <CardContent sx={{ py: 6, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '2.5rem', mb: 1.5 }}>📡</Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
              Noch keine Verträge erfasst
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Lege zuerst Versicherungen oder einen Stromtarif an, um den Spar-Radar zu nutzen.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Stack spacing={1.5}>
          {contracts.map((c) => (
            <ContractCard
              key={c.id}
              contract={c}
              onUpdate={updateContract}
              onUpdateNote={updateNote}
            />
          ))}
        </Stack>
      )}
    </Box>
  );
}
