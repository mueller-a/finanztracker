import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Box, Stack, Typography, Button, IconButton, TextField, MenuItem,
  Checkbox, FormControlLabel, ToggleButton, ToggleButtonGroup,
  Tooltip as MuiTooltip, Alert, AlertTitle, CircularProgress, Chip,
  Divider, Tabs, Tab,
  Accordion, AccordionSummary, AccordionDetails,
  Table, TableBody, TableCell, TableRow,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import LinkIcon from '@mui/icons-material/Link';
import RefreshIcon from '@mui/icons-material/Refresh';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  DEFAULT_GEHALT, STEUERKLASSEN, BUNDESLAENDER,
  calcGehaltResult, calcNettoComparison, calcAgZuschuss, fmtEuro,
} from '../utils/salaryCalculations';
import { useSalarySettings } from '../hooks/useSalarySettings';
import { fetchBmfTaxValidation } from '../lib/bmfValidator';
import { PageHeader, SectionCard, CurrencyField } from '../components/mui';
import SalaryHistoryTab from './SalaryHistoryTab';

// ─── Lohnsteuer Tooltip Body ──────────────────────────────────────────────────
function LohnsteuerTooltipContent({ result, gh }) {
  const d = result.lstDetail;
  const rows = [
    ['Jahresbrutto (JB)', fmtEuro(d.JB, 0)],
    ['− Arbeitnehmer-Pauschbetrag', fmtEuro(d.ANP, 0)],
    ['− Sonderausgaben-Pauschbetrag', fmtEuro(d.SAP || 36, 0)],
    ['− Vorsorgepauschale §39b', fmtEuro(d.sonderausgaben, 0)],
  ];
  const vspKvPv = gh.ghKvType === 'pkv' ? [
    ['PKV Basisanteil', fmtEuro((result.pkvBasis || result.kvAN + result.agZuschuss) * 12, 0)],
    ['− AG-Zuschuss (steuerfrei)', '−' + fmtEuro(result.agZuschuss * 12, 0)],
    ['= Ist-Beiträge KV/PV', fmtEuro(result.vspKVPVist, 0)],
  ] : [
    ['KV-AN', fmtEuro(result.kvAN * 12, 0)],
    ['+ PV-AN', fmtEuro(result.pvAN * 12, 0)],
    ['= Ist-Beiträge KV/PV', fmtEuro(result.vspKVPVist, 0)],
  ];

  return (
    <Box sx={{ p: 0.5, color: 'text.primary' }}>
      <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, fontSize: '0.82rem', mb: 0.75 }}>
        Lohnsteuer-Berechnung §32a EStG
      </Typography>
      {rows.map(([l, v]) => (
        <Stack key={l} direction="row" justifyContent="space-between" spacing={1.5} sx={{ py: 0.25 }}>
          <Typography variant="caption">{l}</Typography>
          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{v}</Typography>
        </Stack>
      ))}

      {/* VSP §39b breakdown */}
      <Box sx={{
        bgcolor: 'action.hover', borderRadius: 1, p: 1, my: 0.5, fontSize: '0.68rem',
      }}>
        <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color: 'text.secondary', mb: 0.5 }}>
          Vorsorgepauschale §39b (Aufschlüsselung)
        </Typography>
        <Stack direction="row" justifyContent="space-between" sx={{ color: 'text.secondary' }}>
          <Typography variant="caption">1. RV-Anteil (9,3% AN, 100%)</Typography>
          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{fmtEuro(result.vspRV, 0)}</Typography>
        </Stack>
        <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: 'text.secondary', mt: 0.5, mb: 0.25 }}>
          2. KV/PV-Teilbetrag (Günstigerprüfung):
        </Typography>
        {vspKvPv.map(([l, v]) => (
          <Stack key={l} direction="row" justifyContent="space-between" sx={{ color: 'text.secondary' }}>
            <Typography variant="caption">{l}</Typography>
            <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{v}</Typography>
          </Stack>
        ))}
        <Stack direction="row" justifyContent="space-between" sx={{ color: 'text.secondary' }}>
          <Typography variant="caption">Mindest-VSP (12% Brutto)</Typography>
          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{fmtEuro(result.vspMindest, 0)}</Typography>
        </Stack>
        <Stack direction="row" justifyContent="space-between" sx={{ color: 'text.secondary' }}>
          <Typography variant="caption">Deckel Stkl. {gh.ghStkl}</Typography>
          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{fmtEuro(result.vspDeckel, 0)}</Typography>
        </Stack>
        <Stack direction="row" justifyContent="space-between" sx={{
          color: result.vspGuenstiger === 'mindest' ? 'warning.main' : 'success.main',
          fontWeight: 600, mt: 0.25,
        }}>
          <Typography variant="caption" sx={{ fontWeight: 'inherit' }}>
            → Günstiger: {result.vspGuenstiger === 'mindest' ? 'Mindest-VSP' : 'Ist-Beiträge'}
          </Typography>
          <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 'inherit' }}>{fmtEuro(result.vspKVPV, 0)}</Typography>
        </Stack>
        {result.vspAV > 0 && (
          <>
            <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: 'text.secondary', mt: 0.5, mb: 0.25 }}>
              3. AV-Anteil (§ 10 Abs. 1 Nr. 3a EStG):
            </Typography>
            <Stack direction="row" justifyContent="space-between" sx={{ color: 'text.secondary' }}>
              <Typography variant="caption">AV-AN (1,3%)</Typography>
              <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{fmtEuro(result.vspAV, 0)}</Typography>
            </Stack>
          </>
        )}
        <Divider sx={{ my: 0.5 }} />
        <Stack direction="row" justifyContent="space-between" sx={{ fontWeight: 700 }}>
          <Typography variant="caption" sx={{ fontWeight: 'inherit' }}>= Gesamt Vorsorgepauschale</Typography>
          <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 'inherit' }}>{fmtEuro(d.sonderausgaben, 0)}</Typography>
        </Stack>
      </Box>

      <Stack direction="row" justifyContent="space-between" sx={{ py: 0.25, fontWeight: 600 }}>
        <Typography variant="caption" sx={{ fontWeight: 'inherit' }}>= ZVE</Typography>
        <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 'inherit' }}>{fmtEuro(d.ZVE, 0)}</Typography>
      </Stack>
      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontSize: '0.65rem' }}>
        Grundfreibetrag ({fmtEuro(d.GFB, 0)}) ist in Zone 1 der Tarifformel enthalten
      </Typography>

      <Divider sx={{ my: 0.75 }} />
      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontSize: '0.7rem', mb: 0.5 }}>
        {d.ZVE <= 0 ? 'ZVE ≤ 0 → Keine Steuer'
          : d.ZVE <= 17799 ? 'Zone 2: y = (ZVE−12.348)/10.000 → (979,18·y+1.400)·y'
          : d.ZVE <= 68430 ? 'Zone 3: z = (ZVE−17.799)/10.000 → (192,59·z+2.397)·z+1.025,38'
          : d.ZVE <= 277825 ? 'Zone 4: 0,42·ZVE − 10.602,13'
          : 'Zone 5: 0,45·ZVE − 19.470,38'}
      </Typography>
      {d.splittingActive && (
        <Typography variant="caption" sx={{ display: 'block', color: 'info.main', mb: 0.5 }}>
          Splitting (Stkl. III): Ergebnis ÷ 2
        </Typography>
      )}
      <Stack direction="row" justifyContent="space-between" sx={{ fontWeight: 700 }}>
        <Typography variant="caption" sx={{ fontWeight: 'inherit' }}>= Lohnsteuer / Jahr</Typography>
        <Typography variant="caption" sx={{ color: 'error.main', fontFamily: 'monospace', fontWeight: 'inherit' }}>{fmtEuro(d.lstJahr, 0)}</Typography>
      </Stack>
      <Stack direction="row" justifyContent="space-between" sx={{ fontWeight: 700 }}>
        <Typography variant="caption" sx={{ fontWeight: 'inherit' }}>= Lohnsteuer / Monat</Typography>
        <Typography variant="caption" sx={{ color: 'error.main', fontFamily: 'monospace', fontWeight: 'inherit' }}>{fmtEuro(d.lstJahr / 12, 2)}</Typography>
      </Stack>
    </Box>
  );
}

