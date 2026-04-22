import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Slider, Box, Button, IconButton, Tabs, Tab, Stack, Typography, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, Card, CardContent,
  Alert, TextField, ToggleButton, ToggleButtonGroup, Switch, Paper,
  Table, TableBody,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Area, AreaChart
} from 'recharts';
import { useETFPolicen } from '../hooks/useETFPolicen';
import { usePolicySnapshots } from '../hooks/usePolicySnapshots';
import {
  calcPolicy, calcAVD, calcDepot, calcBAV, calcDRV,
  euro, num, fmtShort
} from '../utils/etfCalculations';
import { computeLumpSumTax, computeAnnuityTax } from '../utils/insuranceTax';
import { computeBavLumpSumTax, computeBavAnnuityTax, compareBavVsPrivat } from '../utils/bavTax';
import { computeGrvTax, getSteuerpflichtigerAnteil } from '../utils/grvTax';
import { readPkvProjection } from '../lib/pkvProjection';
import { useModules, calculateAge } from '../context/ModuleContext';
import { calculateTotalNetRetirement } from '../utils/retirementNet';
import {
  KpiCard, SectionCard, PageHeader, CurrencyField, DateField, ConfirmDialog, DataTable,
} from '../components/mui';

// ── Chart colors — Fiscal Gallery palette ───────────────────────────────────
// Recharts needs raw CSS values — these mirror theme.palette tokens and
// design-tokens.css. Never use other hex literals in this file.
const CHART = {
  positive: '#006c49',   // secondary — gains, emerald
  negative: '#ba1a1a',   // error — losses, coral-red
  neutral:  '#131b2e',   // primary_container — navy focal line
  warning:  '#b45309',   // amber
  muted:    '#45464d',   // on_surface_variant
  grid:     '#c6c6cd',   // outline_variant
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function runCalc(type, params, snapshot, snapshotHistory, policyMeta) {
  if (!params) return null;
  try {
    // Inject snapshot for hybrid tracking (only relevant for insurance type)
    // snapshot       = neuester Snapshot (Startpunkt für Prognose)
    // snapshotHistory = alle Snapshots (für historische Datapoints im Chart)
    // policyMeta     = zusätzliche Policy-Felder außerhalb von params (z.B. is_passive)
    const baseParams = policyMeta?.is_passive != null
      ? { ...params, is_passive: policyMeta.is_passive }
      : params;
    const enriched = snapshot
      ? { ...baseParams, snapshotStart: snapshot, snapshotHistory: snapshotHistory || [] }
      : baseParams;
    if (type === 'drv')   return calcDRV(baseParams);
    if (type === 'bav') {
      const r = calcBAV(baseParams);
      // Depot equivalent: same monthly net cost from today → retirement (for comparison chart)
      const nowDate  = new Date();
      const nowYear  = nowDate.getFullYear();
      const nowMonth = nowDate.getMonth() + 1;
      const depotComp = calcDepot({
        sparrate:     r.nettoVerzicht,
        rendite:      params.rendite || 7,
        ter:          0.2,
        depotgebuehr: 0,
        inflation:    params.inflation || 2,
        steuer:       26.375,
        vbJahr:       nowYear,
        vbMonat:      nowMonth,
        rentenJahr:   params.rentenJahr,
        rentenMonat:  params.rentenMonat,
        leben:        22,
      });
      return { ...r, depotComparison: depotComp };
    }
    if (type === 'avd')   return calcAVD(baseParams);
    if (type === 'depot') return calcDepot(enriched);  // Snapshot als Startwert übernehmen
    return calcPolicy(enriched);
  } catch { return null; }
}

const TYPE_LABEL = { insurance: 'RV', avd: 'AVD', depot: 'Depot', bav: 'bAV', drv: 'DRV' };
const TYPE_NAME  = {
  insurance: 'Rentenversicherung',
  avd:       'AVD Depot',
  depot:     'Freies ETF-Depot',
  bav:       'Betriebliche Altersvorsorge',
  drv:       'Gesetzliche Rente (DRV)',
};
const TYPE_DESC = {
  insurance: 'Fondsgebundene Police · Alpha/Beta/Gamma-Kostenstruktur · Lebenslange Rente',
  avd:       'Staatl. gefördert · Grundzulage bis 570 €/Jahr · Kinderzulage 300 €/Kind · ab 2027',
  depot:     'Kein Versicherungsmantel · Nur TER + Depotgebühr · Abgeltungssteuer + 30 % Teilfreistellung',
  bav:       'Entgeltumwandlung · AG-Zuschuss · Steuervorteil jetzt · Nachgelagerte Besteuerung im Alter',
  drv:       'Aus Rentenbescheid · Entgeltpunkte · Dynamische Rentenanpassung · PKV-Integration',
};
const TYPE_ICON  = { insurance: '💼', avd: '🏛️', depot: '📈', bav: '🏢', drv: '🏛' };
const TYPE_COLOR = { insurance: CHART.neutral, avd: CHART.neutral, depot: CHART.positive, bav: CHART.warning, drv: CHART.positive };

// ── Theme-Token-Shim ──────────────────────────────────────────────────────────
// Liest alle Farben/Surfaces aus dem MUI-Theme statt aus hardcoded Hex.
// Die alten Sub-Komponenten (Sidebars, Modals, Stat/Detail-Cards) verwenden
// weiterhin diese Felder, ziehen aber transparent aus theme.palette. Das
// `accent` Feld bleibt zur Kompat. erhalten und verweist auf primary.main.

function useTokens() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  return {
    card:    theme.palette.background.paper,
    cardAlt: isDark ? CHART.neutral : theme.palette.background.default,
    bdr:     theme.palette.divider,
    text:    theme.palette.text.primary,
    sub:     theme.palette.text.secondary,
    bg:      theme.palette.background.default,
    grid:    isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)',
    tickClr: theme.palette.text.disabled,
    accent:  theme.palette.primary.main,
  };
}

// ── Recharts custom tooltip ───────────────────────────────────────────────────
// Uses Paper (surface-container-lowest bg + ghost border via outlined variant)
// so it inherits the Fiscal Gallery chrome automatically.

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, p: 1.25, fontSize: 12 }}>
      <Box sx={{ color: 'text.secondary', mb: 0.5 }}>{label}</Box>
      {payload.map((entry) => (
        <Stack key={entry.dataKey} direction="row" spacing={1} sx={{ color: entry.color }}>
          <span>{entry.name}:</span>
          <Box component="span" sx={{ fontWeight: 600 }}>{euro(entry.value)}</Box>
        </Stack>
      ))}
    </Paper>
  );
}

// ── Slider control ────────────────────────────────────────────────────────────

function SliderCtrl({ label, value, min, max, step, onChange, format, color, isDark }) {
  const t = useTokens(isDark);
  const display = format ? format(value) : value;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ color: t.sub, fontSize: '0.7rem' }}>{label}</span>
        <span style={{ color: t.text, fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 700 }}>
          {display}
        </span>
      </div>
      <Slider
        value={value} min={min} max={max} step={step}
        onChange={(_, v) => onChange(v)}
        size="small"
        sx={{
          color,
          '& .MuiSlider-thumb': { width: 12, height: 12 },
          '& .MuiSlider-rail': { opacity: 0.3 },
          padding: '8px 0',
        }}
      />
    </div>
  );
}

// ── Month input ───────────────────────────────────────────────────────────────

function MonthInput({ label, value, onChange, min, max, isDark }) {
  const t = useTokens(isDark);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ color: t.sub, fontSize: '0.7rem', marginBottom: 4 }}>{label}</div>
      <input
        type="month"
        value={value}
        min={min}
        max={max}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', background: t.cardAlt, border: `1px solid ${t.bdr}`,
          borderRadius: 6, padding: '5px 8px', color: t.text,
          fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box',
          colorScheme: isDark ? 'dark' : 'light',
        }}
      />
    </div>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children, isDark }) {
  const t = useTokens(isDark);
  return (
    <div style={{
      color: t.sub, fontSize: '0.65rem', fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.1em',
      marginBottom: 10, marginTop: 4,
      paddingBottom: 6, borderBottom: `1px solid ${t.bdr}`,
    }}>
      {children}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
// Primary KPI-Style gemäß .claude/skills/design-system/design-KPIs.md
// (Editorial Navy mit Emerald-Decorative-Icon + optional Pill-Badge).
// `accent` wird legacy weiter entgegengenommen, aber visuell nicht mehr genutzt.

// eslint-disable-next-line no-unused-vars
function StatCard({ label, value, sub, icon, badge, accent }) {
  return (
    <Paper sx={(t) => ({
      position: 'relative',
      overflow: 'hidden',
      bgcolor: 'primary.dark',
      color: 'primary.contrastText',
      borderRadius: 3,
      p: { xs: 2, sm: 2.25 },
      minWidth: 0,
      height: '100%',
      '&::before': {
        content: '""',
        position: 'absolute',
        inset: 0,
        background: `linear-gradient(135deg, ${t.palette.primary.dark} 0%, ${t.palette.primary.main} 100%)`,
        opacity: 0.5,
        pointerEvents: 'none',
      },
    })}>
      {icon && (
        <Box
          component="span"
          className="material-symbols-outlined"
          sx={{
            position: 'absolute',
            right: -16, bottom: -20,
            fontSize: 140,
            color: 'accent.positiveSurface',
            opacity: 0.1,
            pointerEvents: 'none',
            userSelect: 'none',
            lineHeight: 1,
            zIndex: 0,
          }}
        >
          {icon}
        </Box>
      )}

      <Box sx={{ position: 'relative', zIndex: 1 }}>
        <Typography variant="overline" sx={{
          color: 'primary.light', display: 'block',
          fontSize: '0.625rem', letterSpacing: '0.08em',
          lineHeight: 1.15, mb: 1,
        }}>
          {label}
        </Typography>
        <Typography sx={{
          fontFamily: '"Manrope", sans-serif',
          fontWeight: 800,
          letterSpacing: '-0.01em',
          lineHeight: 1.1,
          fontSize: { xs: '1.5rem', sm: '1.75rem' },
          color: 'primary.contrastText',
          mb: (badge || sub) ? 1.5 : 0,
        }}>
          {value}
        </Typography>
        {(badge || sub) && (
          <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
            {badge && (
              <Box sx={{
                px: 1.25, py: 0.5, borderRadius: 99,
                bgcolor: 'accent.positiveSurface', color: 'primary.dark',
                fontWeight: 700, fontSize: '0.72rem',
                letterSpacing: '0.01em', lineHeight: 1, whiteSpace: 'nowrap',
              }}>
                {badge}
              </Box>
            )}
            {sub && (
              <Typography variant="caption" sx={{
                color: 'primary.light', lineHeight: 1.3, fontSize: '0.72rem',
              }}>
                {sub}
              </Typography>
            )}
          </Stack>
        )}
      </Box>
    </Paper>
  );
}

// Secondary KPI-Style gemäß .claude/skills/design-system/design-KPIs.md
// (helle Surface mit 3px Emerald-Linkstreifen + Tinted Shadow + Emerald-Icon
// 18% Opacity). Für unterstützende Kennzahlen, die neben Primary-Karten stehen.
function StatCardSecondary({ label, value, sub, icon, badge }) {
  return (
    <Paper sx={{
      position: 'relative',
      overflow: 'hidden',
      bgcolor: 'background.paper',
      color: 'text.primary',
      borderRadius: 3,
      p: { xs: 2, sm: 2.25 },
      borderLeft: '3px solid',
      borderLeftColor: 'accent.positiveSurface',
      boxShadow: '0 6px 30px rgba(11, 28, 48, 0.06)',
      minWidth: 0,
      height: '100%',
    }}>
      {icon && (
        <Box
          component="span"
          className="material-symbols-outlined"
          sx={{
            position: 'absolute',
            right: -12, bottom: -18,
            fontSize: 120,
            color: 'accent.positiveSurface',
            opacity: 0.18,
            pointerEvents: 'none',
            userSelect: 'none',
            lineHeight: 1,
            zIndex: 0,
          }}
        >
          {icon}
        </Box>
      )}

      <Box sx={{ position: 'relative', zIndex: 1 }}>
        <Typography variant="overline" sx={{
          color: 'text.secondary', display: 'block',
          fontSize: '0.625rem', letterSpacing: '0.08em',
          lineHeight: 1.15, mb: 1,
        }}>
          {label}
        </Typography>
        <Typography sx={{
          fontFamily: '"Manrope", sans-serif',
          fontWeight: 800,
          letterSpacing: '-0.01em',
          lineHeight: 1.1,
          fontSize: { xs: '1.25rem', sm: '1.5rem' },
          color: 'text.primary',
          mb: (badge || sub) ? 1.5 : 0,
        }}>
          {value}
        </Typography>
        {(badge || sub) && (
          <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
            {badge && (
              <Box sx={{
                px: 1.25, py: 0.5, borderRadius: 99,
                bgcolor: 'accent.positiveSurface', color: 'primary.dark',
                fontWeight: 700, fontSize: '0.72rem',
                letterSpacing: '0.01em', lineHeight: 1, whiteSpace: 'nowrap',
              }}>
                {badge}
              </Box>
            )}
            {sub && (
              <Typography variant="caption" sx={{
                color: 'text.secondary', lineHeight: 1.3, fontSize: '0.72rem',
              }}>
                {sub}
              </Typography>
            )}
          </Stack>
        )}
      </Box>
    </Paper>
  );
}

// ── Type selector modal ───────────────────────────────────────────────────────

function TypeSelectorModal({ open, onClose, onSelect }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Vorsorge-Typ wählen</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Welche Art der Altersvorsorge möchtest du hinzufügen?
        </Typography>
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: 1.5,
        }}>
          {['drv', 'insurance', 'avd', 'depot', 'bav'].map(type => (
            <Box
              key={type}
              onClick={() => onSelect(type)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(type); }}
              sx={(theme) => ({
                backgroundColor: theme.palette.mode === 'dark' ? CHART.neutral : theme.palette.background.default,
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: 1,
                p: 2,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'border-color 0.15s, transform 0.15s',
                '&:hover': { borderColor: TYPE_COLOR[type], transform: 'translateY(-1px)' },
              })}
            >
              <Typography sx={{ fontSize: '1.6rem', mb: 1 }}>{TYPE_ICON[type]}</Typography>
              <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', mb: 0.5 }}>
                {TYPE_NAME[type]}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.5 }}>
                {TYPE_DESC[type]}
              </Typography>
            </Box>
          ))}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">Abbrechen</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Insurance sidebar ─────────────────────────────────────────────────────────

