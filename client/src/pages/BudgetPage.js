import { useState, useRef, useCallback, useMemo, useEffect, Fragment } from 'react';
import {
  Box, Stack, Typography, Button, IconButton, TextField, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions, Checkbox,
  CircularProgress, Alert, Chip, LinearProgress, Paper,
  Collapse, InputAdornment, useMediaQuery, Divider,
  Table, TableHead, TableBody,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import BoltIcon from '@mui/icons-material/Bolt';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useBudget } from '../hooks/useBudget';
import { PageHeader, ConfirmDialog } from '../components/mui';

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS_DE = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const DEBOUNCE_MS = 600;
const COMBO_ID = 'budget-label-suggestions';

const LABEL_SUGGESTIONS = [
  'Gehalt', 'Nebeneinkommen', 'Kindergeld', 'Steuerrückerstattung', 'Sonstige Einnahmen',
  'Miete / Kaltmiete', 'Nebenkosten', 'Strom', 'Gas / Heizung', 'Internet & Telefon',
  'GEZ / Rundfunk', 'Haushalt & Lebensmittel', 'Drogerie & Hygiene', 'Kleidung & Schuhe',
  'Mobilität / ÖPNV', 'KFZ-Versicherung', 'Kraftstoff', 'Kfz-Steuer',
  'Freizeit & Hobbys', 'Sport & Fitness', 'Streaming & Abo', 'Restaurantbesuche',
  'Urlaub & Reisen', 'Arzt & Apotheke', 'Weiterbildung', 'Spende', 'Haustier', 'Steuerberater',
];

// ─── Expense categories ───────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'wohnen',       label: 'Wohnen & Fixkosten',      color: '#3b82f6', emoji: '🏠' },
  { id: 'versicherung', label: 'Versicherungen & Kredite', color: '#ef4444', emoji: '🛡️' },
  { id: 'sparen',       label: 'Sparen & Vorsorge',        color: '#10b981', emoji: '💰' },
  { id: 'lifestyle',    label: 'Lifestyle & Abos',         color: '#f59e0b', emoji: '✨' },
  { id: 'sonstiges',    label: 'Sonstiges',                color: '#8b5cf6', emoji: '📦' },
];
const CAT_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

const SOURCE_META = {
  insurance: { color: '#7c3aed', label: 'Versicherung' },
  strom:     { color: '#f59e0b', label: 'Strom' },
  kredit:    { color: '#ef4444', label: 'Kredit' },
  sparziel:  { color: '#0ea5e9', label: 'Sparziel' },
  salary:    { color: '#10b981', label: 'Gehalt' },
  custom:    { color: '#9090b0', label: 'Manuell' },
};

const fmt2 = (n) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function effectiveAmount(item) {
  const amt   = parseFloat(item.amount);
  const share = parseFloat(item.share_percent);
  if (isNaN(amt) || isNaN(share)) return null;
  return amt * share / 100;
}

// ─── Month Navigation ─────────────────────────────────────────────────────────
function MonthNav({ month, year, onChange }) {
  function prev() { onChange(month === 1 ? 12 : month - 1, month === 1 ? year - 1 : year); }
  function next() {
    const nm = month === 12 ? 1 : month + 1;
    const ny = month === 12 ? year + 1 : year;
    const now = new Date();
    if (ny > now.getFullYear() || (ny === now.getFullYear() && nm > now.getMonth() + 2)) return;
    onChange(nm, ny);
  }

  const isCurrentMonth = month === new Date().getMonth() + 1 && year === new Date().getFullYear();

  return (
    <Stack direction="row" alignItems="center" spacing={1.5}>
      <IconButton size="small" onClick={prev}><ChevronLeftIcon /></IconButton>
      <Box sx={{ textAlign: 'center', minWidth: 160 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
          {MONTHS_DE[month - 1]} {year}
        </Typography>
        {isCurrentMonth && (
          <Chip label="Aktueller Monat" size="small" color="primary" variant="outlined"
            sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700 }} />
        )}
      </Box>
      <IconButton size="small" onClick={next}><ChevronRightIcon /></IconButton>
    </Stack>
  );
}

// ─── Selective Import Modal ───────────────────────────────────────────────────
function SelectiveImportModal({ fetchImportCandidates, importSelected, onClose }) {
  const [candidates, setCandidates] = useState(null);
  const [loadErr,    setLoadErr]    = useState('');
  const [selected,   setSelected]   = useState({});
  const [importing,  setImporting]  = useState(false);
  const [importErr,  setImportErr]  = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchImportCandidates().then((data) => {
      if (cancelled) return;
      setCandidates(data);
      const init = {};
      Object.entries(data).forEach(([source, items]) => {
        items.forEach((_, idx) => { init[`${source}:${idx}`] = true; });
      });
      setSelected(init);
    }).catch((e) => { if (!cancelled) setLoadErr(e.message); });
    return () => { cancelled = true; };
  }, [fetchImportCandidates]);

  function toggleAll(source, items, value) {
    setSelected((prev) => {
      const next = { ...prev };
      items.forEach((_, idx) => { next[`${source}:${idx}`] = value; });
      return next;
    });
  }
  function toggle(key) { setSelected((prev) => ({ ...prev, [key]: !prev[key] })); }

  function getSelectedCandidates() {
    if (!candidates) return [];
    const result = [];
    Object.entries(candidates).forEach(([source, items]) => {
      items.forEach((item, idx) => {
        if (selected[`${source}:${idx}`]) result.push(item);
      });
    });
    return result;
  }

  async function handleImport() {
    const toImport = getSelectedCandidates();
    if (toImport.length === 0) return;
    setImporting(true); setImportErr('');
    try { await importSelected(toImport); onClose(); }
    catch (e) { setImportErr(e.message); }
    finally { setImporting(false); }
  }

  const selectedCount = Object.values(selected).filter(Boolean).length;

  const SECTIONS = [
    { key: 'salary',    label: 'Gehalt',          emoji: '💶', color: SOURCE_META.salary.color },
    { key: 'insurance', label: 'Versicherungen', emoji: '🛡️', color: SOURCE_META.insurance.color },
    { key: 'strom',     label: 'Strom',          emoji: '⚡',  color: SOURCE_META.strom.color },
    { key: 'kredit',    label: 'Kredite',         emoji: '🏦', color: SOURCE_META.kredit.color },
    { key: 'sparziel',  label: 'Sparziele',       emoji: '🎯', color: SOURCE_META.sparziel.color },
  ];

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth scroll="paper">
      <DialogTitle sx={{ pr: 6 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <BoltIcon color="primary" />
          <span>Selektiver Import</span>
        </Stack>
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontWeight: 400, mt: 0.25 }}>
          Wähle aus, was importiert werden soll
        </Typography>
        <IconButton
          onClick={onClose}
          aria-label="Schließen"
          sx={{ position: 'absolute', right: 12, top: 12 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {!candidates && !loadErr && (
          <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="center" sx={{ py: 4, color: 'text.secondary' }}>
            <CircularProgress size={18} />
            <Typography variant="body2">Lade verfügbare Posten…</Typography>
          </Stack>
        )}
        {loadErr && <Alert severity="error">{loadErr}</Alert>}

        {candidates && (
          <Stack spacing={2}>
            {SECTIONS.map(({ key, label, emoji, color }) => {
              const sItems = candidates[key] ?? [];
              if (sItems.length === 0) {
                return (
                  <Box key={key} sx={{ opacity: 0.4 }}>
                    <Typography variant="caption" sx={{
                      color: 'text.secondary', fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', mb: 0.5,
                    }}>
                      {emoji} {label}
                    </Typography>
                    <Paper variant="outlined" sx={{ px: 1.25, py: 0.75 }}>
                      <Typography variant="body2" color="text.secondary">Keine Posten verfügbar</Typography>
                    </Paper>
                  </Box>
                );
              }
              const allChecked = sItems.every((_, idx) => selected[`${key}:${idx}`]);
              return (
                <Box key={key}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
                    <Typography variant="caption" sx={{
                      color, fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.07em',
                    }}>
                      {emoji} {label} ({sItems.length})
                    </Typography>
                    <Button
                      size="small"
                      onClick={() => toggleAll(key, sItems, !allChecked)}
                      sx={{ color, textTransform: 'none', fontSize: '0.7rem', minWidth: 0 }}
                    >
                      {allChecked ? 'Alle abwählen' : 'Alle auswählen'}
                    </Button>
                  </Stack>
                  <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
                    <Stack divider={<Box sx={{ borderBottom: 1, borderColor: 'divider' }} />}>
                      {sItems.map((item, idx) => {
                        const k = `${key}:${idx}`;
                        const checked = !!selected[k];
                        return (
                          <Box
                            key={k}
                            component="label"
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1.25,
                              px: 1.5,
                              py: 1,
                              cursor: 'pointer',
                              bgcolor: checked ? `${color}0a` : 'transparent',
                              transition: 'background 0.1s',
                            }}
                          >
                            <Checkbox
                              size="small"
                              checked={checked}
                              onChange={() => toggle(k)}
                              sx={{ p: 0, color, '&.Mui-checked': { color } }}
                            />
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography variant="body2" sx={{
                                fontWeight: checked ? 600 : 400,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}>
                                {item.label}
                                {item._yearNote && (
                                  <Typography component="span" variant="caption" sx={{ color: 'warning.main', ml: 0.75 }}>
                                    {item._yearNote}
                                  </Typography>
                                )}
                              </Typography>
                              {item.note && (
                                <Typography variant="caption" color="text.secondary">{item.note}</Typography>
                              )}
                            </Box>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                              {fmt2(item.amount)} €
                            </Typography>
                          </Box>
                        );
                      })}
                    </Stack>
                  </Paper>
                </Box>
              );
            })}
          </Stack>
        )}

        {importErr && <Alert severity="error" sx={{ mt: 2 }}>{importErr}</Alert>}
      </DialogContent>

      <DialogActions sx={{ justifyContent: 'space-between', px: 3 }}>
        <Typography variant="caption" color="text.secondary">
          {selectedCount} Posten ausgewählt
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button onClick={onClose} color="inherit" disabled={importing}>Abbrechen</Button>
          <Button
            variant="contained"
            onClick={handleImport}
            disabled={importing || selectedCount === 0}
            startIcon={importing ? <CircularProgress size={14} color="inherit" /> : <BoltIcon />}
          >
            {importing ? 'Importiere…' : `${selectedCount} importieren`}
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}

