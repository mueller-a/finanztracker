import React, { useState, useMemo, useEffect, useRef } from 'react';
import { savePkvProjection } from '../lib/pkvProjection';
import {
  MAX_AG_ZUSCHUSS, GKV_BBG_KV, GKV_BASIS_RATE,
  GKV_PV_RATE, GKV_PV_ZUSCHLAG,
  pvSatzByKinder, calcAgZuschuss,
  DEFAULT_GEHALT,
} from '../utils/salaryCalculations';
import { readSalaryNetto } from '../hooks/useSalarySettings';
import { useModules, calculateAge } from '../context/ModuleContext';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartTooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  Box, Stack, Typography, Tabs, Tab, Button, TextField,
  Slider, Tooltip as MuiTooltip, ToggleButton, ToggleButtonGroup,
  Alert, Link as MuiLink, Switch, InputAdornment, IconButton, Paper, Divider,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import LaunchIcon from '@mui/icons-material/Launch';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import dayjs from 'dayjs';
import 'dayjs/locale/de';
import { PageHeader, SectionCard, DateField } from '../components/mui';

// ─── Constants (SV-Werte aus salaryCalculations.js importiert) ────────────────
const CURRENT_YEAR = new Date().getFullYear();

// ─── Default state ────────────────────────────────────────────────────────────
const DEFAULT_TARIFE = [
  { id: 1, name: 'Krankenvollversicherung', amount: 520,  gz: true,  steuer: true,  steuerPct: 88.00, dropAtAge: null },
  { id: 2, name: 'Krankentagegeld',          amount: 45,   gz: false, steuer: false, steuerPct: 0,     dropAtAge: null },
  { id: 3, name: 'Pflegepflicht',            amount: 58,   gz: true,  steuer: true,  steuerPct: 100.0, dropAtAge: null },
  { id: 4, name: 'BEN',                      amount: 0,    gz: false, steuer: false, steuerPct: 0,     dropAtAge: null },
];

// Defaults für neu angelegte Tarife: alle Toggles auf "Nein" (false).
const NEW_TARIF_DEFAULTS = { name: 'Neuer Tarif', amount: 0, gz: false, steuer: false, steuerPct: 0, dropAtAge: null };
const DEFAULT_SENKUNGEN = [
  { id: 1, name: 'BEN-Rückerstattung', amount: 530, fromAge: 65 },
];
const DEFAULT_PKV = {
  insurer:          'HanseMerkur',
  startDate:        '2010-01-01',
  birthdate:        '1981-03-15',
  currentAge:       45,
  maxAge:           85,
  growthRate:       5,
  taxRateWork:      42,
  taxRateRetire:    26,
  inflationRate:    2,
  employmentStatus: 'angestellt',
  rzActive:         true,
  rzFromAge:        67,
  rzRente:          1800,
  tarife:           DEFAULT_TARIFE,
  senkungen:        DEFAULT_SENKUNGEN,
  yearOverrides:    {},
  brkAmounts:       {},
  freeMonths:       {},
  manualOverrides:  {},
};
const DEFAULT_GKV = {
  gkvGehaltsRate:  2,
  gkvBeitragsRate: 2,
};

// ─── Pure calculation functions (pvSatzByKinder, calcAgZuschuss → salaryCalculations.js) ──

function getEffectiveTarife(yearOverrides, baseTarife, year, startYear) {
  for (let y = year; y >= startYear; y--) {
    if (yearOverrides[y]) return yearOverrides[y];
  }
  return baseTarife;
}

// Brutto-PKV-Beitrag pro Monat:  Σ(Tarif × (1+GZ)) − Senkungen.
// Zuschüsse (AG bzw. KVdR) werden NICHT hier abgezogen, damit sie außen
// separat ausgewiesen werden können — analog zum Arbeitgeber-Zuschuss.
function getMonthlyAtAgeFor(age, gf, yTarife, senkungen) {
  // §149 VAG: Gesetzlicher Zuschlag (10 %) wird bis zum vollendeten 60. Lebensjahr
  // erhoben — d.h. ab Alter 60 entfällt er.
  const gzActive = age < 60;
  let total = 0;
  yTarife.forEach((t) => {
    if (t.dropAtAge !== null && age >= t.dropAtAge) return;
    const net = t.amount * gf;
    const gzFactor = (t.gz && gzActive) ? 1.10 : 1.0;
    total += net * gzFactor;
  });
  senkungen.forEach((s) => {
    if (age >= s.fromAge) total = Math.max(0, total - s.amount);
  });
  return Math.max(0, total);
}

function getRentenzuschuss(age, pkvMonthly, rzActive, rzFromAge, rzRente) {
  if (!rzActive) return 0;
  if (age < rzFromAge) return 0;
  const zuschuss    = rzRente * 0.0875;
  const maxZuschuss = pkvMonthly * 0.5;
  return Math.min(zuschuss, maxZuschuss);
}

function getGzMonthlyFor(age, gf, yTarife) {
  if (age >= 60) return 0;
  let gz = 0;
  yTarife.forEach((t) => {
    if (!t.gz) return;
    if (t.dropAtAge !== null && age >= t.dropAtAge) return;
    const net = t.amount * gf;
    gz += net * 0.10;
  });
  return gz;
}

function getSteuerBasisMonthlyFor(age, gf, yTarife) {
  const gzActive = age < 60;
  let total = 0;
  yTarife.forEach((t) => {
    if (t.dropAtAge !== null && age >= t.dropAtAge) return;
    const net = t.amount * gf;
    if (t.steuer && t.steuerPct > 0) {
      total += net * (t.steuerPct / 100);
    }
    if (t.gz && gzActive) {
      total += net * 0.10;
    }
  });
  return total;
}

function calcPkvData(pkv) {
  const {
    startDate, birthdate, currentAge, maxAge, growthRate, taxRateWork, taxRateRetire,
    employmentStatus, rzActive, rzFromAge, rzRente, tarife, senkungen,
    yearOverrides, brkAmounts, freeMonths, manualOverrides,
  } = pkv;

  const startDateVal  = startDate ? new Date(startDate) : null;
  const startYear     = startDateVal ? startDateVal.getFullYear() : CURRENT_YEAR;
  const startMonths   = startDateVal ? (12 - startDateVal.getMonth()) : 12;
  const todayYear     = CURRENT_YEAR;
  const birthYear     = birthdate ? new Date(birthdate).getFullYear() : (todayYear - currentAge);
  const startAge      = startYear - birthYear;
  const growthRateDec = growthRate / 100;
  const taxWorkDec    = taxRateWork / 100;
  const taxRetireDec  = taxRateRetire / 100;
  const years         = maxAge - startAge + 1;
  if (years <= 0) return [];

  const data = [];
  let cumulative      = 0;
  let cumulativeEigen = 0;
  let cumTaxSaving    = 0;

  for (let i = 0; i < years; i++) {
    const year = startYear + i;
    const age  = startAge + i;
    const gf   = Math.pow(1 + growthRateDec, i);

    const yTarife = getEffectiveTarife(yearOverrides, tarife, year, startYear);
    const hasYearOverride = !!yearOverrides[year];

    let monthly;
    if (manualOverrides[year] !== undefined) {
      // manualOverrides enthalten den Brutto-PKV-Beitrag (vor AG- und KVdR-Zuschuss).
      monthly = manualOverrides[year];
    } else {
      monthly = getMonthlyAtAgeFor(age, gf, yTarife, senkungen);
    }

    const gzActive  = age < 60;
    const gzScaled  = getGzMonthlyFor(age, gf, yTarife);
    const steuerMonthly = getSteuerBasisMonthlyFor(age, gf, yTarife);
    const activeTaxRate = age >= rzFromAge ? taxRetireDec : taxWorkDec;

    const baseMonths   = (i === 0) ? startMonths : 12;
    const freeMo       = Math.min(freeMonths[year] || 0, baseMonths);
    const monthsInYear = Math.max(0, baseMonths - freeMo);

    const annual     = monthly * monthsInYear;
    const taxDed     = steuerMonthly * monthsInYear * activeTaxRate;
    cumulative      += annual;
    cumTaxSaving    += taxDed;

    // Zuschüsse — AG (Arbeitsphase) bzw. KVdR (Rentenphase). Greifen nie
    // gleichzeitig: AG gilt nur `age < rzFromAge`, KVdR nur `age >= rzFromAge`.
    const agZuschuss = (employmentStatus === 'angestellt' && age < rzFromAge)
      ? Math.min(monthly * 0.5, MAX_AG_ZUSCHUSS)
      : 0;
    const rzBd = getRentenzuschuss(age, monthly, rzActive, rzFromAge, rzRente);
    const nettoMonthly = Math.max(0, monthly - agZuschuss - rzBd);
    const annualEigen  = nettoMonthly * monthsInYear;
    cumulativeEigen   += annualEigen;

    // Breakdown for tooltip
    const breakdown = [];
    let gzTotalBd = 0;
    yTarife.forEach((t) => {
      if (t.dropAtAge !== null && age >= t.dropAtAge) return;
      const net = t.amount * gf;
      breakdown.push({ name: t.name, amount: net });
      if (t.gz && gzActive) gzTotalBd += net * 0.10;
    });

    const prevMonthly = i > 0 ? data[i - 1].monthly : null;
    const changePct   = prevMonthly !== null ? ((monthly - prevMonthly) / prevMonthly) * 100 : null;
    const brkYear     = brkAmounts[year] || 0;

    data.push({
      year, age, monthly, annual, changePct,
      isStartYear: i === 0, startMonths: i === 0 ? startMonths : 12,
      monthsInYear, freeMonthsVal: freeMo,
      gz: gzScaled, gzActive,
      taxDeduction: taxDed, steuerMonthly,
      cumulative, cumulativeEigen, cumTaxSaving,
      annualEigen,
      brkYear, gzTotalBd, gf,
      isFuture:    year > todayYear,
      isCurrent:   year === todayYear,
      isPast:      year < todayYear,
      hasOverride: manualOverrides[year] !== undefined,
      hasYearOverride,
      activeTaxRate, agZuschuss, nettoMonthly,
      gesamtbeitragMtl: monthly,
      eigenanteilMtl:   nettoMonthly,
      rzBd, breakdown,
    });
  }
  return data;
}