function InsuranceSidebar({ params, onChange, color, isDark }) {
  const t = useTokens(isDark);
  const p = params;
  const yr = p.vbJahr    + '-' + String(p.vbMonat    || 1).padStart(2, '0');
  const rv = p.rentenJahr + '-' + String(p.rentenMonat || 1).padStart(2, '0');

  function onMonth(field, val) {
    const [y, m] = val.split('-');
    const updates = field === 'vb'
      ? { vbJahr: parseInt(y), vbMonat: parseInt(m) }
      : { rentenJahr: parseInt(y), rentenMonat: parseInt(m) };
    onChange({ ...p, ...updates });
  }

  const isSimple = p.costMode !== 'expert';

  return (
    <div>
      <SectionLabel isDark={isDark}>Sparphase</SectionLabel>
      <SliderCtrl label="Sparrate" value={p.sparrate} min={25} max={1000} step={5}
        onChange={v => onChange({ ...p, sparrate: v })} format={v => euro(v) + '/Monat'}
        color={color} isDark={isDark} />
      <SliderCtrl label="ETF-Rendite p.a." value={p.rendite} min={1} max={15} step={0.5}
        onChange={v => onChange({ ...p, rendite: v })} format={v => num(v, 1) + ' %'}
        color={color} isDark={isDark} />
      <SliderCtrl label="Inflation p.a." value={p.inflation} min={0} max={6} step={0.1}
        onChange={v => onChange({ ...p, inflation: v })} format={v => num(v, 1) + ' %'}
        color={color} isDark={isDark} />
      <MonthInput label="Versicherungsbeginn" value={yr} min="2020-01" max="2060-12"
        onChange={v => onMonth('vb', v)} isDark={isDark} />

      <SectionLabel isDark={isDark}>Rentenphase</SectionLabel>
      <MonthInput label="Rentenbeginn" value={rv} min="2030-01" max="2100-12"
        onChange={v => onMonth('rv', v)} isDark={isDark} />
      <SliderCtrl label="Rentenphase (Jahre)" value={p.leben} min={5} max={40} step={1}
        onChange={v => onChange({ ...p, leben: v })} format={v => v + ' Jahre'}
        color={color} isDark={isDark} />
      {/* Persönlicher Steuersatz im Alter — wird für Halbeinkünfteverfahren und
          Ertragsanteilbesteuerung im Steuer-Simulator verwendet. Hat KEINE
          Wirkung in der Ansparphase (§20 Nr. 6 / §22 EStG). */}
      <SliderCtrl label="Pers. Steuersatz im Alter" value={p.steuer} min={0} max={45} step={1}
        onChange={v => onChange({ ...p, steuer: v })} format={v => num(v, 0) + ' %'}
        color={color} isDark={isDark} />

      <SectionLabel isDark={isDark}>Beitragsdynamik</SectionLabel>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <input type="checkbox" id="dyn-toggle" checked={!!p.dynAktiv}
          onChange={e => onChange({ ...p, dynAktiv: e.target.checked })}
          style={{ accentColor: color, width: 14, height: 14 }} />
        <label htmlFor="dyn-toggle" style={{ color: t.sub, fontSize: '0.78rem', cursor: 'pointer' }}>
          Beitragsdynamik aktiv
        </label>
      </div>
      {p.dynAktiv && (
        <SliderCtrl label="Steigerung p.a." value={p.dynProzent || 0} min={0} max={10} step={0.5}
          onChange={v => onChange({ ...p, dynProzent: v })} format={v => num(v, 1) + ' %'}
          color={color} isDark={isDark} />
      )}

      <SectionLabel isDark={isDark}>Auszahlung</SectionLabel>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {[['annuity', 'Rente'], ['lump_sum', 'Einmalzahlung']].map(([val, label]) => (
          <button key={val} onClick={() => onChange({ ...p, payoutStrategy: val })} style={{
            flex: 1, padding: '5px 0', borderRadius: 7, fontSize: '0.72rem', fontWeight: 700,
            cursor: 'pointer',
            background: (p.payoutStrategy || 'annuity') === val ? color + '22' : 'transparent',
            border: `1px solid ${(p.payoutStrategy || 'annuity') === val ? color : t.bdr}`,
            color: (p.payoutStrategy || 'annuity') === val ? color : t.sub,
          }}>
            {label}
          </button>
        ))}
      </div>
      {(p.payoutStrategy || 'annuity') === 'annuity' && (
        <SliderCtrl label="Rentenfaktor (per 10.000 €)" value={p.rentenfaktor || 0} min={0} max={50} step={0.5}
          onChange={v => onChange({ ...p, rentenfaktor: v })} format={v => v > 0 ? num(v, 1) : 'nicht hinterlegt'}
          color={color} isDark={isDark} />
      )}

      <SectionLabel isDark={isDark}>Kostenmodell</SectionLabel>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {['simple','expert'].map(mode => (
          <button key={mode} onClick={() => onChange({ ...p, costMode: mode })} style={{
            flex: 1, padding: '5px 0', borderRadius: 7, fontSize: '0.72rem', fontWeight: 700,
            cursor: 'pointer',
            background: p.costMode === mode || (!p.costMode && mode === 'simple')
              ? color + '22' : 'transparent',
            border: `1px solid ${p.costMode === mode || (!p.costMode && mode === 'simple') ? color : t.bdr}`,
            color: p.costMode === mode || (!p.costMode && mode === 'simple') ? color : t.sub,
          }}>
            {mode === 'simple' ? 'Einfach' : 'Experte'}
          </button>
        ))}
      </div>

      {isSimple ? (
        <SliderCtrl label="Effektivkostenquote p.a." value={p.effektivkosten || 1.05}
          min={0} max={4} step={0.05}
          onChange={v => onChange({ ...p, effektivkosten: v })} format={v => num(v, 2) + ' %'}
          color={color} isDark={isDark} />
      ) : (
        <>
          <SliderCtrl label="α Abschlusskosten (% BBS)" value={p.alphaPct || 0} min={0} max={10} step={0.1}
            onChange={v => onChange({ ...p, alphaPct: v })} format={v => num(v, 1) + ' %'}
            color={color} isDark={isDark} />
          <SliderCtrl label="β Laufende Kosten" value={p.betaPct || 0} min={0} max={15} step={0.1}
            onChange={v => onChange({ ...p, betaPct: v })} format={v => num(v, 1) + ' %'}
            color={color} isDark={isDark} />
          <SliderCtrl label="γ Verwaltungskosten p.a." value={p.gammaPct || 0} min={0} max={2} step={0.05}
            onChange={v => onChange({ ...p, gammaPct: v })} format={v => num(v, 2) + ' %'}
            color={color} isDark={isDark} />
          <SliderCtrl label="κ Stückkosten (EUR/Jahr)" value={p.kappaEur || 0} min={0} max={200} step={1}
            onChange={v => onChange({ ...p, kappaEur: v })} format={v => euro(v)}
            color={color} isDark={isDark} />
          <SliderCtrl label="TER Fondskosten p.a." value={p.terPct || 0} min={0} max={2} step={0.05}
            onChange={v => onChange({ ...p, terPct: v })} format={v => num(v, 2) + ' %'}
            color={color} isDark={isDark} />
        </>
      )}
    </div>
  );
}

// ── AVD sidebar ───────────────────────────────────────────────────────────────

function AVDSidebar({ params, onChange, color, isDark }) {
  const p = params;
  const yr = p.vbJahr    + '-' + String(p.vbMonat    || 1).padStart(2, '0');
  const rv = p.rentenJahr + '-' + String(p.rentenMonat || 1).padStart(2, '0');

  function onMonth(field, val) {
    const [y, m] = val.split('-');
    const updates = field === 'vb'
      ? { vbJahr: parseInt(y), vbMonat: parseInt(m) }
      : { rentenJahr: parseInt(y), rentenMonat: parseInt(m) };
    onChange({ ...p, ...updates });
  }

  return (
    <div>
      <SectionLabel isDark={isDark}>Sparphase</SectionLabel>
      <SliderCtrl label="Monatl. Eigenbeitrag" value={p.sparrate} min={25} max={500} step={5}
        onChange={v => onChange({ ...p, sparrate: v })} format={v => euro(v) + '/Monat'}
        color={color} isDark={isDark} />
      <SliderCtrl label="ETF-Rendite p.a." value={p.rendite} min={1} max={12} step={0.5}
        onChange={v => onChange({ ...p, rendite: v })} format={v => num(v, 1) + ' %'}
        color={color} isDark={isDark} />
      <SliderCtrl label="Depotkosten (TER)" value={p.ter} min={0} max={2} step={0.1}
        onChange={v => onChange({ ...p, ter: v })} format={v => num(v, 1) + ' %'}
        color={color} isDark={isDark} />
      <SliderCtrl label="Inflation p.a." value={p.inflation} min={0} max={6} step={0.1}
        onChange={v => onChange({ ...p, inflation: v })} format={v => num(v, 1) + ' %'}
        color={color} isDark={isDark} />
      <MonthInput label="Sparbeginn" value={yr} min="2025-01" max="2060-12"
        onChange={v => onMonth('vb', v)} isDark={isDark} />

      <SectionLabel isDark={isDark}>Rentenphase</SectionLabel>
      <MonthInput label="Rentenbeginn" value={rv} min="2030-01" max="2100-12"
        onChange={v => onMonth('rv', v)} isDark={isDark} />
      <SliderCtrl label="Rentenalter" value={p.rentenAlter || 67} min={60} max={75} step={1}
        onChange={v => onChange({ ...p, rentenAlter: v })} format={v => v + ' Jahre'}
        color={color} isDark={isDark} />
      <SliderCtrl label="Kapitalverzehr bis Lebensjahr" value={p.leben || 90} min={75} max={100} step={1}
        onChange={v => onChange({ ...p, leben: v })} format={v => v + '. Lj.'}
        color={color} isDark={isDark} />

      <SectionLabel isDark={isDark}>Staatliche Förderung</SectionLabel>
      <SliderCtrl label="Anzahl Kinder" value={p.kinder || 0} min={0} max={5} step={1}
        onChange={v => onChange({ ...p, kinder: v })} format={v => v + ' Kinder'}
        color={color} isDark={isDark} />
      {(p.kinder > 0) && (
        <SliderCtrl label="Kinderzulage bis Alter" value={p.kinderBis || 18} min={18} max={25} step={1}
          onChange={v => onChange({ ...p, kinderBis: v })} format={v => v + ' Jahre'}
          color={color} isDark={isDark} />
      )}

      <SectionLabel isDark={isDark}>Nachgelagerte Besteuerung</SectionLabel>
      <SliderCtrl label="Pers. Steuersatz" value={p.steuerSatz || 20} min={0} max={42} step={1}
        onChange={v => onChange({ ...p, steuerSatz: v })} format={v => v + ' %'}
        color={color} isDark={isDark} />
    </div>
  );
}

// ── Depot sidebar ─────────────────────────────────────────────────────────────

function DepotSidebar({ params, onChange, color, isDark }) {
  const p = params;
  const yr = p.vbJahr    + '-' + String(p.vbMonat    || 1).padStart(2, '0');
  const rv = p.rentenJahr + '-' + String(p.rentenMonat || 1).padStart(2, '0');

  function onMonth(field, val) {
    const [y, m] = val.split('-');
    const updates = field === 'vb'
      ? { vbJahr: parseInt(y), vbMonat: parseInt(m) }
      : { rentenJahr: parseInt(y), rentenMonat: parseInt(m) };
    onChange({ ...p, ...updates });
  }

  return (
    <div>
      <SectionLabel isDark={isDark}>Sparphase</SectionLabel>
      <SliderCtrl label="Monatliche Sparrate" value={p.sparrate} min={25} max={2000} step={25}
        onChange={v => onChange({ ...p, sparrate: v })} format={v => euro(v) + '/Monat'}
        color={color} isDark={isDark} />
      <SliderCtrl label="ETF-Rendite p.a." value={p.rendite} min={1} max={15} step={0.5}
        onChange={v => onChange({ ...p, rendite: v })} format={v => num(v, 1) + ' %'}
        color={color} isDark={isDark} />
      <SliderCtrl label="Fondskosten TER p.a." value={p.ter || 0.2} min={0} max={2} step={0.05}
        onChange={v => onChange({ ...p, ter: v })} format={v => num(v, 2) + ' %'}
        color={color} isDark={isDark} />
      <SliderCtrl label="Depotgebühr (EUR/Jahr)" value={p.depotgebuehr || 0} min={0} max={200} step={1}
        onChange={v => onChange({ ...p, depotgebuehr: v })} format={v => euro(v) + '/Jahr'}
        color={color} isDark={isDark} />
      <SliderCtrl label="Inflation p.a." value={p.inflation} min={0} max={6} step={0.1}
        onChange={v => onChange({ ...p, inflation: v })} format={v => num(v, 1) + ' %'}
        color={color} isDark={isDark} />
      <MonthInput label="Sparbeginn" value={yr} min="2020-01" max="2060-12"
        onChange={v => onMonth('vb', v)} isDark={isDark} />

      <SectionLabel isDark={isDark}>Rentenphase</SectionLabel>
      <MonthInput label="Rentenbeginn" value={rv} min="2030-01" max="2100-12"
        onChange={v => onMonth('rv', v)} isDark={isDark} />
      <SliderCtrl label="Entnahmedauer (Jahre)" value={p.leben || 22} min={5} max={40} step={1}
        onChange={v => onChange({ ...p, leben: v })} format={v => v + ' Jahre'}
        color={color} isDark={isDark} />

      <SectionLabel isDark={isDark}>Steuer</SectionLabel>
      <SliderCtrl label="Abgeltungssteuer" value={p.steuer || 26.375} min={20} max={30} step={0.125}
        onChange={v => onChange({ ...p, steuer: v })} format={v => num(v, 3) + ' %'}
        color={color} isDark={isDark} />
    </div>
  );
}

// ── DRV sidebar ───────────────────────────────────────────────────────────────