// ─── Empty State Banner ───────────────────────────────────────────────────────
function EmptyBanner({ onImport, onCopyPrev, onSelectiveImport, importing }) {
  const [copyErr, setCopyErr] = useState('');

  async function handleCopy() {
    setCopyErr('');
    try { await onCopyPrev(); } catch (e) { setCopyErr(e.message); }
  }

  return (
    <Paper
      variant="outlined"
      sx={{ borderRadius: 1, p: 5, textAlign: 'center' }}
    >
      <Typography sx={{ fontSize: '2.5rem', mb: 1.5 }}>📋</Typography>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>Monat noch leer</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Importiere Daten aus deinen Modulen oder kopiere den Vormonat.
      </Typography>
      <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap" useFlexGap>
        <Button
          variant="contained"
          onClick={onImport}
          disabled={importing}
          startIcon={importing ? <CircularProgress size={14} color="inherit" /> : <BoltIcon />}
        >
          {importing ? 'Importiere…' : 'Alles importieren'}
        </Button>
        <Button variant="outlined" onClick={onSelectiveImport} startIcon={<PlaylistAddCheckIcon />}>
          Auswählen & importieren
        </Button>
        <Button variant="outlined" onClick={handleCopy} startIcon={<ContentCopyIcon />}>
          Vormonat kopieren
        </Button>
      </Stack>
      {copyErr && <Alert severity="error" sx={{ mt: 2 }}>{copyErr}</Alert>}
    </Paper>
  );
}

// ─── Inline-editable cell ─────────────────────────────────────────────────────
function EditCell({ value, field, itemId, onCommit, type = 'text', style, invalid }) {
  const theme = useTheme();
  const [local,   setLocal]   = useState(value ?? '');
  const [focused, setFocused] = useState(false);
  const timer = useRef(null);

  if (!focused && String(value) !== String(local)) setLocal(value ?? '');

  function handleChange(e) {
    const v = e.target.value;
    setLocal(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onCommit(itemId, field, v), DEBOUNCE_MS);
  }

  function handleBlur() {
    setFocused(false);
    clearTimeout(timer.current);
    onCommit(itemId, field, local);
  }

  return (
    <input
      type={type}
      value={local}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
      onChange={handleChange}
      step={type === 'number' ? '0.01' : undefined}
      style={{
        width: '100%', background: 'transparent',
        color: theme.palette.text.primary,
        border: invalid ? `1.5px solid ${theme.palette.error.main}` : '1.5px solid transparent',
        borderRadius: 6, padding: '4px 6px', fontSize: '0.85rem', outline: 'none',
        fontFamily: type === 'number' ? 'monospace' : undefined,
        transition: 'border-color 0.15s',
        minWidth: type === 'text' ? 160 : undefined,
        ...style,
      }}
      onMouseEnter={(e) => { if (!invalid) e.currentTarget.style.borderColor = theme.palette.primary.light; }}
      onMouseLeave={(e) => { if (!invalid && !focused) e.currentTarget.style.borderColor = 'transparent'; }}
    />
  );
}

// ─── Drag handle icon ─────────────────────────────────────────────────────────
function DragHandle() {
  return (
    <Box component="svg" width="14" height="14" viewBox="0 0 14 14" fill="none"
      sx={{ display: 'block', color: 'text.disabled' }}>
      <circle cx="4"  cy="3"  r="1.2" fill="currentColor" />
      <circle cx="4"  cy="7"  r="1.2" fill="currentColor" />
      <circle cx="4"  cy="11" r="1.2" fill="currentColor" />
      <circle cx="10" cy="3"  r="1.2" fill="currentColor" />
      <circle cx="10" cy="7"  r="1.2" fill="currentColor" />
      <circle cx="10" cy="11" r="1.2" fill="currentColor" />
    </Box>
  );
}