// ─── BMF Debug-Panel ──────────────────────────────────────────────────────────
// Stellt Lokal-Werte und BMF-`raw`-Felder nebeneinander, um Abweichungen
// präzise lokalisieren zu können (VSP, ZVE, Tarif, Soli).
function BmfDebugPanel({ local, bmf }) {
  const raw = bmf.raw || {};
  // BMF liefert alle Werte in CENTS — Umrechnung € (außer ZAHL-Felder wie STKL).
  const cents = (k) => (raw[k] != null ? raw[k] / 100 : null);
  const num   = (k) => (raw[k] != null ? raw[k]       : null);

  const fmt = (v, d = 2) =>
    v == null || isNaN(v) ? '—'
      : v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtE = (v, d = 0) => v == null ? '—' : fmt(v, d) + ' €';

  // Zentrale Vergleichszeilen: lokal vs BMF, Diff
  const d = local.lstDetail;
  const compareRows = [
    ['Jahresbrutto (RE4)',           d.JB,                cents('RE4') ?? d.JB],
    ['Sonderausgaben (VSP gesamt)',  local.sonderausgabenJahr, null /* BMF gibt VSP nicht direkt aus */],
    ['– davon RV-Anteil',            local.vspRV,         cents('VSP1') ?? cents('VSPRENT')],
    ['– davon KV/PV-Anteil',         local.vspKVPV,       cents('VSPN') ?? cents('VKVLZZ')],
    ['– davon AV-Anteil',            local.vspAV,         null],
    ['ZVE (zu vers. Einkommen)',     d.ZVE,               cents('ZVE')],
    ['LSt-Jahr',                     local.lstJahr,       cents('LSTJAHR') ?? cents('LSTLZZ')],
    ['Soli-Jahr',                    local.soliJahr,      cents('SOLZJ') ?? cents('SOLZLZZ')],
  ];

  // Alle BMF-`<ausgabe>`-Tags als Tabelle (rohe Werte in € umgerechnet, wo sinnvoll)
  const rawEntries = Object.entries(raw).sort(([a], [b]) => a.localeCompare(b));

  return (
    <Accordion disableGutters elevation={0} sx={{ mt: 1.5, '&:before': { display: 'none' }, bgcolor: 'transparent' }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0, minHeight: 0, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          🔍 Detail-Vergleich (Lokal ↔ BMF)
        </Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 0, pt: 0 }}>
        {/* Curated Side-by-Side */}
        <Table size="small" sx={{ mb: 2 }}>
          <TableBody>
            <TableRow sx={{ '& th': { fontWeight: 700, color: 'text.secondary', fontSize: '0.72rem', textTransform: 'uppercase' } }}>
              <TableCell component="th">Größe</TableCell>
              <TableCell component="th" align="right">Lokal</TableCell>
              <TableCell component="th" align="right">BMF</TableCell>
              <TableCell component="th" align="right">Diff</TableCell>
            </TableRow>
            {compareRows.map(([label, l, b]) => {
              const diff = (l != null && b != null) ? b - l : null;
              const hasDiff = diff != null && Math.abs(diff) >= 1;
              return (
                <TableRow key={label} sx={{ '& td': { fontSize: '0.78rem', fontFamily: 'monospace' } }}>
                  <TableCell sx={{ fontFamily: 'inherit !important', fontSize: '0.78rem !important' }}>{label}</TableCell>
                  <TableCell align="right">{fmtE(l)}</TableCell>
                  <TableCell align="right" sx={{ color: b == null ? 'text.disabled' : 'text.primary' }}>
                    {b == null ? '—' : fmtE(b)}
                  </TableCell>
                  <TableCell align="right" sx={{ color: hasDiff ? 'warning.main' : 'text.disabled', fontWeight: hasDiff ? 700 : 400 }}>
                    {diff == null ? '—' : (diff > 0 ? '+' : '') + fmtE(diff)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {/* Roh-Dump aller BMF-Felder */}
        <Accordion disableGutters elevation={0} sx={{ '&:before': { display: 'none' }, bgcolor: 'action.hover', borderRadius: 1 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 0, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              BMF-Rohdaten ({rawEntries.length} Felder)
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 0.75, fontFamily: 'monospace', fontSize: '0.72rem' }}>
              {rawEntries.map(([k, v]) => (
                <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', borderBottom: 1, borderColor: 'divider', py: 0.25 }}>
                  <Typography component="span" variant="caption" sx={{ fontFamily: 'inherit', color: 'text.secondary' }}>{k}</Typography>
                  <Typography component="span" variant="caption" sx={{ fontFamily: 'inherit' }}>
                    {v} {Number.isInteger(v) && Math.abs(v) > 100 ? `(${(v / 100).toLocaleString('de-DE')} €)` : ''}
                  </Typography>
                </Box>
              ))}
            </Box>
          </AccordionDetails>
        </Accordion>
      </AccordionDetails>
    </Accordion>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SalaryPage() {
  const theme = useTheme();
  const { settings, loading, saveSettings } = useSalarySettings();

  const [gh, setGh] = useState(DEFAULT_GEHALT);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [bmfStatus, setBmfStatus] = useState('idle');
  const [bmfResult, setBmfResult] = useState(null);
  const [activeTab, setActiveTab] = useState('current'); // 'current' | 'history'
  const debounceRef = useRef(null);
  const savedRef    = useRef(null);
  const mountedRef  = useRef(false);

  useEffect(() => {
    if (!loading && settings) setGh({ ...DEFAULT_GEHALT, ...settings });
  }, [loading, settings]);

  useEffect(() => {
    if (!loading) {
      const id = setTimeout(() => { mountedRef.current = true; }, 100);
      return () => clearTimeout(id);
    }
  }, [loading]);

  const doSave = useCallback(async (params) => {
    setSaveStatus('saving');
    try {
      const netto = calcGehaltResult(params, params.ghPkvBeitrag, 0).netto;
      await saveSettings(params, netto);
      setSaveStatus('saved');
      clearTimeout(savedRef.current);
      savedRef.current = setTimeout(() => setSaveStatus('idle'), 2500);
    } catch {
      setSaveStatus('error');
    }
  }, [saveSettings]);

  useEffect(() => {
    if (!mountedRef.current) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSave(gh), 700);
    return () => clearTimeout(debounceRef.current);
  }, [gh, doSave]);

  function update(patch) {
    setGh((p) => ({ ...p, ...patch }));
    if (bmfStatus !== 'idle') { setBmfStatus('idle'); setBmfResult(null); }
  }

  const result = useMemo(() => calcGehaltResult(gh, gh.ghPkvBeitrag, 0), [gh]);
  const comp   = useMemo(() => calcNettoComparison(gh, gh.ghPkvBeitrag), [gh]);

  const mul  = gh.ghView === 'jahr' ? 12 : 1;
  const suf  = gh.ghView === 'jahr' ? ' / Jahr' : ' / Monat';
  const fmtE = (v) => fmtEuro(v * mul, 2);

  async function handleBmfValidate() {
    setBmfStatus('loading');
    setBmfResult(null);
    try {
      const r = await fetchBmfTaxValidation(gh, result);
      setBmfResult(r);
      if (!r.ok) setBmfStatus('error');
      else if (r.match) setBmfStatus('match');
      else setBmfStatus('mismatch');
    } catch (err) {
      setBmfStatus('error');
      setBmfResult({ ok: false, error: err.message });
    }
  }

  function syncFromPkvDraft() {
    try {
      const raw = localStorage.getItem('pkv_draft');
      if (!raw) return;
      const state = JSON.parse(raw);
      if (!state?.tarife?.length) return;
      const total = state.tarife.reduce((s, t) => s + (t.amount || 0), 0);
      const basis = state.tarife.filter(t => t.steuer).reduce((s, t) => s + (t.amount * (t.steuerPct || 0) / 100), 0);
      const agMax = calcAgZuschuss(total, gh.ghBrutto, gh.ghGkvZusatz);
      update({
        ghPkvBeitrag: Math.round(total * 100) / 100,
        ghPkvBasis: Math.round(basis * 100) / 100,
        ghPkvAgZuschuss: Math.round(agMax * 100) / 100,
        ghPkvSynced: true,
      });
    } catch {}
  }

  if (loading) {
    return (
      <Stack alignItems="center" justifyContent="center" sx={{ minHeight: 200, color: 'text.secondary' }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <CircularProgress size={20} />
          <Typography variant="body2">Lade Gehaltseinstellungen…</Typography>
        </Stack>
      </Stack>
    );
  }

  // ── Status indicator ────────────────────────────────────────────────────────
  let statusEl = null;
  if (saveStatus === 'saving') {
    statusEl = <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 600 }}>↑ Speichert…</Typography>;
  } else if (saveStatus === 'saved') {
    statusEl = <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600 }}>✓ Gespeichert</Typography>;
  } else if (saveStatus === 'error') {
    statusEl = (
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 600 }}>✕ Fehler</Typography>
        <Button size="small" variant="outlined" color="error" onClick={() => doSave(gh)} startIcon={<RefreshIcon />}>
          Erneut versuchen
        </Button>
      </Stack>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1100 }}>
      <PageHeader
        title="Gehaltsrechner"
        subtitle="Netto-Berechnung mit Lohnsteuer, Sozialversicherung & PKV/GKV-Vergleich"
        actions={statusEl}
      />

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2.5 }}>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
          <Tab value="current" label="Aktueller Rechner" />
          <Tab value="history" label="Gehaltshistorie & Prognose" />
        </Tabs>
      </Box>

      {activeTab === 'history' && (
        <SalaryHistoryTab baseParams={gh} />
      )}

      {activeTab === 'current' && (
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '300px 1fr' },
        gap: 3,
        alignItems: 'flex-start',
      }}>
        {/* ── Sidebar ── */}
        <Stack spacing={2}>
          <SectionCard title="Gehalt">
            <Stack spacing={1.5}>
              <CurrencyField
                label="Bruttogehalt monatlich"
                value={gh.ghBrutto}
                onChange={(v) => update({ ghBrutto: v === '' ? 0 : v })}
                fullWidth
                inputProps={{ step: 100, min: 0 }}
              />
              <TextField
                select label="Steuerklasse" value={gh.ghStkl}
                onChange={(e) => update({ ghStkl: parseInt(e.target.value, 10) })}
                fullWidth
              >
                {STEUERKLASSEN.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
              </TextField>
              <TextField
                select label="Bundesland" value={gh.ghBundesland}
                onChange={(e) => update({ ghBundesland: parseInt(e.target.value, 10) })}
                fullWidth
              >
                {BUNDESLAENDER.map((b) => <MenuItem key={b.value} value={b.value}>{b.label}</MenuItem>)}
              </TextField>
            </Stack>
          </SectionCard>

          <SectionCard title="Steuern & Abgaben">
            <Stack spacing={0.5}>
              {[
                ['Kirchensteuer', 'ghKist'],
                ['Rentenversicherung (9,3%)', 'ghRv'],
                ['Arbeitslosenversicherung (1,3%)', 'ghAv'],
              ].map(([label, key]) => (
                <FormControlLabel
                  key={key}
                  control={
                    <Checkbox
                      size="small"
                      checked={!!gh[key]}
                      onChange={(e) => update({ [key]: e.target.checked })}
                    />
                  }
                  label={<Typography variant="body2">{label}</Typography>}
                />
              ))}
              <TextField
                select label="Kinder (PV-Staffelung)" value={gh.ghKinder}
                onChange={(e) => update({ ghKinder: parseInt(e.target.value, 10) })}
                fullWidth size="small" sx={{ mt: 1 }}
              >
                {[0, 1, 2, 3, 4, 5].map((k) => (
                  <MenuItem key={k} value={k}>
                    {k} {k === 0 ? 'Kinder (kinderlos +0,6%)' : k === 1 ? 'Kind' : `Kinder (−${(k - 1) * 0.25}% PV)`}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
          </SectionCard>

          <SectionCard title="Krankenversicherung">
            <ToggleButtonGroup
              value={gh.ghKvType}
              exclusive
              onChange={(_, v) => v && update({ ghKvType: v })}
              size="small"
              fullWidth
              sx={{ mb: 1.5 }}
            >
              <ToggleButton value="gkv">GKV</ToggleButton>
              <ToggleButton value="pkv">PKV</ToggleButton>
            </ToggleButtonGroup>

            {gh.ghKvType === 'gkv' ? (
              <CurrencyField
                label="GKV-Zusatzbeitrag"
                value={gh.ghGkvZusatz}
                onChange={(v) => update({ ghGkvZusatz: v === '' ? 1.7 : v })}
                adornment="%"
                decimals={2}
                inputProps={{ min: 0, max: 5, step: 0.01 }}
                fullWidth
              />
            ) : (
              <Stack spacing={1.5}>
                <Button
                  variant="outlined" color="info" size="small"
                  startIcon={<LinkIcon />}
                  onClick={syncFromPkvDraft}
                >
                  Aus PKV-Rechner synchronisieren
                </Button>

                <CurrencyField
                  label={
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <span>PKV-Beitrag Gesamt</span>
                      {gh.ghPkvSynced && <LinkIcon sx={{ fontSize: 12, color: 'info.main' }} />}
                    </Stack>
                  }
                  value={gh.ghPkvBeitrag}
                  onChange={(v) => update({ ghPkvBeitrag: v === '' ? 0 : v, ghPkvSynced: false })}
                  fullWidth
                  inputProps={{ step: 1, min: 0 }}
                />

                <CurrencyField
                  label={
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <span>PKV-Basisanteil</span>
                      {gh.ghPkvSynced && <LinkIcon sx={{ fontSize: 12, color: 'info.main' }} />}
                    </Stack>
                  }
                  value={gh.ghPkvBasis || ''}
                  onChange={(v) => update({ ghPkvBasis: v === '' ? 0 : v, ghPkvSynced: false })}
                  fullWidth
                  placeholder="steuerlich absetzbar"
                  helperText="Nur Basisanteil mindert die Vorsorgepauschale (§39b EStG)"
                  inputProps={{ step: 1, min: 0 }}
                />

                <Box>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>AG-Zuschuss</Typography>
                    <Button
                      size="small" variant="text"
                      onClick={() => {
                        const maxAg = calcAgZuschuss(gh.ghPkvBeitrag || 0, gh.ghBrutto, gh.ghGkvZusatz);
                        update({ ghPkvAgZuschuss: Math.round(maxAg * 100) / 100 });
                      }}
                      sx={{ minWidth: 0, fontSize: '0.6rem', py: 0 }}
                    >
                      Max. berechnen
                    </Button>
                  </Stack>
                  <CurrencyField
                    value={gh.ghPkvAgZuschuss || ''}
                    onChange={(v) => update({ ghPkvAgZuschuss: v === '' ? 0 : v, ghPkvSynced: false })}
                    fullWidth
                    placeholder="0"
                    inputProps={{ step: 1, min: 0 }}
                    helperText="Steuerfrei, max. 613,22 €/Mon (§257 SGB V)"
                  />
                </Box>

                {gh.ghPkvBeitrag > 0 && (
                  <Alert severity="info" variant="outlined" icon={false} sx={{ fontSize: '0.72rem', py: 0.5 }}>
                    Eigenanteil: <strong>{fmtEuro(Math.max(0, (gh.ghPkvBeitrag || 0) - (gh.ghPkvAgZuschuss || 0)), 2)}/Mon</strong>
                    <br />Netto = Brutto − LSt − Soli − RV − AV − Eigenanteil
                  </Alert>
                )}
              </Stack>
            )}
          </SectionCard>
        </Stack>

        {/* ── Content ── */}
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          {/* View toggle */}
          <Stack direction="row" justifyContent="flex-end">
            <ToggleButtonGroup
              size="small"
              value={gh.ghView}
              exclusive
              onChange={(_, v) => v && update({ ghView: v })}
            >
              <ToggleButton value="monat">Monatlich</ToggleButton>
              <ToggleButton value="jahr">Jährlich</ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          {/* Netto hero */}
          <Box sx={{
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            borderRadius: 1,
            p: 3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 2,
          }}>
            <Box>
              <Typography variant="caption" sx={{ display: 'block', opacity: 0.85, fontWeight: 600 }}>
                Nettoeinkommen{suf}
              </Typography>
              <Typography variant="caption" sx={{ display: 'block', opacity: 0.7 }}>
                nach allen Abzügen
              </Typography>
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
              {fmtE(result.netto)}
            </Typography>
          </Box>

          {/* BMF Validation */}
          <SectionCard
            title="BMF-Abgleich"
            subheader="Offizielle Lohnsteuer-Schnittstelle (LSt2026ext)"
            action={
              bmfStatus === 'idle' ? (
                <Button
                  variant="contained" size="small"
                  startIcon={<FactCheckOutlinedIcon />}
                  onClick={handleBmfValidate}
                >
                  Mit BMF abgleichen
                </Button>
              ) : bmfStatus === 'loading' ? (
                <Stack direction="row" spacing={1} alignItems="center">
                  <CircularProgress size={14} />
                  <Typography variant="caption" color="text.secondary">Prüfung läuft…</Typography>
                </Stack>
              ) : bmfStatus === 'match' && bmfResult ? (
                <MuiTooltip arrow placement="left" title={
                  <Box sx={{ p: 0.5 }}>
                    <Typography variant="caption" sx={{ display: 'block' }}>Lokale LSt: <strong>{fmtEuro(bmfResult.localLstJahr, 0)}</strong>/Jahr</Typography>
                    <Typography variant="caption" sx={{ display: 'block' }}>BMF LSt: <strong>{fmtEuro(bmfResult.bmfLstJahr, 0)}</strong>/Jahr</Typography>
                    <Typography variant="caption" sx={{ display: 'block' }}>BMF Soli: {fmtEuro(bmfResult.bmfSoliJahr, 0)}/Jahr</Typography>
                  </Box>
                }>
                  <Chip label="✓ Amtlich geprüft" color="success" variant="outlined" size="small" sx={{ cursor: 'help' }} />
                </MuiTooltip>
              ) : bmfStatus === 'mismatch' && bmfResult ? (
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Chip
                    label={`⚠ Abweichung ${bmfResult.diff >= 0 ? '+' : ''}${fmtEuro(bmfResult.diff, 0)}/Jahr`}
                    color="warning" variant="outlined" size="small"
                  />
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
                    Lokal: {fmtEuro(bmfResult.localLstJahr, 0)} · BMF: {fmtEuro(bmfResult.bmfLstJahr, 0)}
                  </Typography>
                  <IconButton size="small" onClick={handleBmfValidate}><RefreshIcon fontSize="inherit" /></IconButton>
                </Stack>
              ) : (
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip label={`✕ ${bmfResult?.error || 'BMF nicht erreichbar'}`} color="error" variant="outlined" size="small" />
                  <IconButton size="small" onClick={handleBmfValidate}><RefreshIcon fontSize="inherit" /></IconButton>
                </Stack>
              )
            }
          >
            {bmfStatus === 'idle' && (
              <Typography variant="caption" color="text.secondary">
                Lohnsteuer-Berechnung gegen die offizielle BMF-Schnittstelle prüfen.
              </Typography>
            )}
            {bmfResult?.ok && bmfResult?.raw && (
              <BmfDebugPanel local={result} bmf={bmfResult} />
            )}
          </SectionCard>

          {/* Abzüge table */}
          <SectionCard title="Abzüge im Überblick">
            <Stack divider={<Divider flexItem />} spacing={0}>
              {[
                ['Bruttogehalt', fmtE(result.brutto), 'success.main', null],
                ['Lohnsteuer', '− ' + fmtE(result.lstMo), 'error.main', 'lst'],
                ['Solidaritätszuschlag', result.soliMo > 0.005 ? '− ' + fmtE(result.soliMo) : '0,00 €', result.soliMo > 0.005 ? 'error.main' : 'text.secondary', null],
                ['Kirchensteuer', result.kistMo > 0.005 ? '− ' + fmtE(result.kistMo) : '0,00 €', result.kistMo > 0.005 ? 'error.main' : 'text.secondary', null],
                [gh.ghKvType === 'pkv' ? 'PKV-Eigenanteil (AN)' : 'Krankenversicherung (AN)', '− ' + fmtE(result.kvAN), 'warning.main', null],
                ...(gh.ghKvType === 'pkv' && result.agZuschuss > 0 ? [['davon AG-Zuschuss PKV', '+ ' + fmtE(result.agZuschuss), 'success.main', null]] : []),
                ...(result.pvAN > 0.005 ? [['Pflegeversicherung (AN)', '− ' + fmtE(result.pvAN), 'warning.main', null]] : []),
                ['Rentenversicherung (AN)', result.rv > 0 ? '− ' + fmtE(result.rv) : '—', result.rv > 0 ? 'warning.main' : 'text.secondary', null],
                ['Arbeitslosenversicherung (AN)', result.av > 0 ? '− ' + fmtE(result.av) : '—', result.av > 0 ? 'warning.main' : 'text.secondary', null],
                ['Gesamt-Abzüge', '− ' + fmtE(result.gesamtAbzug), 'error.main', null],
              ].map(([label, value, color, tooltip]) => {
                const row = (
                  <Stack
                    key={label}
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ py: 0.75, cursor: tooltip ? 'help' : 'default' }}
                  >
                    <Typography variant="body2" color="text.secondary">{label}</Typography>
                    <Typography variant="body2" sx={{ color, fontWeight: 600, fontFamily: 'monospace' }}>{value}</Typography>
                  </Stack>
                );
                if (tooltip !== 'lst') return row;
                return (
                  <MuiTooltip
                    key={label}
                    arrow
                    placement="right"
                    slotProps={{
                      tooltip: {
                        sx: {
                          maxWidth: 380,
                          bgcolor: 'background.paper',
                          color: 'text.primary',
                          border: 1,
                          borderColor: 'divider',
                          boxShadow: 4,
                          p: 1.5,
                        },
                      },
                    }}
                    title={<LohnsteuerTooltipContent result={result} gh={gh} />}
                  >
                    {row}
                  </MuiTooltip>
                );
              })}
            </Stack>
            <Stack direction="row" justifyContent="space-between" sx={{ pt: 1.5, mt: 0.5, borderTop: 1, borderColor: 'divider' }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>= Nettoeinkommen</Typography>
              <Typography variant="body1" sx={{ color: 'success.main', fontWeight: 700, fontFamily: 'monospace' }}>
                {fmtE(result.netto)}
              </Typography>
            </Stack>
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1 }}>
              Vorsorgepauschale §39b EStG: {fmtEuro(result.sonderausgabenJahr / 12, 2)}/Monat
              ({fmtEuro(result.sonderausgabenJahr, 0)}/Jahr) mindert Lohnsteuer
            </Typography>
          </SectionCard>

          {/* PKV vs GKV netto comparison */}
          {(gh.ghKvType === 'pkv' && gh.ghPkvBeitrag > 0) && (
            <SectionCard title="PKV vs. GKV · Netto-Vergleich">
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5, mb: 1.5 }}>
                <Box sx={{
                  bgcolor: theme.palette.mode === 'dark' ? 'rgba(232,184,75,0.07)' : 'rgba(232,184,75,0.06)',
                  borderRadius: 1, p: 1.5,
                }}>
                  <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.5 }}>
                    Netto mit PKV (AN)
                  </Typography>
                  <Typography variant="h6" sx={{ color: '#e8b84b', fontWeight: 700, fontFamily: 'monospace' }}>
                    {fmtEuro(comp.nettoPkv, 2)}/Monat
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    PKV-AN {fmtEuro(comp.kvPkv, 2)} · AG {fmtEuro(comp.agZ, 2)}
                  </Typography>
                </Box>
                <Box sx={{
                  bgcolor: theme.palette.mode === 'dark' ? 'rgba(91,141,238,0.07)' : 'rgba(91,141,238,0.06)',
                  borderRadius: 1, p: 1.5,
                }}>
                  <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.5 }}>
                    Netto mit GKV (AN)
                  </Typography>
                  <Typography variant="h6" sx={{ color: '#5b8dee', fontWeight: 700, fontFamily: 'monospace' }}>
                    {fmtEuro(comp.nettoGkv, 2)}/Monat
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    KV {fmtEuro(comp.kvGkv, 2)} + PV {fmtEuro(comp.pvGkv, 2)}
                  </Typography>
                </Box>
              </Box>
              <Alert
                severity={Math.abs(comp.nettoDiff) < 1 ? 'info' : comp.nettoDiff > 0 ? 'success' : 'error'}
                variant="outlined"
                sx={{ fontFamily: 'monospace', fontWeight: 600 }}
              >
                {Math.abs(comp.nettoDiff) < 1
                  ? '≈ Gleichauf'
                  : comp.nettoDiff > 0
                    ? `PKV → +${fmtEuro(Math.abs(comp.nettoDiff), 2)}/Monat mehr Netto`
                    : `GKV → +${fmtEuro(Math.abs(comp.nettoDiff), 2)}/Monat mehr Netto`}
              </Alert>
            </SectionCard>
          )}

          {/* Hint: budget integration */}
          <Alert severity="success" variant="outlined">
            Netto wird automatisch gespeichert und als Einnahmequelle im Budget-Modul vorgeschlagen.
          </Alert>
        </Stack>
      </Box>
      )}
    </Box>
  );
}