function DRVSidebar({ params, onChange, color, isDark }) {
  const t = useTokens(isDark);
  const p = params;
  const rvVal = (p.rentenJahr || 2045) + '-' + String(p.rentenMonat || 1).padStart(2, '0');

  function onMonth(val) {
    const [y, m] = val.split('-');
    onChange({ ...p, rentenJahr: parseInt(y), rentenMonat: parseInt(m) });
  }

  function loadFromPkv() {
    const proj = readPkvProjection();
    if (!proj) return;
    onChange({ ...p, pkvNettobeitrag: proj.nettoMonatlich });
  }

  // Helper: MUI CurrencyField für Rentenbescheid-Zahlen (EUR oder dezimal ohne Suffix).
  function NumField({ label, field, helper, decimals = 2, adornment = '€' }) {
    return (
      <Box sx={{ mb: 1.75 }}>
        <CurrencyField
          label={label}
          value={p[field] ?? ''}
          onChange={(v) => onChange({ ...p, [field]: v === '' ? '' : v })}
          adornment={adornment}
          decimals={decimals}
          fullWidth
          helperText={helper}
          inputProps={{ step: decimals > 0 ? Math.pow(10, -decimals) : 1, min: 0 }}
        />
      </Box>
    );
  }

  return (
    <Box>
      <SectionLabel isDark={isDark}>Aus Rentenbescheid (DRV)</SectionLabel>
      <NumField label="Bisher erreichte Anwartschaft / Monat" field="anwartschaft" helper="z.B. 555,70 €" />
      <NumField label="Hochgerechnete Rente / Monat" field="hochgerechnete" helper="z.B. 2.564,84 €" />
      <NumField label="Aktuelle Entgeltpunkte" field="entgeltpunkte" helper="z.B. 13,6234" decimals={4} adornment="EP" />

      <SectionLabel isDark={isDark}>Rentenbeginn & Anpassung</SectionLabel>
      <MonthInput label="Rentenbeginn" value={rvVal} min="2025-01" max="2080-12"
        onChange={onMonth} isDark={isDark} />
      <SliderCtrl label="Jährl. Rentenanpassung" value={p.rentenAnpassung || 2} min={0} max={3} step={0.1}
        onChange={v => onChange({ ...p, rentenAnpassung: v })} format={v => num(v, 1) + ' %'}
        color={color} isDark={isDark} />
      <SliderCtrl label="Inflation (Kaufkraft-Vergleich)" value={p.inflation || 2} min={0} max={5} step={0.1}
        onChange={v => onChange({ ...p, inflation: v })} format={v => num(v, 1) + ' %'}
        color={color} isDark={isDark} />

      <SectionLabel isDark={isDark}>Abzüge im Alter</SectionLabel>
      <SliderCtrl label="Einkommensteuer im Alter" value={p.steuerSatz || 20} min={0} max={42} step={1}
        onChange={v => onChange({ ...p, steuerSatz: v })} format={v => v + ' %'}
        color={color} isDark={isDark} />
      <Box sx={{ mb: 1.75 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
            PKV-Nettobeitrag im Alter
          </Typography>
          <Button
            size="small"
            variant="outlined"
            color="success"
            onClick={loadFromPkv}
            sx={{ minWidth: 0, fontSize: '0.62rem', py: 0 }}
          >
            📥 PKV-Rechner
          </Button>
        </Stack>
        <CurrencyField
          value={p.pkvNettobeitrag ?? ''}
          onChange={(v) => onChange({ ...p, pkvNettobeitrag: v === '' ? '' : v })}
          fullWidth
          placeholder="0"
          helperText="Bereits nach Rentenzuschuss (kein Doppelabzug)"
          inputProps={{ step: 1, min: 0 }}
        />
      </Box>
    </Box>
  );
}

// ── bAV sidebar ───────────────────────────────────────────────────────────────

function BAVSidebar({ params, onChange, color, isDark, isPassive, onPassiveChange }) {
  const t = useTokens(isDark);
  const p = params;
  const vbVal = p.vbJahr + '-' + String(p.vbMonat || 1).padStart(2, '0');
  const rvVal = p.rentenJahr + '-' + String(p.rentenMonat || 1).padStart(2, '0');

  function onMonth(field, val) {
    const [y, m] = val.split('-');
    const updates = field === 'vb'
      ? { vbJahr: parseInt(y), vbMonat: parseInt(m) }
      : { rentenJahr: parseInt(y), rentenMonat: parseInt(m) };
    onChange({ ...p, ...updates });
  }

  return (
    <div>
      {/* ── Beitragsfrei-Stellung ─────────────────────────────────────────── */}
      <Paper variant="outlined" sx={{ borderRadius: 1, p: 1.5, mb: 1.5 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              Vertrag beitragsfrei gestellt
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Pausiert künftige Einzahlungen, Kapital läuft weiter.
            </Typography>
          </Box>
          <Switch
            checked={!!isPassive}
            onChange={(e) => onPassiveChange?.(e.target.checked)}
            inputProps={{ 'aria-label': 'Vertrag beitragsfrei gestellt' }}
          />
        </Stack>
        {isPassive && (
          <Alert severity="info" variant="outlined" sx={{ mt: 1.5 }}>
            Hinweis: In der Projektion werden keine weiteren Einzahlungen berücksichtigt,
            das Kapital verzinst sich jedoch weiter.
          </Alert>
        )}
      </Paper>

      <SectionLabel isDark={isDark}>Beiträge</SectionLabel>
      <Box sx={{
        opacity: isPassive ? 0.45 : 1,
        pointerEvents: isPassive ? 'none' : 'auto',
        transition: 'opacity 120ms ease',
      }} aria-disabled={isPassive}>
        <SliderCtrl label="Brutto-Umwandlungsbetrag" value={p.sparrate} min={50} max={500} step={10}
          onChange={v => onChange({ ...p, sparrate: v })} format={v => euro(v) + '/Monat'}
          color={color} isDark={isDark} />
        <SliderCtrl label="AG-Zuschuss" value={p.agZuschuss || 0} min={0} max={150} step={5}
          onChange={v => onChange({ ...p, agZuschuss: v })} format={v => euro(v) + '/Monat'}
          color={color} isDark={isDark} />
      </Box>

      <SectionLabel isDark={isDark}>Rendite & Kosten</SectionLabel>
      <SliderCtrl label="Fondsentwicklung p.a." value={p.rendite} min={1} max={12} step={0.5}
        onChange={v => onChange({ ...p, rendite: v })} format={v => num(v, 1) + ' %'}
        color={color} isDark={isDark} />
      <SliderCtrl label="Effektivkosten p.a." value={p.effektivkosten || 1.2} min={0} max={3} step={0.1}
        onChange={v => onChange({ ...p, effektivkosten: v })} format={v => num(v, 1) + ' %'}
        color={color} isDark={isDark} />
      <SliderCtrl label="Inflation p.a." value={p.inflation} min={0} max={6} step={0.1}
        onChange={v => onChange({ ...p, inflation: v })} format={v => num(v, 1) + ' %'}
        color={color} isDark={isDark} />

      <SectionLabel isDark={isDark}>Zeitraum</SectionLabel>
      <MonthInput label="Vertragsbeginn" value={vbVal} min="2000-01" max="2060-12"
        onChange={v => onMonth('vb', v)} isDark={isDark} />
      <MonthInput label="Rentenbeginn" value={rvVal} min="2030-01" max="2100-12"
        onChange={v => onMonth('rv', v)} isDark={isDark} />

      <SectionLabel isDark={isDark}>Aktueller Stand</SectionLabel>
      <div style={{ marginBottom: 14 }}>
        <div style={{ color: t.sub, fontSize: '0.7rem', marginBottom: 4 }}>
          Deckungskapital / Garantiewert (€)
        </div>
        <input
          type="number"
          value={p.deckungskapital || ''}
          placeholder="0"
          onChange={e => onChange({ ...p, deckungskapital: e.target.value })}
          style={{
            width: '100%', background: t.cardAlt, border: `1px solid ${t.bdr}`,
            borderRadius: 6, padding: '5px 8px', color: t.text,
            fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box',
          }}
        />
        <div style={{ color: t.sub, fontSize: '0.65rem', marginTop: 3 }}>
          Aus Ihrem letzten Jahresausweis
        </div>
      </div>
      <SectionLabel isDark={isDark}>Auszahlung</SectionLabel>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {[['annuity', 'Rente'], ['lump_sum', 'Einmalzahlung']].map(([val, label]) => (
          <button key={val} onClick={() => onChange({ ...p, payoutStrategy: val })} style={{
            flex: 1, padding: '5px 0', borderRadius: 7, fontSize: '0.72rem', fontWeight: 700,
            cursor: 'pointer',
            background: (p.payoutStrategy || 'annuity') === val ? color + '22' : 'transparent',
            border: `1px solid ${(p.payoutStrategy || 'annuity') === val ? color : t.bdr}`,
            color: (p.payoutStrategy || 'annuity') === val ? color : t.sub,
          }}>
            {label}
          </button>
        ))}
      </div>
      {(p.payoutStrategy || 'annuity') === 'annuity' && (
        <SliderCtrl label="Rentenfaktor (per 10.000 €)" value={p.rentenfaktor || 28} min={10} max={60} step={0.5}
          onChange={v => onChange({ ...p, rentenfaktor: v })} format={v => num(v, 1)}
          color={color} isDark={isDark} />
      )}

      <SectionLabel isDark={isDark}>Besteuerung</SectionLabel>
      <SliderCtrl label="Steuer+SV-Ersparnis jetzt" value={p.grenzsteuersatz || 42} min={20} max={60} step={1}
        onChange={v => onChange({ ...p, grenzsteuersatz: v })} format={v => v + ' %'}
        color={color} isDark={isDark} />
      <SliderCtrl label="Steuersatz im Alter" value={p.steuerImAlter || 27} min={10} max={42} step={1}
        onChange={v => onChange({ ...p, steuerImAlter: v })} format={v => v + ' %'}
        color={color} isDark={isDark} />
    </div>
  );
}

// ── Detail table ──────────────────────────────────────────────────────────────

const COL_MAP = { g: CHART.positive, r: CHART.negative, y: CHART.warning };

function buildInsuranceRows(r, params) {
  const dynInfo = r.dynAktiv ? ('aktiv +' + num(r.dynProzent, 1) + '%/Jahr') : 'deaktiviert';
  const costRows = r.costMode === 'simple'
    ? [
        ['__head', 'Kosten (Einfach-Modus)'],
        ['Effektivkostenquote', num(r.effektivkosten, 2) + '% p.a.', 'r'],
        ['Effektivkosten RiY',  '≈ ' + num(r.riyPct, 2) + '% p.a.', 'r'],
      ]
    : [
        ['__head', 'Kostenstruktur (Experten-Modus)'],
        ['α Abschlusskosten', euro(r.totAlpha), 'r'],
        ['β Laufende Kosten', euro(r.totBeta), 'r'],
        ['γ Verwaltungskosten', euro(r.totGamma), 'r'],
        ['κ Stückkosten', euro(r.totKappa), 'r'],
        ['TER (' + num(r.terPct, 2) + '% p.a.)', 'Renditekürzung', 'r'],
        ['Gesamtkosten', euro(r.gesamtkosten), 'r'],
        ['Effektivkosten (RiY)', '≈ ' + num(r.riyPct, 2) + '% p.a.', 'r'],
      ];
  return [
    ['__head', 'Sparphase'],
    ['Versicherungsbeginn', r.vbString, ''],
    ['Rentenbeginn', r.rentenString, ''],
    ['Sparjahre', r.sparjahre + ' Jahre', ''],
    ['Sparrate (Start)', euro(r.sparrate), ''],
    r.dynAktiv ? ['Sparrate (Ende)', euro(r.sparrateEnd), 'g'] : null,
    ['Beitragsdynamik', dynInfo, r.dynAktiv ? 'g' : ''],
    ['Einzahlungen ges.', euro(r.totalEingezahlt), 'r'],
    ...costRows,
    ['__head', 'Ergebnis'],
    ['Kapital bei Rentenbeginn', euro(r.kapBeiRente), 'g'],
    ['Kaufkraft real (heute)', euro(r.kapBeiRenteReal), 'y'],
    ['Netto-Gewinn', euro(r.gewinn), r.gewinn >= 0 ? 'g' : 'r'],
    ['Rendite-Faktor', num(r.faktor) + 'x', r.faktor >= 1 ? 'g' : 'r'],
    ['Mögl. Monatsrente', euro(r.possibleRente), 'g'],
    ['Kapitalrest am Ende', euro(Math.max(0, r.kapFinal)), r.kapFinal > 100 ? 'g' : 'r'],
  ].filter(Boolean);
}

function buildAVDRows(r, params) {
  return [
    ['__head', 'Sparphase'],
    ['Sparbeginn', r.vbString, ''],
    ['Rentenbeginn', r.rentenString, ''],
    ['Sparjahre', r.sparjahre + ' Jahre', ''],
    ['Monatl. Eigenbeitrag', euro(r.sparrate), ''],
    ['Grundzulage p.a.', euro(r.grundzulageJahr), 'g'],
    r.kinderzulageJahr > 0 ? ['Kinderzulage p.a.', euro(r.kinderzulageJahr), 'g'] : null,
    ['Staatl. Förderung ges.', euro(r.totalStaatlich), 'g'],
    r.phaseWechsel ? ['davon Phase 1 (2027–28)', euro(r.totalPhase1), ''] : null,
    r.phaseWechsel ? ['davon Phase 2 (ab 2029)', euro(r.totalPhase2), 'g'] : null,
    ['Eigene Einzahlungen', euro(r.totalEigenzahlt), 'r'],
    ['__head', 'Ergebnis'],
    ['Kapital bei Rentenbeginn', euro(r.kapBeiRente), 'g'],
    ['Kaufkraft real (heute)', euro(r.kapBeiRenteReal), 'y'],
    ['Netto-Gewinn', euro(r.gewinn), r.gewinn >= 0 ? 'g' : 'r'],
    ['Rendite-Faktor', num(r.faktor) + 'x', r.faktor >= 1 ? 'g' : 'r'],
    ['__head', 'Rentenphase (nachgelagert besteuert)'],
    ['Mögl. Bruttorente', euro(r.possibleRenteBrutto), 'g'],
    ['Steuer (' + r.steuerSatz + '%)', '-' + euro(r.possibleRenteBrutto * r.steuerSatz / 100), 'r'],
    ['Mögl. Nettorente', euro(r.possibleRente), 'g'],
    ['Kapitalrest am Ende', euro(Math.max(0, r.kapFinal)), r.kapFinal > 100 ? 'g' : 'r'],
  ].filter(Boolean);
}

function buildDepotRows(r, params) {
  return [
    ['__head', 'Sparphase'],
    ['Sparbeginn', r.vbString, ''],
    ['Rentenbeginn', r.rentenString, ''],
    ['Sparjahre', r.sparjahre + ' Jahre', ''],
    ['Monatliche Sparrate', euro(r.sparrate), ''],
    ['TER', num(r.ter, 2) + '% p.a.', 'r'],
    r.depotgebuehr > 0 ? ['Depotgebühr', euro(r.depotgebuehr) + '/Jahr', 'r'] : null,
    ['Einzahlungen ges.', euro(r.totalEingezahlt), 'r'],
    ['__head', 'Ergebnis vor Steuer'],
    ['Kapital brutto', euro(r.kapBeiRente), 'g'],
    ['Kaufkraft real', euro(r.kapBeiRenteReal), 'y'],
    ['Gewinn (brutto)', euro(r.gewinnBrutto), 'g'],
    ['__head', 'Steuer (Abgeltungssteuer + 30% Teilfreistellung)'],
    ['Steuerpflichtig (70%)', euro(r.steuerpflicht), 'r'],
    ['Steuerlast (' + num(r.steuerSatz, 3) + '%)', euro(r.steuerlast), 'r'],
    ['Kapital netto', euro(r.kapNetto), 'g'],
    ['Netto-Gewinn', euro(r.gewinn), r.gewinn >= 0 ? 'g' : 'r'],
    ['Rendite-Faktor', num(r.faktor) + 'x', r.faktor >= 1 ? 'g' : 'r'],
    ['Mögl. Monatsrente', euro(r.possibleRente), 'g'],
    ['Kapitalrest am Ende', euro(Math.max(0, r.kapFinal)), r.kapFinal > 100 ? 'g' : 'r'],
  ].filter(Boolean);
}

function buildDRVRows(r) {
  return [
    ['__head', 'Rentenbescheid (DRV)'],
    ['Bereits erarbeitet', euro(r.anwartschaft) + '/Monat', 'g'],
    ['Entgeltpunkte aktuell', num(r.entgeltpunkte, 4) + ' EP', ''],
    ['Hochgerechnete Rente', euro(r.hochgerechnete) + '/Monat', ''],
    ['__head', 'Prognose bis Rentenbeginn ' + r.rentenJahr],
    ['Jährl. Rentenanpassung', num(r.rentenAnpassung, 1) + ' %', ''],
    ['Jahre bis Rentenbeginn', r.yearsToRente + ' Jahre', ''],
    ['Bruttorente (angepasst)', euro(r.bruttoRente) + '/Monat', 'g'],
    ['__head', 'Netto-Kalkulation'],
    ['Einkommensteuer (' + r.steuerSatz + '%)', '-' + euro(r.steuerBetrag) + '/Monat', 'r'],
    ['PKV-Nettobeitrag', r.pkvNettobeitrag > 0 ? '-' + euro(r.pkvNettobeitrag) + '/Monat' : '–', r.pkvNettobeitrag > 0 ? 'r' : ''],
    ['Netto-Echt-Rente', euro(r.nettoRente) + '/Monat', 'g'],
    ['__head', 'Kaufkraft-Vergleich'],
    ['Inflation p.a.', num(r.rentenAnpassung >= (r.inflation || 2) ? 0 : 2, 1) + ' %', ''],
    [
      r.rentenAnpassung >= (r.inflation || 2) ? 'Kaufkraft steigt' : 'Kaufkraft sinkt',
      r.rentenAnpassung >= (r.inflation || 2)
        ? 'Anpassung > Inflation ✓'
        : 'Anpassung < Inflation ⚠',
      r.rentenAnpassung >= (r.inflation || 2) ? 'g' : 'r',
    ],
  ].filter(Boolean);
}

function buildBAVRows(r) {
  return [
    ['__head', 'Beitragsstruktur'],
    ['Brutto-Umwandlung', euro(r.sparrate) + '/Monat', ''],
    ['AG-Zuschuss', euro(r.agZuschussEur) + '/Monat', 'g'],
    ['Gesamtbeitrag', euro(r.totalMonthly) + '/Monat', 'g'],
    ['Netto-Verzicht (tatsächlich)', euro(r.nettoVerzicht) + '/Monat', 'y'],
    ['Steuervorteil/Monat', euro(r.sparrate - r.nettoVerzicht) + '/Monat', 'g'],
    ['__head', 'Laufzeit'],
    ['Vertragsbeginn', r.vbString, ''],
    ['Rentenbeginn', r.rentenString, ''],
    ['Sparjahre gesamt', r.sparjahre + ' Jahre', ''],
    r.deckungskapital > 0 ? ['Deckungskapital (aktuell)', euro(r.deckungskapital), 'g'] : null,
    ['Brutto-Einzahlungen ges.', euro(r.bruttoEinsatzGesamt), 'r'],
    ['AG-Zuschuss ges.', euro(r.agZuschussGesamt), 'g'],
    ['Netto-Verzicht ges.', euro(r.nettoVerzichtGesamt), 'y'],
    ['Steuervorteil ges.', euro(r.steuervorteilGesamt), 'g'],
    ['__head', 'Ergebnis'],
    ['Kapital bei Rente', euro(r.kapBeiRente), 'g'],
    ['Kaufkraft real (heute)', euro(r.kapBeiRenteReal), 'y'],
    ['Netto-Gewinn', euro(r.gewinn), r.gewinn >= 0 ? 'g' : 'r'],
    ['Rendite-Faktor', num(r.faktor) + 'x', r.faktor >= 1 ? 'g' : 'r'],
    ['__head', 'Auszahlungsphase'],
    ['Auszahlungsart', r.payoutStrategy === 'lump_sum' ? 'Einmalzahlung' : 'Lebenslange Rente', ''],
    ...(r.payoutStrategy === 'lump_sum' ? [
      ['Einmalzahlung (brutto)', euro(r.lumpSum), 'g'],
    ] : [
      ['Rentenfaktor', num(r.rentenfaktor, 1) + ' per 10.000 €', ''],
      ['Brutto-Betriebsrente', euro(r.bruttorente) + '/Monat', 'g'],
      ['Steuer im Alter (' + r.steuerImAlter + '%)',
        '-' + euro(r.bruttorente * r.steuerImAlter / 100) + '/Monat', 'r'],
      ['Netto-Betriebsrente', euro(r.nettorente) + '/Monat', 'g'],
      r.breakEvenAlter != null ? ['Break-Even', 'ab ~' + r.breakEvenAlter + ' Monaten Rentenbezug', 'g'] : null,
    ]),
    r.depotComparison
      ? ['Vergleich: ETF-Depot netto', euro(r.depotComparison.kapNetto), 'y']
      : null,
  ].filter(Boolean);
}

function DetailTable({ pol, isDark }) {
  const t = useTokens(isDark);
  const r = pol.result;
  if (!r) return null;
  const rows = pol.type === 'drv'   ? buildDRVRows(r)
             : pol.type === 'avd'   ? buildAVDRows(r, pol.params)
             : pol.type === 'depot' ? buildDepotRows(r, pol.params)
             : pol.type === 'bav'   ? buildBAVRows(r)
             : buildInsuranceRows(r, pol.params);
  return (
    <Table size="small" sx={{ borderCollapse: 'collapse', fontSize: '0.78rem' }}>
      <TableBody>
        {rows.map((row, i) => {
          if (row[0] === '__head') return (
            <tr key={i}>
              <td colSpan={2} style={{
                color: t.sub, fontSize: '0.65rem', fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.08em',
                padding: '12px 0 4px', borderBottom: `1px solid ${t.bdr}`,
              }}>
                {row[1]}
              </td>
            </tr>
          );
          return (
            <tr key={i} style={{ borderBottom: `1px solid ${t.bdr}22` }}>
              <td style={{ color: t.sub, padding: '5px 0' }}>{row[0]}</td>
              <td style={{
                color: COL_MAP[row[2]] || t.text,
                textAlign: 'right', padding: '5px 0', fontWeight: row[2] ? 600 : 400,
                fontFamily: 'monospace',
              }}>
                {row[1]}
              </td>
            </tr>
          );
        })}
      </TableBody>
    </Table>
  );
}

// ── Snapshot panel ────────────────────────────────────────────────────────────

const EMPTY_FUND = { name: '', isin: '', share_pct: 100, unit_price: '', units: '', value: '' };

const EMPTY_FORM = {
  snapshot_date: new Date().toISOString().split('T')[0],
  // Vertragswerte
  contract_value: '',
  fund_balance: '',
  valuation_reserves: '',
  guaranteed_value: '',
  // Beiträge
  total_contributions_paid: '',
  // Kosten (einzeln)
  cost_acquisition: '',
  cost_administration: '',
  cost_fund: '',
  cost_other: '',
  note: '',
};

function SnapshotPanel({ policyId, snapshots, onAdd, onUpdate, onDelete, isDark }) {
  const theme = useTheme();
  const [showForm, setShowForm]       = useState(false);
  const [editId, setEditId]           = useState(null);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [funds, setFunds]             = useState([{ ...EMPTY_FUND }]);
  const [deleteId, setDeleteId]       = useState(null);

  function resetForm() {
    setForm({ ...EMPTY_FORM, snapshot_date: new Date().toISOString().split('T')[0] });
    setFunds([{ ...EMPTY_FUND }]);
    setEditId(null);
    setShowForm(false);
  }

  function loadFromSnapshot(s, asNew = false) {
    setEditId(asNew ? null : s.id);
    let snapshotDate = s.snapshot_date;
    if (asNew) {
      const next = new Date(s.snapshot_date);
      next.setFullYear(next.getFullYear() + 1);
      snapshotDate = next.toISOString().split('T')[0];
    }
    setForm({
      snapshot_date:            snapshotDate,
      contract_value:           s.contract_value           ?? '',
      fund_balance:             s.fund_balance             ?? '',
      valuation_reserves:       s.valuation_reserves       ?? '',
      guaranteed_value:         s.guaranteed_value         ?? '',
      total_contributions_paid: s.total_contributions_paid ?? '',
      cost_acquisition:         s.cost_acquisition         ?? '',
      cost_administration:      s.cost_administration      ?? '',
      cost_fund:                s.cost_fund                ?? '',
      cost_other:               s.cost_other               ?? '',
      note:                     s.note                     ?? '',
    });
    setFunds(
      Array.isArray(s.fund_allocation) && s.fund_allocation.length > 0
        ? s.fund_allocation.map(f => ({
            name:       f.name       ?? '',
            isin:       f.isin       ?? '',
            share_pct:  f.share_pct  ?? 100,
            unit_price: f.unit_price ?? '',
            units:      f.units      ?? '',
            value:      f.value      ?? '',
          }))
        : [{ ...EMPTY_FUND }]
    );
    setShowForm(true);
  }

  function startEdit(s) { loadFromSnapshot(s, false); }
  function startCopy(s) { loadFromSnapshot(s, true); }

  function updateFund(idx, key, val) {
    setFunds(prev => prev.map((f, i) => i === idx ? { ...f, [key]: val } : f));
  }
  function addFundRow() {
    setFunds(prev => [...prev, { ...EMPTY_FUND, share_pct: 0 }]);
  }
  function removeFundRow(idx) {
    setFunds(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);
  }

  // Auto-derive value from units × unit_price when both filled
  function fundValue(f) {
    if (f.value !== '' && f.value != null) return Number(f.value) || 0;
    const u = Number(f.units) || 0;
    const p = Number(f.unit_price) || 0;
    return u * p;
  }

  // Sum of all fund values
  const fundsTotal = funds.reduce((s, f) => s + fundValue(f), 0);

  // Sum of all single costs
  const totalCosts = (
    (Number(form.cost_acquisition)    || 0) +
    (Number(form.cost_administration) || 0) +
    (Number(form.cost_fund)           || 0) +
    (Number(form.cost_other)          || 0)
  );

  async function handleSave() {
    const fundAlloc = funds
      .filter(f => f.name || f.isin || fundValue(f) > 0)
      .map(f => ({
        name:       f.name || '',
        isin:       f.isin || '',
        share_pct:  Number(f.share_pct)  || 0,
        unit_price: Number(f.unit_price) || 0,
        units:      Number(f.units)      || 0,
        value:      Math.round(fundValue(f) * 100) / 100,
      }));

    const payload = {
      policy_id:                policyId,
      snapshot_date:            form.snapshot_date,
      contract_value:           Number(form.contract_value) || 0,
      fund_balance:             form.fund_balance       !== '' ? Number(form.fund_balance)       : null,
      valuation_reserves:       form.valuation_reserves !== '' ? Number(form.valuation_reserves) : null,
      guaranteed_value:         form.guaranteed_value   !== '' ? Number(form.guaranteed_value)   : null,
      total_contributions_paid: form.total_contributions_paid !== '' ? Number(form.total_contributions_paid) : null,
      cost_acquisition:         form.cost_acquisition    !== '' ? Number(form.cost_acquisition)    : null,
      cost_administration:      form.cost_administration !== '' ? Number(form.cost_administration) : null,
      cost_fund:                form.cost_fund           !== '' ? Number(form.cost_fund)           : null,
      cost_other:               form.cost_other          !== '' ? Number(form.cost_other)          : null,
      total_costs_paid:         totalCosts > 0 ? totalCosts : null,
      fund_allocation:          fundAlloc,
      note:                     form.note,
    };

    try {
      if (editId) await onUpdate(editId, payload);
      else        await onAdd(payload);
      resetForm();
    } catch (e) {
      alert('Fehler: ' + e.message);
    }
  }

  // Sort ascending for chart, descending for table
  const sortedAsc  = [...snapshots].sort((a, b) => new Date(a.snapshot_date) - new Date(b.snapshot_date));
  const sortedDesc = [...sortedAsc].reverse();

  // Chart data: cumulative contributions vs contract value
  const chartData = sortedAsc.map(s => ({
    date:    s.snapshot_date.substring(0, 7),
    Beiträge: Number(s.total_contributions_paid) || 0,
    Vertragswert: Number(s.contract_value) || 0,
  }));

  const formValid = !!form.snapshot_date && form.contract_value !== '' && form.contract_value != null;

  // Map contract values to deltas + percentage growth for the table rows
  const tableRows = sortedDesc.map((s, idx) => {
    const prev = sortedDesc[idx + 1];
    const delta = prev ? Number(s.contract_value) - Number(prev.contract_value) : null;
    const pct = prev && Number(prev.contract_value) > 0
      ? ((Number(s.contract_value) - Number(prev.contract_value)) / Number(prev.contract_value)) * 100
      : null;
    return { ...s, _delta: delta, _pct: pct, _isLatest: idx === 0 };
  });

  const snapshotColumns = [
    {
      key: 'snapshot_date',
      label: 'Stichtag',
      render: (s) => (
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
            {new Date(s.snapshot_date).toLocaleDateString('de-DE')}
          </Typography>
          {s._isLatest && <Chip label="AKTUELL" size="small" color="primary" sx={{ height: 18, fontSize: '0.6rem' }} />}
        </Stack>
      ),
    },
    {
      key: 'contract_value',
      label: 'Vertragswert',
      align: 'right',
      render: (s) => (
        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
          {euro(s.contract_value)}
        </Typography>
      ),
    },
    {
      key: 'total_contributions_paid',
      label: 'Beiträge',
      align: 'right',
      render: (s) => (
        <Typography variant="body2" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
          {s.total_contributions_paid ? euro(s.total_contributions_paid) : '–'}
        </Typography>
      ),
    },
    {
      key: 'total_costs_paid',
      label: 'Kosten',
      align: 'right',
      render: (s) => (
        <Typography variant="body2" sx={{ fontFamily: 'monospace', color: 'error.main' }}>
          {s.total_costs_paid ? euro(s.total_costs_paid) : '–'}
        </Typography>
      ),
    },
    {
      key: '_delta',
      label: 'Δ Vorjahr',
      align: 'right',
      render: (s) => (
        <Typography variant="body2" sx={{
          fontFamily: 'monospace', fontWeight: 600,
          color: s._delta == null ? 'text.secondary' : s._delta >= 0 ? 'success.main' : 'error.main',
        }}>
          {s._delta == null ? '–' : (s._delta >= 0 ? '+' : '') + euro(s._delta)}
        </Typography>
      ),
    },
    {
      key: '_pct',
      label: 'Wachstum %',
      align: 'right',
      render: (s) => (
        <Typography variant="body2" sx={{
          fontFamily: 'monospace',
          color: s._pct == null ? 'text.secondary' : s._pct >= 0 ? 'success.main' : 'error.main',
        }}>
          {s._pct == null ? '–' : (s._pct >= 0 ? '+' : '') + num(s._pct, 2) + ' %'}
        </Typography>
      ),
    },
    {
      key: '_actions',
      label: '',
      align: 'right',
      render: (s) => (
        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
          <IconButton size="small" color="primary"
            title="Als Vorlage für neuen Snapshot verwenden (Stichtag +1 Jahr)"
            onClick={() => startCopy(s)}>
            <ContentCopyIcon fontSize="inherit" />
          </IconButton>
          <IconButton size="small" onClick={() => startEdit(s)} title="Bearbeiten">
            <EditOutlinedIcon fontSize="inherit" />
          </IconButton>
          <IconButton size="small" color="error" onClick={() => setDeleteId(s.id)} title="Löschen">
            <DeleteOutlineIcon fontSize="inherit" />
          </IconButton>
        </Stack>
      ),
    },
  ];

  async function confirmDelete() {
    const id = deleteId;
    setDeleteId(null);
    try { await onDelete(id); }
    catch (e) { alert('Fehler: ' + e.message); }
  }

  return (
    <Stack spacing={2}>
      {/* Header */}
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={1.5}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Historie & Snapshots</Typography>
          <Typography variant="caption" color="text.secondary">
            {snapshots.length} Jahresmeldung{snapshots.length === 1 ? '' : 'en'} erfasst — der neueste Stand wird als Startpunkt für die Prognose verwendet.
          </Typography>
        </Box>
        {!showForm && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setShowForm(true)}>
            Jahresmeldung erfassen
          </Button>
        )}
      </Stack>

      {/* Form */}
      {showForm && (
        <SectionCard
          title={editId ? 'Snapshot bearbeiten' : 'Neue Standmitteilung erfassen'}
        >
          {/* Section 1: Vertragswerte */}
          <Typography variant="overline" sx={{ display: 'block', color: 'text.secondary', fontWeight: 700, mb: 1 }}>
            1. Vertragswerte (Stichtag)
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 1.5, mb: 2.5 }}>
            <DateField
              label="Stichtag *"
              value={form.snapshot_date}
              onChange={(v) => setForm(p => ({ ...p, snapshot_date: v }))}
            />
            <CurrencyField
              label="Vertragswert *"
              value={form.contract_value}
              onChange={(v) => setForm(p => ({ ...p, contract_value: v }))}
              fullWidth
              required
            />
            <CurrencyField
              label="davon Fondsguthaben"
              value={form.fund_balance}
              onChange={(v) => setForm(p => ({ ...p, fund_balance: v }))}
              fullWidth
            />
            <CurrencyField
              label="Bewertungsreserve"
              value={form.valuation_reserves}
              onChange={(v) => setForm(p => ({ ...p, valuation_reserves: v }))}
              fullWidth
            />
            <CurrencyField
              label="davon garantiert"
              value={form.guaranteed_value}
              onChange={(v) => setForm(p => ({ ...p, guaranteed_value: v }))}
              fullWidth
            />
            <CurrencyField
              label="Beiträge gezahlt ges."
              value={form.total_contributions_paid}
              onChange={(v) => setForm(p => ({ ...p, total_contributions_paid: v }))}
              fullWidth
            />
          </Box>

          {/* Section 2: Fondsverteilung */}
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700 }}>
              2. Fondsverteilung
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Summe: <strong style={{ color: theme.palette.text.primary, fontFamily: 'monospace' }}>{euro(fundsTotal)}</strong>
            </Typography>
          </Stack>
          <Stack spacing={1} sx={{ mb: 1.5 }}>
            {funds.map((f, idx) => (
              <Box key={idx} sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '2fr 1.4fr 0.8fr 1fr 0.9fr 1.1fr 40px' },
                gap: 1, alignItems: 'center',
              }}>
                <TextField size="small" fullWidth placeholder="z.B. iShares MSCI World SRI"
                  label={idx === 0 ? 'Fondsname' : undefined}
                  value={f.name} onChange={e => updateFund(idx, 'name', e.target.value)} />
                <TextField size="small" fullWidth placeholder="IE00..."
                  label={idx === 0 ? 'ISIN' : undefined}
                  value={f.isin} onChange={e => updateFund(idx, 'isin', e.target.value)}
                  inputProps={{ style: { fontFamily: 'monospace' } }} />
                <CurrencyField adornment="%" label={idx === 0 ? 'Anteil' : undefined}
                  value={f.share_pct} onChange={v => updateFund(idx, 'share_pct', v)} fullWidth />
                <CurrencyField label={idx === 0 ? 'Anteilepreis' : undefined}
                  value={f.unit_price} onChange={v => updateFund(idx, 'unit_price', v)} decimals={4} fullWidth />
                <TextField size="small" fullWidth type="number"
                  label={idx === 0 ? 'Anteile' : undefined}
                  inputProps={{ step: '0.0001', min: 0, style: { textAlign: 'right', fontFamily: 'monospace' } }}
                  value={f.units} onChange={e => updateFund(idx, 'units', e.target.value)}
                  placeholder="90.7282" />
                <CurrencyField label={idx === 0 ? 'Wert' : undefined}
                  value={f.value} onChange={v => updateFund(idx, 'value', v)} fullWidth
                  placeholder="auto" />
                <IconButton size="small" color="error" onClick={() => removeFundRow(idx)} disabled={funds.length === 1}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
          </Stack>
          <Button variant="outlined" size="small" startIcon={<AddIcon />}
            onClick={addFundRow} sx={{ mb: 2.5, borderStyle: 'dashed' }}>
            Fonds hinzufügen
          </Button>

          {/* Section 3: Kosten */}
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700 }}>
              3. Kosten (Berichtszeitraum, meist 1 Jahr)
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Summe: <strong style={{ color: theme.palette.error.main, fontFamily: 'monospace' }}>{euro(totalCosts)}</strong>
            </Typography>
          </Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 1.5, mb: 2.5 }}>
            <CurrencyField label="Abschluss- & Vertriebskosten" value={form.cost_acquisition}
              onChange={v => setForm(p => ({ ...p, cost_acquisition: v }))} fullWidth />
            <CurrencyField label="Verwaltungskosten" value={form.cost_administration}
              onChange={v => setForm(p => ({ ...p, cost_administration: v }))} fullWidth />
            <CurrencyField label="Fondskosten / TER" value={form.cost_fund}
              onChange={v => setForm(p => ({ ...p, cost_fund: v }))} fullWidth />
            <CurrencyField label="Sonstige Kosten" value={form.cost_other}
              onChange={v => setForm(p => ({ ...p, cost_other: v }))} fullWidth />
          </Box>

          {/* Notiz */}
          <TextField label="Notiz" fullWidth value={form.note}
            onChange={e => setForm(p => ({ ...p, note: e.target.value }))}
            placeholder="z.B. Standmitteilung Nürnberger 2024" sx={{ mb: 2 }} />

          {/* Action buttons */}
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={resetForm} color="inherit">Abbrechen</Button>
            <Button variant="contained" onClick={handleSave} disabled={!formValid}>
              {editId ? 'Aktualisieren' : 'Speichern'}
            </Button>
          </Stack>
        </SectionCard>
      )}

      {/* Chart: contributions vs contract value */}
      {chartData.length >= 2 && (
        <SectionCard
          title={
            <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700 }}>
              Beiträge vs. Vertragswert
            </Typography>
          }
        >
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.palette.divider} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: theme.palette.text.disabled }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: theme.palette.text.disabled }} tickLine={false} axisLine={false} tickFormatter={v => fmtShort(v)} width={48} />
              <Tooltip content={<ChartTooltip isDark={isDark} />} />
              <Line type="monotone" dataKey="Beiträge" stroke={theme.palette.error.main} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Vertragswert" stroke={theme.palette.success.main} strokeWidth={2.5} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </SectionCard>
      )}

      {/* Snapshots table */}
      {snapshots.length > 0 ? (
        <SectionCard noPadding>
          <DataTable
            columns={snapshotColumns}
            rows={tableRows}
            getRowId={(s) => s.id}
            sx={{ border: 'none', borderRadius: 0 }}
          />
        </SectionCard>
      ) : !showForm && (
        <SectionCard>
          <Box sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}>
            <Typography variant="body2">
              📋 Noch keine Jahresmeldungen erfasst. Klicke oben auf <strong>Jahresmeldung erfassen</strong> um den ersten Snapshot anzulegen.
            </Typography>
          </Box>
        </SectionCard>
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="Snapshot löschen?"
        message="Die Standmitteilung wird unwiderruflich gelöscht."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />
    </Stack>
  );
}

