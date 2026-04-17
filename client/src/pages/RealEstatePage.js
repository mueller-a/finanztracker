import { useState, useMemo } from 'react';
import {
  Box, Stack, Typography, Button, IconButton, TextField, MenuItem,
  Slider, Alert, CircularProgress, Chip,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ComposedChart,
} from 'recharts';
import { useRealEstate } from '../hooks/useRealEstate';
import { useModules } from '../context/ModuleContext';
import {
  buildMortgageSchedule, mortgageSummary, getCurrentMortgageBalance,
  calcLTV, calcAfA, calcSteuerVorteil, checkHaltefrist,
  checkZinsbindung, calcMonthlyCashflow, monthlyRate, fmtEuro,
} from '../utils/realEstateCalc';
import { PageHeader, SectionCard, CurrencyField, DateField } from '../components/mui';

// ── Stat card with accent stripe ──────────────────────────────────────────────
function StatCard({ label, value, sub, accent }) {
  return (
    <Box sx={(theme) => ({
      backgroundColor: 'background.paper',
      borderTop: `1px solid ${theme.palette.divider}`,
      borderRight: `1px solid ${theme.palette.divider}`,
      borderBottom: `1px solid ${theme.palette.divider}`,
      borderLeft: `3px solid ${accent}`,
      borderRadius: 1,
      p: '14px 16px',
      height: '100%',
    })}>
      <Typography variant="caption" sx={{
        display: 'block', color: 'text.secondary', fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.08em', mb: 0.75,
      }}>
        {label}
      </Typography>
      <Typography variant="subtitle1" sx={{ color: accent, fontWeight: 700, lineHeight: 1.2 }}>
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

// ── Property Form ─────────────────────────────────────────────────────────────
function PropertyForm({ property, onSave, onCancel }) {
  const [f, setF] = useState(property || {
    name: '', type: 'vermietet', purchase_price: '', purchase_date: '',
    market_value: '', land_value_ratio: 20, living_space: '', build_year: '',
    monthly_rent: 0, monthly_hausgeld: 0, maintenance_reserve: 0, color_code: '#7c3aed',
  });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  return (
    <SectionCard title={property ? 'Immobilie bearbeiten' : 'Neue Immobilie'}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5 }}>
        <TextField label="Name" size="small" fullWidth value={f.name}
          onChange={(e) => set('name', e.target.value)} placeholder="z.B. ETW München" />
        <TextField select label="Typ" size="small" fullWidth value={f.type}
          onChange={(e) => set('type', e.target.value)}>
          <MenuItem value="vermietet">Vermietet (Kapitalanlage)</MenuItem>
          <MenuItem value="eigengenutzt">Eigengenutzt</MenuItem>
        </TextField>
        <CurrencyField label="Kaufpreis" value={f.purchase_price}
          onChange={(v) => set('purchase_price', v === '' ? '' : v)} fullWidth />
        <DateField label="Kaufdatum" value={f.purchase_date || ''}
          onChange={(v) => set('purchase_date', v)} />
        <CurrencyField label="Marktwert aktuell" value={f.market_value || ''}
          onChange={(v) => set('market_value', v === '' ? '' : v)} fullWidth />
        <CurrencyField label="Grundstücksanteil" adornment="%" decimals={0}
          value={f.land_value_ratio} onChange={(v) => set('land_value_ratio', v === '' ? 0 : v)}
          inputProps={{ min: 0, max: 100, step: 1 }} fullWidth />
        <TextField type="number" inputProps={{ inputMode: "decimal" }} label="Wohnfläche (m²)" size="small" fullWidth
          value={f.living_space || ''} onChange={(e) => set('living_space', e.target.value)} />
        <TextField type="number" inputProps={{ inputMode: "numeric" }} label="Baujahr" size="small" fullWidth
          value={f.build_year || ''} onChange={(e) => set('build_year', e.target.value)} />
        {f.type === 'vermietet' && (
          <>
            <CurrencyField label="Kaltmiete monatlich" value={f.monthly_rent}
              onChange={(v) => set('monthly_rent', v === '' ? 0 : v)} fullWidth />
            <CurrencyField label="Hausgeld monatlich" value={f.monthly_hausgeld}
              onChange={(v) => set('monthly_hausgeld', v === '' ? 0 : v)} fullWidth />
          </>
        )}
      </Box>
      <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 2 }}>
        <Button onClick={onCancel} color="inherit">Abbrechen</Button>
        <Button variant="contained" onClick={() => onSave(f)}>Speichern</Button>
      </Stack>
    </SectionCard>
  );
}