// ─── Budget Row ───────────────────────────────────────────────────────────────
function BudgetRow({ item, onCommit, onDelete, dragHandlers, isDragging, isOver, isIncome }) {
  const theme = useTheme();

  const amtNum   = parseFloat(item.amount);
  const shareNum = parseFloat(item.share_percent);
  const amtValid   = !isNaN(amtNum) && amtNum >= 0;
  const shareValid = !isNaN(shareNum) && shareNum >= 0 && shareNum <= 100;
  const effective  = amtValid && shareValid ? amtNum * shareNum / 100 : null;

  // Income: source color; Expense: category color
  const dotColor = isIncome
    ? (SOURCE_META[item.source]?.color ?? '#9090b0')
    : (CAT_MAP[item.category ?? 'sonstiges']?.color ?? '#8b5cf6');

  const dotTitle = isIncome
    ? (SOURCE_META[item.source]?.label ?? item.source)
    : (CAT_MAP[item.category ?? 'sonstiges']?.label ?? 'Sonstiges');

  const hoverBg = theme.palette.mode === 'dark' ? 'rgba(124,58,237,0.08)' : 'rgba(124,58,237,0.04)';

  return (
    <tr
      style={{
        borderBottom: `1px solid ${theme.palette.divider}`,
        borderTop: isOver ? `2px solid ${theme.palette.primary.main}` : undefined,
        opacity: isDragging ? 0.35 : 1,
        background: isOver ? hoverBg : 'transparent',
        transition: 'opacity 0.15s, background 0.1s',
      }}
      {...dragHandlers}
    >
      <td style={{ padding: '7px 6px', width: 20, cursor: 'grab', userSelect: 'none' }}>
        <DragHandle />
      </td>
      <td style={{ padding: '7px 6px', width: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, display: 'inline-block' }} title={dotTitle} />
      </td>
      <td style={{ padding: '4px 6px', minWidth: 220 }}>
        <EditCell value={item.label} field="label" itemId={item.id} onCommit={onCommit} />
      </td>
      <td style={{ padding: '4px 6px', width: 130 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <EditCell value={item.amount} field="amount" itemId={item.id} onCommit={onCommit}
            type="number" invalid={!amtValid} style={{ textAlign: 'right', minWidth: 0 }} />
          <Typography component="span" variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>€</Typography>
        </div>
      </td>
      <td style={{ padding: '4px 6px', width: 90 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <EditCell value={item.share_percent} field="share_percent" itemId={item.id} onCommit={onCommit}
            type="number" invalid={!shareValid} style={{ textAlign: 'right', minWidth: 0 }} />
          <Typography component="span" variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>%</Typography>
        </div>
      </td>
      <td style={{ padding: '7px 10px', textAlign: 'right', width: 110 }}>
        {effective !== null ? (
          <Typography component="span" variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
            {fmt2(effective)} €
          </Typography>
        ) : (
          <Typography component="span" variant="caption" color="error.main">Ungültig</Typography>
        )}
      </td>
      <td style={{ padding: '4px 6px', minWidth: 120 }}>
        <EditCell value={item.note} field="note" itemId={item.id} onCommit={onCommit}
          style={{ color: theme.palette.text.secondary, fontSize: '0.78rem' }} />
      </td>
      <td style={{ padding: '7px 10px', width: 36, textAlign: 'right' }}>
        <IconButton size="small" color="error" onClick={() => onDelete(item.id)} title="Löschen"
          sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}>
          <DeleteOutlineIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </td>
    </tr>
  );
}

// ─── Category header row (droppable) ─────────────────────────────────────────
function CategoryHeaderRow({ cat, subtotal, onDragOver, onDrop, isOver }) {
  const theme = useTheme();
  const bgBase = theme.palette.mode === 'dark' ? `${cat.color}10` : `${cat.color}08`;
  return (
    <tr
      onDragOver={(e) => onDragOver(e, cat.id)}
      onDrop={(e) => onDrop(e, cat.id)}
      style={{
        background: isOver ? `${cat.color}22` : bgBase,
        borderTop: `2px solid ${cat.color}50`,
        transition: 'background 0.12s',
        cursor: isOver ? 'copy' : 'default',
      }}
    >
      <td colSpan={2} style={{ padding: '9px 10px 9px 14px' }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <span style={{ fontSize: '0.95rem', lineHeight: 1 }}>{cat.emoji}</span>
          <Typography variant="caption" sx={{
            color: cat.color, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.07em',
          }}>
            {cat.label}
          </Typography>
        </Stack>
      </td>
      <td colSpan={4} />
      <td colSpan={2} style={{ padding: '9px 14px', textAlign: 'right' }}>
        <Typography component="span" variant="body2" sx={{ color: cat.color, fontFamily: 'monospace', fontWeight: 700 }}>
          {fmt2(subtotal)} €
        </Typography>
      </td>
    </tr>
  );
}

// ─── Empty drop-zone row (for categories with no items) ──────────────────────
function EmptyCategoryDropZone({ cat, onDragOver, onDrop, isOver }) {
  return (
    <tr
      onDragOver={(e) => onDragOver(e, cat.id)}
      onDrop={(e) => onDrop(e, cat.id)}
      style={{ background: isOver ? `${cat.color}12` : 'transparent', transition: 'background 0.1s' }}
    >
      <td colSpan={8} style={{ padding: '8px 16px', textAlign: 'center' }}>
        <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
          Keine Einträge — hierher ziehen oder unten hinzufügen
        </Typography>
      </td>
    </tr>
  );
}

// ─── Insight row (Verfügbar nach Kategorie) ───────────────────────────────────
function InsightRow({ catLabel, remaining, totalIncome }) {
  const theme = useTheme();
  if (totalIncome <= 0) return null;
  const positive = remaining >= 0;
  const color    = positive ? theme.palette.success.main : theme.palette.error.main;
  const bgColor  = positive ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)';
  const pct      = totalIncome > 0 ? Math.round(Math.abs(remaining) / totalIncome * 100) : 0;

  return (
    <tr style={{ borderBottom: `1px dashed ${theme.palette.divider}` }}>
      <td colSpan={5} style={{ padding: '5px 14px' }}>
        <Typography component="span" variant="caption" color="text.secondary">
          Verfügbar nach <strong>{catLabel}</strong>:
        </Typography>
        {!positive && (
          <Typography component="span" variant="caption" sx={{ ml: 1, color: 'error.main', fontWeight: 700 }}>
            ⚠️ Budget überschritten
          </Typography>
        )}
      </td>
      <td colSpan={3} style={{ padding: '5px 14px', textAlign: 'right' }}>
        <Box component="span" sx={{
          color,
          fontFamily: 'monospace',
          fontWeight: 700,
          fontSize: '0.78rem',
          background: bgColor,
          borderRadius: 0.75,
          px: 1,
          py: 0.25,
        }}>
          {positive ? '+' : '−'} {fmt2(Math.abs(remaining))} € ({pct}%)
        </Box>
      </td>
    </tr>
  );
}

// ─── Red deficit line ─────────────────────────────────────────────────────────
function DeficitRow({ totalIncome }) {
  return (
    <tr>
      <td colSpan={8} style={{ padding: 0 }}>
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 1,
          px: 1.75, py: 0.75,
          background: 'rgba(239,68,68,0.07)',
          borderTop: 2, borderBottom: 2, borderColor: 'error.main',
        }}>
          <span style={{ fontSize: '0.8rem' }}>⛔</span>
          <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 700 }}>
            Budget aufgebraucht — Einnahmen ({fmt2(totalIncome)} €) überschritten
          </Typography>
        </Box>
      </td>
    </tr>
  );
}

