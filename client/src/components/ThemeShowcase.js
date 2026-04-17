import { useState } from 'react';
import {
  Box, Stack, Typography, Button, Chip, Alert, Switch, FormControlLabel,
  Slider, TextField, ToggleButton, ToggleButtonGroup, Paper, LinearProgress,
  Divider,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  SectionCard, KpiCard, CurrencyField, DateField, MoneyDisplay, PageHeader,
} from './mui';

function Section({ title, children }) {
  return (
    <Box sx={{ mb: 4 }}>
      <Typography variant="overline" sx={{
        display: 'block', color: 'text.secondary', fontWeight: 700,
        letterSpacing: '0.1em', mb: 1.5, pb: 0.75, borderBottom: 1, borderColor: 'divider',
      }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

export default function ThemeShowcase({ isDark, onToggleDark }) {
  const theme = useTheme();
  const [toggleOn, setToggleOn] = useState(true);
  const [sliderVal, setSliderVal] = useState(65);
  const [sampleAmount, setSampleAmount] = useState(1234.56);
  const [sampleDate, setSampleDate] = useState(new Date().toISOString().split('T')[0]);
  const [viewMode, setViewMode] = useState('jahr');

  return (
    <Box>
      {/* ── KPI Cards (mui Wrapper) ──────────────────────────────────── */}
      <Section title="KPI Cards (KpiCard wrapper)">
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fit, minmax(188px, 1fr))' }, gap: 2 }}>
          <KpiCard title="Gesamtkapital" value="855.073 €" sub="alle Policen kumuliert" accent="primary" />
          <KpiCard title="Mögl. Monatsrente" value="5.667 €/M" sub="erreichbar (brutto)" accent="success" />
          <KpiCard title="Netto-Monatsrente" value="4.230 €/M" sub="nach Steuer (PKV: 0€ SV)" accent="primary" />
          <KpiCard title="Einzahlungen ges." value="363.025 €" sub="alle Policen" accent="error" />
          <KpiCard title="Netto-Gewinn" value="492.048 €" sub="Faktor 2,4x gesamt" accent="success" />
        </Box>
      </Section>

      {/* ── SectionCard ──────────────────────────────────────────────── */}
      <Section title="SectionCard (wrapper)">
        <Stack spacing={2}>
          <SectionCard title="Standard SectionCard" subheader="Titel + Subheader">
            <Typography variant="body2" color="text.secondary">
              Inhalt einer typischen Sektion. SectionCard wird als Container für fast alle Formulare,
              Tabellen und Gruppen verwendet.
            </Typography>
          </SectionCard>
          <SectionCard
            title="Mit Action"
            action={<Button size="small" variant="contained">Aktion</Button>}
          >
            <Typography variant="body2" color="text.secondary">
              SectionCard mit Action-Slot rechts (z. B. für "Speichern" oder ToggleButtonGroup).
            </Typography>
          </SectionCard>
        </Stack>
      </Section>

      {/* ── Netto Hero Box ───────────────────────────────────────────── */}
      <Section title="Netto Hero Box">
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
              Nettoeinkommen / Monat
            </Typography>
            <Typography variant="caption" sx={{ display: 'block', opacity: 0.7 }}>
              nach allen Abzügen
            </Typography>
          </Box>
          <Typography variant="h4" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
            4.386,67 €
          </Typography>
        </Box>
      </Section>

      {/* ── Chips (Urgency / Status) ─────────────────────────────────── */}
      <Section title="Chips — Urgency & Status">
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip label="Dringend (12d)" color="error" variant="outlined" size="small" />
          <Chip label="Bald fällig (58d)" color="warning" variant="outlined" size="small" />
          <Chip label="Kein Handlungsbedarf" size="small" />
          <Chip label="Gekündigt" color="success" variant="outlined" size="small" />
          <Chip label="Amtlich geprüft" color="success" variant="outlined" size="small" />
          <Chip label="Admin" color="primary" size="small" />
        </Stack>
      </Section>

      {/* ── Form inputs (mui wrapper) ────────────────────────────────── */}
      <Section title="Form Inputs (CurrencyField / DateField / TextField)">
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
          gap: 1.5,
          maxWidth: 720,
        }}>
          <CurrencyField label="Betrag" value={sampleAmount} onChange={(v) => setSampleAmount(v || 0)} fullWidth />
          <CurrencyField label="Zinssatz" value={3.5} adornment="%" decimals={2} onChange={() => {}} fullWidth />
          <DateField label="Datum" value={sampleDate} onChange={(v) => setSampleDate(v)} />
          <TextField label="Name" size="small" fullWidth placeholder="Eingabe…" />
          <TextField select size="small" label="Optionen" value="a" SelectProps={{ native: true }}>
            <option value="a">Option A</option>
            <option value="b">Option B</option>
          </TextField>
          <Box>
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 0.5 }}>
              MoneyDisplay
            </Typography>
            <MoneyDisplay value={sampleAmount} variant="h6" bold color="auto" />
          </Box>
        </Box>
      </Section>

      {/* ── Toggle Buttons ──────────────────────────────────────────── */}
      <Section title="ToggleButtonGroup (View-Toggles)">
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={(_, v) => v && setViewMode(v)}
          size="small"
        >
          <ToggleButton value="jahr">Jahresansicht</ToggleButton>
          <ToggleButton value="monat">Monatsansicht</ToggleButton>
        </ToggleButtonGroup>
      </Section>

      {/* ── Buttons ─────────────────────────────────────────────────── */}
      <Section title="Buttons (MUI)">
        <Stack direction="row" spacing={1.25} flexWrap="wrap" useFlexGap>
          <Button variant="contained">Primary</Button>
          <Button variant="contained" color="secondary">Secondary</Button>
          <Button variant="outlined">Outlined</Button>
          <Button variant="text">Text</Button>
          <Button variant="contained" color="success">Success</Button>
          <Button variant="contained" color="error">Error</Button>
          <Button variant="outlined" color="warning">Warning</Button>
          <Button disabled>Disabled</Button>
        </Stack>
      </Section>

      {/* ── Alerts ──────────────────────────────────────────────────── */}
      <Section title="Alerts">
        <Stack spacing={1.25} sx={{ maxWidth: 600 }}>
          <Alert severity="info">Bitte ergänze dein Geburtsdatum in den Einstellungen.</Alert>
          <Alert severity="success">PKV-Vorteil: Keine SV-Abzüge auf Betriebsrente</Alert>
          <Alert severity="warning">Zinsbindung endet in 6 Monaten — Anschlussfinanzierung planen!</Alert>
          <Alert severity="error">Kapital erschöpft ab ~2071. Nachhaltige Rente: 1.178 €/Monat.</Alert>
          <Alert severity="info" variant="outlined">Halbeinkünfteverfahren (§20 Abs. 1 Nr. 6 EStG) — 50% steuerfrei</Alert>
        </Stack>
      </Section>

      {/* ── Switches ────────────────────────────────────────────────── */}
      <Section title="Switches (Einstellungen)">
        <Stack spacing={1.5} sx={{ maxWidth: 500 }}>
          {[
            { icon: '📊', label: 'Budget', desc: 'Monatliche Einnahmen & Ausgaben tracken', on: true },
            { icon: '🏥', label: 'PKV-Rechner', desc: 'Beitragsprognose & GKV-Vergleich', on: false },
          ].map((m) => (
            <Paper key={m.label} variant="outlined" sx={{
              p: '16px 20px',
              opacity: m.on ? 1 : 0.55,
              transition: 'opacity 0.2s',
            }}>
              <Stack direction="row" alignItems="center" spacing={2}>
                <Typography sx={{ fontSize: '1.5rem', flexShrink: 0 }}>{m.icon}</Typography>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{m.label}</Typography>
                  <Typography variant="caption" color="text.secondary">{m.desc}</Typography>
                </Box>
                <Switch defaultChecked={m.on} />
              </Stack>
            </Paper>
          ))}
        </Stack>
      </Section>

      {/* ── Slider ──────────────────────────────────────────────────── */}
      <Section title="Slider">
        <Box sx={{ maxWidth: 400 }}>
          <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
              Beispiel-Slider
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
              {sliderVal}%
            </Typography>
          </Stack>
          <Slider
            value={sliderVal}
            min={0}
            max={100}
            step={1}
            onChange={(_, v) => setSliderVal(v)}
            size="small"
          />
        </Box>
      </Section>

      {/* ── Progress Bars ───────────────────────────────────────────── */}
      <Section title="LinearProgress">
        <Stack spacing={1.75} sx={{ maxWidth: 400 }}>
          {[
            { label: 'Rücklagen', pct: 72, color: 'primary' },
            { label: 'KFZ-Kredit', pct: 45, color: 'error' },
            { label: 'Stromvertrag', pct: 100, color: 'success' },
          ].map((p) => (
            <Box key={p.label}>
              <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{p.label}</Typography>
                <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                  {p.pct}%
                </Typography>
              </Stack>
              <LinearProgress variant="determinate" value={p.pct} color={p.color} sx={{ height: 8, borderRadius: 99 }} />
            </Box>
          ))}
        </Stack>
      </Section>

      {/* ── Color Palette ───────────────────────────────────────────── */}
      <Section title="Farbpalette (aus Theme)">
        <Stack direction="row" spacing={1.25} flexWrap="wrap" useFlexGap>
          {[
            { name: 'Primary', key: 'primary.main' },
            { name: 'Secondary', key: 'secondary.main' },
            { name: 'Success', key: 'success.main' },
            { name: 'Warning', key: 'warning.main' },
            { name: 'Error', key: 'error.main' },
            { name: 'Info', key: 'info.main' },
            { name: 'BG Paper', key: 'background.paper' },
            { name: 'BG Default', key: 'background.default' },
            { name: 'Text Primary', key: 'text.primary' },
            { name: 'Text Secondary', key: 'text.secondary' },
            { name: 'Divider', key: 'divider' },
          ].map((c) => (
            <Box key={c.name} sx={{ textAlign: 'center' }}>
              <Box sx={{
                width: 48, height: 48, borderRadius: 1.25,
                bgcolor: c.key, border: 1, borderColor: 'divider',
              }} />
              <Typography variant="caption" sx={{ display: 'block', mt: 0.5, fontSize: '0.6rem' }}>
                {c.name}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Section>

      {/* ── Typography ──────────────────────────────────────────────── */}
      <Section title="Typografie-System">
        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <Stack spacing={1}>
            <Typography variant="h4">H4 — Seitentitel</Typography>
            <Typography variant="h5">H5 — Modulüberschrift</Typography>
            <Typography variant="h6">H6 — Kartenüberschrift</Typography>
            <Typography variant="subtitle1">Subtitle 1 — Abschnittstitel</Typography>
            <Typography variant="subtitle2">Subtitle 2 — Sub-Abschnitt</Typography>
            <Typography variant="body1">Body 1 — Standard Text</Typography>
            <Typography variant="body2">Body 2 — Sekundärtext</Typography>
            <Typography variant="caption">Caption — Labels</Typography>
            <Typography variant="overline">OVERLINE — Section Labels</Typography>
            <Divider />
            <MoneyDisplay value={1234.56} variant="h6" bold />
            <MoneyDisplay value={4386.67} variant="h4" bold color="success.main" />
          </Stack>
        </Paper>
      </Section>

      {/* ── Theme Toggle Banner ─────────────────────────────────────── */}
      <Box sx={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #4c1d95 40%, #7c3aed 70%, #f43f5e 100%)',
        borderRadius: 1,
        p: 4,
        textAlign: 'center',
        color: '#fff',
      }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.75 }}>
          Finanztracker Design System — {isDark ? 'Dark Mode' : 'Light Mode'}
        </Typography>
        <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,0.7)', mb: 2 }}>
          Material UI · Zentrales Theme · Wrapper-Barrel (components/mui)
        </Typography>
        <Button
          onClick={onToggleDark}
          variant="contained"
          sx={{
            bgcolor: 'rgba(255,255,255,0.15)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.3)',
            backdropFilter: 'blur(8px)',
            '&:hover': { bgcolor: 'rgba(255,255,255,0.22)' },
          }}
        >
          {isDark ? '☀️ Light Mode' : '🌙 Dark Mode'}
        </Button>
      </Box>
    </Box>
  );
}