// ── Mortgage Form ─────────────────────────────────────────────────────────────
function MortgageForm({ mortgage, propertyId, onSave, onCancel }) {
  const [f, setF] = useState(mortgage || {
    property_id: propertyId, label: 'Darlehen', principal: '', interest_rate: 2.0,
    repayment_rate: 2.0, start_date: '', fixed_until: '', special_repayment_yearly: 0,
  });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  return (
    <SectionCard title={mortgage ? 'Darlehen bearbeiten' : 'Neues Darlehen'}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5 }}>
        <TextField label="Bezeichnung" size="small" fullWidth value={f.label}
          onChange={(e) => set('label', e.target.value)} />
        <CurrencyField label="Darlehensbetrag" value={f.principal}
          onChange={(v) => set('principal', v === '' ? '' : v)} fullWidth />
        <CurrencyField label="Sollzins p.a." adornment="%" decimals={2}
          value={f.interest_rate} onChange={(v) => set('interest_rate', v === '' ? 0 : v)}
          inputProps={{ step: 0.01, min: 0 }} fullWidth />
        <CurrencyField label="Tilgung p.a." adornment="%" decimals={1}
          value={f.repayment_rate} onChange={(v) => set('repayment_rate', v === '' ? 0 : v)}
          inputProps={{ step: 0.1, min: 0 }} fullWidth />
        <DateField label="Startdatum" value={f.start_date || ''}
          onChange={(v) => set('start_date', v)} />
        <DateField label="Zinsbindung bis" value={f.fixed_until || ''}
          onChange={(v) => set('fixed_until', v)} />
        <CurrencyField label="Sondertilgung p.a." value={f.special_repayment_yearly}
          onChange={(v) => set('special_repayment_yearly', v === '' ? 0 : v)} fullWidth />
      </Box>
      <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 2 }}>
        <Button onClick={onCancel} color="inherit">Abbrechen</Button>
        <Button variant="contained" color="info" onClick={() => onSave({ ...f, property_id: propertyId })}>
          Speichern
        </Button>
      </Stack>
    </SectionCard>
  );
}