// ─── Add-item row with category select ───────────────────────────────────────
function AddItemRow({ type, onAdd, defaultCategory, isExpense }) {
  const theme = useTheme();
  const [label,    setLabel]    = useState('');
  const [amount,   setAmount]   = useState('');
  const [category, setCategory] = useState(defaultCategory ?? 'sonstiges');
  const [saving,   setSaving]   = useState(false);

  useEffect(() => { setCategory(defaultCategory ?? 'sonstiges'); }, [defaultCategory]);

  const catColor = CAT_MAP[category]?.color ?? '#8b5cf6';

  async function handleAdd() {
    if (!label.trim() || !amount) return;
    setSaving(true);
    try {
      await onAdd({ label: label.trim(), amount, share_percent: 100, type, source: 'custom', category });
      setLabel('');
      setAmount('');
    } finally {
      setSaving(false);
    }
  }

  const disabled = saving || !label.trim() || !amount;

  return (
    <tr style={{ borderTop: `1px dashed ${theme.palette.divider}` }}>
      <td style={{ padding: '6px 8px' }}>
        <AddIcon sx={{ fontSize: 14, color: 'success.main' }} />
      </td>

      {/* Expense: category select; Income: source dot placeholder */}
      <td style={{ padding: '4px 4px', width: isExpense ? 160 : 8 }}>
        {isExpense ? (
          <TextField
            select
            size="small"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            sx={{
              width: '100%',
              '& .MuiOutlinedInput-root': {
                fontSize: '0.72rem', fontWeight: 600,
                '& fieldset': { borderColor: `${catColor}80`, borderWidth: 1.5 },
                '&:hover fieldset': { borderColor: catColor },
                '&.Mui-focused fieldset': { borderColor: catColor },
              },
              '& .MuiSelect-select': { py: 0.5, color: catColor },
            }}
          >
            {CATEGORIES.map((c) => (
              <MenuItem key={c.id} value={c.id}>{c.emoji} {c.label}</MenuItem>
            ))}
          </TextField>
        ) : (
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: theme.palette.success.main, display: 'inline-block' }} />
        )}
      </td>

      <td style={{ padding: '4px 6px', minWidth: 220 }}>
        <input
          type="text" list={COMBO_ID} value={label}
          placeholder="Bezeichnung wählen oder eingeben…"
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          style={{
            width: '100%', padding: '4px 8px', fontSize: '0.82rem',
            background: 'transparent',
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 6, color: theme.palette.text.primary, outline: 'none',
          }}
        />
      </td>

      <td style={{ padding: '4px 6px', width: 130 }}>
        <input
          type="number" step="0.01" value={amount} placeholder="0,00"
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          style={{
            width: '100%', padding: '4px 8px', fontSize: '0.82rem', textAlign: 'right',
            fontFamily: 'monospace',
            background: 'transparent',
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 6, color: theme.palette.text.primary, outline: 'none',
          }}
        />
      </td>

      <td colSpan={2} />

      <td colSpan={2} style={{ padding: '6px 10px', textAlign: 'right' }}>
        <Button
          size="small"
          variant="outlined"
          onClick={handleAdd}
          disabled={disabled}
          startIcon={saving ? <CircularProgress size={12} color="inherit" /> : <AddIcon />}
        >
          {saving ? '…' : 'Hinzufügen'}
        </Button>
      </td>
    </tr>
  );
}