// ── Tax Simulator Card ────────────────────────────────────────────────────────
// Halbeinkünfteverfahren (§20 Abs.1 Nr.6 EStG) für Einmalauszahlung
// Ertragsanteilbesteuerung (§22 EStG) für Monatsrente
// Siehe SKILL.md §65–93.

function TaxSimulatorCard({ pol, birthday }) {
  const [scenario, setScenario] = useState('lumpsum'); // 'lumpsum' | 'annuity'
  const r = pol.result;
  if (!r) return null;

  // Alter bei Auszahlung / Rentenbeginn aus globalem Geburtstag ableiten.
  // Fallback 67, wenn kein Geburtsdatum hinterlegt ist.
  const birthYear = birthday ? new Date(birthday).getFullYear() : null;
  const ageAtRetirement = birthYear && pol.params?.rentenJahr
    ? pol.params.rentenJahr - birthYear
    : 67;
  const personalTaxRate = r.personalTaxRate ?? pol.params?.steuer ?? 25;

  // Szenario A: Einmalauszahlung
  const lumpSumResult = useMemo(() => computeLumpSumTax({
    payoutAmount:          r.kapBeiRente,
    totalContributions:    r.totalEingezahlt,
    contractDurationYears: r.sparjahre,
    ageAtPayout:           ageAtRetirement,
    personalTaxRate,
  }), [r.kapBeiRente, r.totalEingezahlt, r.sparjahre, ageAtRetirement, personalTaxRate]);

  // Szenario B: Monatliche Rente
  const annuityResult = useMemo(() => computeAnnuityTax({
    monthlyPension:       r.possibleRente,
    ageAtRetirementStart: ageAtRetirement,
    personalTaxRate,
  }), [r.possibleRente, ageAtRetirement, personalTaxRate]);

  const currentAge = calculateAge(birthday);

  return (
    <SectionCard
      title={
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>Steuer-Simulator</Typography>
          <Chip
            label={`${personalTaxRate}% pers. Steuersatz`}
            size="small"
            variant="outlined"
            sx={{ height: 20, fontSize: '0.62rem' }}
          />
        </Stack>
      }
      subheader={
        birthday
          ? `Geburtsjahr ${birthYear}${currentAge != null ? ` · heute ${currentAge} J.` : ''} · Rentenbeginn ${pol.params?.rentenJahr} (Alter ${ageAtRetirement})`
          : 'Geburtsdatum in den Einstellungen hinterlegen für exakte Berechnung (Fallback: Alter 67)'
      }
      action={
        <ToggleButtonGroup
          value={scenario}
          exclusive
          onChange={(_, v) => v && setScenario(v)}
          size="small"
        >
          <ToggleButton value="lumpsum">Kapitalauszahlung</ToggleButton>
          <ToggleButton value="annuity">Monatliche Rente</ToggleButton>
        </ToggleButtonGroup>
      }
    >
      {scenario === 'lumpsum' ? (
        <Stack spacing={1}>
          {!lumpSumResult.qualifiesForHalbeinkuenfte && lumpSumResult.warnings.length > 0 && (
            <Alert severity="warning" variant="outlined">
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                Halbeinkünfteverfahren greift nicht — voller Gewinn versteuert
              </Typography>
              {lumpSumResult.warnings.map((w, i) => (
                <Typography key={i} variant="caption" sx={{ display: 'block' }}>• {w}</Typography>
              ))}
            </Alert>
          )}
          {lumpSumResult.qualifiesForHalbeinkuenfte && (
            <Alert severity="success" variant="outlined" sx={{ py: 0.5 }}>
              <Typography variant="caption">
                ✓ Halbeinkünfteverfahren (§20 Abs. 1 Nr. 6 EStG) — 50 % des Gewinns steuerfrei
              </Typography>
            </Alert>
          )}
          <TaxRow label="Kapitalauszahlung (brutto)" value={euro(lumpSumResult.brutto)} color="text.primary" bold />
          <TaxRow label="− Eingezahlte Beiträge" value={`− ${euro(r.totalEingezahlt)}`} color="text.secondary" />
          <TaxRow label="= Gewinn" value={euro(lumpSumResult.gewinn)} color="text.primary" bold />
          <TaxRow
            label={lumpSumResult.qualifiesForHalbeinkuenfte
              ? 'Steuerpflichtiger Ertrag (50 % des Gewinns)'
              : 'Steuerpflichtiger Ertrag (voller Gewinn)'}
            value={euro(lumpSumResult.steuerpflichtigerErtrag)}
            color="text.secondary"
          />
          <TaxRow label={`− Einkommensteuer (${personalTaxRate} %)`} value={`− ${euro(lumpSumResult.steuer)}`} color="error.main" />
          <TaxRow label="= Netto-Auszahlung" value={euro(lumpSumResult.netto)} color="success.main" bold large />
        </Stack>
      ) : (
        <Stack spacing={1}>
          <Alert severity="info" variant="outlined" sx={{ py: 0.5 }}>
            <Typography variant="caption">
              Ertragsanteilbesteuerung (§22 Nr. 1 S. 3 lit. a EStG) —
              Alter bei Rentenbeginn <strong>{ageAtRetirement}</strong> → Ertragsanteil <strong>{annuityResult.ertragsanteilPct} %</strong>
            </Typography>
          </Alert>
          <TaxRow label="Monatsrente (brutto)" value={`${euro(annuityResult.brutto)} / Monat`} color="text.primary" bold />
          <TaxRow
            label={`Steuerpflichtiger Anteil (${annuityResult.ertragsanteilPct} %)`}
            value={`${euro(annuityResult.steuerpflichtig)} / Monat`}
            color="text.secondary"
          />
          <TaxRow
            label={`− Einkommensteuer (${personalTaxRate} % auf Ertragsanteil)`}
            value={`− ${euro(annuityResult.steuer)} / Monat`}
            color="error.main"
          />
          <TaxRow
            label="KV/PV (KVdR)"
            value="0,00 € / Monat"
            color="text.secondary"
            hint="Schicht 3 regelmäßig beitragsfrei"
          />
          <TaxRow
            label="= Netto-Monatsrente"
            value={`${euro(annuityResult.netto)} / Monat`}
            color="success.main"
            bold large
          />
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.5 }}>
            Jährlich netto: <strong>{euro(annuityResult.netto * 12)}</strong>
          </Typography>
        </Stack>
      )}
    </SectionCard>
  );
}

