import { useState, useEffect } from 'react';
import {
  Box, Stack, Typography, Button, IconButton, TextField, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions, Alert,
  LinearProgress, Divider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import MoreHorizOutlinedIcon from '@mui/icons-material/MoreHorizOutlined';
import { PageHeader, SectionCard, KpiCard, MoneyDisplay, CurrencyField, ConfirmDialog } from '../components/mui';
import {
  useLearningBudgetItems, useLearningBudgetStats, useLearningBudgetYearLimits,
  effectiveLimitForYear, hasExplicitLimit,
} from '../hooks/useLearningBudget';

// ── Kategorien ──────────────────────────────────────────────────
const CATEGORIES = [
  { key: 'fachbuch',  label: 'Fachbuch',   icon: MenuBookOutlinedIcon },
  { key: 'konferenz', label: 'Konferenz',  icon: GroupsOutlinedIcon },
  { key: 'training',  label: 'Training',   icon: SchoolOutlinedIcon },
  { key: 'sonstiges', label: 'Sonstiges',  icon: MoreHorizOutlinedIcon },
];
const CAT_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

function ymd(d) { return d.toISOString().slice(0, 10); }

// ═══════════════════════════════════════════════════════════════
export default function LearningBudgetPage() {
  const { items, loading, addItem, updateItem, deleteItem } = useLearningBudgetItems();
  const { yearLimits, setYearLimit } = useLearningBudgetYearLimits();

  const [year, setYear] = useState(new Date().getFullYear());
  const effectiveLimit = effectiveLimitForYear(year, yearLimits);
  const isExplicitLimit = hasExplicitLimit(year, yearLimits);
  const stats = useLearningBudgetStats(items, effectiveLimit, year);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  function openNew() { setEditingItem(null); setDialogOpen(true); }
  function openEdit(item) { setEditingItem(item); setDialogOpen(true); }
  function closeDialog() { setDialogOpen(false); setEditingItem(null); }

  async function handleSave(payload) {
    if (editingItem) await updateItem(editingItem.id, payload);
    else             await addItem(payload);
    closeDialog();
  }

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return;
    await deleteItem(deleteTarget.id);
    setDeleteTarget(null);
  }

  const barPct = Math.min(100, stats.percentUsed);

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 960, pb: 6 }}>
      <PageHeader
        title="Weiterbildungsbudget"
        icon="school"
        subtitle="Jährliches Budget für Fachbücher, Konferenzen & Training"
        actions={
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={openNew}>
            Ausgabe erfassen
          </Button>
        }
      />

      <Stack spacing={2}>
        {/* Jahres-Navigator */}
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
          <IconButton size="small" onClick={() => setYear((y) => y - 1)} aria-label="Vorheriges Jahr">
            <ChevronLeftIcon />
          </IconButton>
          <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 56, textAlign: 'center' }}>
            {year}
          </Typography>
          <IconButton
            size="small"
            onClick={() => setYear((y) => y + 1)}
            disabled={year >= new Date().getFullYear()}
            aria-label="Nächstes Jahr"
          >
            <ChevronRightIcon />
          </IconButton>
        </Stack>

        {/* Ampel-Fortschritt */}
        <SectionCard>
          <Stack spacing={1.5}>
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Verfügbar in {year}
              </Typography>
              <Typography variant="h3" sx={{ color: `${stats.severity}.main`, fontWeight: 700, fontFamily: 'monospace', lineHeight: 1 }}>
                <MoneyDisplay value={stats.available} decimals={0} variant="inherit" color="inherit" />
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={barPct}
              color={stats.severity}
              sx={{ height: 12, borderRadius: 99, bgcolor: 'action.hover' }}
            />
            <Typography variant="caption" color="text.secondary">
              <MoneyDisplay value={stats.spent} decimals={2} /> von <MoneyDisplay value={effectiveLimit} decimals={0} /> ausgegeben ({stats.percentUsed.toFixed(0)} %)
            </Typography>
          </Stack>
        </SectionCard>

        {/* KPI-Grid */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fit, minmax(188px, 1fr))' }, gap: 2 }}>
          <KpiCard title="Jahreslimit" value={<MoneyDisplay value={effectiveLimit} decimals={0} variant="h5" bold />} />
          <KpiCard title="Ausgegeben" value={<MoneyDisplay value={stats.spent} decimals={2} variant="h5" bold />} accent="error" />
          <KpiCard title="Verfügbar" value={<MoneyDisplay value={stats.available} decimals={2} variant="h5" bold />} accent={stats.severity} />
        </Box>

        <SectionCard
          title={`Einträge · ${year}`}
        >
          {loading ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              Lade Einträge…
            </Typography>
          ) : stats.yearItems.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              Noch keine Einträge für {year}. Klicke auf „Ausgabe erfassen".
            </Typography>
          ) : (
            <Stack divider={<Divider flexItem />}>
              {stats.yearItems.map((item) => (
                <EntryRow
                  key={item.id}
                  item={item}
                  onEdit={() => openEdit(item)}
                  onDelete={() => setDeleteTarget(item)}
                />
              ))}
            </Stack>
          )}
        </SectionCard>

        <YearLimitEditor
          year={year}
          effectiveLimit={effectiveLimit}
          isExplicit={isExplicitLimit}
          onSave={(value) => setYearLimit(year, value)}
        />
      </Stack>

      <EntryDialog
        open={dialogOpen}
        initial={editingItem}
        onClose={closeDialog}
        onSave={handleSave}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Eintrag löschen?"
        message={deleteTarget ? `„${deleteTarget.description || CAT_BY_KEY[deleteTarget.category]?.label}" wirklich löschen?` : ''}
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setDeleteTarget(null)}
      />
    </Box>
  );
}