// ─── Mobile: Edit/Add Sheet für einzelnen Eintrag ────────────────────────────
function ItemEditSheet({ open, initial, isIncome, onClose, onSave, onDelete }) {
  const [label,        setLabel]        = useState('');
  const [amount,       setAmount]       = useState('');
  const [sharePercent, setSharePercent] = useState(100);
  const [category,     setCategory]     = useState('sonstiges');
  const [note,         setNote]         = useState('');
  const [busy,         setBusy]         = useState(false);
  const [error,        setError]        = useState(null);

  useEffect(() => {
    if (!open) return;
    setLabel(initial?.label ?? '');
    setAmount(initial?.amount != null ? String(initial.amount) : '');
    setSharePercent(initial?.share_percent ?? 100);
    setCategory(initial?.category ?? 'sonstiges');
    setNote(initial?.note ?? '');
    setError(null);
  }, [open, initial]);

  const amtNum   = parseFloat(String(amount).replace(',', '.'));
  const shareNum = parseFloat(sharePercent);
  const effective = !isNaN(amtNum) && !isNaN(shareNum) ? amtNum * shareNum / 100 : null;

  async function handleSave() {
    if (!label.trim()) { setError('Bezeichnung fehlt'); return; }
    if (isNaN(amtNum) || amtNum < 0) { setError('Betrag ungültig'); return; }
    if (isNaN(shareNum) || shareNum < 0 || shareNum > 100) { setError('Anteil muss 0-100 sein'); return; }
    setBusy(true); setError(null);
    try {
      await onSave({
        label: label.trim(),
        amount: amtNum,
        share_percent: Math.round(shareNum),
        note: note.trim() || null,
        ...(isIncome ? {} : { category }),
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const isEdit = !!initial?.id;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs"
      PaperProps={{ sx: { m: { xs: 0, sm: 2 }, borderRadius: { xs: 0, sm: 1 }, height: { xs: '100%', sm: 'auto' } } }}>
      <DialogTitle sx={{ pb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {isEdit ? 'Eintrag bearbeiten' : (isIncome ? 'Neue Einnahme' : 'Neue Ausgabe')}
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            autoFocus fullWidth label="Bezeichnung"
            value={label} onChange={(e) => setLabel(e.target.value)}
          />
          {!isIncome && (
            <TextField
              select fullWidth label="Kategorie" value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <MenuItem key={c.id} value={c.id}>{c.emoji} {c.label}</MenuItem>
              ))}
            </TextField>
          )}
          <Stack direction="row" spacing={1.5}>
            <TextField
              fullWidth label="Betrag" type="number" value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputProps={{ inputMode: 'decimal', step: 0.01, min: 0 }}
              InputProps={{ endAdornment: <InputAdornment position="end">€</InputAdornment> }}
            />
            <TextField
              fullWidth label="Anteil" type="number" value={sharePercent}
              onChange={(e) => setSharePercent(e.target.value)}
              inputProps={{ inputMode: 'numeric', step: 1, min: 0, max: 100 }}
              InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
            />
          </Stack>
          {effective !== null && (
            <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, p: 1.25, textAlign: 'right' }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Mein Anteil</Typography>
              <Typography variant="h6" sx={{ fontFamily: 'monospace', fontWeight: 700, color: isIncome ? 'success.main' : 'error.main' }}>
                {fmt2(effective)} €
              </Typography>
            </Box>
          )}
          <TextField fullWidth label="Notiz (optional)" value={note}
            onChange={(e) => setNote(e.target.value)} multiline rows={2} />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
        {isEdit ? (
          <Button color="error" startIcon={<DeleteOutlineIcon />} onClick={() => onDelete(initial.id)}>
            Löschen
          </Button>
        ) : <span />}
        <Stack direction="row" spacing={1}>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="contained" onClick={handleSave} disabled={busy}>
            {busy ? '…' : isEdit ? 'Aktualisieren' : 'Speichern'}
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}

// ─── Mobile: kompakte Item-Zeile (1-Zeiler in Card) ─────────────────────────
function MobileItemLine({ item, isIncome, onClick }) {
  const amt      = parseFloat(item.amount);
  const share    = parseFloat(item.share_percent);
  const effective = !isNaN(amt) && !isNaN(share) ? amt * share / 100 : null;
  const dotColor = isIncome
    ? (SOURCE_META[item.source]?.color ?? '#9090b0')
    : (CAT_MAP[item.category ?? 'sonstiges']?.color ?? '#8b5cf6');

  return (
    <Stack direction="row" alignItems="center" spacing={1} onClick={onClick}
      sx={{
        py: 1, px: 1.5, borderRadius: 0.75, cursor: 'pointer',
        '&:hover': { bgcolor: 'action.hover' },
      }}>
      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: dotColor, flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.label || <em style={{ color: '#999' }}>(ohne Bezeichnung)</em>}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {!isNaN(amt) ? `${fmt2(amt)} €` : '—'}
          {!isNaN(share) && share !== 100 && ` · ${share}%`}
          {item.note && ` · ${item.note}`}
        </Typography>
      </Box>
      <Typography variant="body2" sx={{
        fontFamily: 'monospace', fontWeight: 700,
        color: effective !== null ? (isIncome ? 'success.main' : 'text.primary') : 'error.main',
      }}>
        {effective !== null ? `${fmt2(effective)} €` : 'Ungültig'}
      </Typography>
    </Stack>
  );
}

// ─── Mobile: aufklappbare Kategorie-Karte ───────────────────────────────────
function MobileCategoryCard({ cat, items, subtotal, remaining, totalIncome, onItemClick, onAddClick, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  const insightColor = remaining < 0 ? 'error.main' : remaining === 0 ? 'warning.main' : 'success.main';
  const sharePct = totalIncome > 0 ? (subtotal / totalIncome) * 100 : 0;

  return (
    <Paper variant="outlined" sx={{ borderRadius: 1, borderLeft: `3px solid ${cat.color}`, overflow: 'hidden' }}>
      <Stack direction="row" alignItems="center" spacing={1} onClick={() => setOpen((v) => !v)}
        sx={{ px: 1.5, py: 1.25, cursor: 'pointer', bgcolor: 'action.hover' }}>
        <Typography sx={{ fontSize: '1.1rem' }}>{cat.emoji}</Typography>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: cat.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {cat.label}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {items.length} {items.length === 1 ? 'Eintrag' : 'Einträge'}
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
            {fmt2(subtotal)} €
          </Typography>
          {totalIncome > 0 && (
            <Typography variant="caption" color="text.secondary">{sharePct.toFixed(0)} %</Typography>
          )}
        </Box>
        <ExpandMoreIcon sx={{
          transition: 'transform 200ms', transform: open ? 'rotate(180deg)' : 'rotate(0)',
        }} />
      </Stack>

      <Collapse in={open}>
        <Stack divider={<Divider flexItem />} spacing={0} sx={{ py: 0.5 }}>
          {items.length === 0 ? (
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', py: 2, fontStyle: 'italic' }}>
              Noch keine Einträge
            </Typography>
          ) : items.map((item) => (
            <MobileItemLine key={item.id} item={item} isIncome={false} onClick={() => onItemClick(item)} />
          ))}
        </Stack>
        <Stack direction="row" justifyContent="space-between" alignItems="center"
          sx={{ px: 1.5, py: 1, borderTop: 1, borderColor: 'divider', bgcolor: 'background.default' }}>
          <Button size="small" startIcon={<AddIcon />} onClick={onAddClick}>
            Eintrag
          </Button>
          {totalIncome > 0 && (
            <Typography variant="caption" sx={{ color: insightColor, fontWeight: 600 }}>
              Verfügbar: {remaining >= 0 ? '+' : ''}{fmt2(remaining)} €
            </Typography>
          )}
        </Stack>
      </Collapse>
    </Paper>
  );
}

// ─── Mobile: Einnahmen-Karte ────────────────────────────────────────────────
function MobileIncomeCard({ items, total, onItemClick, onAddClick }) {
  const [open, setOpen] = useState(true);
  return (
    <Paper variant="outlined" sx={{ borderRadius: 1, borderLeft: '3px solid #10b981', overflow: 'hidden' }}>
      <Stack direction="row" alignItems="center" spacing={1} onClick={() => setOpen((v) => !v)}
        sx={{ px: 1.5, py: 1.25, cursor: 'pointer', bgcolor: 'rgba(16,185,129,0.08)' }}>
        <Typography sx={{ fontSize: '1.1rem' }}>💚</Typography>
        <Box sx={{ flex: 1 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'success.main', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Einnahmen
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {items.length} {items.length === 1 ? 'Eintrag' : 'Einträge'}
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'success.main' }}>
          {fmt2(total)} €
        </Typography>
        <ExpandMoreIcon sx={{ transition: 'transform 200ms', transform: open ? 'rotate(180deg)' : 'rotate(0)' }} />
      </Stack>
      <Collapse in={open}>
        <Stack divider={<Divider flexItem />} spacing={0} sx={{ py: 0.5 }}>
          {items.length === 0 ? (
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', py: 2, fontStyle: 'italic' }}>
              Noch keine Einnahmen
            </Typography>
          ) : items.map((item) => (
            <MobileItemLine key={item.id} item={item} isIncome onClick={() => onItemClick(item)} />
          ))}
        </Stack>
        <Box sx={{ px: 1.5, py: 1, borderTop: 1, borderColor: 'divider', bgcolor: 'background.default' }}>
          <Button size="small" startIcon={<AddIcon />} onClick={onAddClick}>Einnahme</Button>
        </Box>
      </Collapse>
    </Paper>
  );
}

// ─── Income Section (flat, no categories) ────────────────────────────────────
function IncomeSection({ items, onCommit, onDelete, onAdd, onReorder, onOpenSheet }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Mobile: aufklappbare Karte mit Item-Zeilen
  if (isMobile) {
    const total = items.reduce((s, i) => s + (effectiveAmount(i) ?? 0), 0);
    return (
      <MobileIncomeCard
        items={items}
        total={total}
        onItemClick={(item) => onOpenSheet({ type: 'income', initial: item })}
        onAddClick={() => onOpenSheet({ type: 'income', initial: null })}
      />
    );
  }

  const dragId = useRef(null);
  const [overId, setOverId] = useState(null);

  function handleDragStart(id) { dragId.current = id; }
  function handleDragOver(e, id) { e.preventDefault(); if (id !== dragId.current) setOverId(id); }
  function handleDrop(e, targetId) {
    e.preventDefault(); setOverId(null);
    const fromId = dragId.current; dragId.current = null;
    if (!fromId || fromId === targetId) return;
    const ids = items.map((i) => i.id);
    const fromIdx = ids.indexOf(fromId);
    const toIdx   = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const reordered = [...ids];
    reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, fromId);
    onReorder(reordered);
  }
  function handleDragEnd() { dragId.current = null; setOverId(null); }

  const total = items.reduce((s, i) => s + (effectiveAmount(i) ?? 0), 0);

  const TH = ({ children, align = 'right', style: s }) => (
    <th style={{
      background: theme.palette.action.hover,
      color: theme.palette.text.secondary,
      fontSize: '0.62rem', fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.08em',
      padding: '8px 10px', textAlign: align, whiteSpace: 'nowrap',
      borderBottom: `2px solid ${theme.palette.success.main}40`,
      ...s,
    }}>
      {children}
    </th>
  );

  return (
    <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{
          px: 2, py: 1.5,
          borderBottom: 1, borderColor: 'divider',
          background: 'rgba(16,185,129,0.05)',
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography sx={{ fontSize: '1.1rem' }}>💚</Typography>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Einnahmen</Typography>
          <Chip
            label={`${items.length} Einträge`}
            size="small"
            sx={{ bgcolor: 'rgba(16,185,129,0.2)', color: 'success.main', height: 20, fontSize: '0.62rem', fontWeight: 700 }}
          />
        </Stack>
        <Typography variant="subtitle1" sx={{ color: 'success.main', fontWeight: 800, fontFamily: 'monospace' }}>
          {fmt2(total)} €
        </Typography>
      </Stack>
      <Box sx={{ width: '100%', overflowX: 'auto' }}>
        <datalist id={COMBO_ID}>
          {LABEL_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
        </datalist>
        <Table size="small" sx={{ borderCollapse: 'collapse' }}>
          <TableHead>
            <tr>
              <TH align="left"> </TH>
              <TH align="left"> </TH>
              <TH align="left" style={{ minWidth: 220 }}>Bezeichnung</TH>
              <TH>Betrag</TH>
              <TH>Anteil %</TH>
              <TH>Mein Anteil</TH>
              <TH align="left">Notiz</TH>
              <TH> </TH>
            </tr>
          </TableHead>
          <TableBody>
            {items.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: 24, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">Noch keine Einträge.</Typography>
                </td>
              </tr>
            )}
            {items.map((item) => (
              <BudgetRow
                key={item.id} item={item} onCommit={onCommit} onDelete={onDelete} isIncome
                isDragging={dragId.current === item.id} isOver={overId === item.id}
                dragHandlers={{
                  draggable: true,
                  onDragStart: () => handleDragStart(item.id),
                  onDragOver:  (e) => handleDragOver(e, item.id),
                  onDrop:      (e) => handleDrop(e, item.id),
                  onDragEnd:   handleDragEnd,
                }}
              />
            ))}
            <AddItemRow type="income" onAdd={onAdd} isExpense={false} />
          </TableBody>
        </Table>
      </Box>
    </Paper>
  );
}

// ─── Expense Table with category grouping and cross-category D&D ──────────────
function ExpenseCategoryTable({ items, totalIncome, onCommit, onDelete, onAdd, onReorder, updateItem, onOpenSheet }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const dragId = useRef(null);
  const [overId,    setOverId]    = useState(null);
  const [overCatId, setOverCatId] = useState(null);
  const [lastCategory, setLastCategory] = useState('sonstiges');

  // Group items by category, preserving global sort_order
  const grouped = useMemo(() => CATEGORIES.map((cat) => ({
    ...cat,
    items: items.filter((i) => (i.category ?? 'sonstiges') === cat.id),
  })), [items]);

  // Per-category running totals + item-level deficit tracking
  const { insights, deficitItemId } = useMemo(() => {
    let cum = 0;
    let deficitItemId = null;

    // Item-level deficit (in category display order)
    for (const cat of CATEGORIES) {
      for (const item of items.filter((i) => (i.category ?? 'sonstiges') === cat.id)) {
        cum += effectiveAmount(item) ?? 0;
        if (cum > totalIncome && deficitItemId === null && totalIncome > 0) {
          deficitItemId = item.id;
        }
      }
    }

    // Per-category insights
    cum = 0;
    const insights = CATEGORIES.map((cat) => {
      const catItems = items.filter((i) => (i.category ?? 'sonstiges') === cat.id);
      const catTotal = catItems.reduce((s, i) => s + (effectiveAmount(i) ?? 0), 0);
      cum += catTotal;
      return { catId: cat.id, catTotal, remaining: totalIncome - cum };
    });

    return { insights, deficitItemId };
  }, [items, totalIncome]);

  const totalExpenses = items.reduce((s, i) => s + (effectiveAmount(i) ?? 0), 0);

  // ── D&D handlers ────────────────────────────────────────────────────────────
  function handleDragStart(id) { dragId.current = id; }

  function handleDragOverItem(e, id) {
    e.preventDefault();
    if (id !== dragId.current) { setOverId(id); setOverCatId(null); }
  }

  function handleDragOverCat(e, catId) {
    e.preventDefault();
    setOverCatId(catId); setOverId(null);
  }

  async function handleDropOnItem(e, targetId) {
    e.preventDefault();
    const fromId = dragId.current;
    dragId.current = null;
    setOverId(null); setOverCatId(null);
    if (!fromId || fromId === targetId) return;

    const fromItem = items.find((i) => i.id === fromId);
    const toItem   = items.find((i) => i.id === targetId);
    if (!fromItem || !toItem) return;

    const fromCat = fromItem.category ?? 'sonstiges';
    const toCat   = toItem.category   ?? 'sonstiges';
    const categoryChanged = fromCat !== toCat;

    // Build new global order: remove fromItem, insert before toItem
    const withoutFrom = items.filter((i) => i.id !== fromId);
    const insertIdx   = withoutFrom.findIndex((i) => i.id === targetId);
    const reordered   = [...withoutFrom];
    reordered.splice(insertIdx, 0, fromItem);

    if (categoryChanged) {
      await updateItem(fromId, { category: toCat });
    }
    await onReorder(reordered.map((i) => i.id));
  }

  async function handleDropOnCat(e, catId) {
    e.preventDefault();
    const fromId = dragId.current;
    dragId.current = null;
    setOverId(null); setOverCatId(null);
    if (!fromId) return;

    const fromItem = items.find((i) => i.id === fromId);
    if (!fromItem) return;

    const fromCat = fromItem.category ?? 'sonstiges';
    const categoryChanged = fromCat !== catId;

    // Insert after the last item currently in the target category
    const withoutFrom = items.filter((i) => i.id !== fromId);
    const catItems    = withoutFrom.filter((i) => (i.category ?? 'sonstiges') === catId);

    let insertIdx;
    if (catItems.length > 0) {
      const lastId = catItems[catItems.length - 1].id;
      insertIdx = withoutFrom.findIndex((i) => i.id === lastId) + 1;
    } else {
      // Find insertion point: before first item of the next category
      const catIdx   = CATEGORIES.findIndex((c) => c.id === catId);
      const nextCats = new Set(CATEGORIES.slice(catIdx + 1).map((c) => c.id));
      const firstNextItem = withoutFrom.find((i) => nextCats.has(i.category ?? 'sonstiges'));
      insertIdx = firstNextItem
        ? withoutFrom.findIndex((i) => i.id === firstNextItem.id)
        : withoutFrom.length;
    }

    const reordered = [...withoutFrom];
    reordered.splice(insertIdx, 0, fromItem);

    if (categoryChanged) {
      await updateItem(fromId, { category: catId });
    }
    await onReorder(reordered.map((i) => i.id));
  }

  function handleDragEnd() { dragId.current = null; setOverId(null); setOverCatId(null); }

  async function handleAdd(itemData) {
    setLastCategory(itemData.category ?? lastCategory);
    await onAdd(itemData);
  }

  // ── Mobile: aufklappbare Kategorie-Karten ──────────────────────────────
  if (isMobile) {
    const totalExpenses = items.reduce((s, i) => s + (effectiveAmount(i) ?? 0), 0);
    return (
      <Stack spacing={1.5}>
        {/* Summe-Header-Card */}
        <Paper variant="outlined" sx={{
          borderRadius: 1, px: 1.5, py: 1.25,
          bgcolor: 'rgba(239,68,68,0.05)',
          borderLeft: '3px solid', borderLeftColor: 'error.main',
        }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography sx={{ fontSize: '1.1rem' }}>🔴</Typography>
              <Box>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'error.main', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Ausgaben gesamt
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {items.length} {items.length === 1 ? 'Eintrag' : 'Einträge'}
                </Typography>
              </Box>
            </Stack>
            <Typography variant="h6" sx={{ color: 'error.main', fontFamily: 'monospace', fontWeight: 800 }}>
              {fmt2(totalExpenses)} €
            </Typography>
          </Stack>
        </Paper>

        {/* Kategorie-Karten */}
        {grouped.map((cat, catIdx) => (
          <MobileCategoryCard
            key={cat.id}
            cat={cat}
            items={cat.items}
            subtotal={insights[catIdx].catTotal}
            remaining={insights[catIdx].remaining}
            totalIncome={totalIncome}
            onItemClick={(item) => onOpenSheet({ type: 'expense', initial: item })}
            onAddClick={() => onOpenSheet({ type: 'expense', initial: { category: cat.id } })}
            defaultOpen={cat.items.length > 0}
          />
        ))}
      </Stack>
    );
  }

  const TH = ({ children, align = 'right', style: s }) => (
    <th style={{
      background: theme.palette.action.hover,
      color: theme.palette.text.secondary,
      fontSize: '0.62rem', fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.08em',
      padding: '8px 10px', textAlign: align, whiteSpace: 'nowrap',
      borderBottom: `2px solid ${theme.palette.error.main}40`,
      ...s,
    }}>
      {children}
    </th>
  );

  return (
    <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{
          px: 2, py: 1.5,
          borderBottom: 1, borderColor: 'divider',
          background: 'rgba(239,68,68,0.05)',
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography sx={{ fontSize: '1.1rem' }}>🔴</Typography>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Ausgaben</Typography>
          <Chip
            label={`${items.length} Einträge`}
            size="small"
            sx={{ bgcolor: 'rgba(239,68,68,0.2)', color: 'error.main', height: 20, fontSize: '0.62rem', fontWeight: 700 }}
          />
        </Stack>
        <Typography variant="subtitle1" sx={{ color: 'error.main', fontWeight: 800, fontFamily: 'monospace' }}>
          {fmt2(totalExpenses)} €
        </Typography>
      </Stack>

      {/* Table */}
      <Box sx={{ width: '100%', overflowX: 'auto' }}>
        <datalist id={COMBO_ID}>
          {LABEL_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
        </datalist>
        <Table size="small" sx={{ borderCollapse: 'collapse' }}>
          <TableHead>
            <tr>
              <TH align="left"> </TH>
              <TH align="left"> </TH>
              <TH align="left" style={{ minWidth: 220 }}>Bezeichnung</TH>
              <TH>Betrag</TH>
              <TH>Anteil %</TH>
              <TH>Mein Anteil</TH>
              <TH align="left">Notiz</TH>
              <TH> </TH>
            </tr>
          </TableHead>
          <TableBody>
            {grouped.map((cat, catIdx) => {
              const insight = insights[catIdx];
              return (
                <Fragment key={cat.id}>
                  {/* Category header */}
                  <CategoryHeaderRow
                    cat={cat}
                    subtotal={insight.catTotal}
                    onDragOver={handleDragOverCat}
                    onDrop={handleDropOnCat}
                    isOver={overCatId === cat.id}
                  />

                  {/* Items in this category */}
                  {cat.items.map((item) => (
                    <Fragment key={item.id}>
                      <BudgetRow
                        item={item}
                        onCommit={onCommit}
                        onDelete={onDelete}
                        isIncome={false}
                        isDragging={dragId.current === item.id}
                        isOver={overId === item.id}
                        dragHandlers={{
                          draggable: true,
                          onDragStart: () => handleDragStart(item.id),
                          onDragOver:  (e) => handleDragOverItem(e, item.id),
                          onDrop:      (e) => handleDropOnItem(e, item.id),
                          onDragEnd:   handleDragEnd,
                        }}
                      />
                      {/* Red deficit line exactly after the item that crosses budget */}
                      {item.id === deficitItemId && <DeficitRow totalIncome={totalIncome} />}
                    </Fragment>
                  ))}

                  {/* Empty drop zone */}
                  {cat.items.length === 0 && (
                    <EmptyCategoryDropZone
                      cat={cat}
                      onDragOver={handleDragOverCat}
                      onDrop={handleDropOnCat}
                      isOver={overCatId === cat.id}
                    />
                  )}

                  {/* Insight row — Verfügbar nach dieser Kategorie */}
                  <InsightRow
                    catLabel={cat.label}
                    remaining={insight.remaining}
                    totalIncome={totalIncome}
                  />
                </Fragment>
              );
            })}

            {/* Add item row */}
            <AddItemRow
              type="expense"
              onAdd={handleAdd}
              defaultCategory={lastCategory}
              isExpense
            />
          </TableBody>
        </Table>
      </Box>
    </Paper>
  );
}

// ─── Netto Footer ─────────────────────────────────────────────────────────────
function NettoFooter({ incomeItems, expenseItems }) {
  const totalIncome  = incomeItems.reduce((s, i) => s + (effectiveAmount(i) ?? 0), 0);
  const totalExpense = expenseItems.reduce((s, i) => s + (effectiveAmount(i) ?? 0), 0);
  const rest         = totalIncome - totalExpense;
  const isPositive   = rest >= 0;
  const pct = totalIncome > 0 ? Math.min(100, Math.round((totalExpense / totalIncome) * 100)) : 0;
  const progressColor = pct > 90 ? 'error' : pct > 70 ? 'warning' : 'success';
  const restColor     = isPositive ? 'success.main' : 'error.main';
  const restBg        = isPositive ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)';
  const restBorder    = isPositive ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)';

  return (
    <Paper variant="outlined" sx={{ borderRadius: 1, p: 2.5 }}>
      <Typography variant="overline" sx={{ display: 'block', color: 'text.secondary', fontWeight: 700, letterSpacing: '0.1em', mb: 2 }}>
        Netto-Bilanz
      </Typography>
      <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap" useFlexGap sx={{ mb: 2.5 }}>
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', mb: 0.5 }}>
            Einnahmen
          </Typography>
          <Typography variant="h5" sx={{ color: 'success.main', fontWeight: 800, fontFamily: 'monospace' }}>
            + {fmt2(totalIncome)} €
          </Typography>
        </Box>
        <Typography sx={{ color: 'text.secondary', fontSize: '1.5rem', fontWeight: 300 }}>−</Typography>
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', mb: 0.5 }}>
            Ausgaben
          </Typography>
          <Typography variant="h5" sx={{ color: 'error.main', fontWeight: 800, fontFamily: 'monospace' }}>
            {fmt2(totalExpense)} €
          </Typography>
        </Box>
        <Typography sx={{ color: 'text.secondary', fontSize: '1.5rem', fontWeight: 300 }}>=</Typography>
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', mb: 0.5 }}>
            Verfügbar
          </Typography>
          <Box sx={{
            color: restColor,
            fontWeight: 800,
            fontFamily: 'monospace',
            fontSize: '1.6rem',
            background: restBg,
            border: 1,
            borderColor: restBorder,
            borderRadius: 1,
            px: 2, py: 0.5,
          }}>
            {isPositive ? '+' : '−'} {fmt2(Math.abs(rest))} €
          </Box>
        </Box>
      </Stack>
      <Box>
        <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary">Ausgabenquote</Typography>
          <Typography variant="caption" sx={{ color: `${progressColor}.main`, fontWeight: 700 }}>
            {pct} %
          </Typography>
        </Stack>
        <LinearProgress
          variant="determinate"
          value={pct}
          color={progressColor}
          sx={{ height: 6, borderRadius: 99 }}
        />
      </Box>
    </Paper>
  );
}

// ─── BudgetPage ───────────────────────────────────────────────────────────────
export default function BudgetPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());
  const [importModalOpen, setImportModalOpen] = useState(false);

  const {
    items, loading, error, importing, isEmpty,
    addItem, updateItem, deleteItem, reorderItems, resetMonth,
    autoImport, copyFromPrevMonth,
    fetchImportCandidates, importSelected,
  } = useBudget(month, year);

  const [copyErr, setCopyErr] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  // Mobile: Item-Edit-Sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetType, setSheetType] = useState('expense'); // 'expense' | 'income'
  const [sheetInitial, setSheetInitial] = useState(null);
  const timers = useRef({});

  function openSheet({ type, initial }) {
    setSheetType(type);
    setSheetInitial(initial);
    setSheetOpen(true);
  }
  function closeSheet() { setSheetOpen(false); setSheetInitial(null); }
  async function handleSheetSave(data) {
    if (sheetInitial?.id) {
      await updateItem(sheetInitial.id, data);
    } else {
      await addItem({ ...data, type: sheetType });
    }
    closeSheet();
  }
  async function handleSheetDelete(id) {
    await deleteItem(id);
    closeSheet();
  }

  async function handleReset() {
    setResetting(true);
    setCopyErr('');
    try { await resetMonth(); setResetOpen(false); }
    catch (e) { setCopyErr(e.message); }
    finally { setResetting(false); }
  }

  const handleCommit = useCallback((id, field, rawValue) => {
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(async () => {
      let value = rawValue;
      if (field === 'amount')        value = parseFloat(rawValue);
      if (field === 'share_percent') value = parseInt(rawValue, 10);
      if (field === 'amount' && isNaN(value)) return;
      if (field === 'share_percent' && (isNaN(value) || value < 0 || value > 100)) return;
      try { await updateItem(id, { [field]: value }); } catch (_) {}
    }, DEBOUNCE_MS);
  }, [updateItem]);

  const incomeItems  = useMemo(() => items.filter((i) => i.type === 'income'),  [items]);
  const expenseItems = useMemo(() => items.filter((i) => i.type === 'expense'), [items]);
  const totalIncome  = useMemo(() => incomeItems.reduce((s, i) => s + (effectiveAmount(i) ?? 0), 0), [incomeItems]);

  async function handleCopyPrev() {
    setCopyErr('');
    try { await copyFromPrevMonth(); } catch (e) { setCopyErr(e.message); }
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <PageHeader
        title="Budget" icon="account_balance_wallet"
        subtitle="Einnahmen & Ausgaben im Monatsüberblick — gegliedert nach Kategorien."
        actions={!isEmpty ? (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button size="small" onClick={handleCopyPrev} startIcon={<ContentCopyIcon />}>
              Vormonat kopieren
            </Button>
            <Button size="small" onClick={() => setImportModalOpen(true)} startIcon={<PlaylistAddCheckIcon />}>
              Auswählen & importieren
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={autoImport}
              disabled={importing}
              startIcon={importing ? <CircularProgress size={12} color="inherit" /> : <BoltIcon />}
            >
              {importing ? 'Importiere…' : 'Alles importieren'}
            </Button>
            <Button
              size="small"
              color="error"
              variant="outlined"
              onClick={() => setResetOpen(true)}
              startIcon={<RestartAltIcon />}
            >
              Zurücksetzen
            </Button>
          </Stack>
        ) : null}
      />

      <ConfirmDialog
        open={resetOpen}
        title={`Monat ${month}/${year} zurücksetzen?`}
        message={`Alle ${items.length} Einträge für diesen Monat werden dauerhaft gelöscht. Das lässt sich nicht rückgängig machen.`}
        confirmLabel="Zurücksetzen"
        loading={resetting}
        onCancel={() => setResetOpen(false)}
        onConfirm={handleReset}
      />

      <Stack spacing={2.5}>
        {copyErr && <Alert severity="error" onClose={() => setCopyErr('')}>{copyErr}</Alert>}

        {/* Month nav + category legend */}
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" useFlexGap spacing={2}>
          <MonthNav month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
          {!isEmpty && (
            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
              {CATEGORIES.map(({ id, color, label }) => (
                <Stack key={id} direction="row" alignItems="center" spacing={0.5}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color }} />
                  <Typography variant="caption" color="text.secondary">{label}</Typography>
                </Stack>
              ))}
            </Stack>
          )}
        </Stack>

        {/* Loading */}
        {loading && (
          <Stack direction="row" alignItems="center" justifyContent="center" spacing={1.5} sx={{ minHeight: 180, color: 'text.secondary' }}>
            <CircularProgress size={18} />
            <Typography variant="body2">Wird geladen…</Typography>
          </Stack>
        )}

        {/* Error */}
        {error && <Alert severity="error"><strong>Fehler:</strong> {error}</Alert>}

        {/* Empty state */}
        {!loading && !error && isEmpty && (
          <EmptyBanner
            onImport={autoImport}
            onCopyPrev={copyFromPrevMonth}
            onSelectiveImport={() => setImportModalOpen(true)}
            importing={importing}
          />
        )}

        {/* Main content */}
        {!loading && !error && !isEmpty && (
          <>
            <IncomeSection
              items={incomeItems}
              onCommit={handleCommit}
              onDelete={deleteItem}
              onAdd={addItem}
              onReorder={reorderItems}
              onOpenSheet={openSheet}
            />
            <ExpenseCategoryTable
              items={expenseItems}
              totalIncome={totalIncome}
              onCommit={handleCommit}
              onDelete={deleteItem}
              onAdd={addItem}
              onReorder={reorderItems}
              updateItem={updateItem}
              onOpenSheet={openSheet}
            />
            <NettoFooter incomeItems={incomeItems} expenseItems={expenseItems} />
          </>
        )}
      </Stack>

      {/* Selective Import Modal */}
      {importModalOpen && (
        <SelectiveImportModal
          fetchImportCandidates={fetchImportCandidates}
          importSelected={importSelected}
          onClose={() => setImportModalOpen(false)}
        />
      )}

      {/* Mobile Item Edit Sheet */}
      <ItemEditSheet
        open={sheetOpen}
        initial={sheetInitial}
        isIncome={sheetType === 'income'}
        onClose={closeSheet}
        onSave={handleSheetSave}
        onDelete={handleSheetDelete}
      />
    </Box>
  );
}