function TaxRow({ label, value, color = 'text.primary', bold = false, large = false, hint }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{
      py: 0.5,
      borderTop: bold && large ? 1 : 0,
      borderColor: 'divider',
      mt: bold && large ? 0.5 : 0,
      pt: bold && large ? 1 : 0.5,
    }}>
      <Box>
        <Typography variant={large ? 'body1' : 'body2'} sx={{ color: 'text.secondary', fontWeight: bold ? 600 : 400 }}>
          {label}
        </Typography>
        {hint && (
          <Typography variant="caption" sx={{ display: 'block', color: 'text.disabled', fontSize: '0.65rem' }}>
            {hint}
          </Typography>
        )}
      </Box>
      <Typography
        variant={large ? 'h6' : 'body2'}
        sx={{ color, fontWeight: bold ? 700 : 500, fontFamily: 'monospace' }}
      >
        {value}
      </Typography>
    </Stack>
  );
}

// ── bAV Tax Simulator Card ────────────────────────────────────────────────────
// 100% nachgelagerte Besteuerung + KV/PV mit KV-Freibetrag (§226 SGB V)
// Vergleich: bAV (Vollversteuerung) vs. Private RV (Ertragsanteil)

function BavTaxSimulatorCard({ pol, birthday }) {
  const { isPkv } = useModules();
  const [scenario, setScenario] = useState('annuity');
  const r = pol.result;
  if (!r) return null;

  const birthYear = birthday ? new Date(birthday).getFullYear() : null;
  const ageAtRetirement = birthYear && pol.params?.rentenJahr
    ? pol.params.rentenJahr - birthYear
    : 67;
  const personalTaxRate = r.steuerImAlter ?? 27;

  // Szenario A: Einmalauszahlung
  const lumpResult = useMemo(() => computeBavLumpSumTax({
    payoutAmount: r.kapBeiRente,
    personalTaxRate,
    isPkv,
  }), [r.kapBeiRente, personalTaxRate, isPkv]);

  // Szenario B: Monatliche Rente
  const annuityResult = useMemo(() => computeBavAnnuityTax({
    monthlyPension: r.bruttorente,
    personalTaxRate,
    isPkv,
  }), [r.bruttorente, personalTaxRate, isPkv]);

  // Vergleich: bAV vs. Private RV
  const comparison = useMemo(() => compareBavVsPrivat({
    monthlyPension: r.bruttorente,
    personalTaxRate,
    ageAtRetirementStart: ageAtRetirement,
    isPkv,
  }), [r.bruttorente, personalTaxRate, ageAtRetirement, isPkv]);

  const currentAge = calculateAge(birthday);

  return (
    <SectionCard
      title={
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>bAV Steuer-Simulator</Typography>
          <Chip
            label={`${personalTaxRate}% Steuersatz · ${isPkv ? 'PKV' : 'GKV'}`}
            size="small"
            variant="outlined"
            sx={{ height: 20, fontSize: '0.62rem' }}
          />
        </Stack>
      }
      subheader={`100% nachgelagerte Besteuerung + ${isPkv ? 'keine SV' : 'KV/PV mit Freibetrag'}`}
      action={
        <ToggleButtonGroup
          value={scenario}
          exclusive
          onChange={(_, v) => v && setScenario(v)}
          size="small"
        >
          <ToggleButton value="lumpsum">Einmalauszahlung</ToggleButton>
          <ToggleButton value="annuity">Monatliche Rente</ToggleButton>
        </ToggleButtonGroup>
      }
    >
      {scenario === 'lumpsum' ? (
        <Stack spacing={1}>
          <Alert severity="info" variant="outlined" sx={{ py: 0.5 }}>
            <Typography variant="caption">
              Kapitalauszahlung: 100% einkommensteuerpflichtig (§22 Nr. 5 EStG).
              {!isPkv && ` GKV: Verteilung auf 120 Monate (§229 SGB V), KV-Freibetrag ${lumpResult.kvFreibetragMonat} €/Monat.`}
            </Typography>
          </Alert>
          <TaxRow label="Kapitalauszahlung (brutto)" value={euro(lumpResult.brutto)} color="text.primary" bold />
          <TaxRow label={`− Einkommensteuer (${personalTaxRate}% auf 100%)`} value={`− ${euro(lumpResult.steuer)}`} color="error.main" />
          {!isPkv && (
            <>
              <TaxRow label="− Krankenversicherung" value={`− ${euro(lumpResult.kvBeitrag)}`} color="warning.main"
                hint={`Fiktiver Monatsbetrag ${euro(lumpResult.brutto / 120)} → abzgl. Freibetrag ${euro(lumpResult.kvFreibetragMonat)}`} />
              <TaxRow label="− Pflegeversicherung" value={`− ${euro(lumpResult.pvBeitrag)}`} color="warning.main"
                hint="Kein Freibetrag, voller Beitrag" />
            </>
          )}
          {isPkv && (
            <TaxRow label="KV/PV (PKV)" value="0,00 €" color="text.secondary" hint="Keine SV-Abzüge bei PKV" />
          )}
          <TaxRow label="= Netto-Auszahlung" value={euro(lumpResult.netto)} color="success.main" bold large />
        </Stack>
      ) : (
        <Stack spacing={1}>
          <Alert severity="warning" variant="outlined" sx={{ py: 0.5 }}>
            <Typography variant="caption">
              bAV-Rente: <strong>100% einkommensteuerpflichtig</strong> (§22 Nr. 5 EStG)
              {!isPkv && ` + KV/PV (Freibetrag ${annuityResult.kvFreibetragMonat} €/Monat)`}.
              Deutlich höhere Abzüge als bei privater Rente (Ertragsanteil)!
            </Typography>
          </Alert>
          <TaxRow label="Brutto-Betriebsrente" value={`${euro(annuityResult.brutto)} / Monat`} color="text.primary" bold />
          <TaxRow label={`− Einkommensteuer (${personalTaxRate}% auf 100%)`}
            value={`− ${euro(annuityResult.steuer)} / Monat`} color="error.main" />
          {!isPkv && (
            <>
              <TaxRow
                label={`− Krankenversicherung (auf ${euro(annuityResult.kvBemessung)})`}
                value={`− ${euro(annuityResult.kvBeitrag)} / Monat`}
                color="warning.main"
                hint={`Brutto ${euro(annuityResult.brutto)} − Freibetrag ${euro(annuityResult.kvFreibetragMonat)} = ${euro(annuityResult.kvBemessung)} KV-pflichtig`}
              />
              <TaxRow
                label="− Pflegeversicherung (kein Freibetrag)"
                value={`− ${euro(annuityResult.pvBeitrag)} / Monat`}
                color="warning.main"
              />
            </>
          )}
          {isPkv && (
            <TaxRow label="KV/PV (PKV)" value="0,00 € / Monat" color="text.secondary" hint="Keine SV-Abzüge bei PKV" />
          )}
          <TaxRow label="= Netto-Betriebsrente" value={`${euro(annuityResult.netto)} / Monat`}
            color="success.main" bold large />
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.5 }}>
            Jährlich netto: <strong>{euro(annuityResult.netto * 12)}</strong>
          </Typography>
        </Stack>
      )}

      {/* ── Vergleich: bAV vs. Private RV ────────────────────────────── */}
      {scenario === 'annuity' && r.bruttorente > 0 && (
        <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <Typography variant="overline" sx={{
            display: 'block', color: 'text.secondary', fontWeight: 700, letterSpacing: '0.1em', mb: 1.5,
          }}>
            Vergleich: bAV vs. Private Rentenversicherung (gleiche Bruttorente)
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5, mb: 1.5 }}>
            <Box sx={{
              bgcolor: 'rgba(239,68,68,0.06)', borderRadius: 1, p: 1.5,
              border: 1, borderColor: 'rgba(239,68,68,0.2)',
            }}>
              <Typography variant="caption" sx={{
                display: 'block', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.5,
              }}>
                bAV Netto (100% besteuert{!isPkv ? ' + SV' : ''})
              </Typography>
              <Typography variant="h6" sx={{ color: 'error.main', fontWeight: 700, fontFamily: 'monospace' }}>
                {euro(comparison.bavNetto)}/Monat
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Abzüge: {euro(comparison.bavAbzuege)}
              </Typography>
            </Box>
            <Box sx={{
              bgcolor: 'rgba(16,185,129,0.06)', borderRadius: 1, p: 1.5,
              border: 1, borderColor: 'rgba(16,185,129,0.2)',
            }}>
              <Typography variant="caption" sx={{
                display: 'block', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.5,
              }}>
                Private RV Netto (Ertragsanteil {comparison.ertragsanteilPct}%)
              </Typography>
              <Typography variant="h6" sx={{ color: 'success.main', fontWeight: 700, fontFamily: 'monospace' }}>
                {euro(comparison.privatNetto)}/Monat
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Abzüge: {euro(comparison.privatAbzuege)} · keine SV
              </Typography>
            </Box>
          </Box>
          <Alert
            severity={comparison.differenz > 0 ? 'warning' : 'info'}
            variant="outlined"
            sx={{ fontFamily: 'monospace', fontWeight: 600 }}
          >
            {comparison.differenz > 0
              ? `Private RV bringt ${euro(comparison.differenz)}/Monat mehr Netto (${euro(comparison.differenz * 12)}/Jahr)`
              : 'Abzüge bei bAV und privater RV sind etwa gleich.'}
          </Alert>
        </Box>
      )}
    </SectionCard>
  );
}

// ── GRV Tax Simulator Card ────────────────────────────────────────────────────
// Kohortenregel §22 Nr.1 EStG + KVdR (halber Satz + PV voll)

function GrvTaxSimulatorCard({ pol }) {
  const { isPkv } = useModules();
  const r = pol.result;
  if (!r) return null;

  const rentenJahr      = pol.params?.rentenJahr || 2026;
  const personalTaxRate = r.steuerSatz ?? 20;
  const inflationRate   = r.rentenAnpassung != null ? r.rentenAnpassung : 2;
  const yearsUntilRente = r.yearsToRente || 0;

  // Kohortenregel: berechnet z.B. 84% für 2026. Für die aufgabenspezifische
  // Annahme "86% steuerpflichtig" kann über den Slider geschaltet werden.
  const [steuerpflichtigPct, setSteuerpflichtigPct] = useState(() => getSteuerpflichtigerAnteil(rentenJahr));

  // Re-init when policy's rentenJahr changes
  useEffect(() => {
    setSteuerpflichtigPct(getSteuerpflichtigerAnteil(rentenJahr));
  }, [rentenJahr]);

  const result = useMemo(() => computeGrvTax({
    monthlyPension:             r.bruttoRente,
    personalTaxRate,
    rentenbeginnJahr:           rentenJahr,
    isPkv,
    yearsUntilRente,
    inflationRate,
    steuerpflichtigPctOverride: steuerpflichtigPct,
  }), [r.bruttoRente, personalTaxRate, rentenJahr, isPkv, yearsUntilRente, inflationRate, steuerpflichtigPct]);

  return (
    <SectionCard
      title={
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>GRV Steuer-Simulator</Typography>
          <Chip
            label={`${steuerpflichtigPct}% steuerpflichtig · ${isPkv ? 'PKV' : 'GKV (KVdR)'}`}
            size="small"
            variant="outlined"
            sx={{ height: 20, fontSize: '0.62rem' }}
          />
        </Stack>
      }
      subheader={`Kohortenregel §22 EStG · Rentenbeginn ${rentenJahr} · persönl. Steuersatz ${personalTaxRate}%`}
    >
      <Stack spacing={1.5}>
        {/* Kohorten-Slider (Annahme-Override) */}
        <Box>
          <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
              Steuerpflichtiger Anteil (Kohortenregel)
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
              {steuerpflichtigPct} %
            </Typography>
          </Stack>
          <Slider
            value={steuerpflichtigPct}
            min={50}
            max={100}
            step={0.5}
            size="small"
            onChange={(_, v) => setSteuerpflichtigPct(Number(v))}
          />
          <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.65rem' }}>
            Default (Jahr {rentenJahr}): {getSteuerpflichtigerAnteil(rentenJahr)}% · Annahme aus Task: 86%
          </Typography>
        </Box>

        <Alert severity="info" variant="outlined" sx={{ py: 0.5 }}>
          <Typography variant="caption">
            {isPkv
              ? 'PKV im Alter: Keine KV/PV-Abzüge auf GRV. Einkommensteuer auf den steuerpflichtigen Anteil.'
              : 'GKV-Rentner (KVdR, §248 SGB V): halber KV-Satz + voller PV-Satz. Einkommensteuer auf den steuerpflichtigen Anteil.'}
          </Typography>
        </Alert>

        <TaxRow label="Bruttorente (hochgerechnet)" value={`${euro(result.brutto)} / Monat`} color="text.primary" bold />
        <TaxRow
          label={`Steuerpflichtig (${steuerpflichtigPct}%)`}
          value={`${euro(result.steuerpflichtig)} / Monat`}
          color="text.secondary"
        />
        <TaxRow
          label={`− Einkommensteuer (${personalTaxRate}%)`}
          value={`− ${euro(result.steuer)} / Monat`}
          color="error.main"
        />
        {!isPkv && (
          <>
            <TaxRow
              label="− KV-Beitrag (halber Satz, KVdR)"
              value={`− ${euro(result.kvBeitrag)} / Monat`}
              color="warning.main"
              hint="§248 SGB V: Rentner zahlen halben Beitragssatz"
            />
            <TaxRow
              label="− PV-Beitrag (voller Satz)"
              value={`− ${euro(result.pvBeitrag)} / Monat`}
              color="warning.main"
              hint="Keine halbierte Beitragspflicht für Pflegeversicherung"
            />
          </>
        )}
        {isPkv && (
          <TaxRow label="KV/PV (PKV)" value="0,00 € / Monat" color="text.secondary" hint="PKV zahlt eigenständig" />
        )}
        <TaxRow
          label="= Netto-Monatsrente"
          value={`${euro(result.netto)} / Monat`}
          color="success.main"
          bold
          large
        />
        {yearsUntilRente > 0 && inflationRate > 0 && (
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.5 }}>
            Kaufkraft heute (Real-Netto bei {inflationRate}% Inflation über {yearsUntilRente} Jahre):{' '}
            <strong>{euro(result.netto_real)}</strong>
          </Typography>
        )}
      </Stack>
    </SectionCard>
  );
}

