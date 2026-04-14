import { useState } from 'react';
import {
  Box, Stack, Typography, IconButton, Chip, Collapse,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, TableFooter,
  TextField, InputAdornment, ToggleButton, ToggleButtonGroup,
  Paper,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { toDisplay, INTERVAL_LABELS } from '../utils/calculations';
import { ConfirmDialog } from './mui';

const SORT_DIRECTIONS = { asc: 'desc', desc: 'asc' };

const fmt = (v) => v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Delta Badge ─────────────────────────────────────────────────────────────
function DeltaBadge({ current, previous }) {
  if (previous == null || current == null) return null;
  const delta = current - previous;
  const pct   = ((delta / previous) * 100).toFixed(1);
  if (delta === 0) return <Chip label="±0" size="small" sx={{ height: 18, fontSize: '0.65rem' }} />;
  const positive = delta > 0;
  return (
    <Chip
      size="small"
      color={positive ? 'error' : 'success'}
      variant="outlined"
      label={`${positive ? '▲' : '▼'} ${Math.abs(delta).toLocaleString('de-DE', { minimumFractionDigits: 2 })} € (${pct}%)`}
      sx={{ height: 18, fontSize: '0.62rem' }}
    />
  );
}

// ─── Category Row ─────────────────────────────────────────────────────────────
function CategoryRow({ category, years, viewMode, onEdit, onDeleteEntry, onDeleteCategory }) {
  const [expanded, setExpanded] = useState(false);
  const [confirm,  setConfirm]  = useState(null); // { type: 'entry'|'category', year? }

  const totalRow = category.entries
    .filter((e) => years.includes(e.year))
    .reduce((sum, e) => sum + toDisplay(e.premium, e.payment_interval, viewMode), 0);
  const latestEntry = category.entries[category.entries.length - 1];

  return (
    <>
      <TableRow hover sx={{ '& > *': { borderBottom: 'unset' } }}>
        {/* Category name */}
        <TableCell sx={{ position: 'sticky', left: 0, backgroundColor: 'background.paper', zIndex: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1.25}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: category.color, flexShrink: 0 }} />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{category.name}</Typography>
              {category.description && (
                <Typography variant="caption" color="text.secondary" sx={{
                  display: 'block', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {category.description}
                </Typography>
              )}
            </Box>
            <IconButton
              size="small"
              color="error"
              onClick={() => setConfirm({ type: 'category' })}
              title="Kategorie löschen"
              sx={{ ml: 'auto' }}
            >
              <DeleteOutlineIcon fontSize="inherit" />
            </IconButton>
          </Stack>
        </TableCell>

        {/* Year columns */}
        {years.map((year, idx) => {
          const entry     = category.entries.find((e) => e.year === year);
          const prevYear  = years[idx - 1];
          const prevEntry = prevYear ? category.entries.find((e) => e.year === prevYear) : null;
          const value     = entry ? toDisplay(entry.premium, entry.payment_interval, viewMode) : null;
          const prevVal   = prevEntry ? toDisplay(prevEntry.premium, prevEntry.payment_interval, viewMode) : null;

          return (
            <TableCell key={year} align="right">
              {entry ? (
                <Stack spacing={0.5} alignItems="flex-end">
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 500 }}>
                      {fmt(value)} €
                    </Typography>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => setConfirm({ type: 'entry', year })}
                      title={`Eintrag ${year} löschen`}
                      sx={{ p: 0.25 }}
                    >
                      <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Stack>
                  <DeltaBadge current={value} previous={prevVal} />
                  <Chip
                    label={INTERVAL_LABELS[entry.payment_interval] ?? entry.payment_interval}
                    size="small"
                    sx={{ height: 16, fontSize: '0.6rem', bgcolor: 'action.hover', color: 'text.secondary' }}
                  />
                </Stack>
              ) : (
                <Typography variant="body2" color="text.disabled">–</Typography>
              )}
            </TableCell>
          );
        })}

        {/* Latest provider */}
        <TableCell align="right">
          {latestEntry && (
            <Chip
              label={latestEntry.provider}
              size="small"
              sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', height: 20, fontSize: '0.7rem' }}
            />
          )}
        </TableCell>

        {/* Row total */}
        <TableCell align="right">
          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
            {fmt(totalRow)} €
          </Typography>
        </TableCell>

        {/* Actions */}
        <TableCell align="right">
          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
            <IconButton size="small" onClick={() => setExpanded((v) => !v)} title={expanded ? 'Verlauf schließen' : 'Verlauf'}>
              {expanded ? <ExpandLessIcon fontSize="inherit" /> : <ExpandMoreIcon fontSize="inherit" />}
            </IconButton>
            <IconButton size="small" onClick={() => onEdit(category.id)} title="Bearbeiten">
              <EditOutlinedIcon fontSize="inherit" />
            </IconButton>
          </Stack>
        </TableCell>
      </TableRow>

      {/* Expanded history */}
      <TableRow>
        <TableCell colSpan={years.length + 4} sx={{ p: 0, borderBottom: expanded ? undefined : 'unset' }}>
          <Collapse in={expanded} timeout="auto" unmountOnExit>
            <Box sx={{ p: 2, bgcolor: 'action.hover' }}>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {category.entries.map((e) => (
                  <Stack
                    key={e.id}
                    direction="row"
                    alignItems="center"
                    spacing={1}
                    sx={{
                      bgcolor: 'background.paper',
                      border: 1,
                      borderColor: 'divider',
                      borderRadius: 1.5,
                      px: 1.25,
                      py: 0.5,
                    }}
                  >
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>{e.year}</Typography>
                    <Typography variant="caption" color="text.disabled">·</Typography>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                      {e.premium.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €{' '}
                      <Typography component="span" variant="caption" color="text.secondary">
                        /{INTERVAL_LABELS[e.payment_interval]?.toLowerCase() ?? e.payment_interval}
                      </Typography>
                    </Typography>
                    <Typography variant="caption" color="text.disabled">·</Typography>
                    <Chip
                      label={e.provider}
                      size="small"
                      sx={{ bgcolor: `${category.color}22`, color: category.color, height: 18, fontSize: '0.62rem' }}
                    />
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => setConfirm({ type: 'entry', year: e.year })}
                      sx={{ p: 0.25 }}
                      title="Eintrag löschen"
                    >
                      <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Stack>
                ))}
              </Stack>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>

      <ConfirmDialog
        open={!!confirm}
        title="Bist du sicher?"
        message={
          confirm?.type === 'category'
            ? `Die Kategorie „${category.name}" und alle zugehörigen Einträge werden dauerhaft gelöscht.`
            : `Der Eintrag für ${confirm?.year} in „${category.name}" wird gelöscht.`
        }
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm?.type === 'category') onDeleteCategory(category.id);
          else if (confirm?.type === 'entry') onDeleteEntry(category.id, confirm.year);
          setConfirm(null);
        }}
      />
    </>
  );
}

