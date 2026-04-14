import { useState, useEffect, useRef } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Button, Stack, Box, Typography, Alert,
  ToggleButton, ToggleButtonGroup, IconButton, Accordion, AccordionSummary, AccordionDetails,
  FormControlLabel, Checkbox, CircularProgress,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { INTERVAL_LABELS, toAnnual } from '../utils/calculations';
import { CurrencyField, DateField } from './mui';

const CURRENT_YEAR          = new Date().getFullYear();
const NEW_CATEGORY_SENTINEL = '__new__';
const FREETEXT_SENTINEL     = '__freetext__';
const INTERVALS             = Object.keys(INTERVAL_LABELS);

export default function EditModal({ categories, initialCategoryId, providers = [], onSave, onClose }) {
  const [categoryId,    setCategoryId]    = useState(initialCategoryId ?? categories[0]?.id ?? NEW_CATEGORY_SENTINEL);
  const [newCatName,    setNewCatName]    = useState('');
  const [year,          setYear]          = useState(CURRENT_YEAR);
  const [premium,       setPremium]       = useState('');
  const [providerId,    setProviderId]    = useState('');
  const [providerText,  setProviderText]  = useState('');
  const [interval,      setInterval]      = useState('jährlich');
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState('');
  const [showContract,  setShowContract]  = useState(false);
  const [contractEnd,   setContractEnd]   = useState('');
  const [noticePeriod,  setNoticePeriod]  = useState(3);
  const [isCancelled,   setIsCancelled]   = useState(false);
  const [cancelDate,    setCancelDate]    = useState('');

  const newCatInputRef = useRef(null);

  const isNewCategory  = categoryId === NEW_CATEGORY_SENTINEL;
  const hasProviders   = providers.length > 0;
  const isFreetextMode = !hasProviders || providerId === FREETEXT_SENTINEL;

  // ── Pre-fill when category or year changes ─────────────────────────────────
  useEffect(() => {
    if (isNewCategory) {
      setPremium(''); setProviderText(''); setProviderId(''); setInterval('jährlich');
      return;
    }
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return;
    const existing = cat.entries.find((e) => e.year === year);
    const source   = existing ?? cat.entries[cat.entries.length - 1];

    if (existing) setPremium(String(existing.premium));
    else setPremium('');

    setInterval((source?.payment_interval) ?? 'jährlich');

    setContractEnd(source?.contract_end_date ?? '');
    setNoticePeriod(source?.notice_period_months ?? 3);
    setIsCancelled(source?.is_cancelled ?? false);
    setCancelDate(source?.cancellation_date ?? '');
    if (source?.contract_end_date) setShowContract(true);

    if (hasProviders) {
      const pid = source?.provider_id;
      if (pid && providers.find((p) => p.id === pid)) {
        setProviderId(pid);
        setProviderText('');
      } else {
        setProviderId(source?.provider ? FREETEXT_SENTINEL : '');
        setProviderText(source?.provider ?? '');
      }
    } else {
      setProviderText(source?.provider ?? '');
    }
  }, [categoryId, year, categories, isNewCategory, hasProviders]); // eslint-disable-line

  useEffect(() => {
    if (isNewCategory) setTimeout(() => newCatInputRef.current?.focus(), 50);
  }, [isNewCategory]);

  const selectedCategory = isNewCategory ? null : categories.find((c) => c.id === categoryId);
  const existingEntry    = selectedCategory?.entries.find((e) => e.year === year);

  const parsedPreview = parseFloat(String(premium).replace(',', '.'));
  const annualPreview = !isNaN(parsedPreview) && parsedPreview > 0 ? toAnnual(parsedPreview, interval) : null;

  const finalProviderId   = isFreetextMode ? null : providerId;
  const finalProviderName = isFreetextMode
    ? providerText.trim()
    : (providers.find((p) => p.id === providerId)?.name ?? '');

  const lastEntry           = selectedCategory?.entries[selectedCategory.entries.length - 1];
  const lastProviderDisplay = lastEntry?.provider_obj?.name ?? lastEntry?.provider ?? '';
  const showChangeNotice    = selectedCategory && selectedCategory.entries.length > 0
    && finalProviderName !== '' && finalProviderName !== lastProviderDisplay;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (isNewCategory && !newCatName.trim()) {
      setError('Bitte einen Namen für die neue Kategorie eingeben.'); return;
    }
    if (!isNewCategory && !categoryId) {
      setError('Bitte eine Kategorie wählen.'); return;
    }
    if (!year || year < 2000) {
      setError('Bitte ein gültiges Jahr eingeben.'); return;
    }
    const parsedPremium = parseFloat(String(premium).replace(',', '.'));
    if (isNaN(parsedPremium) || parsedPremium <= 0) {
      setError('Bitte einen gültigen Beitrag eingeben (z.B. 120.50).'); return;
    }
    if (hasProviders && providerId === '') {
      setError('Bitte einen Anbieter auswählen.'); return;
    }
    if (!finalProviderName) {
      setError('Bitte einen Anbieter eingeben.'); return;
    }

    setSaving(true);
    try {
      await onSave({
        categoryId:       isNewCategory ? null : categoryId,
        newCategoryName:  isNewCategory ? newCatName.trim() : null,
        year:             Number(year),
        premium:          parsedPremium,
        provider:         finalProviderName,
        provider_id:      finalProviderId,
        payment_interval: interval,
        contract_end_date:    contractEnd || null,
        notice_period_months: Number(noticePeriod) || 3,
        is_cancelled:         isCancelled,
        cancellation_date:    isCancelled ? (cancelDate || null) : null,
      });
    } catch (err) {
      setError(err.message ?? 'Fehler beim Speichern.');
      setSaving(false);
    }
  }

  const modalTitle = isNewCategory
    ? 'Neue Kategorie & Eintrag'
    : existingEntry ? 'Beitrag bearbeiten' : 'Neuer Eintrag';
  const modalSubtitle = isNewCategory
    ? 'Kategorie wird angelegt und der erste Beitrag gespeichert'
    : existingEntry
      ? `Bestehender Beitrag für ${year} wird überschrieben`
      : 'Jahresbeitrag für eine Kategorie hinzufügen';

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth component="form" onSubmit={handleSubmit}>
      <DialogTitle sx={{ pr: 6 }}>
        {modalTitle}
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.5, fontWeight: 400 }}>
          {modalSubtitle}
        </Typography>
        <IconButton
          onClick={onClose}
          sx={{ position: 'absolute', right: 12, top: 12 }}
          aria-label="Schließen"
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2}>
          {/* Category */}
          <TextField
            select
            label="Kategorie"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            fullWidth
            helperText={selectedCategory?.description}
          >
            {categories.map((c) => (
              <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
            ))}
            <MenuItem value={NEW_CATEGORY_SENTINEL}>➕ Neue Kategorie anlegen…</MenuItem>
          </TextField>

          {/* New category name */}
          {isNewCategory && (
            <TextField
              inputRef={newCatInputRef}
              label="Name der neuen Kategorie"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="z.B. Zahnzusatz, Reisekranken…"
              inputProps={{ maxLength: 100 }}
              fullWidth
            />
          )}

          {/* Year + Premium */}
          <Stack direction="row" spacing={1.5}>
            <TextField
              type="number"
              label="Jahr"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              inputProps={{ min: 2000, max: CURRENT_YEAR + 5 }}
              sx={{ flex: 1 }}
            />
            <CurrencyField
              label="Beitrag"
              value={premium === '' ? '' : Number(String(premium).replace(',', '.'))}
              onChange={(v) => setPremium(v === '' ? '' : String(v))}
              fullWidth
              sx={{ flex: 1 }}
              helperText={existingEntry ? `aktuell: ${existingEntry.premium.toLocaleString('de-DE')} €` : undefined}
            />
          </Stack>

          {/* Payment interval */}
          <Box>
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 0.5, fontWeight: 600 }}>
              Zahlungsintervall
            </Typography>
            <ToggleButtonGroup
              value={interval}
              exclusive
              onChange={(_, v) => v && setInterval(v)}
              size="small"
              fullWidth
            >
              {INTERVALS.map((iv) => (
                <ToggleButton key={iv} value={iv} sx={{ fontSize: '0.72rem', textTransform: 'none' }}>
                  {INTERVAL_LABELS[iv]}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            {annualPreview !== null && (
              <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.75 }}>
                = <strong>{annualPreview.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €/Jahr</strong>
                {' · '}
                <strong>{(annualPreview / 12).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €/Monat</strong>
              </Typography>
            )}
          </Box>

          {/* Provider */}
          {hasProviders ? (
            <>
              <TextField
                select
                label="Anbieter"
                value={providerId}
                onChange={(e) => {
                  setProviderId(e.target.value);
                  if (e.target.value !== FREETEXT_SENTINEL) setProviderText('');
                }}
                fullWidth
              >
                <MenuItem value="">— Anbieter wählen —</MenuItem>
                {providers.map((p) => (
                  <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                ))}
                <MenuItem value={FREETEXT_SENTINEL}>✏️ Freitext eingeben…</MenuItem>
              </TextField>
              {providerId === FREETEXT_SENTINEL && (
                <TextField
                  label="Anbieter (Freitext)"
                  value={providerText}
                  onChange={(e) => setProviderText(e.target.value)}
                  placeholder="Anbieter eingeben…"
                  fullWidth
                  autoFocus
                />
              )}
            </>
          ) : (
            <TextField
              label="Anbieter"
              value={providerText}
              onChange={(e) => setProviderText(e.target.value)}
              placeholder="z.B. Allianz, HUK-COBURG, DEVK…"
              fullWidth
              helperText='Tipp: Lege Anbieter im Tab „Anbieter" an, um sie hier auszuwählen.'
            />
          )}

          {/* Provider-change notice */}
          {showChangeNotice && (
            <Alert severity="info" icon={<InfoOutlinedIcon fontSize="small" />}>
              Anbieterwechsel: <strong>{lastProviderDisplay}</strong> → <strong>{finalProviderName}</strong>.
              Der Trend für <strong>{selectedCategory.name}</strong> bleibt sichtbar.
            </Alert>
          )}

          {/* Contract fields (collapsible) */}
          <Accordion
            disableGutters
            expanded={showContract}
            onChange={() => setShowContract((v) => !v)}
            sx={{ boxShadow: 'none', border: 1, borderColor: 'divider', '&:before': { display: 'none' } }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>Vertragsdaten</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2}>
                <Stack direction="row" spacing={1.5}>
                  <DateField
                    label="Vertragsende"
                    value={contractEnd}
                    onChange={(v) => setContractEnd(v)}
                  />
                  <TextField
                    type="number"
                    label="Kündigungsfrist (Monate)"
                    value={noticePeriod}
                    onChange={(e) => setNoticePeriod(parseInt(e.target.value, 10) || 0)}
                    inputProps={{ min: 0, max: 24 }}
                    sx={{ width: 180 }}
                  />
                </Stack>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={isCancelled}
                      onChange={(e) => setIsCancelled(e.target.checked)}
                      color="success"
                    />
                  }
                  label="Bereits gekündigt"
                />
                {isCancelled && (
                  <DateField
                    label="Gekündigt am"
                    value={cancelDate}
                    onChange={(v) => setCancelDate(v)}
                  />
                )}
              </Stack>
            </AccordionDetails>
          </Accordion>

          {/* Error */}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} color="inherit" disabled={saving}>Abbrechen</Button>
        <Button
          type="submit"
          variant="contained"
          disabled={saving}
          startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {saving ? 'Speichern…' : isNewCategory ? 'Anlegen & Speichern' : existingEntry ? 'Aktualisieren' : 'Hinzufügen'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