// calcLohnsteuer2025 → imported from salaryCalculations.js

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmt(v, d = 0) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' €';
}
function fmtPct(v) {
  if (v === null) return '—';
  return (v > 0 ? '+' : '') + v.toFixed(2) + ' %';
}

// ─── Reusable UI helpers ──────────────────────────────────────────────────────
function SliderField({ label, min, max, step, value, onChange, suffix = '', sub }) {
  return (
    <Box sx={{ mb: 1.75 }}>
      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Typography variant="caption" sx={{
          color: 'text.secondary', fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          {label}
        </Typography>
        <Typography variant="caption" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
          {value}{suffix}
        </Typography>
      </Stack>
      <Slider
        value={value}
        min={min}
        max={max}
        step={step}
        size="small"
        onChange={(_, v) => onChange(Number(v))}
        sx={{ py: 1 }}
      />
      {sub && <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>{sub}</Typography>}
    </Box>
  );
}

function SectionLabel({ children }) {
  return (
    <Typography variant="overline" sx={{
      display: 'block',
      color: 'text.secondary',
      fontWeight: 700,
      letterSpacing: '0.1em',
      mb: 1,
      mt: 2.5,
    }}>
      {children}
    </Typography>
  );
}

// Local KpiCard mit free-form `color` (unter den 6 Brand-Farben gemappt
// auf das Theme würde detail verlieren). Akzentstreifen links.
function KpiCard({ label, value, sub, color = '#7c3aed' }) {
  return (
    <Box sx={(theme) => ({
      backgroundColor: 'background.paper',
      borderTop: `1px solid ${theme.palette.divider}`,
      borderRight: `1px solid ${theme.palette.divider}`,
      borderBottom: `1px solid ${theme.palette.divider}`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 1.5,
      p: '14px 16px',
      minWidth: 0,
    })}>
      <Typography variant="caption" sx={{
        display: 'block', color: 'text.secondary', fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.07em', mb: 0.75,
      }}>
        {label}
      </Typography>
      <Typography variant="subtitle1" sx={{ color, fontWeight: 700, fontFamily: 'monospace', mb: 0.5 }}>
        {value}
      </Typography>
      {sub && (
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
          {sub}
        </Typography>
      )}
    </Box>
  );
}

// ─── Chart components ─────────────────────────────────────────────────────────
// Zeigt zwei Serien gleichzeitig:
//   - "Gesamtbeitrag" (Brutto-PKV-Beitrag, gold)
//   - "Eigenanteil"   (Cashflow nach AG-/KVdR-Zuschuss, grün)
// Im "Kumuliert"-Modus zwei Linien, sonst gruppierte Bars.
function PkvLineChart({ data, mode, showInflation, inflationRate, isDark }) {
  const chartData = useMemo(() => {
    const todayYear = CURRENT_YEAR;
    return data.map((d) => {
      let brutto, eigen;
      if (mode === 'monthly') {
        brutto = d.gesamtbeitragMtl;
        eigen  = d.eigenanteilMtl;
      } else if (mode === 'annual') {
        brutto = d.annual;
        eigen  = d.annualEigen;
      } else {
        brutto = d.cumulative;
        eigen  = d.cumulativeEigen;
      }
      if (showInflation && d.isFuture && inflationRate > 0) {
        const f = Math.pow(1 + inflationRate / 100, d.year - todayYear);
        brutto /= f;
        eigen  /= f;
      }
      return {
        year:   d.year,
        brutto: Math.round(brutto * 100) / 100,
        eigen:  Math.round(eigen  * 100) / 100,
        isFuture: d.isFuture,
      };
    });
  }, [data, mode, showInflation, inflationRate]);

  const colorBrutto = '#e8b84b'; // Gold — konsistent zur "Gesamtbeitrag"-Spalte in der Tabelle
  const colorEigen  = '#10b981'; // Grün — konsistent zur "Eigenanteil"-Spalte
  const sub         = isDark ? '#a5a0c8' : '#6d6a8a';
  const tickFormat  = (v) => mode === 'cumulative' ? (v / 1000).toFixed(0) + 'k €' : v + ' €';
  const seriesLabel = (k) => k === 'brutto' ? 'Gesamtbeitrag' : 'Eigenanteil';

  return (
    <ResponsiveContainer width="100%" height={260}>
      {mode === 'cumulative' ? (
        <LineChart data={chartData} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'} />
          <XAxis dataKey="year" tick={{ fill: sub, fontSize: 10 }} />
          <YAxis tick={{ fill: sub, fontSize: 10 }} tickFormatter={tickFormat} />
          <RechartTooltip
            formatter={(v, k) => [fmt(v, 2), seriesLabel(k)]}
            contentStyle={{ background: isDark ? '#1a1744' : '#fff', border: `1px solid ${isDark ? '#2d2a5e' : '#e8e4f8'}`, borderRadius: 8, fontSize: 12 }}
          />
          <Legend formatter={seriesLabel} wrapperStyle={{ fontSize: 11, paddingTop: 4, color: sub }} iconType="circle" iconSize={8} />
          <Line type="monotone" dataKey="brutto" stroke={colorBrutto} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="eigen"  stroke={colorEigen}  strokeWidth={2} dot={false} />
        </LineChart>
      ) : (
        <BarChart data={chartData} margin={{ top: 4, right: 12, bottom: 0, left: 0 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'} />
          <XAxis dataKey="year" tick={{ fill: sub, fontSize: 10 }} />
          <YAxis tick={{ fill: sub, fontSize: 10 }} tickFormatter={tickFormat} />
          <RechartTooltip
            formatter={(v, k) => [fmt(v, 2), seriesLabel(k)]}
            contentStyle={{ background: isDark ? '#1a1744' : '#fff', border: `1px solid ${isDark ? '#2d2a5e' : '#e8e4f8'}`, borderRadius: 8, fontSize: 12 }}
            cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}
          />
          <Legend formatter={seriesLabel} wrapperStyle={{ fontSize: 11, paddingTop: 4, color: sub }} iconType="square" iconSize={10} />
          <Bar dataKey="brutto" fill={colorBrutto} radius={[2, 2, 0, 0]} />
          <Bar dataKey="eigen"  fill={colorEigen}  radius={[2, 2, 0, 0]} />
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function PkvCalculatorPage({ isDark = false }) {
  const { birthday: globalBirthday } = useModules();

  // ── PKV state ──
  const [pkv, setPkv] = useState(DEFAULT_PKV);
  const [gkv, setGkv] = useState(DEFAULT_GKV);
  // gh: salary params used by GKV-Tab comparison (read from standalone Gehaltsrechner)
  const [gh,  setGh]  = useState(() => {
    const saved = readSalaryNetto();
    return saved?.params ? { ...DEFAULT_GEHALT, ...saved.params } : DEFAULT_GEHALT;
  });

  // ── UI state ──
  const [globalTab, setGlobalTab] = useState('pkv');  // 'pkv' | 'gkv'
  const [chartMode, setChartMode] = useState('monthly');
  const [showInflation, setShowInflation] = useState(false);
  const [nextTarifId, setNextTarifId] = useState(5);
  const [nextSenkungId, setNextSenkungId] = useState(2);
  const [expandedYear, setExpandedYear] = useState(null);

  const lsDraftTimer = useRef(null);

  // ── Sync global birthday → pkv state ────────────────────────────────────────
  useEffect(() => {
    if (!globalBirthday) return;
    const age = calculateAge(globalBirthday);
    if (age != null) {
      setPkv(prev => ({ ...prev, birthdate: globalBirthday, currentAge: age }));
    }
  }, [globalBirthday]);

  // ── Restore localStorage draft on first mount ──────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem('pkv_draft');
      if (!raw) return;
      const state = JSON.parse(raw);
      if (state?.version !== 1) return;
      const { gkv: savedGkv, gh: _savedGh, birthdate: _bd, currentAge: _age, ...savedPkv } = state;
      setPkv(prev => ({ ...DEFAULT_PKV, ...savedPkv, birthdate: prev.birthdate, currentAge: prev.currentAge }));
      if (savedGkv) setGkv({ ...DEFAULT_GKV, ...savedGkv });
      if (savedPkv.tarife?.length)    setNextTarifId(Math.max(...savedPkv.tarife.map((t) => t.id)) + 1);
      if (savedPkv.senkungen?.length) setNextSenkungId(Math.max(...savedPkv.senkungen.map((s) => s.id)) + 1);
    } catch {}
  }, []);  // eslint-disable-line

  // ── Auto-save to localStorage on every change (debounced 600ms) ───────────
  useEffect(() => {
    clearTimeout(lsDraftTimer.current);
    lsDraftTimer.current = setTimeout(() => {
      try {
        const { birthdate: _bd, currentAge: _age, ...pkvToSave } = pkv;
        localStorage.setItem('pkv_draft', JSON.stringify({
          version: 1, savedAt: new Date().toISOString(), ...pkvToSave, gkv,
        }));
      } catch {}
      // ── PKV projection for Ruhestandsplanung ──────────────────────────────
      // Netto-PKV-Beitrag bei Rentenbeginn = Brutto-Beitrag minus KVdR-Zuschuss.
      // (AG-Zuschuss entfällt im Rentenalter ohnehin.)
      try {
        const yearsToRente    = Math.max(0, (pkv.rzFromAge || 67) - (pkv.currentAge || 45));
        const gfAtRente       = Math.pow(1 + (pkv.growthRate || 5) / 100, yearsToRente);
        const retirementYear  = CURRENT_YEAR + yearsToRente;
        const yTarifeAtRente  = getEffectiveTarife(pkv.yearOverrides, pkv.tarife, retirementYear, CURRENT_YEAR);
        const atAge           = pkv.rzFromAge || 67;
        const bruttoMonatlich = getMonthlyAtAgeFor(atAge, gfAtRente, yTarifeAtRente, pkv.senkungen);
        const rzAtRente       = getRentenzuschuss(atAge, bruttoMonatlich, pkv.rzActive, atAge, pkv.rzRente || 0);
        const nettoMonatlich  = Math.max(0, bruttoMonatlich - rzAtRente);
        savePkvProjection({
          nettoMonatlich: Math.round(nettoMonatlich * 100) / 100,
          rzRente:        pkv.rzRente || 0,
          atAge:          pkv.rzFromAge || 67,
          savedAt:        new Date().toISOString(),
        });
      } catch {}
    }, 600);
    return () => clearTimeout(lsDraftTimer.current);
  }, [pkv, gkv]);

  // ── Styling tokens (Theme-Shim, vermeidet hardcoded Hex) ──
  const theme   = useTheme();
  const card    = theme.palette.background.paper;
  const bdr     = theme.palette.divider;
  const text    = theme.palette.text.primary;
  const sub     = theme.palette.text.secondary;
  const muted   = theme.palette.text.disabled;
  const accent  = theme.palette.primary.main;

  // ── Calculations ──
  const pkvData = useMemo(() => calcPkvData(pkv), [pkv]);
  const currentYearData = useMemo(() => pkvData.find((d) => d.isCurrent) ?? pkvData[0], [pkvData]);
  const lastYearData    = pkvData[pkvData.length - 1];

  const gkvProjection = useMemo(() => {
    if (!pkvData.length) return [];
    const { gkvGehaltsRate, gkvBeitragsRate } = gkv;
    const { ghBrutto: brutto0, ghGkvZusatz: zusatz, ghKinder: kinder } = gh;
    const pvRate  = pvSatzByKinder(kinder);
    const gRate   = gkvGehaltsRate  / 100;
    const bRate   = gkvBeitragsRate / 100;
    const rows    = [];
    let gkvCum = 0, pkvCum = 0;
    for (let i = 0; i < pkvData.length; i++) {
      const d = pkvData[i];
      if (d.age >= pkv.rzFromAge) break;
      const gf      = Math.pow(1 + gRate, i);
      const brutto  = brutto0 * gf;
      const svBase  = Math.min(brutto, GKV_BBG_KV);
      const kv      = svBase * (GKV_BASIS_RATE + zusatz / 200);
      const pv      = svBase * pvRate;
      const gkvMult = Math.pow(1 + bRate, i);
      const gkvMo   = (kv + pv) * gkvMult;
      const ag      = calcAgZuschuss(d.monthly, brutto, zusatz);
      const pkvNetto = d.monthly - ag;
      gkvCum += gkvMo   * (d.monthsInYear || 12);
      pkvCum += pkvNetto * (d.monthsInYear || 12);
      rows.push({ year: d.year, age: d.age, brutto, gkvMo, pkvBrutto: d.monthly, agMo: ag, pkvNetto, gkvCum, pkvCum, vorteil: gkvCum - pkvCum, isCurrent: d.isCurrent, isFuture: d.isFuture });
    }
    return rows;
  }, [pkvData, gkv, gh, pkv.rzFromAge]);

  // ── Handlers ──
  function updatePkv(patch) { setPkv((p) => ({ ...p, ...patch })); }
  function updateGkv(patch) { setGkv((p) => ({ ...p, ...patch })); }
  function addTarif() {
    const id = nextTarifId;
    setNextTarifId((n) => n + 1);
    updatePkv({ tarife: [...pkv.tarife, { id, ...NEW_TARIF_DEFAULTS }] });
  }
  function removeTarif(id) {
    if (pkv.tarife.length <= 1) return;
    updatePkv({ tarife: pkv.tarife.filter((t) => t.id !== id) });
  }
  function updateTarif(id, field, val) {
    updatePkv({ tarife: pkv.tarife.map((t) => t.id !== id ? t : { ...t, [field]: val }) });
  }
  function updateTarifSteuer(id, checked) {
    updatePkv({ tarife: pkv.tarife.map((t) => t.id !== id ? t : { ...t, steuer: checked, steuerPct: checked ? (t.steuerPct || 88) : 0 }) });
  }

  function addSenkung() {
    const id = nextSenkungId;
    setNextSenkungId((n) => n + 1);
    updatePkv({ senkungen: [...pkv.senkungen, { id, name: 'Neue Senkung', amount: 0, fromAge: 65 }] });
  }
  function removeSenkung(id) {
    updatePkv({ senkungen: pkv.senkungen.filter((s) => s.id !== id) });
  }
  function updateSenkung(id, field, val) {
    updatePkv({ senkungen: pkv.senkungen.map((s) => s.id !== id ? s : { ...s, [field]: val }) });
  }

  function setBrkAmount(year, amount) {
    const next = { ...pkv.brkAmounts };
    if (amount > 0) next[year] = amount; else delete next[year];
    updatePkv({ brkAmounts: next });
  }
  function setFreeMonths(year, months) {
    const m = Math.min(6, Math.max(0, months));
    const next = { ...pkv.freeMonths };
    if (m > 0) next[year] = m; else delete next[year];
    updatePkv({ freeMonths: next });
  }

  // ── Budget export ──
  async function exportToBudget() {
    if (!currentYearData) return;
    const { supabase } = await import('../lib/supabaseClient');
    const monthlyNet = currentYearData.eigenanteilMtl;
    await supabase.from('custom_budget_items').insert({
      month: new Date().getMonth() + 1,
      year:  new Date().getFullYear(),
      label: `PKV – ${pkv.insurer || 'Beitrag'} (Eigenanteil)`,
      amount: Math.round(monthlyNet * 100) / 100,
      share_percent: 100,
      type: 'expense',
      source: 'insurance',
      source_id: null,
      note: `PKV-Rechner Export · ${pkv.employmentStatus === 'angestellt' ? 'nach AG-Zuschuss' : 'Selbstständig'}`,
      category: 'versicherung',
      sort_order: 999,
    });
    alert(`${fmt(monthlyNet, 2)}/Monat wurde zum Budget ${new Date().getMonth() + 1}/${new Date().getFullYear()} hinzugefügt.`);
  }

  // ── KPIs ──
  const kpis = useMemo(() => {
    if (!pkvData.length) return {};
    const first = pkvData[0];
    const last  = pkvData[pkvData.length - 1];
    const totalTax = pkvData.reduce((s, d) => s + d.taxDeduction, 0);
    const totalBrk = pkvData.reduce((s, d) => s + d.brkYear, 0);
    const brkCount = pkvData.filter((d) => d.brkYear > 0).length;
    const renteD   = pkvData.find((d) => d.age >= pkv.rzFromAge) ?? last;
    const anstieg  = first.monthly > 0 ? ((last.monthly - first.monthly) / first.monthly) * 100 : 0;
    return { first, last, totalTax, totalBrk, brkCount, renteD, anstieg };
  }, [pkvData, pkv.rzFromAge]);

  // ── Sidebar ──
  function PkvSidebar() {
    return (
      <Stack sx={{ minWidth: 280, maxWidth: 300 }}>
        {/* Persönliche Daten */}
        <SectionLabel>Persönliche Daten</SectionLabel>
        <SectionCard sx={{ mb: 1.5 }} contentSx={{ pt: 2 }}>
          <Stack spacing={1.75}>
            <TextField
              label="Versicherer" size="small" fullWidth
              value={pkv.insurer}
              onChange={(e) => updatePkv({ insurer: e.target.value })}
              placeholder="Name der PKV"
            />

            <DateField
              label="Versicherungsbeginn"
              value={pkv.startDate}
              onChange={(v) => updatePkv({ startDate: v })}
            />

            <Box>
              <Typography variant="caption" sx={{
                color: 'text.secondary', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.06em',
                display: 'block', mb: 0.5,
              }}>
                Geburtsdatum
              </Typography>
              {pkv.birthdate ? (
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  sx={(theme) => ({
                    backgroundColor: theme.palette.background.default,
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1.25,
                    px: 1.5,
                    py: 1,
                  })}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {dayjs(pkv.birthdate).format('DD.MM.YYYY')}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 700 }}>
                    {pkv.currentAge} Jahre
                  </Typography>
                </Stack>
              ) : (
                <Alert severity="warning" variant="outlined" sx={{ py: 0.5, fontSize: '0.78rem' }}>
                  Bitte in den{' '}
                  <MuiLink href="/settings" sx={{ fontWeight: 700 }}>Einstellungen</MuiLink>
                  {' '}ergänzen.
                </Alert>
              )}
            </Box>

            <SliderField label="Erwartetes Lebensalter" min={60} max={110} step={1} value={pkv.maxAge} onChange={(v) => updatePkv({ maxAge: v })} />
          </Stack>
        </SectionCard>

        {/* Tarife */}
        <SectionLabel isDark={isDark}>Tarife · Startjahr</SectionLabel>
        <Paper variant="outlined" sx={{ borderRadius: 2, p: 2, mb: 1.5 }}>
          <Alert
            severity="info"
            variant="outlined"
            sx={{ mb: 1.5, py: 0.5, fontSize: '0.7rem', '& .MuiAlert-message': { py: 0.5 } }}
            icon={false}
          >
            <strong>GZ</strong> = Gesetzl. Zuschlag (10% auf GZ-pflichtige Tarife, bis Alter 60).<br/>
            <strong>Basis</strong> = Steuerlich absetzbarer Anteil.
          </Alert>

          <Stack spacing={1.5}>
            {pkv.tarife.map((t) => (
              <Paper
                key={t.id}
                variant="outlined"
                sx={{
                  borderRadius: 2,
                  p: 1.5,
                  bgcolor: 'action.hover',
                }}
              >
                {/* Header: Tarifname (eigene Zeile) → Beitrag + Entfernen (eigene Zeile) */}
                <Stack spacing={1} sx={{ mb: 1 }}>
                  <TextField
                    size="small"
                    fullWidth
                    label="Tarifname"
                    value={t.name}
                    onChange={(e) => updateTarif(t.id, 'name', e.target.value)}
                    placeholder="z.B. Krankenvollversicherung"
                  />
                  <Stack direction="row" spacing={1} alignItems="center">
                    <TextField
                      size="small"
                      fullWidth
                      type="number"
                      label="Beitrag"
                      value={t.amount}
                      onChange={(e) => updateTarif(t.id, 'amount', parseFloat(e.target.value) || 0)}
                      inputProps={{ min: 0, step: 0.01, style: { textAlign: 'right' } }}
                      InputProps={{
                        endAdornment: <InputAdornment position="end">€</InputAdornment>,
                      }}
                    />
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => removeTarif(t.id)}
                      title="Tarif entfernen"
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </Stack>

                <Divider sx={{ my: 1 }} />

                {/* Option: GZ-pflichtig */}
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ py: 0.5 }}>
                  <Stack>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>GZ-pflichtig</Typography>
                    <Typography variant="caption" color="text.secondary">
                      10 % Gesetzl. Zuschlag bis Alter 59
                    </Typography>
                  </Stack>
                  <Switch
                    checked={!!t.gz}
                    onChange={(e) => updateTarif(t.id, 'gz', e.target.checked)}
                    inputProps={{ 'aria-label': 'GZ-pflichtig' }}
                  />
                </Stack>

                {/* Option: Basisabsicherung */}
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ py: 0.5 }}>
                  <Stack>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Basisabsicherung</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Steuerlich absetzbarer Tarif (§ 10 EStG)
                    </Typography>
                  </Stack>
                  <Switch
                    checked={!!t.steuer}
                    onChange={(e) => updateTarifSteuer(t.id, e.target.checked)}
                    inputProps={{ 'aria-label': 'Basisabsicherung' }}
                  />
                </Stack>

                {/* Dynamisch: steuerl. Absetzbar — nur sichtbar, wenn Basisabsicherung aktiv */}
                {t.steuer && (
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ py: 0.5, pl: 2 }}>
                    <Typography variant="body2" color="text.secondary">steuerl. Absetzbar</Typography>
                    <TextField
                      size="small"
                      type="number"
                      value={t.steuerPct}
                      onChange={(e) => updateTarif(t.id, 'steuerPct', Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                      inputProps={{ min: 0, max: 100, step: 0.01, style: { textAlign: 'right' } }}
                      InputProps={{
                        endAdornment: <InputAdornment position="end">%</InputAdornment>,
                      }}
                      sx={{ width: 140 }}
                    />
                  </Stack>
                )}

                <Divider sx={{ my: 1 }} />

                {/* Option: Tarif entfällt ab — eigene Zeile mit Jahre-Feld */}
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ py: 0.5 }}>
                  <Stack>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Tarif entfällt ab</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Ab einem bestimmten Alter wird dieser Tarif nicht mehr berücksichtigt
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={1} alignItems="center">
                    {t.dropAtAge !== null && (
                      <TextField
                        size="small"
                        type="number"
                        value={t.dropAtAge}
                        onChange={(e) => updateTarif(t.id, 'dropAtAge', parseInt(e.target.value, 10) || 0)}
                        inputProps={{ min: 18, max: 110, style: { textAlign: 'right' } }}
                        InputProps={{
                          endAdornment: <InputAdornment position="end">Jahre</InputAdornment>,
                        }}
                        sx={{ width: 120 }}
                      />
                    )}
                    <Switch
                      checked={t.dropAtAge !== null}
                      onChange={(e) => updateTarif(t.id, 'dropAtAge', e.target.checked ? 62 : null)}
                      inputProps={{ 'aria-label': 'Tarif entfällt ab' }}
                    />
                  </Stack>
                </Stack>
              </Paper>
            ))}
          </Stack>

          <Button
            onClick={addTarif}
            variant="outlined"
            startIcon={<AddIcon />}
            fullWidth
            sx={{
              mt: 1.5,
              textTransform: 'none',
              borderStyle: 'dashed',
            }}
          >
            Tarif hinzufügen
          </Button>
        </Paper>

        {/* Prognose */}
        <SectionLabel isDark={isDark}>Prognose</SectionLabel>
        <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <SliderField label="Jährl. Beitragssteigerung" min={0} max={20} step={0.5} value={pkv.growthRate} onChange={(v) => updatePkv({ growthRate: v })} suffix="%" isDark={isDark} />
          <SliderField label="Steuersatz bis Renteneintritt" min={0} max={55} step={1} value={pkv.taxRateWork} onChange={(v) => updatePkv({ taxRateWork: v })} suffix="%" isDark={isDark} />
          <SliderField label="Steuersatz ab Renteneintritt" min={0} max={55} step={1} value={pkv.taxRateRetire} onChange={(v) => updatePkv({ taxRateRetire: v })} suffix="%" isDark={isDark} />
          <SliderField label="Inflation p.a." min={0} max={10} step={0.5} value={pkv.inflationRate} onChange={(v) => updatePkv({ inflationRate: v })} suffix="%" isDark={isDark} />
        </div>

        {/* Berufsstatus */}
        <SectionLabel isDark={isDark}>Berufsstatus</SectionLabel>
        <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 16 }}>
            {['angestellt', 'selbststaendig'].map((v) => (
              <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: text, cursor: 'pointer' }}>
                <input type="radio" name="empStatus" value={v} checked={pkv.employmentStatus === v} onChange={() => updatePkv({ employmentStatus: v })} />
                {v === 'angestellt' ? 'Angestellt' : 'Selbstständig'}
              </label>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: '0.68rem', color: muted, lineHeight: 1.6 }}>
            {pkv.employmentStatus === 'angestellt' ? 'AG übernimmt 50% des Beitrags, max. 613,22 €/Monat (§ 257 SGB V).' : 'Selbstständige tragen 100% selbst.'}
          </div>
        </div>

        {/* Beitragssenkungen */}
        <SectionLabel isDark={isDark}>Beitragssenkungen</SectionLabel>
        <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: '0.68rem', color: muted, marginBottom: 10, lineHeight: 1.6 }}>
            Mtl. Beträge die ab einem Alter abgezogen werden (z.B. BEN-Rückerstattung).
          </div>
          {pkv.senkungen.map((s) => (
            <div key={s.id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              <input value={s.name} onChange={(e) => updateSenkung(s.id, 'name', e.target.value)}
                style={{ flex: 1, minWidth: 80, padding: '4px 8px', borderRadius: 6, border: `1px solid ${bdr}`, background: isDark ? '#0f0d2e' : '#fff', color: text, fontSize: '0.78rem' }}
              />
              <span style={{ color: muted, fontSize: '0.72rem' }}>ab</span>
              <input type="number" value={s.fromAge} min={18} max={110} onChange={(e) => updateSenkung(s.id, 'fromAge', parseInt(e.target.value) || 65)}
                style={{ width: 44, padding: '4px 6px', borderRadius: 6, border: `1px solid ${bdr}`, background: isDark ? '#0f0d2e' : '#fff', color: text, fontSize: '0.78rem', textAlign: 'right' }}
              />
              <span style={{ color: muted, fontSize: '0.72rem' }}>J →</span>
              <input type="number" value={s.amount} min={0} step={0.01} onChange={(e) => updateSenkung(s.id, 'amount', parseFloat(e.target.value) || 0)}
                style={{ width: 60, padding: '4px 6px', borderRadius: 6, border: `1px solid ${bdr}`, background: isDark ? '#0f0d2e' : '#fff', color: text, fontSize: '0.78rem', textAlign: 'right' }}
              />
              <span style={{ color: muted, fontSize: '0.72rem' }}>€</span>
              <button onClick={() => removeSenkung(s.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
            </div>
          ))}
          <button onClick={addSenkung}
            style={{ width: '100%', padding: '7px', borderRadius: 8, border: `1px dashed ${bdr}`, background: 'transparent', color: accent, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>
            + Senkung hinzufügen
          </button>
        </div>

        {/* Rentenzuschuss */}
        <SectionLabel isDark={isDark}>Rentenzuschuss (§106 SGB VI)</SectionLabel>
        <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: '0.68rem', color: muted, marginBottom: 10, lineHeight: 1.6 }}>
            8,75% × gesetzl. Bruttorente, max. 50% des PKV-Beitrags.
          </div>
          <SliderField label="Renteneintritt ab Alter" min={60} max={80} step={1} value={pkv.rzFromAge} onChange={(v) => updatePkv({ rzFromAge: v })} isDark={isDark} />
          <div style={{ marginBottom: 12 }}>
            <label style={{ color: muted, fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Erwartete monatl. Bruttorente (€)</label>
            <input type="number" value={pkv.rzRente} min={0} step={10} onChange={(e) => updatePkv({ rzRente: parseFloat(e.target.value) || 0 })}
              style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: `1px solid ${bdr}`, background: isDark ? '#0f0d2e' : '#f8f7ff', color: text, fontSize: '0.82rem', boxSizing: 'border-box' }} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', color: text, cursor: 'pointer' }}>
            <input type="checkbox" checked={pkv.rzActive} onChange={(e) => updatePkv({ rzActive: e.target.checked })} />
            In Berechnung einbeziehen
          </label>
          {pkv.rzActive && (
            <div style={{ marginTop: 10, fontSize: '0.72rem', color: sub, background: isDark ? 'rgba(10,202,142,0.07)' : 'rgba(16,185,129,0.07)', borderRadius: 8, padding: '8px 10px', lineHeight: 1.7 }}>
              8,75% × {fmt(pkv.rzRente, 2)} = <strong>{fmt(pkv.rzRente * 0.0875, 2)}</strong><br />
              Max. 50% PKV-Beitrag ≈ {fmt((currentYearData?.monthly ?? 0) * 0.5, 2)}
            </div>
          )}
        </div>
      </Stack>
    );
  }

  // ── Expanded year row ──
  function setYearOverride(year, tarife) {
    const next = { ...pkv.yearOverrides };
    if (tarife) next[year] = tarife; else delete next[year];
    updatePkv({ yearOverrides: next });
  }

  function resetYearOverride(year) {
    const next = { ...pkv.yearOverrides };
    delete next[year];
    updatePkv({ yearOverrides: next });
  }

  function YearExpandPanel({ d }) {
    const startYear = new Date(pkv.startDate || CURRENT_YEAR + '-01-01').getFullYear();
    const yo = pkv.yearOverrides[d.year] ?? getEffectiveTarife(pkv.yearOverrides, pkv.tarife, d.year, startYear);
    const hasOverride = !!pkv.yearOverrides[d.year];
    const brkVal  = pkv.brkAmounts[d.year] || 0;
    const freeVal = pkv.freeMonths[d.year] || 0;

    // Tarife ausblenden, die laut `dropAtAge` in diesem Jahr bereits entfallen
    // sind. Sie werden so aus ALLEN Anzeigen und Interaktionen dieser Zeile
    // entfernt — konsistent mit den Projektions-Berechnungen (Zeile 83/108/119/193).
    // `origIdx` zeigt auf die Position im ungefilterten `yo`-Array, damit Edits
    // weiterhin die richtige Zeile im Override-State treffen.
    const visibleTarife = yo
      .map((t, origIdx) => ({ t, origIdx }))
      .filter(({ t }) => t.dropAtAge === null || t.dropAtAge === undefined || d.age < t.dropAtAge);
    const droppedCount = yo.length - visibleTarife.length;

    const inpSt = { padding: '4px 8px', borderRadius: 6, border: `1px solid ${bdr}`, background: isDark ? '#0f0d2e' : '#fff', color: text, fontSize: '0.78rem', fontFamily: 'monospace' };
    const chkSt = { accentColor: accent, width: 13, height: 13 };
    const lblSt = { color: muted, fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.05em' };

    function updateTarif(origIdx, field, val) {
      const copy = yo.map((t, i) => i === origIdx ? { ...t, [field]: val } : t);
      setYearOverride(d.year, copy);
    }
    function removeTarif(origIdx) {
      // Mindestens 1 sichtbarer Tarif muss übrig bleiben — bezieht sich auf
      // die sichtbare Liste, nicht auf die Gesamtzahl im Override.
      if (visibleTarife.length <= 1) return;
      setYearOverride(d.year, yo.filter((_, i) => i !== origIdx));
    }
    function addTarif() {
      const newId = Date.now();
      setYearOverride(d.year, [...yo, { id: newId, ...NEW_TARIF_DEFAULTS }]);
    }

    return (
      <tr>
        <td colSpan={9} style={{ padding: 0 }}>
          <div style={{ background: isDark ? 'rgba(167,139,250,0.05)' : 'rgba(124,58,237,0.04)', border: `1px solid ${bdr}`, borderRadius: 10, margin: '4px 8px', padding: 14 }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: accent, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Tarife {d.year}
                </span>
                {hasOverride && (
                  <span style={{ fontSize: '0.62rem', padding: '2px 6px', borderRadius: 4, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontWeight: 700 }}>
                    MANUELL
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {hasOverride && (
                  <button onClick={() => resetYearOverride(d.year)} style={{ padding: '3px 8px', borderRadius: 6, border: `1px solid ${bdr}`, background: 'transparent', color: muted, cursor: 'pointer', fontSize: '0.68rem' }}>
                    Zurücksetzen
                  </button>
                )}
                <button onClick={addTarif} style={{ padding: '3px 8px', borderRadius: 6, border: `1px solid ${accent}`, background: accent + '15', color: accent, cursor: 'pointer', fontSize: '0.68rem', fontWeight: 700 }}>
                  + Tarif
                </button>
              </div>
            </div>

            {/* Tarif rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {/* Column headers */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 50px 50px 60px 28px', gap: 6, alignItems: 'center', padding: '0 2px' }}>
                <span style={lblSt}>Tarif</span>
                <span style={lblSt}>Betrag €</span>
                <span style={lblSt}>GZ</span>
                <span style={lblSt}>Basis</span>
                <span style={lblSt}>Absetzbar</span>
                <span />
              </div>
              {visibleTarife.map(({ t, origIdx }) => (
                <div key={t.id || origIdx} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 50px 50px 60px 28px', gap: 6, alignItems: 'center', padding: '3px 2px', borderRadius: 6, background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
                  <input type="text" value={t.name} onChange={(e) => updateTarif(origIdx, 'name', e.target.value)}
                    style={{ ...inpSt, width: '100%' }} />
                  <input type="number" step="0.01" value={t.amount} onChange={(e) => updateTarif(origIdx, 'amount', parseFloat(e.target.value) || 0)}
                    style={{ ...inpSt, width: '100%', textAlign: 'right' }} />
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <input type="checkbox" checked={!!t.gz} onChange={(e) => updateTarif(origIdx, 'gz', e.target.checked)} style={chkSt} title="Gesetzlicher Zuschlag 10%" />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <input type="checkbox" checked={!!t.steuer} onChange={(e) => updateTarif(origIdx, 'steuer', e.target.checked)} style={chkSt} title="Basisabsicherung (steuerlich absetzbar)" />
                  </div>
                  <input type="number" min={0} max={100} step={1} value={t.steuerPct || 0}
                    onChange={(e) => updateTarif(origIdx, 'steuerPct', parseFloat(e.target.value) || 0)}
                    style={{ ...inpSt, width: '100%', textAlign: 'right', opacity: t.steuer ? 1 : 0.3 }} disabled={!t.steuer} />
                  <button onClick={() => removeTarif(origIdx)} title="Tarif entfernen"
                    style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'rgba(239,68,68,0.1)', color: '#ef4444', cursor: visibleTarife.length > 1 ? 'pointer' : 'not-allowed', fontSize: '0.82rem', opacity: visibleTarife.length > 1 ? 1 : 0.3 }}>
                    ×
                  </button>
                </div>
              ))}
              {droppedCount > 0 && (
                <div style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: isDark ? 'rgba(107,114,128,0.12)' : 'rgba(107,114,128,0.08)',
                  color: muted,
                  fontSize: '0.7rem',
                  fontStyle: 'italic',
                  marginTop: 4,
                }}>
                  {droppedCount} Tarif{droppedCount !== 1 ? 'e' : ''} in diesem Jahr entfallen (Alter ≥ „Tarif entfällt ab").
                </div>
              )}
            </div>

            {/* BRK + Free months */}
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div>
                <label style={{ ...lblSt, display: 'block', marginBottom: 4 }}>BRK (€/Jahr)</label>
                <input type="number" value={brkVal} min={0} step={1} onChange={(e) => setBrkAmount(d.year, parseFloat(e.target.value) || 0)}
                  style={{ ...inpSt, width: 100 }} />
              </div>
              <div>
                <label style={{ ...lblSt, display: 'block', marginBottom: 4 }}>Beitragsfreie Monate</label>
                <input type="number" value={freeVal} min={0} max={6} step={1} onChange={(e) => setFreeMonths(d.year, parseInt(e.target.value) || 0)}
                  style={{ ...inpSt, width: 60 }} />
              </div>
            </div>
          </div>
        </td>
      </tr>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, minHeight: '100vh' }}>
      <PageHeader
        title="PKV Beitragsrechner"
        subtitle="Private Krankenversicherung · Beitragsverlauf · GKV-Vergleich"
        actions={
          <Button variant="outlined" startIcon={<LaunchIcon />} onClick={exportToBudget}>
            Zum Budget übertragen
          </Button>
        }
      />

      {/* ── Global tabs ──────────────────────────────────────────────────── */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2.5 }}>
        <Tabs value={globalTab} onChange={(_, v) => setGlobalTab(v)}>
          <Tab value="pkv" label="PKV-Rechner" />
          <Tab value="gkv" label="GKV-Vergleich" />
        </Tabs>
      </Box>

      {/* ══════════════════════ PKV TAB ══════════════════════════════════════ */}
      {globalTab === 'pkv' && (
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          {/* Sidebar */}
          <div style={{ flexShrink: 0 }}>
            {PkvSidebar()}
          </div>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* KPIs */}
            {pkvData.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(188px, 1fr))', gap: 16, alignItems: 'stretch' }}>
                <KpiCard
                  label={pkv.employmentStatus === 'angestellt' && kpis.first?.agZuschuss > 0 ? `Mtl. Netto-Aufwand AN ${kpis.first?.year}` : `Mtl. Beitrag ${kpis.first?.year}`}
                  value={pkv.employmentStatus === 'angestellt' && kpis.first?.agZuschuss > 0 ? fmt(kpis.first?.nettoMonthly, 2) : fmt(kpis.first?.monthly, 2)}
                  sub={pkv.employmentStatus === 'angestellt' && kpis.first?.agZuschuss > 0 ? `Brutto: ${fmt(kpis.first?.monthly, 2)}` : `davon GZ: ${fmt(kpis.first?.gz, 2)}`}
                  color="#e8b84b" isDark={isDark}
                />
                <KpiCard label="Gesamtkosten Lebenszeit" value={fmt(kpis.last?.cumulative, 0)} sub={`${pkvData.length} Jahre`} color="#5b8dee" isDark={isDark} />
                <KpiCard label="Steuerl. Ersparnis (kum.)" value={fmt(kpis.totalTax, 0)} sub={`Arbeit: ${pkv.taxRateWork}% · Rente: ${pkv.taxRateRetire}%`} color="#10b981" isDark={isDark} />
                <KpiCard label="BRK kumuliert" value={kpis.totalBrk > 0 ? fmt(kpis.totalBrk, 0) : '—'} sub={kpis.brkCount > 0 ? `${kpis.brkCount} Jahre mit BRK` : 'Noch keine eingetragen'} color="#5b8dee" isDark={isDark} />
                <KpiCard label="Beitrag bei Renteneintritt" value={fmt(kpis.renteD?.monthly, 2)} sub={`ab Alter ${pkv.rzFromAge} (${kpis.renteD?.year})`} color="#e8b84b" isDark={isDark} />
                <KpiCard label="Beitragsanstieg gesamt" value={(kpis.anstieg >= 0 ? '+' : '') + (kpis.anstieg?.toFixed(0) ?? '—') + ' %'} sub={`${fmt(kpis.first?.monthly, 2)} → ${fmt(kpis.last?.monthly, 2)}`} color="#ef4444" isDark={isDark} />
              </div>
            )}

            {/* Chart */}
            <SectionCard
              title="Beitragsverlauf"
              action={
                <ToggleButtonGroup
                  size="small"
                  value={chartMode}
                  exclusive
                  onChange={(_, v) => v && setChartMode(v)}
                >
                  <ToggleButton value="monthly">Monatlich</ToggleButton>
                  <ToggleButton value="annual">Jährlich</ToggleButton>
                  <ToggleButton value="cumulative">Kumuliert</ToggleButton>
                </ToggleButtonGroup>
              }
            >
              <Box sx={{ mb: 1 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.72rem', color: muted, cursor: 'pointer' }}>
                  <input type="checkbox" checked={showInflation} onChange={(e) => setShowInflation(e.target.checked)} style={{ accentColor: accent }} />
                  Kaufkraftbereinigt (Barwert)
                </label>
              </Box>
              <PkvLineChart data={pkvData} mode={chartMode} showInflation={showInflation} inflationRate={pkv.inflationRate} isDark={isDark} />
            </SectionCard>

            {/* Table */}
            <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${bdr}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ color: text, fontWeight: 700, fontSize: '0.9rem' }}>Jahresübersicht</div>
                <div style={{ color: muted, fontSize: '0.7rem', fontFamily: 'monospace' }}>Zeile anklicken → BRK & Freie Monate bearbeiten</div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', fontFamily: 'monospace' }}>
                  <thead>
                    <tr style={{ background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' }}>
                      {['Jahr', 'Alter', 'Gesamtbeitrag mtl.', 'Eigenanteil mtl.', 'Jährl. Kosten', 'Änderung', 'BRK', 'GZ-Anteil', 'Kumuliert'].map((h) => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: muted, fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pkvData.map((d) => (
                      <React.Fragment key={d.year}>
                        <tr
                          onClick={() => setExpandedYear(expandedYear === d.year ? null : d.year)}
                          style={{
                            cursor: 'pointer',
                            background: expandedYear === d.year ? (isDark ? 'rgba(167,139,250,0.08)' : 'rgba(124,58,237,0.05)') :
                              d.isCurrent ? (isDark ? 'rgba(91,141,238,0.08)' : 'rgba(91,141,238,0.05)') : 'transparent',
                            opacity: d.isPast ? 0.65 : 1,
                            borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`,
                          }}
                        >
                          <td style={{ padding: '8px 12px', color: text, fontWeight: d.isCurrent ? 700 : 400 }}>
                            {d.year}
                            {d.isCurrent && <span style={{ marginLeft: 6, fontSize: '0.62rem', background: 'rgba(91,141,238,0.18)', color: '#5b8dee', borderRadius: 4, padding: '1px 5px', fontFamily: 'sans-serif' }}>JETZT</span>}
                            {d.isFuture && !d.isCurrent && <span style={{ marginLeft: 6, fontSize: '0.62rem', background: 'rgba(167,139,250,0.12)', color: accent, borderRadius: 4, padding: '1px 5px', fontFamily: 'sans-serif' }}>PROG</span>}
                            {d.hasYearOverride && <span style={{ marginLeft: 6, fontSize: '0.62rem', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', borderRadius: 4, padding: '1px 5px', fontFamily: 'sans-serif' }} title="Manuelle Tarifanpassung">✎</span>}
                          </td>
                          <td style={{ padding: '8px 12px', color: sub }}>{d.age}</td>
                          <MuiTooltip arrow placement="top" slotProps={{ tooltip: { sx: { maxWidth: 320, bgcolor: isDark ? '#1c2030' : '#fff', color: isDark ? '#ede9fe' : '#1e1b4b', border: `1px solid ${isDark ? '#2d2a5e' : '#e8e4f8'}`, borderRadius: '10px', p: '10px 14px', fontSize: '0.75rem', fontFamily: 'monospace', boxShadow: '0 4px 20px rgba(0,0,0,0.25)' } } }} title={
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 2, fontFamily: 'sans-serif' }}>Mtl. Gesamtbeitrag (Brutto)</div>
                              <div style={{ color: isDark ? '#a5a0c8' : '#6d6a8a', fontSize: '0.7rem', marginBottom: 8, fontFamily: 'sans-serif' }}>Voller Tarifbeitrag vor allen Subventionen</div>
                              {d.breakdown.map((b, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '2px 0' }}>
                                  <span>{b.name}</span><span>{fmt(b.amount, 2)}</span>
                                </div>
                              ))}
                              {d.gzActive && d.gzTotalBd > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '2px 0', color: '#e8b84b' }}>
                                  <span>GZ (10%)</span><span>+{fmt(d.gzTotalBd, 2)}</span>
                                </div>
                              )}
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '4px 0 0', borderTop: `1px solid ${isDark ? '#2d2a5e' : '#e8e4f8'}`, marginTop: 4, fontWeight: 700 }}>
                                <span>Gesamtbeitrag</span><span style={{ color: '#e8b84b' }}>{fmt(d.gesamtbeitragMtl, 2)}</span>
                              </div>
                            </div>
                          }>
                            <td style={{ padding: '8px 12px', color: '#e8b84b', fontWeight: 600, cursor: 'help' }}>{fmt(d.gesamtbeitragMtl, 2)}</td>
                          </MuiTooltip>
                          <MuiTooltip arrow placement="top" slotProps={{ tooltip: { sx: { maxWidth: 320, bgcolor: isDark ? '#1c2030' : '#fff', color: isDark ? '#ede9fe' : '#1e1b4b', border: `1px solid ${isDark ? '#2d2a5e' : '#e8e4f8'}`, borderRadius: '10px', p: '10px 14px', fontSize: '0.75rem', fontFamily: 'monospace', boxShadow: '0 4px 20px rgba(0,0,0,0.25)' } } }} title={
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 2, fontFamily: 'sans-serif' }}>Mtl. Eigenanteil (Cashflow)</div>
                              <div style={{ color: isDark ? '#a5a0c8' : '#6d6a8a', fontSize: '0.7rem', marginBottom: 8, fontFamily: 'sans-serif' }}>
                                {d.agZuschuss > 0 ? 'Arbeitsphase: Gesamtbeitrag minus AG-Zuschuss'
                                 : d.rzBd > 0    ? 'Rentenphase: Gesamtbeitrag minus KVdR-Zuschuss'
                                 :                  'Kein Zuschuss (Selbstständig)'}
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '2px 0' }}>
                                <span>Gesamtbeitrag</span><span>{fmt(d.gesamtbeitragMtl, 2)}</span>
                              </div>
                              {d.agZuschuss > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '2px 0', color: '#10b981' }}>
                                  <span>AG-Zuschuss (§ 257 SGB V)</span><span>-{fmt(d.agZuschuss, 2)}</span>
                                </div>
                              )}
                              {d.rzBd > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '2px 0', color: '#10b981' }}>
                                  <span>KVdR-Zuschuss (§ 106 SGB VI)</span><span>-{fmt(d.rzBd, 2)}</span>
                                </div>
                              )}
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '4px 0 0', borderTop: `1px solid ${isDark ? '#2d2a5e' : '#e8e4f8'}`, marginTop: 4, fontWeight: 700, color: '#10b981' }}>
                                <span>Eigenanteil</span><span>{fmt(d.eigenanteilMtl, 2)}</span>
                              </div>
                            </div>
                          }>
                            <td style={{ padding: '8px 12px', color: (d.agZuschuss > 0 || d.rzBd > 0) ? '#10b981' : text, fontWeight: 600, cursor: 'help' }}>
                              {fmt(d.eigenanteilMtl, 2)}
                              {d.agZuschuss > 0 && <span style={{ fontSize: '0.65rem', color: '#10b981', marginLeft: 4 }}>AN</span>}
                              {d.rzBd > 0      && <span style={{ fontSize: '0.65rem', color: '#10b981', marginLeft: 4 }}>Rente</span>}
                            </td>
                          </MuiTooltip>
                          <MuiTooltip arrow placement="top" slotProps={{ tooltip: { sx: { maxWidth: 280, bgcolor: isDark ? '#1c2030' : '#fff', color: isDark ? '#ede9fe' : '#1e1b4b', border: `1px solid ${isDark ? '#2d2a5e' : '#e8e4f8'}`, borderRadius: '10px', p: '10px 14px', fontSize: '0.75rem', fontFamily: 'monospace', boxShadow: '0 4px 20px rgba(0,0,0,0.25)' } } }} title={
                            d.freeMonthsVal > 0 ? (
                              <div style={{ fontFamily: 'sans-serif' }}>
                                <div style={{ fontWeight: 700, marginBottom: 4 }}>{d.freeMonthsVal} beitragsfreie Monate</div>
                                <div style={{ color: isDark ? '#a5a0c8' : '#6d6a8a', fontSize: '0.75rem' }}>
                                  {fmt(d.gesamtbeitragMtl, 2)} x {d.monthsInYear} Monate
                                </div>
                              </div>
                            ) : (
                              <span style={{ fontFamily: 'sans-serif' }}>{fmt(d.gesamtbeitragMtl, 2)} x {d.monthsInYear} Monate</span>
                            )
                          }>
                            <td style={{ padding: '8px 12px', color: text, cursor: 'help' }}>{fmt(d.annual, 2)}</td>
                          </MuiTooltip>
                          <td style={{ padding: '8px 12px', color: d.changePct === null ? sub : d.changePct > 0 ? '#ef4444' : '#10b981' }}>
                            {fmtPct(d.changePct)}
                          </td>
                          <td style={{ padding: '8px 12px', color: d.brkYear > 0 ? '#10b981' : muted }}>{d.brkYear > 0 ? fmt(d.brkYear, 2) : '—'}</td>
                          <td style={{ padding: '8px 12px', color: d.gzActive ? '#e8b84b' : muted }}>{d.gzActive ? fmt(d.gz, 2) : 'entfallen'}</td>
                          <td style={{ padding: '8px 12px', color: muted }}>{fmt(d.cumulative, 0)}</td>
                        </tr>
                        {expandedYear === d.year && YearExpandPanel({ d })}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ color: muted, fontSize: '0.68rem', lineHeight: 1.6 }}>
              * Alle Angaben ohne Gewähr. GZ = Gesetzl. Zuschlag (10% auf GZ-pflichtige Tarife, bis Alter 59). Steuerl. Ersparnis = Basisabsicherungsanteile × Steuersatz.
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════ GKV TAB ══════════════════════════════════════ */}
      {globalTab === 'gkv' && (
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          {/* Sidebar */}
          <div style={{ flexShrink: 0, minWidth: 240 }}>
            <SectionLabel isDark={isDark}>Hochrechnung</SectionLabel>
            <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
              <SliderField label="Jährl. Gehaltssteigerung" min={0} max={10} step={0.5} value={gkv.gkvGehaltsRate} onChange={(v) => updateGkv({ gkvGehaltsRate: v })} suffix="%" isDark={isDark} />
              <SliderField label="Jährl. GKV-Beitragsanpassung" min={0} max={10} step={0.5} value={gkv.gkvBeitragsRate} onChange={(v) => updateGkv({ gkvBeitragsRate: v })} suffix="%" isDark={isDark} />
              <div style={{ fontSize: '0.68rem', color: muted, lineHeight: 1.6, marginTop: 8 }}>
                Brutto, GKV-Zusatzbeitrag und Kinder werden aus dem Gehaltsrechner-Modul übernommen.
              </div>
            </div>
          </div>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Current comparison */}
            {pkvData.length > 0 && (() => {
              const pkvMonthly  = pkvData[0].monthly;
              const brutto0     = gh.ghBrutto;
              const zusatz      = gh.ghGkvZusatz;
              const kinder      = gh.ghKinder;
              const pvRate      = pvSatzByKinder(kinder);
              const svBase      = Math.min(brutto0, GKV_BBG_KV);
              const kvGkv       = svBase * (GKV_BASIS_RATE + zusatz / 200);
              const pvGkv       = svBase * pvRate;
              const gkvAN       = kvGkv + pvGkv;
              const agZ         = calcAgZuschuss(pkvMonthly, brutto0, zusatz);
              const pkvNetto    = pkvMonthly - agZ;
              const diff        = pkvNetto - gkvAN;
              const beRaw       = pkvMonthly * 0.5 / (GKV_BASIS_RATE + zusatz / 200 + GKV_PV_RATE + GKV_PV_ZUSCHLAG);

              return (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}>
                    <div style={{ color: text, fontWeight: 700, fontSize: '0.85rem', marginBottom: 14 }}>PKV vs. GKV · Aktueller Vergleich</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                      {[['PKV brutto', fmt(pkvMonthly, 2), '#e8b84b'], ['AG-Zuschuss', fmt(agZ, 2), '#10b981'], ['PKV netto (AN)', fmt(pkvNetto, 2), '#e8b84b']].map(([l, v, c]) => (
                        <div key={l}>
                          <div style={{ fontSize: '0.65rem', color: muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{l}</div>
                          <div style={{ fontSize: '1.1rem', color: c, fontWeight: 700, fontFamily: 'monospace', marginTop: 4 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ borderTop: `1px solid ${bdr}`, paddingTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <div style={{ fontSize: '0.65rem', color: muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>GKV mtl. (AN)</div>
                        <div style={{ fontSize: '1.1rem', color: '#5b8dee', fontWeight: 700, fontFamily: 'monospace', marginTop: 4 }}>{fmt(gkvAN, 2)}</div>
                        <div style={{ fontSize: '0.68rem', color: muted }}>KV {fmt(kvGkv, 2)} + PV {fmt(pvGkv, 2)}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <div style={{
                          width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: '0.78rem', fontFamily: 'monospace', fontWeight: 600,
                          background: Math.abs(diff) < 1 ? 'rgba(255,255,255,0.04)' : diff < 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.08)',
                          color: Math.abs(diff) < 1 ? muted : diff < 0 ? '#10b981' : '#ef4444',
                        }}>
                          {Math.abs(diff) < 1 ? '≈ Gleichauf' : diff < 0 ? `PKV günstiger um ${fmt(Math.abs(diff), 2)}/Monat` : `GKV günstiger um ${fmt(diff, 2)}/Monat`}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}>
                    <div style={{ color: text, fontWeight: 700, fontSize: '0.85rem', marginBottom: 10 }}>Break-even · Ab welchem Bruttogehalt ist PKV günstiger?</div>
                    <div style={{ fontSize: '1.4rem', color: '#e8b84b', fontWeight: 700, fontFamily: 'monospace', marginBottom: 6 }}>
                      {beRaw <= GKV_BBG_KV ? fmt(beRaw, 0) + '/Monat' : '> BBG'}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: muted, lineHeight: 1.6 }}>
                      {beRaw <= GKV_BBG_KV
                        ? (beRaw < brutto0 ? `Dein Gehalt (${fmt(brutto0, 0)}) liegt darüber → PKV netto günstiger` : `Dein Gehalt (${fmt(brutto0, 0)}) liegt darunter → GKV AN günstiger`)
                        : 'AG-Zuschuss deckt 50% — PKV ab BBG immer günstiger'
                      }
                    </div>
                    <div style={{ marginTop: 10, fontSize: '0.68rem', color: muted }}>BBG KV/PV 2026: 5.812,50 €/Monat</div>
                  </div>
                </div>
              );
            })()}

            {/* GKV projection chart */}
            {gkvProjection.length > 0 && (
              <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 14, padding: 20 }}>
                <div style={{ color: text, fontWeight: 700, fontSize: '0.9rem', marginBottom: 16 }}>GKV vs. PKV · Hochrechnung bis Rente</div>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={gkvProjection} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'} />
                    <XAxis dataKey="year" tick={{ fill: sub, fontSize: 10 }} />
                    <YAxis tick={{ fill: sub, fontSize: 10 }} tickFormatter={(v) => (v / 1000).toFixed(0) + 'k €'} />
                    <RechartTooltip
                      formatter={(v, name) => [fmt(v, 0), name]}
                      contentStyle={{ background: isDark ? '#1a1744' : '#fff', border: `1px solid ${bdr}`, borderRadius: 8, fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: '0.72rem', color: sub }} />
                    <Line type="monotone" dataKey="gkvCum" name="GKV kumuliert (AN)" stroke="#5b8dee" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="pkvCum" name="PKV kumuliert (netto)" stroke="#e8b84b" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* GKV table */}
            <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${bdr}` }}>
                <div style={{ color: text, fontWeight: 700, fontSize: '0.9rem' }}>GKV-Vergleich Jahresübersicht</div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', fontFamily: 'monospace' }}>
                  <thead>
                    <tr style={{ background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' }}>
                      {['Jahr', 'Alter', 'Brutto', 'GKV mtl.', 'PKV brutto', 'AG-Zuschuss', 'PKV netto', 'Differenz', 'GKV kum.', 'PKV kum.', 'Vorteil'].map((h) => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: muted, fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {gkvProjection.map((r) => {
                      const diff = r.pkvNetto - r.gkvMo;
                      return (
                        <tr key={r.year} style={{ borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`, background: r.isCurrent ? (isDark ? 'rgba(91,141,238,0.06)' : 'rgba(91,141,238,0.04)') : 'transparent' }}>
                          <td style={{ padding: '8px 12px', color: text }}>{r.year}{r.isCurrent && <span style={{ marginLeft: 5, fontSize: '0.62rem', background: 'rgba(91,141,238,0.15)', color: '#5b8dee', borderRadius: 4, padding: '1px 4px' }}>JETZT</span>}</td>
                          <td style={{ padding: '8px 12px', color: sub }}>{r.age}</td>
                          <td style={{ padding: '8px 12px', color: text }}>{r.brutto.toLocaleString('de-DE', { maximumFractionDigits: 0 })} €</td>
                          <td style={{ padding: '8px 12px', color: '#5b8dee' }}>{fmt(r.gkvMo, 2)}</td>
                          <td style={{ padding: '8px 12px', color: '#e8b84b' }}>{fmt(r.pkvBrutto, 2)}</td>
                          <td style={{ padding: '8px 12px', color: '#10b981' }}>−{fmt(r.agMo, 2)}</td>
                          <td style={{ padding: '8px 12px', color: '#e8b84b', fontWeight: 600 }}>{fmt(r.pkvNetto, 2)}</td>
                          <td style={{ padding: '8px 12px', color: diff < 0 ? '#10b981' : '#ef4444' }}>{(diff >= 0 ? '+' : '') + fmt(diff, 2)}</td>
                          <td style={{ padding: '8px 12px', color: muted }}>{fmt(r.gkvCum, 0)}</td>
                          <td style={{ padding: '8px 12px', color: muted }}>{fmt(r.pkvCum, 0)}</td>
                          <td style={{ padding: '8px 12px', color: r.vorteil > 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                            {r.vorteil > 0 ? `PKV +${r.vorteil.toLocaleString('de-DE', { maximumFractionDigits: 0 })} €` : `GKV +${Math.abs(r.vorteil).toLocaleString('de-DE', { maximumFractionDigits: 0 })} €`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

    </Box>
  );
}
