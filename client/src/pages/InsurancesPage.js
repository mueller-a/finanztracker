import { useState } from 'react';
import {
  Box, Stack, Typography, Tabs, Tab, Button, Alert, CircularProgress,
  Avatar, IconButton, Link, TextField, Chip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import LanguageIcon from '@mui/icons-material/Language';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import Dashboard from '../components/Dashboard';
import InsuranceTable from '../components/InsuranceTable';
import EditModal from '../components/EditModal';
import { useInsurances } from '../hooks/useInsurances';
import { useInsuranceProviders } from '../hooks/useInsuranceProviders';
import { getTotalByYear, toDisplay } from '../utils/calculations';
import { KpiCard, PageHeader, SectionCard, ConfirmDialog } from '../components/mui';

// ─── Providers Panel ──────────────────────────────────────────────────────────
function ProvidersPanel({ providers, loading, onAdd, onUpdate, onDelete }) {
  const [form,    setForm]    = useState({ name: '', website_url: '', portal_login_url: '' });
  const [editId,  setEditId]  = useState(null);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  function startEdit(p) {
    setEditId(p.id);
    setForm({ name: p.name, website_url: p.website_url ?? '', portal_login_url: p.portal_login_url ?? '' });
    setError('');
  }
  function cancelEdit() {
    setEditId(null);
    setForm({ name: '', website_url: '', portal_login_url: '' });
    setError('');
  }

  async function handleSave(isEdit) {
    if (!form.name.trim()) { setError('Name darf nicht leer sein.'); return; }
    setSaving(true);
    setError('');
    try {
      if (isEdit) await onUpdate(editId, form);
      else        await onAdd(form);
      cancelEdit();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Stack spacing={2.5}>
      {/* Add / Edit form */}
      <SectionCard title={editId ? 'Anbieter bearbeiten' : 'Neuen Anbieter anlegen'}>
        <Stack spacing={1.5}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 1.5 }}>
            <TextField
              label="Name *"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Allianz"
              fullWidth
            />
            <TextField
              label="Website"
              value={form.website_url}
              onChange={(e) => setForm((f) => ({ ...f, website_url: e.target.value }))}
              placeholder="https://allianz.de"
              fullWidth
            />
            <TextField
              label="Kundenportal-URL"
              value={form.portal_login_url}
              onChange={(e) => setForm((f) => ({ ...f, portal_login_url: e.target.value }))}
              placeholder="https://meine.allianz.de"
              fullWidth
            />
          </Box>
          {error && <Alert severity="error">{error}</Alert>}
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              onClick={() => handleSave(!!editId)}
              disabled={saving}
              startIcon={saving ? <CircularProgress size={14} color="inherit" /> : (editId ? null : <AddIcon />)}
            >
              {saving ? '…' : editId ? 'Speichern' : 'Anlegen'}
            </Button>
            {editId && (
              <Button onClick={cancelEdit} color="inherit">Abbrechen</Button>
            )}
          </Stack>
        </Stack>
      </SectionCard>

      {/* Providers list */}
      {loading ? (
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ color: 'text.secondary', p: 2 }}>
          <CircularProgress size={16} />
          <Typography variant="body2">Wird geladen…</Typography>
        </Stack>
      ) : providers.length === 0 ? (
        <SectionCard>
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <Typography variant="body2" color="text.secondary">Noch keine Anbieter angelegt.</Typography>
            <Typography variant="caption" color="text.disabled">
              Lege Anbieter an, um sie beim Erfassen von Versicherungen auszuwählen.
            </Typography>
          </Box>
        </SectionCard>
      ) : (
        <Stack spacing={1}>
          {providers.map((p) => (
            <SectionCard
              key={p.id}
              dense
              sx={{ borderColor: editId === p.id ? 'primary.main' : 'divider', borderWidth: editId === p.id ? 2 : 1, borderStyle: 'solid' }}
            >
              <Stack direction="row" alignItems="center" spacing={1.5}>
                <Avatar sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', width: 36, height: 36 }}>
                  {p.name.charAt(0).toUpperCase()}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{p.name}</Typography>
                  <Stack direction="row" spacing={1.5} sx={{ mt: 0.25 }} flexWrap="wrap" useFlexGap>
                    {p.website_url && (
                      <Link href={p.website_url} target="_blank" rel="noopener noreferrer"
                        underline="hover" sx={{ fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                        <LanguageIcon sx={{ fontSize: 12 }} /> Website
                      </Link>
                    )}
                    {p.portal_login_url && (
                      <Link href={p.portal_login_url} target="_blank" rel="noopener noreferrer"
                        underline="hover" color="info.main"
                        sx={{ fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                        <LockOutlinedIcon sx={{ fontSize: 12 }} /> Kundenportal
                      </Link>
                    )}
                    {!p.website_url && !p.portal_login_url && (
                      <Typography variant="caption" color="text.disabled">Keine Links hinterlegt</Typography>
                    )}
                  </Stack>
                </Box>
                <Stack direction="row" spacing={0.5}>
                  <IconButton size="small" onClick={() => startEdit(p)} title="Bearbeiten">
                    <EditOutlinedIcon fontSize="inherit" />
                  </IconButton>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => setConfirmDelete(p)}
                    title="Löschen"
                  >
                    <DeleteOutlineIcon fontSize="inherit" />
                  </IconButton>
                </Stack>
              </Stack>
            </SectionCard>
          ))}
        </Stack>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Anbieter löschen?"
        message={`„${confirmDelete?.name ?? ''}" wird unwiderruflich gelöscht.`}
        onConfirm={() => { onDelete(confirmDelete.id); setConfirmDelete(null); }}
        onCancel={() => setConfirmDelete(null)}
      />
    </Stack>
  );
}

export default function InsurancesPage() {
  const { categories, loading, error, upsertEntry, addCategory, deleteEntry, deleteCategory } = useInsurances();
  const { providers, loading: provLoading, addProvider, updateProvider, deleteProvider } = useInsuranceProviders();

  const [activeTab,     setActiveTab]     = useState('dashboard');
  const [viewMode,      setViewMode]      = useState('jahr');
  const [modalState,    setModalState]    = useState({ open: false, categoryId: null });
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const totalByYear = getTotalByYear(categories, viewMode);
  const latestYear  = Math.max(...Object.keys(totalByYear).map(Number), 0);
  const latestTotal = totalByYear[latestYear] ?? 0;
  const prevTotal   = totalByYear[latestYear - 1] ?? null;
  const totalDelta  = prevTotal !== null ? latestTotal - prevTotal : null;

  function openModal(categoryId = null) { setModalState({ open: true, categoryId }); }
  function closeModal()                 { setModalState({ open: false, categoryId: null }); }

  async function handleSave({ categoryId, newCategoryName, year, premium, provider, provider_id, payment_interval,
    contract_end_date, notice_period_months, is_cancelled, cancellation_date }) {
    let targetId = categoryId;
    if (newCategoryName) {
      const created = await addCategory({ name: newCategoryName });
      targetId = created.id;
    }
    await upsertEntry(targetId, { year, premium, provider, provider_id, payment_interval,
      contract_end_date, notice_period_months, is_cancelled, cancellation_date });
    closeModal();
  }

  function handleRequestDeleteCategory(id, name) { setDeleteConfirm({ id, name }); }
  async function handleConfirmDeleteCategory() {
    if (!deleteConfirm) return;
    await deleteCategory(deleteConfirm.id);
    setDeleteConfirm(null);
  }

  const cheapest      = cheapestCategory(categories, latestYear, viewMode);
  const mostExpensive = mostExpensiveCategory(categories, latestYear, viewMode);
  const fmtEuro = (v) => v.toLocaleString('de-DE', { minimumFractionDigits: 2 });

  return (
    <Box>
      <PageHeader
        title="Versicherungen" icon="shield"
        subtitle="Übersicht, Vergleich und Verwaltung deiner Versicherungsverträge"
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => openModal()}>
            Eintrag hinzufügen
          </Button>
        }
      />

      {/* KPI Cards */}
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fit, minmax(188px, 1fr))' },
        gap: 2,
        mb: 4,
      }}>
        <KpiCard
          title={`Gesamtkosten (${viewMode === 'monat' ? 'Monat' : 'Jahr'})`}
          value={`${fmtEuro(latestTotal)} €`}
          sub={
            <Stack direction="row" spacing={0.75} alignItems="center">
              <span>Jahr {latestYear}</span>
              {totalDelta !== null && (
                <Chip
                  size="small"
                  label={`${totalDelta > 0 ? '+' : ''}${fmtEuro(totalDelta)} €`}
                  color={totalDelta > 0 ? 'error' : 'success'}
                  variant="outlined"
                  sx={{ height: 18, fontSize: '0.6rem' }}
                />
              )}
            </Stack>
          }
        />
        <KpiCard title="Kategorien" value={categories.length} sub="Versicherungsarten" />
        <KpiCard
          title="Günstigste Kategorie"
          value={cheapest?.name ?? '–'}
          sub={cheapest ? `${fmtEuro(cheapest.value)} €` : ''}
          accent="success"
        />
        <KpiCard
          title="Teuerste Kategorie"
          value={mostExpensive?.name ?? '–'}
          sub={mostExpensive ? `${fmtEuro(mostExpensive.value)} €` : ''}
          accent="error"
        />
      </Box>

      {/* Tab Bar */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
          <Tab value="dashboard" label="Dashboard"  icon={<DashboardOutlinedIcon fontSize="small" />} iconPosition="start" />
          <Tab value="table"     label="Tabelle"    icon={<TableChartOutlinedIcon fontSize="small" />} iconPosition="start" />
          <Tab value="providers" label="Anbieter"   icon={<BusinessOutlinedIcon fontSize="small" />} iconPosition="start" />
        </Tabs>
      </Box>

      {/* Content */}
      {loading && (
        <Stack alignItems="center" justifyContent="center" sx={{ minHeight: 200 }}>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ color: 'text.secondary' }}>
            <CircularProgress size={20} />
            <Typography variant="body2">Daten werden geladen…</Typography>
          </Stack>
        </Stack>
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }}><strong>Fehler:</strong> {error}</Alert>}
      {!loading && !error && (
        <>
          {activeTab === 'dashboard' && (
            <Dashboard
              categories={categories}
              totalByYear={totalByYear}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onEdit={openModal}
              onDeleteCategory={handleRequestDeleteCategory}
            />
          )}
          {activeTab === 'table' && (
            <InsuranceTable
              categories={categories}
              onEdit={openModal}
              onDeleteEntry={deleteEntry}
              onDeleteCategory={(id) => {
                const cat = categories.find((c) => c.id === id);
                handleRequestDeleteCategory(id, cat?.name ?? '');
              }}
            />
          )}
          {activeTab === 'providers' && (
            <ProvidersPanel
              providers={providers}
              loading={provLoading}
              onAdd={addProvider}
              onUpdate={updateProvider}
              onDelete={deleteProvider}
            />
          )}
        </>
      )}

      {modalState.open && (
        <EditModal
          categories={categories}
          providers={providers}
          initialCategoryId={modalState.categoryId}
          onSave={handleSave}
          onClose={closeModal}
        />
      )}
      <ConfirmDialog
        open={!!deleteConfirm}
        title="Kategorie löschen?"
        message={`Die Kategorie „${deleteConfirm?.name ?? ''}" und alle Einträge werden dauerhaft gelöscht.`}
        onConfirm={handleConfirmDeleteCategory}
        onCancel={() => setDeleteConfirm(null)}
      />
    </Box>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function cheapestCategory(categories, year, viewMode) {
  const mapped = categories.map((c) => {
    const e = c.entries.find((e) => e.year === year);
    if (!e) return null;
    return { name: c.name, value: toDisplay(e.premium, e.payment_interval, viewMode) };
  }).filter(Boolean);
  if (!mapped.length) return null;
  return mapped.reduce((min, c) => (c.value < min.value ? c : min));
}

function mostExpensiveCategory(categories, year, viewMode) {
  const mapped = categories.map((c) => {
    const e = c.entries.find((e) => e.year === year);
    if (!e) return null;
    return { name: c.name, value: toDisplay(e.premium, e.payment_interval, viewMode) };
  }).filter(Boolean);
  if (!mapped.length) return null;
  return mapped.reduce((max, c) => (c.value > max.value ? c : max));
}