// ── Policy panel ──────────────────────────────────────────────────────────────

function PolicyPanel({ pol, onParamChange, onRename, onUpdatePolicy, isDark, snapshots, onAddSnapshot, onUpdateSnapshot, onDeleteSnapshot }) {
  const t = useTokens(isDark);
  const { birthday } = useModules();
  const r = pol.result;
  const [activeSubTab, setActiveSubTab] = useState('detail');

  const statCards = r ? (
    pol.type === 'drv' ? [
      { icon: 'account_balance', label: 'Bruttorente (angepasst)', value: euro(r.bruttoRente) + '/Mo', badge: num(r.rentenAnpassung, 1) + '% p.a.', sub: 'Anpassung' },
      { icon: 'payments',        label: 'Netto-Echt-Rente',        value: euro(r.nettoRente) + '/Mo', sub: 'nach Steuer & PKV' },
      { icon: 'receipt_long',    label: 'Einkommensteuer',         value: '-' + euro(r.steuerBetrag) + '/Mo', badge: r.steuerSatz + '%', sub: 'Steuersatz' },
      { icon: 'health_and_safety', label: 'PKV-Kosten (netto)',    value: r.pkvNettobeitrag > 0 ? '-' + euro(r.pkvNettobeitrag) + '/Mo' : 'nicht erfasst', sub: 'inkl. RV-Zuschuss verrechnet' },
      { icon: 'monitoring',      label: 'Anwartschaft (heute)',    value: euro(r.anwartschaft) + '/Mo', sub: 'bereits erarbeitet' },
      { icon: 'star',            label: 'Entgeltpunkte',           value: num(r.entgeltpunkte, 4) + ' EP', badge: r.yearsToRente + ' J.', sub: 'bis Rentenbeginn' },
    ] : pol.type === 'bav' ? [
      { icon: 'monitoring', label: 'Kapital bei Rente', value: euro(r.kapBeiRente) },
      ...(r.payoutStrategy === 'lump_sum' ? [
        { icon: 'payments', label: 'Einmalzahlung', value: euro(r.lumpSum), sub: 'Kapitalwahlrecht' },
      ] : [
        { icon: 'account_balance', label: 'Bruttorente', value: euro(r.bruttorente) + '/Mo', badge: 'RF ' + num(r.rentenfaktor, 1), sub: 'per 10.000 €' },
        { icon: 'payments',        label: 'Nettorente',  value: euro(r.nettorente) + '/Mo', badge: r.steuerImAlter + '%', sub: 'Steuer' },
      ]),
      { icon: 'savings',    label: 'Einzahlungen ges.',  value: euro(r.totalEingezahlt),    sub: 'davon AG ' + euro(r.agZuschussGesamt) },
      { icon: 'money_off',  label: 'Netto-Verzicht ges.',value: euro(r.nettoVerzichtGesamt),sub: 'tatsächliche Kosten' },
      { icon: 'trending_up',label: 'Steuervorteil ges.', value: euro(r.steuervorteilGesamt),badge: r.grenzsteuersatz + '%', sub: 'Steuer+SV-Ersparnis' },
      ...(r.breakEvenAlter != null ? [{ icon: 'schedule', label: 'Break-Even', value: 'ab ~' + r.breakEvenAlter + ' Mo', sub: 'Rente lohnt sich ab dann' }] : []),
    ] : pol.type === 'avd' ? [
      { icon: 'monitoring',  label: 'Kapital bei Rente', value: euro(r.kapBeiRente) },
      { icon: 'show_chart',  label: 'Kaufkraft real',    value: euro(r.kapBeiRenteReal), sub: 'heutige Kaufkraft' },
      { icon: 'payments',    label: 'Mögl. Nettorente',  value: euro(r.possibleRente) + '/Mo', sub: 'Brutto: ' + euro(r.possibleRenteBrutto) },
      { icon: 'savings',     label: 'Einzahlungen ges.', value: euro(r.totalEingezahlt),      badge: r.foerderquote + '% Staat', sub: euro(r.totalStaatlich) + ' Förderung' },
      { icon: 'trending_up', label: 'Netto-Gewinn',      value: euro(r.gewinn), badge: r.gewinn >= 0 ? 'Positiv' : 'Negativ' },
      { icon: 'schedule',    label: 'Spar / Rente',      value: r.sparjahre + ' / ' + r.rentenjahre, sub: 'Jahre' },
    ] : pol.type === 'depot' ? [
      { icon: 'monitoring',  label: 'Kapital brutto',    value: euro(r.kapBeiRente) },
      { icon: 'receipt_long',label: 'Kapital netto',     value: euro(r.kapNetto), sub: 'nach Steuern' },
      { icon: 'payments',    label: 'Mögl. Monatsrente', value: euro(r.possibleRente) + '/Mo' },
      { icon: 'savings',     label: 'Einzahlungen ges.', value: euro(r.totalEingezahlt) },
      { icon: 'trending_up', label: 'Netto-Gewinn',      value: euro(r.gewinn), badge: r.gewinn >= 0 ? 'Positiv' : 'Negativ' },
      { icon: 'schedule',    label: 'Spar / Rente',      value: r.sparjahre + ' / ' + r.rentenjahre, sub: 'Jahre' },
    ] : [
      { icon: 'monitoring',  label: 'Kapital bei Rente', value: euro(r.kapBeiRente) },
      { icon: 'show_chart',  label: 'Kaufkraft real',    value: euro(r.kapBeiRenteReal), sub: 'heutige Kaufkraft' },
      r.payoutStrategy === 'lump_sum'
        ? { icon: 'payments', label: 'Einmalzahlung', value: euro(r.lumpSum), sub: 'Kapitalwahlrecht' }
        : r.rentenfaktor > 0
          ? { icon: 'payments', label: 'Rente (Rentenfaktor)', value: euro(r.renteViaFaktor) + '/Mo', badge: 'RF ' + num(r.rentenfaktor, 1), sub: 'per 10k€' }
          : { icon: 'payments', label: 'Mögl. Monatsrente',    value: euro(r.possibleRente) + '/Mo', badge: r.rentenjahre + ' J.', sub: 'Rentenphase' },
      { icon: 'savings',     label: 'Einzahlungen ges.', value: euro(r.totalEingezahlt), sub: 'Kosten: ' + euro(r.gesamtkosten) },
      { icon: 'trending_up', label: 'Netto-Gewinn',      value: euro(r.gewinn), badge: 'Faktor ' + num(r.faktor) + 'x' },
      ...(r.payoutStrategy === 'annuity' && r.rentenfaktor === 0 ? [{ icon: 'warning', label: 'Rentenfaktor', value: 'nicht hinterlegt', sub: 'Bitte aus Vertrag nachtragen' }] : []),
      ...(r.breakEvenAlter != null ? [{ icon: 'schedule', label: 'Break-Even', value: 'ab Alter ~' + r.breakEvenAlter, sub: 'Rente lohnt sich ab dann' }] : []),
      { icon: 'schedule',    label: 'Spar / Rente',      value: r.sparjahre + ' / ' + r.rentenjahre, sub: 'Jahre' },
    ]
  ) : [];

  const chartData = r ? r.labels.map((yr, i) => ({
    year: yr, nominal: r.nomArr[i], real: r.realArr[i], einzahlungen: r.einzArr[i],
  })) : [];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, alignItems: 'start' }}>
      {/* Sidebar */}
      <div style={{
        background: t.card, border: `1px solid ${t.bdr}`, borderRadius: 16, padding: 16,
        position: 'sticky', top: 0, maxHeight: 'calc(100vh - 160px)', overflowY: 'auto',
      }}>
        {/* Name input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{
            fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px',
            borderRadius: 99, background: pol.color + '22', color: pol.color,
          }}>
            {TYPE_LABEL[pol.type]}
          </span>
          <input
            value={pol.name}
            onChange={e => onRename(pol.id, e.target.value)}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: t.text, fontWeight: 700, fontSize: '0.9rem',
            }}
          />
        </div>

        {pol.type === 'drv' && (
          <DRVSidebar params={pol.params} color={pol.color} isDark={isDark}
            onChange={newP => onParamChange(pol.id, newP)} />
        )}
        {pol.type === 'insurance' && (
          <InsuranceSidebar params={pol.params} color={pol.color} isDark={isDark}
            onChange={newP => onParamChange(pol.id, newP)} />
        )}
        {pol.type === 'avd' && (
          <AVDSidebar params={pol.params} color={pol.color} isDark={isDark}
            onChange={newP => onParamChange(pol.id, newP)} />
        )}
        {pol.type === 'depot' && (
          <DepotSidebar params={pol.params} color={pol.color} isDark={isDark}
            onChange={newP => onParamChange(pol.id, newP)} />
        )}
        {pol.type === 'bav' && (
          <BAVSidebar params={pol.params} color={pol.color} isDark={isDark}
            isPassive={!!pol.is_passive}
            onPassiveChange={(v) => onUpdatePolicy?.(pol.id, { is_passive: v })}
            onChange={newP => onParamChange(pol.id, newP)} />
        )}
      </div>

      {/* Content */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Sub-tabs (for insurance, bAV, DRV, depot — alle mit Snapshot-Tracking) */}
        {(pol.type === 'insurance' || pol.type === 'bav' || pol.type === 'drv' || pol.type === 'depot') && (
          <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${t.bdr}` }}>
            {[
              { id: 'detail',    label: 'Prognose & Details' },
              { id: 'snapshots', label: 'Historie & Snapshots' + (snapshots && snapshots.length > 0 ? ` (${snapshots.length})` : '') },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveSubTab(tab.id)} style={{
                padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: activeSubTab === tab.id ? `2px solid ${t.accent}` : '2px solid transparent',
                marginBottom: -1,
                color: activeSubTab === tab.id ? t.accent : t.sub,
                fontWeight: activeSubTab === tab.id ? 700 : 500, fontSize: '0.82rem',
              }}>
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Snapshots tab — zwei verschiedene Panels je nach Typ:
            - Versicherung/bAV/DRV: komplexer SnapshotPanel mit Fondsverteilung + Kostenblöcken
            - Depot:                schlankes DepotSnapshotPanel (Performance-Card + Liste) */}
        {(pol.type === 'insurance' || pol.type === 'bav' || pol.type === 'drv') && activeSubTab === 'snapshots' && (
          <SnapshotPanel
            policyId={pol.id}
            snapshots={snapshots || []}
            onAdd={onAddSnapshot}
            onUpdate={onUpdateSnapshot}
            onDelete={onDeleteSnapshot}
            isDark={isDark}
          />
        )}

        {pol.type === 'depot' && activeSubTab === 'snapshots' && (
          <DepotSnapshotPanel
            policyId={pol.id}
            snapshots={snapshots || []}
            onAdd={onAddSnapshot}
            onUpdate={onUpdateSnapshot}
            onDelete={onDeleteSnapshot}
          />
        )}

        {/* Hybrid Tracking Banner */}
        {pol.type === 'insurance' && activeSubTab === 'detail' && r?.usingSnapshot && (
          <div style={{
            background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)',
            borderRadius: 10, padding: '10px 14px', color: CHART.positive, fontSize: '0.78rem',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span>📊</span>
            <span>
              <strong>Hybrid Tracking aktiv:</strong> Prognose basiert auf Snapshot vom {new Date(r.snapshotDate).toLocaleDateString('de-DE')} (echter Vertragswert) statt theoretischer Berechnung.
            </span>
          </div>
        )}

        {(pol.type === 'avd' || activeSubTab === 'detail') && r?.depletionYear && (
          <div style={{
            background: '#ef444415', border: '1px solid #ef4444',
            borderRadius: 10, padding: '10px 14px', color: CHART.negative, fontSize: '0.82rem',
          }}>
            ⚠ Kapital erschöpft ab ~{r.depletionYear}. Nachhaltige Rente: {euro(r.possibleRente)}/Monat.
          </div>
        )}

        {/* Stat cards (hidden in snapshots tab) */}
        {(pol.type === 'avd' || activeSubTab === 'detail') && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fit, minmax(220px, 1fr))' }, gap: 2, alignItems: 'stretch' }}>
          {statCards.map((s, i) => (
            <StatCard key={i} {...s} />
          ))}
        </Box>
        )}

        {/* Steuer-Simulator — Private Rentenversicherung (Schicht 3, Ertragsanteil) */}
        {pol.type === 'insurance' && activeSubTab === 'detail' && r && (
          <TaxSimulatorCard pol={pol} birthday={birthday} />
        )}

        {/* bAV Steuer-Simulator (100% nachgelagert + KV/PV + Vergleich) */}
        {pol.type === 'bav' && activeSubTab === 'detail' && r && (
          <BavTaxSimulatorCard pol={pol} birthday={birthday} />
        )}

        {/* GRV Steuer-Simulator (Kohortenregel + KVdR) */}
        {pol.type === 'drv' && activeSubTab === 'detail' && r && (
          <GrvTaxSimulatorCard pol={pol} />
        )}

        {(pol.type === 'avd' || activeSubTab === 'detail') && <>
        {/* Capital chart */}
        <div style={{ background: t.card, border: `1px solid ${t.bdr}`, borderRadius: 16, padding: 16 }}>
          <div style={{ color: t.sub, fontSize: '0.65rem', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
            Kapitalentwicklung
          </div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
            {[
              { color: pol.color, label: 'Nominal' },
              { color: CHART.warning, label: 'Real' },
              { color: CHART.negative, label: 'Einzahlungen' },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: l.color }} />
                <span style={{ color: t.sub, fontSize: '0.72rem' }}>{l.label}</span>
              </div>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={t.grid} />
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: t.tickClr }} tickLine={false} axisLine={false}
                interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: t.tickClr }} tickLine={false} axisLine={false}
                tickFormatter={v => fmtShort(v)} width={48} />
              <Tooltip content={<ChartTooltip isDark={isDark} />} />
              <Line type="monotone" dataKey="nominal" name="Kapital nominal"
                stroke={pol.color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="real" name="Kapital real"
                stroke={CHART.warning} strokeWidth={1.5} strokeDasharray="5 4" dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="einzahlungen" name="Einzahlungen"
                stroke={CHART.negative} strokeWidth={1.5} strokeDasharray="3 3" dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* DRV: Rentenanpassung vs. Inflation chart */}
        {pol.type === 'drv' && r && (() => {
          const chartData = r.labels.map((yr, i) => ({
            year: yr,
            angepasst:  r.nomArr[i],
            inflation:  r.realArr[i],
            anwartschaft: r.einzArr[i],
          }));
          const kaufkraftSteigt = r.rentenAnpassung >= (r.inflation || 2);
          return (
            <div style={{ background: t.card, border: `1px solid ${t.bdr}`, borderRadius: 16, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ color: t.sub, fontSize: '0.65rem', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>
                    Rentenentwicklung bis {r.rentenJahr}
                  </div>
                  <div style={{ color: t.sub, fontSize: '0.7rem' }}>
                    Anpassungsrate {num(r.rentenAnpassung, 1)}% vs. Inflation {num(r.inflation || 2, 1)}%
                  </div>
                </div>
                <span style={{
                  fontSize: '0.68rem', fontWeight: 700, padding: '3px 8px', borderRadius: 99,
                  background: kaufkraftSteigt ? '#22c55e20' : '#ef444420',
                  color: kaufkraftSteigt ? CHART.positive : CHART.negative,
                  border: `1px solid ${kaufkraftSteigt ? CHART.positive : CHART.negative}`,
                }}>
                  {kaufkraftSteigt ? '✓ Kaufkraft wächst' : '⚠ Kaufkraft sinkt'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
                {[
                  { color: pol.color,    label: 'Mit Rentenanpassung' },
                  { color: CHART.warning,    label: 'Inflationsäquivalent' },
                  { color: CHART.muted,    label: 'Anwartschaft (heute)' },
                ].map(l => (
                  <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: l.color }} />
                    <span style={{ color: t.sub, fontSize: '0.7rem' }}>{l.label}</span>
                  </div>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={t.grid} />
                  <XAxis dataKey="year" tick={{ fontSize: 10, fill: t.tickClr }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: t.tickClr }} tickLine={false} axisLine={false}
                    tickFormatter={v => euro(v).replace(' €', '€')} width={60} />
                  <Tooltip content={<ChartTooltip isDark={isDark} />} />
                  <Line type="monotone" dataKey="angepasst" name="Mit Rentenanpassung"
                    stroke={pol.color} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="inflation" name="Inflationsäquivalent"
                    stroke={CHART.warning} strokeWidth={1.5} strokeDasharray="5 4" dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="anwartschaft" name="Anwartschaft (heute)"
                    stroke={CHART.muted} strokeWidth={1} strokeDasharray="3 3" dot={false} activeDot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          );
        })()}

        {/* bAV: Steuervorteil summary */}
        {pol.type === 'bav' && r && (
          <div style={{ background: t.card, border: `1px solid ${t.bdr}`, borderRadius: 16, padding: 16 }}>
            <div style={{ color: t.sub, fontSize: '0.65rem', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
              Vorteilsrechner — Brutto-Einsatz vs. Netto-Verzicht
            </div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 14 }}>
              <div>
                <div style={{ color: t.sub, fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Brutto-Einsatz/Monat</div>
                <div style={{ color: CHART.negative, fontSize: '1rem', fontWeight: 700, fontFamily: 'monospace' }}>{euro(r.sparrate)}</div>
              </div>
              <div>
                <div style={{ color: t.sub, fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Netto-Verzicht/Monat</div>
                <div style={{ color: CHART.warning, fontSize: '1rem', fontWeight: 700, fontFamily: 'monospace' }}>{euro(r.nettoVerzicht)}</div>
              </div>
              <div>
                <div style={{ color: t.sub, fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Steuervorteil/Monat</div>
                <div style={{ color: CHART.positive, fontSize: '1rem', fontWeight: 700, fontFamily: 'monospace' }}>{euro(r.sparrate - r.nettoVerzicht)}</div>
              </div>
              <div>
                <div style={{ color: t.sub, fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>AG-Zuschuss/Monat</div>
                <div style={{ color: CHART.neutral, fontSize: '1rem', fontWeight: 700, fontFamily: 'monospace' }}>{euro(r.agZuschussEur)}</div>
              </div>
            </div>
            {/* Visual bar comparison */}
            {[
              { label: 'Brutto-Einsatz gesamt', value: r.bruttoEinsatzGesamt, pct: 100, color: '#ef444430' },
              { label: 'davon AG-Zuschuss', value: r.agZuschussGesamt, pct: r.bruttoEinsatzGesamt > 0 ? r.agZuschussGesamt / r.bruttoEinsatzGesamt * 100 : 0, color: '#0ea5e930' },
              { label: 'Netto-Verzicht gesamt', value: r.nettoVerzichtGesamt, pct: r.bruttoEinsatzGesamt > 0 ? r.nettoVerzichtGesamt / r.bruttoEinsatzGesamt * 100 : 0, color: '#f59e0b30' },
              { label: 'Steuervorteil gesamt', value: r.steuervorteilGesamt, pct: r.bruttoEinsatzGesamt > 0 ? r.steuervorteilGesamt / r.bruttoEinsatzGesamt * 100 : 0, color: '#10b98130' },
            ].map(row => (
              <div key={row.label} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ color: t.sub, fontSize: '0.7rem' }}>{row.label}</span>
                  <span style={{ color: t.text, fontSize: '0.7rem', fontFamily: 'monospace', fontWeight: 600 }}>{euro(row.value)}</span>
                </div>
                <div style={{ background: t.bdr, borderRadius: 4, height: 8, overflow: 'hidden' }}>
                  <div style={{ width: row.pct + '%', height: '100%', background: row.color.replace('30', 'cc'), borderRadius: 4, transition: 'width 0.4s' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* bAV: Comparison chart — bAV vs. Depot equivalent */}
        {pol.type === 'bav' && r?.depotComparison && (() => {
          const bavByYear   = Object.fromEntries(r.labels.map((yr, i) => [yr, r.nomArr[i]]));
          const depotByYear = Object.fromEntries(r.depotComparison.labels.map((yr, i) => [yr, r.depotComparison.nomArr[i]]));
          const allYears    = [...new Set([...r.labels, ...r.depotComparison.labels])].sort((a, b) => Number(a) - Number(b));
          const compData    = allYears.map(yr => ({ year: yr, bav: bavByYear[yr] ?? null, depot: depotByYear[yr] ?? null }));
          return (
            <div style={{ background: t.card, border: `1px solid ${t.bdr}`, borderRadius: 16, padding: 16 }}>
              <div style={{ color: t.sub, fontSize: '0.65rem', fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
                Vergleich: bAV vs. ETF-Depot (gleiche Nettolast)
              </div>
              <div style={{ color: t.sub, fontSize: '0.7rem', marginBottom: 10 }}>
                ETF-Depot mit {euro(r.nettoVerzicht)}/Monat — was du tatsächlich aufgibst
              </div>
              <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
                {[{ color: pol.color, label: 'bAV Kapital' }, { color: CHART.positive, label: 'ETF-Depot (netto)' }].map(l => (
                  <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: l.color }} />
                    <span style={{ color: t.sub, fontSize: '0.72rem' }}>{l.label}</span>
                  </div>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={compData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={t.grid} />
                  <XAxis dataKey="year" tick={{ fontSize: 10, fill: t.tickClr }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: t.tickClr }} tickLine={false} axisLine={false} tickFormatter={v => fmtShort(v)} width={48} />
                  <Tooltip content={<ChartTooltip isDark={isDark} />} />
                  <Line type="monotone" dataKey="bav" name="bAV Kapital"
                    stroke={pol.color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls={false} />
                  <Line type="monotone" dataKey="depot" name="ETF-Depot"
                    stroke={CHART.positive} strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4 }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          );
        })()}

        {/* Detail table */}
        <div style={{ background: t.card, border: `1px solid ${t.bdr}`, borderRadius: 16, padding: 16 }}>
          <div style={{ color: t.sub, fontSize: '0.65rem', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
            Detailübersicht
          </div>
          <DetailTable pol={pol} isDark={isDark} />
        </div>
        </>}
      </div>
    </div>
  );
}

// ── Overview panel ────────────────────────────────────────────────────────────

function OverviewPanel({ policies, onTabSwitch, isDark }) {
  const t = useTokens(isDark);
  const { isPkv, steuerSatzAlter, birthday } = useModules();

  // Geburtsjahr für Ertragsanteilbesteuerung (insurance) — Alter bei Rentenbeginn
  const birthYear = birthday ? new Date(birthday).getFullYear() : null;

  const netRetirement = useMemo(() =>
    calculateTotalNetRetirement(
      policies.filter(p => p.result),
      steuerSatzAlter,
      isPkv,
      { birthYear },
    ),
    [policies, steuerSatzAlter, isPkv, birthYear]
  );

  const totals = useMemo(() => {
    let kap = 0, rente = 0, einz = 0, gewinn = 0;
    policies.forEach(p => {
      const r = p.result;
      if (!r) return;
      kap    += r.kapBeiRente     || 0;
      rente  += r.possibleRente   || 0;
      einz   += r.totalEingezahlt || 0;
      gewinn += r.gewinn          || 0;
    });
    return { kap, rente, einz, gewinn, faktor: einz > 0 ? kap / einz : 0 };
  }, [policies]);

  // 3-Schichten Real-Netto-Summe (nur Ist-Prognose, keine Wunschrente)
  const schichten = useMemo(() => {
    const perPol = netRetirement.perPolicy || [];
    const sumType = (types) => perPol
      .filter(p => types.includes(p.type))
      .reduce((s, p) => s + (p.netto || 0), 0);
    return {
      grv:     sumType(['drv']),           // Schicht 1: Gesetzliche Rente
      bav:     sumType(['bav', 'avd']),    // Schicht 2: bAV/AVD (nachgelagert)
      privat:  sumType(['insurance', 'depot']), // Schicht 3: Private Vorsorge
      total:   netRetirement.totalNetto || 0,
    };
  }, [netRetirement]);

  const chartData = useMemo(() => {
    const yearMap = {};
    policies.forEach(p => {
      p.result?.labels?.forEach((yr, i) => {
        if (!yearMap[yr]) yearMap[yr] = { year: yr, kapital: 0, einzahlungen: 0 };
        yearMap[yr].kapital      += p.result.nomArr[i]  || 0;
        yearMap[yr].einzahlungen += p.result.einzArr[i] || 0;
      });
    });
    return Object.values(yearMap).sort((a, b) => Number(a.year) - Number(b.year));
  }, [policies]);

  const maxKap = Math.max(...policies.map(p => p.result?.kapBeiRente || 0), 1);
  const drvPols = policies.filter(p => p.type === 'drv' && p.result);

  if (!policies.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh' }}>
        <div style={{
          background: t.card, border: `1px solid ${t.bdr}`, borderRadius: 20,
          padding: '3rem 2.5rem', maxWidth: 420, textAlign: 'center',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>📈</div>
          <div style={{ color: t.text, fontWeight: 700, fontSize: '1.1rem', marginBottom: 8 }}>
            Noch keine Policen
          </div>
          <div style={{ color: t.sub, fontSize: '0.875rem' }}>
            Klicke auf <strong style={{ color: CHART.neutral }}>+ Hinzufügen</strong> um deine erste Vorsorge anzulegen.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 3-Schichten Real-Netto-KPIs */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fit, minmax(220px, 1fr))' }, gap: 2, alignItems: 'stretch' }}>
        <StatCard
          icon="payments"
          label="Netto-Monatsrente gesamt"
          value={euro(schichten.total) + '/Mo'}
          badge={isPkv ? 'PKV' : 'GKV'}
          sub="alle 3 Schichten"
        />
        <StatCardSecondary
          icon="account_balance"
          label="Schicht 1 · GRV (Netto)"
          value={euro(schichten.grv) + '/Mo'}
          sub={drvPols.length === 0 ? 'noch nicht erfasst' : 'Gesetzliche Rente'}
        />
        <StatCardSecondary
          icon="work"
          label="Schicht 2 · bAV/AVD (Netto)"
          value={euro(schichten.bav) + '/Mo'}
          sub="nachgelagert besteuert"
        />
        <StatCardSecondary
          icon="savings"
          label="Schicht 3 · Privat (Netto)"
          value={euro(schichten.privat) + '/Mo'}
          sub="Ertragsanteil / Abgeltung"
        />
        <StatCardSecondary
          icon="monitoring"
          label="Gesamtkapital bei Rente"
          value={euro(totals.kap)}
          sub={'Einzahlungen: ' + euro(totals.einz)}
        />
        <StatCardSecondary
          icon="trending_up"
          label="Netto-Gewinn gesamt"
          value={euro(totals.gewinn)}
          badge={'Faktor ' + num(totals.faktor) + 'x'}
          sub={totals.gewinn >= 0 ? 'Positiv' : 'Negativ'}
        />
      </Box>

      {/* DRV InfoCard — shown whenever at least one DRV policy is configured */}
      {drvPols.length > 0 && (
        <div style={{ background: t.card, border: `2px solid #22c55e40`, borderRadius: 16, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: '1.2rem' }}>🏛</span>
            <div>
              <div style={{ color: t.text, fontWeight: 700, fontSize: '0.9rem' }}>Gesetzliche Rente (DRV)</div>
              <div style={{ color: t.sub, fontSize: '0.72rem' }}>Auf Basis des aktuellen Rentenbescheids</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
            {drvPols.map(pol => {
              const r = pol.result;
              return (
                <div key={pol.id} style={{ display: 'contents' }}>
                  <div style={{ background: t.cardAlt, border: `1px solid ${t.bdr}`, borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ color: t.sub, fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Entgeltpunkte</div>
                    <div style={{ color: CHART.positive, fontWeight: 700, fontSize: '0.9rem', fontFamily: 'monospace' }}>{num(r.entgeltpunkte, 4)} EP</div>
                  </div>
                  <div style={{ background: t.cardAlt, border: `1px solid ${t.bdr}`, borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ color: t.sub, fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Anwartschaft</div>
                    <div style={{ color: t.text, fontWeight: 700, fontSize: '0.9rem', fontFamily: 'monospace' }}>{euro(r.anwartschaft)}/M</div>
                  </div>
                  <div style={{ background: t.cardAlt, border: `1px solid ${t.bdr}`, borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ color: t.sub, fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Bruttorente {r.rentenJahr}</div>
                    <div style={{ color: CHART.positive, fontWeight: 700, fontSize: '0.9rem', fontFamily: 'monospace' }}>{euro(r.bruttoRente)}/M</div>
                  </div>
                  <div style={{ background: t.cardAlt, border: `1px solid ${t.bdr}`, borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ color: t.sub, fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Netto-Echt-Rente</div>
                    <div style={{ color: CHART.positive, fontWeight: 700, fontSize: '0.9rem', fontFamily: 'monospace' }}>{euro(r.nettoRente)}/M</div>
                    <div style={{ color: t.sub, fontSize: '0.62rem', marginTop: 2 }}>nach Steuer & PKV</div>
                  </div>
                  {r.pkvNettobeitrag > 0 && (
                    <div style={{ background: t.cardAlt, border: `1px solid ${t.bdr}`, borderRadius: 10, padding: '10px 12px' }}>
                      <div style={{ color: t.sub, fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>PKV-Abzug</div>
                      <div style={{ color: CHART.warning, fontWeight: 700, fontSize: '0.9rem', fontFamily: 'monospace' }}>-{euro(r.pkvNettobeitrag)}/M</div>
                      <div style={{ color: t.sub, fontSize: '0.62rem', marginTop: 2 }}>nach RV-Zuschuss</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Netto-Breakdown */}
      {netRetirement.perPolicy.length > 0 && (
        <div style={{ background: t.card, border: `1px solid ${t.bdr}`, borderRadius: 16, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ color: t.sub, fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Netto-Aufschlüsselung · {steuerSatzAlter}% Steuersatz · {isPkv ? 'PKV' : 'GKV'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              {[
                { label: 'Netto', value: euro(netRetirement.totalNetto), color: CHART.positive },
                { label: 'Steuer', value: '-' + euro(netRetirement.totalSteuer), color: CHART.negative },
                { label: 'KV/PV', value: isPkv ? '0 €' : '-' + euro(netRetirement.totalSv), color: isPkv ? CHART.positive : CHART.negative },
              ].map(k => (
                <div key={k.label} style={{ textAlign: 'right' }}>
                  <div style={{ color: t.sub, fontSize: '0.6rem', textTransform: 'uppercase' }}>{k.label}</div>
                  <div style={{ color: k.color, fontSize: '0.82rem', fontWeight: 700, fontFamily: 'monospace' }}>{k.value}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {netRetirement.perPolicy.map(p => {
              const total = netRetirement.totalBrutto || 1;
              const netPct = Math.round((p.netto / total) * 100);
              const stPct  = Math.round((p.steuer / total) * 100);
              const svPct  = Math.round((p.sv / total) * 100);
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                  <span style={{ color: t.text, fontSize: '0.78rem', fontWeight: 600, minWidth: 120 }}>{p.name}</span>
                  <div style={{ flex: 1, height: 8, borderRadius: 99, background: t.bdr, overflow: 'hidden', display: 'flex' }}>
                    <div style={{ width: netPct + '%', background: CHART.positive, height: '100%' }} title={'Netto: ' + euro(p.netto)} />
                    <div style={{ width: stPct + '%', background: CHART.negative, height: '100%' }} title={'Steuer: ' + euro(p.steuer)} />
                    {svPct > 0 && <div style={{ width: svPct + '%', background: CHART.warning, height: '100%' }} title={'SV: ' + euro(p.sv)} />}
                  </div>
                  <span style={{ color: CHART.positive, fontSize: '0.75rem', fontWeight: 700, fontFamily: 'monospace', minWidth: 80, textAlign: 'right' }}>
                    {euro(p.netto)}/M
                  </span>
                </div>
              );
            })}
          </div>
          {isPkv && (
            <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 8, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: CHART.positive, fontSize: '0.72rem', fontWeight: 600 }}>
                ✓ PKV-Vorteil: Keine SV-Abzüge auf Betriebsrente, DRV & AVD — Ersparnis: {euro(netRetirement.perPolicy.reduce((s, p) => s + (p.type === 'bav' || p.type === 'drv' || p.type === 'avd' ? p.brutto * 0.189 : 0), 0))}/Monat vs. GKV
              </span>
            </div>
          )}
          <div style={{ color: t.sub, fontSize: '0.6rem', marginTop: 6, fontStyle: 'italic' }}>
            Hinweis: Steuerberechnung basiert auf Schätzwerten. Die tatsächliche Steuerlast hängt vom Gesamteinkommen im Alter ab.
          </div>
        </div>
      )}

      {/* Chart + Comparison */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {/* Aggregated chart */}
        <div style={{ background: t.card, border: `1px solid ${t.bdr}`, borderRadius: 16, padding: 16 }}>
          <div style={{ color: t.sub, fontSize: '0.65rem', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
            Kapitalentwicklung Gesamt
          </div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
            {[{ color: CHART.neutral, label: 'Kapital gesamt' }, { color: CHART.warning, label: 'Einzahlungen' }].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: l.color }} />
                <span style={{ color: t.sub, fontSize: '0.72rem' }}>{l.label}</span>
              </div>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="gradKap" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART.neutral} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={CHART.neutral} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={t.grid} />
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: t.tickClr }} tickLine={false} axisLine={false}
                interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: t.tickClr }} tickLine={false} axisLine={false}
                tickFormatter={v => fmtShort(v)} width={48} />
              <Tooltip content={<ChartTooltip isDark={isDark} />} />
              <Area type="monotone" dataKey="kapital" name="Kapital gesamt"
                stroke={CHART.neutral} fill="url(#gradKap)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="einzahlungen" name="Einzahlungen ges."
                stroke={CHART.warning} strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Comparison bars */}
        <div style={{ background: t.card, border: `1px solid ${t.bdr}`, borderRadius: 16, padding: 16 }}>
          <div style={{ color: t.sub, fontSize: '0.65rem', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>
            Policen im Vergleich
          </div>
          {policies.map(pol => {
            const r = pol.result;
            const w = r ? Math.round((r.kapBeiRente || 0) / maxKap * 100) : 0;
            return (
              <div key={pol.id} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: pol.color, fontSize: '0.78rem', fontWeight: 600,
                    maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {pol.name}
                  </span>
                  <span style={{ color: t.text, fontSize: '0.78rem', fontFamily: 'monospace' }}>
                    {r ? euro(r.kapBeiRente) : '-'}
                  </span>
                </div>
                <div style={{ background: t.bdr, borderRadius: 99, height: 6, marginBottom: 3 }}>
                  <div style={{ width: w + '%', background: pol.color, height: '100%',
                    borderRadius: 99, transition: 'width 0.4s' }} />
                </div>
                <div style={{ color: t.sub, fontSize: '0.7rem' }}>
                  Rente (brutto): {r ? euro(r.possibleRente) : '-'}/M
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Policy list */}
      <div style={{ background: t.card, border: `1px solid ${t.bdr}`, borderRadius: 16, padding: 16 }}>
        <div style={{ color: t.sub, fontSize: '0.65rem', fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>
          Alle Policen
        </div>
        {policies.map(pol => {
          const r = pol.result;
          return (
            <div
              key={pol.id}
              onClick={() => onTabSwitch(pol.id)}
              style={{
                display: 'grid',
                gridTemplateColumns: '12px auto 1fr 1fr 1fr',
                alignItems: 'center', gap: 12,
                padding: '8px 4px', cursor: 'pointer',
                borderBottom: `1px solid ${t.bdr}22`,
              }}
              onMouseEnter={e => e.currentTarget.style.background = t.bdr + '33'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: pol.color, display: 'block' }} />
              <span style={{ color: t.text, fontSize: '0.82rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {pol.name}
                {pol.is_passive && (
                  <Chip size="small" label="Passiv" variant="outlined"
                    sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700 }}
                    title="Vertrag beitragsfrei gestellt" />
                )}
              </span>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: t.sub, fontSize: '0.62rem' }}>KAPITAL</div>
                <div style={{ color: t.text, fontSize: '0.78rem', fontFamily: 'monospace' }}>
                  {r ? euro(r.kapBeiRente) : '-'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: t.sub, fontSize: '0.62rem' }}>RENTE/M</div>
                <div style={{ color: CHART.positive, fontSize: '0.78rem', fontFamily: 'monospace' }}>
                  {r ? euro(r.possibleRente) : '-'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: t.sub, fontSize: '0.62rem' }}>FAKTOR</div>
                <div style={{ color: t.text, fontSize: '0.78rem', fontFamily: 'monospace' }}>
                  {r ? num(r.faktor) + 'x' : '-'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DepotSnapshotPanel — schlanker Snapshot-Manager für Depot-Typ-Policen.
// Nutzt dieselbe `policy_snapshots`-Tabelle wie Versicherungen, aber nur
// die zwei relevanten Felder: total_balance (= contract_value) und
// invested_capital (= total_contributions_paid).
//
// Steuerlogik: 26,375 % Abgeltungssteuer, reduziert um 30 % Teilfreistellung
// für Aktien-ETFs → effektiv 18,4625 % auf den Gewinn.
// ─────────────────────────────────────────────────────────────────────────────
const DEPOT_TAX_RATE = 0.26375 * 0.70; // 30 % Teilfreistellung

function DepotSnapshotPanel({ policyId, snapshots, onAdd, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(null); // null | { id?, ... }

  const sorted = useMemo(
    () => [...(snapshots ?? [])].sort((a, b) => new Date(b.snapshot_date) - new Date(a.snapshot_date)),
    [snapshots],
  );
  const latest = sorted[0] ?? null;

  const metrics = useMemo(() => {
    if (!latest) return null;
    const balance  = Number(latest.contract_value) || 0;
    const invested = Number(latest.total_contributions_paid) || 0;
    const gewinn   = balance - invested;
    const pct      = invested > 0 ? (gewinn / invested) * 100 : 0;
    const steuer   = gewinn > 0 ? gewinn * DEPOT_TAX_RATE : 0;
    return { balance, invested, gewinn, pct, steuer, netto: balance - steuer };
  }, [latest]);

  async function handleSave(form) {
    const payload = {
      snapshot_date:            form.snapshot_date,
      contract_value:           Number(form.total_balance),
      total_contributions_paid: Number(form.invested_capital),
      note:                     form.note ?? '',
    };
    if (form.id) await onUpdate(form.id, payload);
    else         await onAdd(policyId, payload);
    setEditing(null);
  }

  return (
    <Stack spacing={2}>
      {/* Performance-Card */}
      {metrics && (
        <Card elevation={2} sx={{ borderRadius: 1 }}>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1.5 }}>
              <Typography variant="caption" sx={{
                color: 'text.secondary', fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase',
              }}>
                Performance · Stand {new Date(latest.snapshot_date).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })}
              </Typography>
              <Chip
                size="small"
                label={metrics.gewinn >= 0 ? `+${metrics.pct.toFixed(2).replace('.', ',')} %` : `${metrics.pct.toFixed(2).replace('.', ',')} %`}
                color={metrics.gewinn >= 0 ? 'success' : 'error'}
                variant="outlined"
              />
            </Stack>
            <Box sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fill, minmax(188px, 1fr))' },
              gap: 1.5,
            }}>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Aktueller Wert
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: 'monospace' }}>
                  {Math.round(metrics.balance).toLocaleString('de-DE')} €
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Eingezahltes Kapital
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: 'monospace', color: 'text.secondary' }}>
                  {Math.round(metrics.invested).toLocaleString('de-DE')} €
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Gewinn / Verlust
                </Typography>
                <Typography variant="h5" sx={{
                  fontWeight: 800, fontFamily: 'monospace',
                  color: metrics.gewinn >= 0 ? 'success.main' : 'error.main',
                }}>
                  {metrics.gewinn >= 0 ? '+' : '−'} {Math.round(Math.abs(metrics.gewinn)).toLocaleString('de-DE')} €
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Netto n. Steuer
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: 'monospace', color: 'warning.main' }}>
                  {Math.round(metrics.netto).toLocaleString('de-DE')} €
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  abzgl. ~{Math.round(metrics.steuer).toLocaleString('de-DE')} € (18,46 %)
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Liste + Toolbar */}
      <Card elevation={2} sx={{ borderRadius: 1 }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
            <Typography variant="caption" sx={{
              color: 'text.secondary', fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>
              Depot-Snapshots ({sorted.length})
            </Typography>
            <Button
              size="small"
              variant="contained"
              onClick={() => setEditing({
                snapshot_date:    new Date().toISOString().split('T')[0],
                total_balance:    '',
                invested_capital: '',
                note:             '',
              })}
            >
              Neuer Snapshot
            </Button>
          </Stack>

          {sorted.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              Noch kein Snapshot. Der erste Snapshot legt den Startwert für die Projektion fest.
            </Typography>
          ) : (
            <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
              {sorted.map((s) => {
                const bal  = Number(s.contract_value) || 0;
                const inv  = Number(s.total_contributions_paid) || 0;
                const g    = bal - inv;
                const pct  = inv > 0 ? (g / inv) * 100 : 0;
                return (
                  <Stack
                    key={s.id}
                    direction="row"
                    alignItems="center"
                    sx={{ py: 1.25, gap: 1.5 }}
                  >
                    <Box sx={{ minWidth: 100 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {new Date(s.snapshot_date).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </Typography>
                    </Box>
                    <Box sx={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Wert</Typography>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                          {Math.round(bal).toLocaleString('de-DE')} €
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Eingezahlt</Typography>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                          {Math.round(inv).toLocaleString('de-DE')} €
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Performance</Typography>
                        <Typography variant="body2" sx={{
                          fontFamily: 'monospace', fontWeight: 600,
                          color: g >= 0 ? 'success.main' : 'error.main',
                        }}>
                          {g >= 0 ? '+' : '−'}{Math.round(Math.abs(g)).toLocaleString('de-DE')} €
                          {' · '}
                          {pct >= 0 ? '+' : ''}{pct.toFixed(1).replace('.', ',')} %
                        </Typography>
                      </Box>
                    </Box>
                    <Stack direction="row" spacing={0.5}>
                      <IconButton size="small" onClick={() => setEditing({
                        id:               s.id,
                        snapshot_date:    s.snapshot_date,
                        total_balance:    s.contract_value ?? '',
                        invested_capital: s.total_contributions_paid ?? '',
                        note:             s.note ?? '',
                      })}>
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => onDelete(s.id).catch(() => {})}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </Stack>
                );
              })}
            </Stack>
          )}
        </CardContent>
      </Card>

      {editing && (
        <DepotSnapshotDialog
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </Stack>
  );
}

function DepotSnapshotDialog({ initial, onClose, onSave }) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.snapshot_date) { setErr('Datum fehlt.'); return; }
    const bal = parseFloat(form.total_balance);
    const inv = parseFloat(form.invested_capital);
    if (isNaN(bal) || bal < 0) { setErr('Depotwert ungültig.'); return; }
    if (isNaN(inv) || inv < 0) { setErr('Eingezahltes Kapital ungültig.'); return; }
    setBusy(true); setErr('');
    try { await onSave(form); }
    catch (ex) { setErr(ex.message); }
    finally    { setBusy(false); }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth component="form" onSubmit={handleSubmit}>
      <DialogTitle>{form.id ? 'Snapshot bearbeiten' : 'Neuer Depot-Snapshot'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <DateField label="Stichtag" value={form.snapshot_date}
            onChange={(v) => setForm((f) => ({ ...f, snapshot_date: v }))} />
          <CurrencyField
            label="Was ist dein aktueller Depotstand?"
            value={form.total_balance}
            onChange={(v) => setForm((f) => ({ ...f, total_balance: v === '' ? '' : v }))}
            fullWidth
            helperText="Marktwert laut Bank am Stichtag"
          />
          <CurrencyField
            label="Wie viel hast du bis heute insgesamt eingezahlt?"
            value={form.invested_capital}
            onChange={(v) => setForm((f) => ({ ...f, invested_capital: v === '' ? '' : v }))}
            fullWidth
            helperText="Kumulierte Einzahlungen minus Entnahmen"
          />
          <TextField
            size="small"
            label="Notiz (optional)"
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            fullWidth
          />
          {err && <Alert severity="error">{err}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit" disabled={busy}>Abbrechen</Button>
        <Button type="submit" variant="contained" disabled={busy}>
          {busy ? 'Speichern…' : 'Speichern'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ETFRechnerPage({ isDark }) {
  const { policies, loading, addPolicy, updatePolicy, savePolicy, deletePolicy } = useETFPolicen();
  const { snapshots, addSnapshot, updateSnapshot, deleteSnapshot, getLatestForPolicy, getAllForPolicy } = usePolicySnapshots();

  const [localPolicies, setLocalPolicies] = useState([]);
  const [activeTab,     setActiveTab]     = useState('overview');
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [deleteTarget,  setDeleteTarget]  = useState(null);
  const [saveStatus,    setSaveStatus]    = useState('idle'); // 'idle'|'saving'|'saved'|'error'

  const debounceTimers = useRef({});

  // ── Sync DB → local state ──────────────────────────────────────────────────
  // Recompute when snapshots change too — Hybrid Tracking
  useEffect(() => {
    if (loading) return;
    setLocalPolicies(prev => {
      const prevMap = Object.fromEntries(prev.map(p => [p.id, p]));
      return policies.map(p => {
        const snap    = getLatestForPolicy(p.id);
        const history = getAllForPolicy(p.id);
        const existing = prevMap[p.id];
        // Recalculate when snapshot changed for this policy (date OR count)
        const sig = (snap?.snapshot_date || '') + '|' + history.length;
        if (existing && existing._snapSig === sig) return existing;
        return { ...p, result: runCalc(p.type, p.params, snap, history, p), _snapSig: sig };
      });
    });
  }, [policies, loading, snapshots, getLatestForPolicy, getAllForPolicy]);

  // ── Param change + debounced save ─────────────────────────────────────────
  const handleParamChange = useCallback((polId, newParams) => {
    setLocalPolicies(prev => prev.map(p => {
      if (p.id !== polId) return p;
      const snap    = getLatestForPolicy(polId);
      const history = getAllForPolicy(polId);
      return { ...p, params: newParams, result: runCalc(p.type, newParams, snap, history, p) };
    }));
    clearTimeout(debounceTimers.current[polId]);
    debounceTimers.current[polId] = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await savePolicy(polId, newParams);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } catch {
        setSaveStatus('error');
      }
    }, 2000);
  }, [savePolicy, getLatestForPolicy, getAllForPolicy]);

  // ── Rename ─────────────────────────────────────────────────────────────────
  const handleRename = useCallback((polId, name) => {
    setLocalPolicies(prev => prev.map(p => p.id !== polId ? p : { ...p, name }));
    updatePolicy(polId, { name }).catch(() => {});
  }, [updatePolicy]);

  // ── Spalten-Felder updaten (z.B. is_passive für bAV-Beitragsfrei-Stellung)
  // Im Gegensatz zu handleParamChange schreibt das nicht ins JSONB-`params`,
  // sondern direkt in eine Zeilen-Spalte. Lokal werden Recalc + Snapshot-
  // Signatur invalidiert, damit die Projektion sofort neu gerechnet wird.
  const handleUpdatePolicyMeta = useCallback((polId, patch) => {
    setLocalPolicies(prev => prev.map(p => {
      if (p.id !== polId) return p;
      const merged = { ...p, ...patch };
      const snap    = getLatestForPolicy(polId);
      const history = getAllForPolicy(polId);
      return {
        ...merged,
        result:    runCalc(merged.type, merged.params, snap, history, merged),
        _snapSig:  (snap?.snapshot_date || '') + '|' + history.length + '|' + JSON.stringify(patch),
      };
    }));
    updatePolicy(polId, patch).catch(() => {});
  }, [updatePolicy, getLatestForPolicy, getAllForPolicy]);

  // ── Add policy ─────────────────────────────────────────────────────────────
  async function handleAddPolicy(type) {
    setTypeModalOpen(false);
    try {
      const newRow = await addPolicy(type);
      const withResult = { ...newRow, result: runCalc(newRow.type, newRow.params, null, null, newRow) };
      setLocalPolicies(prev => [...prev, withResult]);
      setActiveTab(newRow.id);
    } catch (e) {
      console.error('Fehler beim Anlegen der Police:', e);
    }
  }

  // ── Delete policy ──────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget;
    setDeleteTarget(null);
    setLocalPolicies(prev => prev.filter(p => p.id !== id));
    if (activeTab === id) setActiveTab('overview');
    try { await deletePolicy(id); } catch (e) { console.error(e); }
  }

  const deleteTargetPol = localPolicies.find(p => p.id === deleteTarget);

  // ── Save status badge colors ────────────────────────────────────────────────
  const statusColor = { saving: CHART.warning, saved: CHART.positive, error: CHART.negative, idle: 'transparent' }[saveStatus];
  const statusText  = { saving: '↑ Speichert...', saved: '✓ Gespeichert', error: '✕ Fehler', idle: '' }[saveStatus];

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      {/* Header */}
      <PageHeader
        title="Ruhestandsplanung" icon="trending_up"
        subtitle="Rentenversicherung · AVD Depot · ETF-Depot · Betriebliche Altersvorsorge"
        actions={saveStatus !== 'idle' ? (
          <Typography sx={{ color: statusColor, fontSize: '0.78rem', fontWeight: 600 }}>
            {statusText}
          </Typography>
        ) : null}
      />

      {/* Tab bar */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2.5 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Tabs
            value={activeTab}
            onChange={(_, v) => setActiveTab(v)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ flex: 1, minHeight: 40 }}
          >
            <Tab
              value="overview"
              label="▪▪▪ Gesamtübersicht"
              sx={{ minHeight: 40, textTransform: 'none', fontWeight: 700 }}
            />
            {localPolicies.map(pol => (
              <Tab
                key={pol.id}
                value={pol.id}
                sx={{ minHeight: 40, textTransform: 'none', pr: 0.5 }}
                label={
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: pol.color }} />
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                      {TYPE_LABEL[pol.type]}
                    </Typography>
                    <Typography variant="body2" sx={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pol.name}
                    </Typography>
                    {pol.is_passive && (
                      <Chip
                        size="small"
                        label="Passiv"
                        color="default"
                        variant="outlined"
                        sx={{ height: 18, fontSize: '0.62rem', fontWeight: 700 }}
                        title="Vertrag beitragsfrei gestellt — keine weiteren Einzahlungen in der Projektion."
                      />
                    )}
                    {/* Close icon — must NOT be a real <button>, Tab itself is a button.
                        Span with role=button keeps the DOM valid and still handles clicks. */}
                    <Box
                      component="span"
                      role="button"
                      tabIndex={0}
                      aria-label="Police löschen"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(pol.id); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation();
                          setDeleteTarget(pol.id);
                        }
                      }}
                      sx={{
                        ml: 0.5,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        cursor: 'pointer',
                        color: 'text.secondary',
                        '&:hover': { bgcolor: 'action.hover', color: 'error.main' },
                      }}
                    >
                      <CloseIcon sx={{ fontSize: 14 }} />
                    </Box>
                  </Stack>
                }
              />
            ))}
          </Tabs>
          <Button
            onClick={() => setTypeModalOpen(true)}
            startIcon={<AddIcon />}
            variant="outlined"
            size="small"
            sx={{ borderStyle: 'dashed', flexShrink: 0 }}
          >
            Hinzufügen
          </Button>
        </Stack>
      </Box>

      {/* Panel content */}
      {loading ? (
        <Box sx={{ color: 'text.secondary', p: 5, textAlign: 'center' }}>Lade Policen...</Box>
      ) : activeTab === 'overview' ? (
        <OverviewPanel
          policies={localPolicies}
          onTabSwitch={setActiveTab}
          isDark={isDark}
        />
      ) : (() => {
        const pol = localPolicies.find(p => p.id === activeTab);
        if (!pol) return null;
        return (
          <PolicyPanel
            pol={pol}
            onParamChange={handleParamChange}
            onRename={handleRename}
            onUpdatePolicy={handleUpdatePolicyMeta}
            isDark={isDark}
            snapshots={getAllForPolicy(pol.id)}
            onAddSnapshot={addSnapshot}
            onUpdateSnapshot={updateSnapshot}
            onDeleteSnapshot={deleteSnapshot}
          />
        );
      })()}

      {/* Modals */}
      <TypeSelectorModal
        open={typeModalOpen}
        onClose={() => setTypeModalOpen(false)}
        onSelect={handleAddPolicy}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        title="Police löschen?"
        message={`„${deleteTargetPol?.name || ''}" wird unwiderruflich gelöscht.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Box>
  );
}