// ── Property Detail ───────────────────────────────────────────────────────────
function PropertyDetail({ property, mortgages: propMortgages, onBack, onAddMortgage, onUpdateMortgage, onDeleteMortgage }) {
  const theme = useTheme();
  const { steuerSatzAlter } = useModules();
  const [editMortgage, setEditMortgage] = useState(null);
  const [showNewMortgage, setShowNewMortgage] = useState(false);
  const [sonderSlider, setSonderSlider] = useState(null);
  const p = property;

  const schedules = useMemo(() =>
    propMortgages.map((m) => ({
      mortgage: m,
      schedule: buildMortgageSchedule({ ...m, special_repayment_yearly: sonderSlider != null ? sonderSlider : m.special_repayment_yearly }),
    })),
    [propMortgages, sonderSlider]
  );

  const totalRestschuld = schedules.reduce((s, { schedule }) => s + getCurrentMortgageBalance(schedule), 0);
  const marktwert = Number(p.market_value) || Number(p.purchase_price);
  const ltv = calcLTV(totalRestschuld, marktwert);
  const afa = calcAfA(p, 'linear');
  const haltefrist = checkHaltefrist(p.purchase_date);
  const rate = schedules.reduce((s, { mortgage: m }) => s + monthlyRate(Number(m.principal), m.interest_rate, m.repayment_rate), 0);
  const cashflow = p.type === 'vermietet' ? calcMonthlyCashflow(p.monthly_rent, rate, p.monthly_hausgeld, p.maintenance_reserve) : null;

  // Steuervorteil
  const zinsenJahr = schedules.reduce((s, { schedule }) => {
    const thisYear = schedule.filter((e) => e.year === new Date().getFullYear());
    return s + thisYear.reduce((ss, e) => ss + e.zinsen, 0);
  }, 0);
  const steuerVorteil = p.type === 'vermietet'
    ? calcSteuerVorteil((p.monthly_rent || 0) * 12, zinsenJahr, afa.jahresAfa, (p.monthly_hausgeld || 0) * 12, steuerSatzAlter || 42)
    : null;

  // Chart data (annual: Zins vs Tilgung)
  const chartData = useMemo(() => {
    if (!schedules.length || !schedules[0].schedule.length) return [];
    const yearMap = {};
    schedules.forEach(({ schedule }) => {
      schedule.forEach((e) => {
        if (!yearMap[e.year]) yearMap[e.year] = { year: e.year, zinsen: 0, tilgung: 0, balance: 0 };
        yearMap[e.year].zinsen  += e.zinsen;
        yearMap[e.year].tilgung += e.tilgung + (e.sonder || 0);
        yearMap[e.year].balance  = Math.max(yearMap[e.year].balance, e.balance);
      });
    });
    return Object.values(yearMap).sort((a, b) => a.year - b.year);
  }, [schedules]);

  async function handleSaveMortgage(f) {
    if (editMortgage) {
      await onUpdateMortgage(editMortgage.id, f);
      setEditMortgage(null);
    } else {
      await onAddMortgage(f);
      setShowNewMortgage(false);
    }
  }

  return (
    <Stack spacing={2}>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <Button onClick={onBack} startIcon={<ArrowBackIcon />} size="small" color="inherit"
          variant="outlined">
          Zurück
        </Button>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>{p.name}</Typography>
          <Typography variant="caption" color="text.secondary">
            {p.type === 'vermietet' ? 'Kapitalanlage' : 'Eigengenutzt'} ·
            Baujahr {p.build_year || '—'} · {p.living_space || '—'} m²
          </Typography>
        </Box>
      </Stack>

      {/* KPIs */}
      <Box sx={{
        display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fit, minmax(188px, 1fr))' }, gap: 2,
      }}>
        <StatCard label="Marktwert" value={fmtEuro(marktwert)} accent="#0ea5e9" />
        <StatCard label="Restschuld" value={fmtEuro(totalRestschuld)} sub={ltv + '% LTV'} accent="#ef4444" />
        <StatCard label="Netto-Vermögen" value={fmtEuro(marktwert - totalRestschuld)}
          accent={marktwert - totalRestschuld >= 0 ? '#10b981' : '#ef4444'} />
        <StatCard label="AfA p.a." value={fmtEuro(afa.jahresAfa)} sub={afa.hinweis} accent="#f59e0b" />
        {cashflow != null && (
          <StatCard label="Cashflow mtl." value={fmtEuro(cashflow, 2)}
            sub={cashflow >= 0 ? 'Positiv' : 'Negativ'}
            accent={cashflow >= 0 ? '#10b981' : '#ef4444'} />
        )}
        {steuerVorteil && steuerVorteil.isNegativ && (
          <StatCard label="Steuervorteil p.a." value={fmtEuro(steuerVorteil.vorteil)}
            sub={steuerSatzAlter + '% Steuersatz'} accent="#10b981" />
        )}
        <StatCard label="Haltefrist §23"
          value={haltefrist.fulfilled ? 'Erfüllt ✓' : haltefrist.remainingYears + ' Jahre'}
          sub={haltefrist.fulfilled ? 'Steuerfreier Verkauf möglich' : 'Steuerfrei ab ' + haltefrist.freeFrom}
          accent={haltefrist.fulfilled ? '#10b981' : '#f59e0b'} />
      </Box>

      {/* Zinsbindungs-Warnungen */}
      {propMortgages.map((m) => {
        const zb = checkZinsbindung(m.fixed_until);
        if (!zb.active || zb.level === 'grey') return null;
        return (
          <Alert
            key={m.id}
            severity={zb.level === 'red' ? 'error' : 'warning'}
            variant="outlined"
          >
            <strong>{m.label}:</strong> Zinsbindung endet in {zb.label} ({m.fixed_until}) — Anschlussfinanzierung planen!
          </Alert>
        );
      })}

      {/* Sondertilgungs-Slider */}
      {propMortgages.length > 0 && (
        <SectionCard title="Sondertilgungs-Simulator">
          <Stack direction="row" alignItems="center" spacing={2}>
            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 120 }}>
              Sondertilgung p.a.
            </Typography>
            <Slider
              value={sonderSlider != null ? sonderSlider : Number(propMortgages[0]?.special_repayment_yearly || 0)}
              min={0} max={50000} step={500}
              onChange={(_, v) => setSonderSlider(v)}
              size="small"
              sx={{ flex: 1, '& .MuiSlider-thumb': { width: 14, height: 14 } }}
            />
            <Typography sx={{
              color: 'primary.main', fontWeight: 700, fontFamily: 'monospace', minWidth: 90, textAlign: 'right',
            }}>
              {fmtEuro(sonderSlider != null ? sonderSlider : (propMortgages[0]?.special_repayment_yearly || 0))}
            </Typography>
          </Stack>
          {schedules[0] && (() => {
            const sum = mortgageSummary(schedules[0].schedule, propMortgages[0].principal);
            return (
              <Stack direction="row" spacing={3} sx={{ mt: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Schuldenfrei:{' '}
                  <strong style={{ color: sum.payoffDate ? theme.palette.success.main : theme.palette.text.primary }}>
                    {sum.payoffDate || 'nach 40+ Jahren'}
                  </strong>
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Zinskosten ges.: <strong style={{ color: theme.palette.error.main }}>{fmtEuro(sum.totalZinsen)}</strong>
                </Typography>
              </Stack>
            );
          })()}
        </SectionCard>
      )}

      {/* Zins vs Tilgung Chart */}
      {chartData.length > 1 && (
        <SectionCard
          title={
            <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700 }}>
              Zins- vs. Tilgungsanteil
            </Typography>
          }
        >
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.palette.divider} />
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: theme.palette.text.disabled }}
                tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: theme.palette.text.disabled }}
                tickLine={false} axisLine={false}
                tickFormatter={(v) => v >= 1000 ? Math.round(v / 1000) + 'k' : v} width={48} />
              <Tooltip contentStyle={{
                background: theme.palette.background.paper,
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: 8, fontSize: 12,
              }} />
              <Bar dataKey="zinsen" name="Zinsen" fill={theme.palette.error.main} stackId="a" />
              <Bar dataKey="tilgung" name="Tilgung" fill={theme.palette.success.main} stackId="a" radius={[2, 2, 0, 0]} />
              <Line type="monotone" dataKey="balance" name="Restschuld" stroke="#0ea5e9" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </SectionCard>
      )}

      {/* Darlehen */}
      <Typography variant="overline" sx={{
        display: 'block', color: 'text.secondary', fontWeight: 700, letterSpacing: '0.1em',
        pb: 0.75, borderBottom: 1, borderColor: 'divider',
      }}>
        Darlehen ({propMortgages.length})
      </Typography>
      {propMortgages.map((m) => {
        const sched = schedules.find((s) => s.mortgage.id === m.id);
        const bal = sched ? getCurrentMortgageBalance(sched.schedule) : Number(m.principal);
        const zb = checkZinsbindung(m.fixed_until);
        return (
          <SectionCard key={m.id} dense>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 700, display: 'inline' }}>{m.label}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  {m.interest_rate}% Zins · {m.repayment_rate}% Tilgung
                </Typography>
              </Box>
              <Stack direction="row" spacing={0.5}>
                <IconButton size="small" onClick={() => setEditMortgage(m)} title="Bearbeiten">
                  <EditOutlinedIcon fontSize="inherit" />
                </IconButton>
                <IconButton size="small" color="error" onClick={() => onDeleteMortgage(m.id)} title="Löschen">
                  <DeleteOutlineIcon fontSize="inherit" />
                </IconButton>
              </Stack>
            </Stack>
            <Box sx={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 1,
            }}>
              <Typography variant="caption" color="text.secondary">
                Darlehen:{' '}
                <Typography component="strong" variant="caption" sx={{ color: 'text.primary', fontWeight: 700 }}>
                  {fmtEuro(m.principal)}
                </Typography>
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Restschuld:{' '}
                <Typography component="strong" variant="caption" sx={{ color: 'error.main', fontWeight: 700 }}>
                  {fmtEuro(bal)}
                </Typography>
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Rate/Monat:{' '}
                <Typography component="strong" variant="caption" sx={{ color: 'text.primary', fontWeight: 700 }}>
                  {fmtEuro(monthlyRate(Number(m.principal), m.interest_rate, m.repayment_rate), 2)}
                </Typography>
              </Typography>
              {zb.active && (
                <Typography variant="caption" color="text.secondary">
                  Zinsbindung:{' '}
                  <Typography component="strong" variant="caption" sx={{
                    color: zb.level === 'red' ? 'error.main' : zb.level === 'yellow' ? 'warning.main' : 'text.primary',
                    fontWeight: 700,
                  }}>
                    {zb.label}
                  </Typography>
                </Typography>
              )}
            </Box>
          </SectionCard>
        );
      })}

      {editMortgage && (
        <MortgageForm mortgage={editMortgage} propertyId={p.id}
          onSave={handleSaveMortgage} onCancel={() => setEditMortgage(null)} />
      )}
      {showNewMortgage && (
        <MortgageForm propertyId={p.id}
          onSave={handleSaveMortgage} onCancel={() => setShowNewMortgage(false)} />
      )}
      {!showNewMortgage && !editMortgage && (
        <Button
          onClick={() => setShowNewMortgage(true)}
          startIcon={<AddIcon />}
          variant="outlined"
          sx={{ alignSelf: 'flex-start', borderStyle: 'dashed' }}
        >
          Darlehen hinzufügen
        </Button>
      )}
    </Stack>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function RealEstatePage() {
  const { steuerSatzAlter } = useModules();
  const {
    properties, mortgages, loading, error,
    addProperty, updateProperty, deleteProperty,
    addMortgage, updateMortgage, deleteMortgage,
  } = useRealEstate();

  const [selectedId, setSelectedId] = useState(null);
  const [showForm, setShowForm]     = useState(false);
  const [editProp, setEditProp]     = useState(null);

  // Portfolio KPIs
  const portfolio = useMemo(() => {
    let totalMarkt = 0, totalSchuld = 0, totalCashflow = 0, totalAfA = 0, totalSteuerVorteil = 0;
    properties.forEach((p) => {
      const marktwert = Number(p.market_value) || Number(p.purchase_price);
      totalMarkt += marktwert;
      const propMorts = mortgages.filter((m) => m.property_id === p.id);
      propMorts.forEach((m) => {
        const sched = buildMortgageSchedule(m);
        totalSchuld += getCurrentMortgageBalance(sched);
      });
      const rate = propMorts.reduce((s, m) => s + monthlyRate(Number(m.principal), m.interest_rate, m.repayment_rate), 0);
      if (p.type === 'vermietet') {
        totalCashflow += calcMonthlyCashflow(p.monthly_rent, rate, p.monthly_hausgeld, p.maintenance_reserve);
      }
      const afa = calcAfA(p, 'linear');
      totalAfA += afa.jahresAfa;
      if (p.type === 'vermietet') {
        const zinsenJ = propMorts.reduce((s, m) => {
          const sc = buildMortgageSchedule(m);
          const yr = sc.filter((e) => e.year === new Date().getFullYear());
          return s + yr.reduce((ss, e) => ss + e.zinsen, 0);
        }, 0);
        const sv = calcSteuerVorteil((p.monthly_rent || 0) * 12, zinsenJ, afa.jahresAfa, (p.monthly_hausgeld || 0) * 12, steuerSatzAlter || 42);
        if (sv.isNegativ) totalSteuerVorteil += sv.vorteil;
      }
    });
    return {
      totalMarkt, totalSchuld,
      nettoVermoegen: totalMarkt - totalSchuld,
      avgLTV: totalMarkt > 0 ? Math.round(totalSchuld / totalMarkt * 100) : 0,
      totalCashflow, totalAfA, totalSteuerVorteil,
    };
  }, [properties, mortgages, steuerSatzAlter]);

  async function handleSaveProperty(f) {
    const payload = {
      name: f.name || 'Neue Immobilie',
      type: f.type,
      purchase_price: Number(f.purchase_price) || 0,
      purchase_date: f.purchase_date || null,
      market_value: f.market_value ? Number(f.market_value) : null,
      land_value_ratio: Number(f.land_value_ratio) || 20,
      living_space: f.living_space ? Number(f.living_space) : null,
      build_year: f.build_year ? Number(f.build_year) : null,
      monthly_rent: Number(f.monthly_rent) || 0,
      monthly_hausgeld: Number(f.monthly_hausgeld) || 0,
      maintenance_reserve: Number(f.maintenance_reserve) || 0,
      color_code: f.color_code || '#7c3aed',
    };
    if (editProp) {
      await updateProperty(editProp.id, payload);
      setEditProp(null);
    } else {
      await addProperty(payload);
    }
    setShowForm(false);
  }

  if (loading) {
    return (
      <Stack alignItems="center" justifyContent="center" sx={{ minHeight: 200, color: 'text.secondary' }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <CircularProgress size={20} />
          <Typography variant="body2">Lade Immobilien…</Typography>
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

  // Detail view
  const selected = properties.find((p) => p.id === selectedId);
  if (selected) {
    return (
      <Box sx={{ p: { xs: 2, sm: 3 } }}>
        <PropertyDetail
          property={selected}
          mortgages={mortgages.filter((m) => m.property_id === selected.id)}
          onBack={() => setSelectedId(null)}
          onAddMortgage={addMortgage}
          onUpdateMortgage={updateMortgage}
          onDeleteMortgage={deleteMortgage}
        />
      </Box>
    );
  }

  // Dashboard view
  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <PageHeader
        title="Immobilien"
        subtitle={`${properties.length} Objekte im Portfolio`}
        actions={
          <Button variant="contained" startIcon={<AddIcon />}
            onClick={() => { setEditProp(null); setShowForm(true); }}>
            Immobilie
          </Button>
        }
      />

      {/* Portfolio KPIs */}
      {properties.length > 0 && (
        <Box sx={{
          display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fit, minmax(188px, 1fr))' }, gap: 2, mb: 2.5,
        }}>
          <StatCard label="Netto-Vermögen" value={fmtEuro(portfolio.nettoVermoegen)}
            sub={fmtEuro(portfolio.totalMarkt) + ' Marktwert'}
            accent={portfolio.nettoVermoegen >= 0 ? '#10b981' : '#ef4444'} />
          <StatCard label="Restschuld gesamt" value={fmtEuro(portfolio.totalSchuld)}
            sub={portfolio.avgLTV + '% Ø LTV'} accent="#ef4444" />
          <StatCard label="Cashflow mtl." value={fmtEuro(portfolio.totalCashflow, 2)}
            sub={portfolio.totalCashflow >= 0 ? 'Positiv' : 'Zuschussbedarf'}
            accent={portfolio.totalCashflow >= 0 ? '#10b981' : '#ef4444'} />
          <StatCard label="Steuervorteil p.a." value={fmtEuro(portfolio.totalSteuerVorteil)}
            sub={(steuerSatzAlter || 42) + '% Steuersatz'} accent="#10b981" />
          <StatCard label="AfA gesamt p.a." value={fmtEuro(portfolio.totalAfA)}
            sub="Absetzung für Abnutzung" accent="#f59e0b" />
        </Box>
      )}

      {/* New/Edit form */}
      {showForm && (
        <Box sx={{ mb: 2.5 }}>
          <PropertyForm property={editProp} onSave={handleSaveProperty}
            onCancel={() => { setShowForm(false); setEditProp(null); }} />
        </Box>
      )}

      {/* Property list */}
      {properties.length === 0 && !showForm ? (
        <SectionCard>
          <Box sx={{ textAlign: 'center', py: 5 }}>
            <Typography sx={{ fontSize: '2.5rem', mb: 1.5 }}>🏠</Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>Noch keine Immobilien</Typography>
            <Typography variant="body2" color="text.secondary">
              Lege dein erstes Objekt an, um das Portfolio zu starten.
            </Typography>
          </Box>
        </SectionCard>
      ) : (
        <Stack spacing={1.5}>
          {properties.map((p) => {
            const propMorts = mortgages.filter((m) => m.property_id === p.id);
            const marktwert = Number(p.market_value) || Number(p.purchase_price);
            const restschuld = propMorts.reduce((s, m) => {
              const sc = buildMortgageSchedule(m);
              return s + getCurrentMortgageBalance(sc);
            }, 0);
            const ltv = calcLTV(restschuld, marktwert);
            const rate = propMorts.reduce((s, m) => s + monthlyRate(Number(m.principal), m.interest_rate, m.repayment_rate), 0);
            const cf = p.type === 'vermietet' ? calcMonthlyCashflow(p.monthly_rent, rate, p.monthly_hausgeld, p.maintenance_reserve) : null;

            return (
              <Box
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                sx={(theme) => ({
                  display: 'flex',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  borderRadius: 1,
                  border: 1,
                  borderColor: 'divider',
                  backgroundColor: 'background.paper',
                  transition: 'border-color 0.15s',
                  '&:hover': { borderColor: p.color_code },
                })}
              >
                <Box sx={{ width: 4, backgroundColor: p.color_code, flexShrink: 0 }} />
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={2}
                  flexWrap="wrap"
                  useFlexGap
                  sx={{ flex: 1, p: '14px 18px' }}
                >
                  <Box sx={{ flex: 1, minWidth: 160 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{p.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {p.type === 'vermietet' ? 'Kapitalanlage' : 'Eigengenutzt'} · {p.living_space || '—'} m²
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: 'right', minWidth: 100 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
                      {fmtEuro(marktwert)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">Marktwert</Typography>
                  </Box>
                  <Box sx={{ textAlign: 'right', minWidth: 100 }}>
                    <Typography variant="body2" sx={{ color: 'error.main', fontWeight: 700, fontFamily: 'monospace' }}>
                      {fmtEuro(restschuld)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">{ltv}% LTV</Typography>
                  </Box>
                  {cf != null && (
                    <Box sx={{ textAlign: 'right', minWidth: 100 }}>
                      <Typography variant="body2" sx={{
                        color: cf >= 0 ? 'success.main' : 'error.main',
                        fontWeight: 700, fontFamily: 'monospace',
                      }}>
                        {fmtEuro(cf, 2)}/M
                      </Typography>
                      <Typography variant="caption" color="text.secondary">Cashflow</Typography>
                    </Box>
                  )}
                  <Stack direction="row" spacing={0.5}>
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); setEditProp(p); setShowForm(true); }}>
                      <EditOutlinedIcon fontSize="inherit" />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); deleteProperty(p.id); }}>
                      <DeleteOutlineIcon fontSize="inherit" />
                    </IconButton>
                  </Stack>
                </Stack>
              </Box>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}