// ─── Jahreslimit-Editor ─────────────────────────────────────────
// Speichert das Limit ausschließlich für `year` — andere Jahre bleiben
// unberührt. Zukünftige Jahre ohne eigenen Eintrag zeigen den vom Vorjahr
// übernommenen Wert an, bis er hier explizit für dieses Jahr geändert wird.
function YearLimitEditor({ year, effectiveLimit, isExplicit, onSave }) {
  const [value, setValue] = useState(effectiveLimit);

  useEffect(() => { setValue(effectiveLimit); }, [year, effectiveLimit]);

  function handleBlur() {
    const n = Number(value) || 0;
    if (n !== effectiveLimit) onSave(n);
  }

  return (
    <SectionCard title={`Jahreslimit ${year} anpassen`}>
      <Stack spacing={1.5}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }}>
          <CurrencyField
            size="small"
            label={`Jahreslimit ${year}`}
            value={value}
            onChange={setValue}
            onBlur={handleBlur}
            sx={{ maxWidth: 220 }}
          />
          <Typography variant="caption" color="text.secondary">
            {isExplicit
              ? `Individuell für ${year} gesetzt.`
              : `Übernommen von einem Vorjahr (Standard ${effectiveLimit.toLocaleString('de-DE')} €) — wird erst für ${year} gespeichert, wenn du den Wert änderst.`}
          </Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Änderungen wirken sich nur auf {year} aus, nie auf vergangene Jahre. Kommende Jahre ohne eigenen Wert übernehmen automatisch diesen Betrag.
        </Typography>
      </Stack>
    </SectionCard>
  );
}

// ─── Eintrag-Zeile ────────────────────────────────────────────────
function EntryRow({ item, onEdit, onDelete }) {
  const cat = CAT_BY_KEY[item.category] ?? CAT_BY_KEY.sonstiges;
  const CatIcon = cat.icon;

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1.5}
      onClick={onEdit}
      sx={{
        py: 1, cursor: 'pointer', borderRadius: 1,
        transition: 'background-color 120ms',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <CatIcon fontSize="small" sx={{ color: 'text.secondary' }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
          {item.description || cat.label}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {cat.label} · {new Date(item.occurred_at + 'T00:00').toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })}
        </Typography>
      </Box>
      <MoneyDisplay value={item.amount} decimals={2} sx={{ fontWeight: 700, fontFamily: 'monospace' }} />
      <IconButton size="small" onClick={(e) => { e.stopPropagation(); onEdit(); }} sx={{ color: 'text.disabled' }} aria-label="Bearbeiten">
        <EditOutlinedIcon fontSize="small" />
      </IconButton>
      <IconButton size="small" onClick={(e) => { e.stopPropagation(); onDelete(); }} sx={{ color: 'text.disabled' }} aria-label="Löschen">
        <DeleteOutlineIcon fontSize="small" />
      </IconButton>
    </Stack>
  );
}

// ─── Add/Edit-Dialog ────────────────────────────────────────────
function EntryDialog({ open, initial, onClose, onSave }) {
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('fachbuch');
  const [description, setDescription] = useState('');
  const [occurredAt, setOccurredAt] = useState(ymd(new Date()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setAmount(initial.amount ?? '');
      setCategory(initial.category || 'fachbuch');
      setDescription(initial.description || '');
      setOccurredAt(initial.occurred_at || ymd(new Date()));
    } else {
      setAmount(''); setCategory('fachbuch'); setDescription(''); setOccurredAt(ymd(new Date()));
    }
    setError(null);
  }, [open, initial]);

  async function handleSave() {
    const n = Number(amount);
    if (!n || n <= 0) { setError('Betrag fehlt'); return; }
    setSaving(true); setError(null);
    try {
      await onSave({ amount: n, category, description, occurred_at: occurredAt });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const isEdit = !!initial;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ pb: 1 }}>{isEdit ? 'Eintrag bearbeiten' : 'Neue Ausgabe'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <CurrencyField autoFocus fullWidth label="Betrag" value={amount} onChange={setAmount} />

          <TextField select fullWidth size="small" label="Kategorie" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <MenuItem key={c.key} value={c.key}>{c.label}</MenuItem>
            ))}
          </TextField>

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
          {saving ? 'Speichern…' : isEdit ? 'Aktualisieren' : 'Speichern'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
