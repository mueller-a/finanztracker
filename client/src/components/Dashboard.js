import { useState } from 'react';
import {
  Box, Stack, Typography, Chip, Card, CardContent, IconButton,
  ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import {
  ComposedChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { buildChartData, buildStackedData, INTERVAL_LABELS } from '../utils/calculations';
import { SectionCard } from './mui';

// ─── Rich Tooltip (total + top-3) ────────────────────────────────────────────
function RichTooltip({ active, payload, label, categories, viewMode }) {
  const theme = useTheme();
  if (!active || !payload?.length) return null;

  const suffix = viewMode === 'monat' ? '/Mo.' : '/Jahr';

  const totalEntry = payload.find((p) => p.dataKey === 'total');
  const total      = totalEntry?.value ?? 0;

  const catRows = payload
    .filter((p) => p.dataKey !== 'total' && p.value != null && p.value > 0)
    .sort((a, b) => b.value - a.value);

  const top3 = catRows.slice(0, 3);
  const rest = catRows.length - 3;

  return (
    <Box sx={{
      bgcolor: 'background.paper',
      border: 1,
      borderColor: 'divider',
      borderRadius: 1,
      p: 1.5,
      minWidth: 200,
      boxShadow: 4,
    }}>
      <Typography variant="caption" sx={{
        display: 'block', color: 'text.secondary', fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.06em', mb: 1,
      }}>
        {label}
      </Typography>

      <Stack
        direction="row" justifyContent="space-between" alignItems="center"
        sx={{ pb: 1, mb: 1, borderBottom: 1, borderColor: 'divider' }}
      >
        <Typography variant="body2" sx={{ fontWeight: 700 }}>Gesamt</Typography>
        <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
          {total.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €{suffix}
        </Typography>
      </Stack>

      {top3.map((p) => {
        const cat = categories.find((c) => c.name === p.dataKey);
        return (
          <Stack key={p.dataKey} direction="row" justifyContent="space-between" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
            <Stack direction="row" alignItems="center" spacing={0.75}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: cat?.color ?? p.color }} />
              <Typography variant="caption" color="text.secondary" sx={{
                maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {p.dataKey}
              </Typography>
            </Stack>
            <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
              {p.value.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
            </Typography>
          </Stack>
        );
      })}
      {rest > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          +{rest} weitere
        </Typography>
      )}
    </Box>
  );
}

// ─── Total Cost Chart ────────────────────────────────────────────────────────
function TotalCostChart({ categories, viewMode }) {
  const theme = useTheme();
  const data   = buildStackedData(categories, viewMode);
  const suffix = viewMode === 'monat' ? '/Monat' : '/Jahr';
  const isDark = theme.palette.mode === 'dark';
  // Total line uses primary (navy) — primary focal line per Fiscal Gallery
  const totalLine = theme.palette.primary.main;

  return (
    <SectionCard
      title="Gesamtkostenentwicklung"
      subheader={`Alle Kategorien gestapelt · ${suffix.slice(1)} · Hover für Details`}
      action={
        <Stack direction="row" flexWrap="wrap" sx={{ gap: '6px 14px', justifyContent: 'flex-end', maxWidth: 320 }}>
          {categories.map((cat) => (
            <Stack key={cat.id} direction="row" alignItems="center" spacing={0.5}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: cat.color }} />
              <Typography variant="caption" color="text.secondary">{cat.name}</Typography>
            </Stack>
          ))}
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Box sx={{ width: 20, height: 3, borderRadius: 1, bgcolor: totalLine }} />
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Gesamt</Typography>
          </Stack>
        </Stack>
      }
    >
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
          <defs>
            {categories.map((cat) => (
              <linearGradient key={cat.id} id={`grad-${cat.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={cat.color} stopOpacity={isDark ? 0.5 : 0.4} />
                <stop offset="95%" stopColor={cat.color} stopOpacity={0.03} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
          <XAxis dataKey="year" tick={{ fill: theme.palette.text.secondary, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: theme.palette.text.secondary, fontSize: 11 }} axisLine={false} tickLine={false}
            tickFormatter={(v) => `${v} €`} width={64} />
          <Tooltip content={<RichTooltip categories={categories} viewMode={viewMode} />} />
          {categories.map((cat) => (
            <Area
              key={cat.id} type="monotone" dataKey={cat.name} stackId="total"
              stroke={cat.color} strokeWidth={1.5} fill={`url(#grad-${cat.id})`}
              connectNulls={false} dot={false}
            />
          ))}
          <Line
            type="monotone" dataKey="total" stroke={totalLine} strokeWidth={3}
            dot={false} connectNulls
            activeDot={{ r: 5, strokeWidth: 2, stroke: theme.palette.background.paper }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </SectionCard>
  );
}

// ─── Provider Timeline ───────────────────────────────────────────────────────
function ProviderTimeline({ entries, color }) {
  if (!entries.length) return null;
  const runs = [];
  entries.forEach((e) => {
    const display = e.provider_obj?.name ?? e.provider ?? '–';
    const last = runs[runs.length - 1];
    if (last && last.provider === display) { last.endYear = e.year; }
    else runs.push({ provider: display, startYear: e.year, endYear: e.year });
  });
  return (
    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
      {runs.map((run, i) => (
        <Chip
          key={i}
          size="small"
          label={
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Box sx={{
                width: 6, height: 6, borderRadius: '50%',
                bgcolor: i === runs.length - 1 ? color : 'text.disabled',
              }} />
              <Typography variant="caption">{run.provider}</Typography>
              <Typography variant="caption" color="text.disabled">
                {run.startYear === run.endYear ? run.startYear : `${run.startYear}–${run.endYear}`}
              </Typography>
            </Stack>
          }
          sx={{ height: 22, '& .MuiChip-label': { px: 1 } }}
        />
      ))}
    </Stack>
  );
}

// ─── Single-Category Line Card ───────────────────────────────────────────────
function CategoryLineCard({ category, viewMode, onEdit, onDeleteCategory }) {
  const theme = useTheme();
  const data   = buildChartData(category, viewMode);
  const suffix = viewMode === 'monat' ? '/Monat' : '/Jahr';
  const latest = data[data.length - 1];

  const latestEntry   = category.entries[category.entries.length - 1];
  const intervalLabel = latestEntry ? (INTERVAL_LABELS[latestEntry.payment_interval] ?? latestEntry.payment_interval) : null;

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
            <Stack direction="row" alignItems="center" spacing={1.25}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: category.color, flexShrink: 0 }} />
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{category.name}</Typography>
                {category.description && (
                  <Typography variant="caption" color="text.secondary">{category.description}</Typography>
                )}
              </Box>
            </Stack>
            <Stack direction="row" spacing={0.5}>
              <IconButton size="small" onClick={() => onEdit(category.id)} title="Bearbeiten">
                <EditOutlinedIcon fontSize="inherit" />
              </IconButton>
              <IconButton
                size="small"
                color="error"
                onClick={() => onDeleteCategory(category.id, category.name)}
                title="Kategorie löschen"
              >
                <DeleteOutlineIcon fontSize="inherit" />
              </IconButton>
            </Stack>
          </Stack>

          <ProviderTimeline entries={category.entries} color={category.color} />

          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.palette.divider} />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: theme.palette.text.secondary }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                axisLine={false} tickLine={false}
                tickFormatter={(v) => `${v} €`}
                width={60}
              />
              <Tooltip
                formatter={(v) => [`${v.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €${suffix}`, category.name]}
                contentStyle={{
                  borderRadius: 8,
                  fontSize: 12,
                  background: theme.palette.background.paper,
                  border: `1px solid ${theme.palette.divider}`,
                }}
              />
              <Line
                type="monotone" dataKey="premium" name={category.name}
                stroke={category.color} strokeWidth={2.5}
                dot={{ fill: category.color, r: 4, strokeWidth: 0 }}
                activeDot={{ r: 6, strokeWidth: 2, stroke: theme.palette.background.paper }}
              />
            </LineChart>
          </ResponsiveContainer>

          {latest && (
            <Stack direction="row" justifyContent="space-between" alignItems="flex-end" sx={{
              pt: 1, borderTop: 1, borderColor: 'divider',
            }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="caption" color="text.secondary">Aktueller Beitrag</Typography>
                {intervalLabel && (
                  <Chip
                    label={intervalLabel}
                    size="small"
                    sx={{ height: 18, fontSize: '0.62rem', bgcolor: 'action.hover', color: 'text.secondary' }}
                  />
                )}
              </Stack>
              <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
                {latest.premium.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €{suffix}
              </Typography>
            </Stack>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

// ─── View-mode toggle ────────────────────────────────────────────────────────
function ViewToggle({ viewMode, onChange }) {
  return (
    <ToggleButtonGroup
      size="small"
      value={viewMode}
      exclusive
      onChange={(_, v) => v && onChange(v)}
    >
      <ToggleButton value="jahr">Jahresansicht</ToggleButton>
      <ToggleButton value="monat">Monatsansicht</ToggleButton>
    </ToggleButtonGroup>
  );
}

// ─── Year Filter ─────────────────────────────────────────────────────────────
function YearFilter({ years, selected, onChange }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
        Filtern:
      </Typography>
      {years.map((y) => {
        const isSelected = selected.includes(y);
        return (
          <Chip
            key={y}
            label={y}
            size="small"
            color={isSelected ? 'primary' : 'default'}
            onClick={() => onChange(isSelected ? selected.filter((s) => s !== y) : [...selected, y])}
            sx={{ height: 22 }}
          />
        );
      })}
    </Stack>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
export default function Dashboard({ categories, onEdit, onDeleteCategory, viewMode, onViewModeChange }) {
  const allYears = Array.from(
    new Set(categories.flatMap((c) => c.entries.map((e) => e.year)))
  ).sort((a, b) => a - b);

  const [selectedYears, setSelectedYears] = useState(allYears);

  const filteredCategories = categories.map((cat) => ({
    ...cat,
    entries: cat.entries.filter((e) => selectedYears.includes(e.year)),
  }));

  return (
    <Stack spacing={3}>
      {/* Controls row */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1.5}>
        {allYears.length > 1 ? (
          <YearFilter years={allYears} selected={selectedYears} onChange={setSelectedYears} />
        ) : <Box />}
        <ViewToggle viewMode={viewMode} onChange={onViewModeChange} />
      </Stack>

      <TotalCostChart categories={filteredCategories} viewMode={viewMode} />

      {/* Einzellinien pro Kategorie — immer sichtbar */}
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', xl: 'repeat(3, 1fr)' },
        gap: 2,
      }}>
        {filteredCategories.map((cat) => (
          <CategoryLineCard
            key={cat.id}
            category={cat}
            viewMode={viewMode}
            onEdit={onEdit}
            onDeleteCategory={onDeleteCategory}
          />
        ))}
      </Box>
    </Stack>
  );
}