// ─── InsuranceTable ───────────────────────────────────────────────────────────
export default function InsuranceTable({ categories, onEdit, onDeleteEntry, onDeleteCategory }) {
  const [sortField, setSortField] = useState('name');
  const [sortDir,   setSortDir]   = useState('asc');
  const [search,    setSearch]    = useState('');
  const [viewMode,  setViewMode]  = useState('jahr'); // 'jahr' | 'monat'

  const years = Array.from(
    new Set(categories.flatMap((c) => c.entries.map((e) => e.year)))
  ).sort((a, b) => b - a);

  function handleSort(field) {
    setSortDir((prev) => field === sortField ? SORT_DIRECTIONS[prev] : 'asc');
    setSortField(field);
  }

  const sorted = [...categories]
    .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      let aVal = a.name, bVal = b.name;
      if (sortField === 'total') {
        aVal = a.entries.reduce((s, e) => s + toDisplay(e.premium, e.payment_interval, viewMode), 0);
        bVal = b.entries.reduce((s, e) => s + toDisplay(e.premium, e.payment_interval, viewMode), 0);
      }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ?  1 : -1;
      return 0;
    });

  const yearTotals = years.reduce((acc, year) => {
    acc[year] = categories.reduce((sum, cat) => {
      const entry = cat.entries.find((e) => e.year === year);
      return sum + (entry ? toDisplay(entry.premium, entry.payment_interval, viewMode) : 0);
    }, 0);
    return acc;
  }, {});
  const grandTotal = Object.values(yearTotals).reduce((s, v) => s + v, 0);

  return (
    <Stack spacing={2}>
      {/* Toolbar */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', sm: 'center' }}
        spacing={1.5}
      >
        <TextField
          size="small"
          placeholder="Kategorie suchen…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ maxWidth: { sm: 280 }, width: '100%' }}
        />
        <Stack direction="row" alignItems="center" spacing={2}>
          <Typography variant="caption" color="text.secondary">
            {sorted.length} von {categories.length} Kategorien
          </Typography>
          <ToggleButtonGroup
            size="small"
            value={viewMode}
            exclusive
            onChange={(_, v) => v && setViewMode(v)}
          >
            <ToggleButton value="jahr">Jahresansicht</ToggleButton>
            <ToggleButton value="monat">Monatsansicht</ToggleButton>
          </ToggleButtonGroup>
        </Stack>
      </Stack>

      {/* Table */}
      <TableContainer component={Paper} elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ position: 'sticky', left: 0, zIndex: 2, bgcolor: 'action.hover' }}>
                <TableSortLabel
                  active={sortField === 'name'}
                  direction={sortField === 'name' ? sortDir : 'asc'}
                  onClick={() => handleSort('name')}
                >
                  Kategorie
                </TableSortLabel>
              </TableCell>
              {years.map((year) => (
                <TableCell key={year} align="right">{year}</TableCell>
              ))}
              <TableCell align="right">Anbieter</TableCell>
              <TableCell align="right">
                <TableSortLabel
                  active={sortField === 'total'}
                  direction={sortField === 'total' ? sortDir : 'asc'}
                  onClick={() => handleSort('total')}
                >
                  Gesamt
                </TableSortLabel>
              </TableCell>
              <TableCell align="right" sx={{ width: 80 }}>Aktionen</TableCell>
            </TableRow>
            <TableRow>
              <TableCell colSpan={years.length + 4} sx={{ py: 0.5, bgcolor: 'action.hover' }}>
                <Typography variant="caption" color="text.secondary">
                  Werte in: <strong>{viewMode === 'jahr' ? 'Jahresbeträge (€/Jahr)' : 'Monatsbeträge (€/Monat)'}</strong>
                </Typography>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sorted.map((cat) => (
              <CategoryRow
                key={cat.id}
                category={cat}
                years={years}
                viewMode={viewMode}
                onEdit={onEdit}
                onDeleteEntry={onDeleteEntry}
                onDeleteCategory={onDeleteCategory}
              />
            ))}
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={years.length + 4} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                  Keine Kategorien gefunden.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          <TableFooter>
            <TableRow sx={{ '& td': { borderTop: 2, borderTopColor: 'divider', bgcolor: 'action.hover' } }}>
              <TableCell sx={{
                position: 'sticky', left: 0, fontWeight: 700, color: 'text.secondary',
                textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.7rem',
              }}>
                Gesamt/{viewMode === 'jahr' ? 'Jahr' : 'Monat'}
              </TableCell>
              {years.map((year) => (
                <TableCell key={year} align="right" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                  {fmt(yearTotals[year])} €
                </TableCell>
              ))}
              <TableCell />
              <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'primary.main' }}>
                {fmt(grandTotal)} €
              </TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </TableContainer>
    </Stack>
  );
}

