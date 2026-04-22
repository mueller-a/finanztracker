import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import {
  Box, Stack, Typography, Switch, FormControlLabel, ToggleButton, ToggleButtonGroup,
  Tabs, Tab, CircularProgress, Chip, Paper, TextField,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
} from '@mui/material';
import CodeIcon from '@mui/icons-material/Code';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import { useModules, calculateAge } from '../context/ModuleContext';
import { supabase } from '../lib/supabaseClient';
import ThemeShowcase from '../components/ThemeShowcase';
import { PageHeader, SectionCard, DateField } from '../components/mui';
import { AdminModulesPanel } from './AdminModulesPage';

// ── Module cards config ───────────────────────────────────────────────────────
// Icons sind Material-Symbols-Outlined-Namen (rendern als Ghost-Box wie der
// PageHeader). Konsistent mit den Modul-Icons in Sidebar + Overview.
const MODULE_CARDS = [
  { key: 'show_budget',          label: 'Budget',                  desc: 'Monatliche Einnahmen & Ausgaben tracken',         icon: 'account_balance_wallet' },
  { key: 'show_salary',          label: 'Gehaltsrechner',          desc: 'Nettolohn, Steuer & SV-Berechnung',               icon: 'calculate' },
  { key: 'show_insurance',       label: 'Versicherungen',          desc: 'Versicherungskategorien & Beitragsübersicht',     icon: 'shield' },
  { key: 'show_pkv_calc',        label: 'PKV-Rechner',             desc: 'Beitragsprognose & GKV-Vergleich',                icon: 'health_and_safety' },
  { key: 'show_electricity',     label: 'Stromübersicht',          desc: 'Verbrauch, Tarife & Kostenentwicklung',           icon: 'bolt' },
  { key: 'show_debts',           label: 'Verbindlichkeiten',       desc: 'Kredite, Tilgungspläne & Sondertilgung',          icon: 'account_balance' },
  { key: 'show_savings',         label: 'Guthaben / Asset-Manager',desc: 'Sparziele, Anleihen, Tagesgeld & ETF-Soft-Link',  icon: 'savings' },
  { key: 'show_retirement_plan', label: 'Ruhestandsplanung',       desc: 'Rentenrechner, DRV, bAV & Depot-Vergleich',       icon: 'trending_up' },
  { key: 'show_real_estate',     label: 'Immobilien',              desc: 'Portfolio, Tilgungspläne, AfA & Steuervorteil',   icon: 'home_work' },
];

// Kleine Helper-Komponente für die Ghost-Box-Icons in den Settings-Karten
function ModuleIcon({ name }) {
  return (
    <Box sx={{
      width: 40, height: 40, borderRadius: '20px',
      bgcolor: 'surface.highest',
      color: 'text.primary',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <Box component="span" className="material-symbols-outlined" sx={{ fontSize: 22 }}>{name}</Box>
    </Box>
  );
}

// ── Module tab ────────────────────────────────────────────────────────────────
function ModuleTab({ modules, setModule, birthday, setBirthday, isPkv, setIsPkv, steuerSatzAlter, setSteuerSatzAlter }) {
  const age = calculateAge(birthday);

  return (
    <Stack spacing={3}>
      {/* Personal info */}
      <Box>
        <Typography variant="overline" sx={{
          color: 'text.secondary', fontWeight: 700, letterSpacing: '0.1em',
          display: 'block', mb: 1.25, pb: 0.75, borderBottom: 1, borderColor: 'divider',
        }}>
          Persönliche Informationen
        </Typography>
        <SectionCard dense>
          <Stack direction="row" alignItems="center" spacing={2}>
            <ModuleIcon name="cake" />
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.75 }}>Geburtsdatum</Typography>
              <Box sx={{ maxWidth: 220 }}>
                <DateField value={birthday || ''} onChange={(v) => setBirthday(v || null)} />
              </Box>
            </Box>
            {age != null && (
              <Box sx={{ textAlign: 'right' }}>
                <Typography variant="h5" sx={{ color: 'primary.main', fontWeight: 700 }}>{age}</Typography>
                <Typography variant="caption" color="text.secondary">Jahre</Typography>
              </Box>
            )}
          </Stack>
        </SectionCard>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75, pl: 0.5 }}>
          Wird automatisch im PKV-Rechner und der Ruhestandsplanung verwendet.
        </Typography>
      </Box>

      {/* Retirement tax settings */}
      <Box>
        <Typography variant="overline" sx={{
          color: 'text.secondary', fontWeight: 700, letterSpacing: '0.1em',
          display: 'block', mb: 1.25, pb: 0.75, borderBottom: 1, borderColor: 'divider',
        }}>
          Ruhestand & Steuer
        </Typography>
        <Stack spacing={1.5}>
          <SectionCard dense>
            <Stack direction="row" alignItems="center" spacing={2}>
              <ModuleIcon name="health_and_safety" />
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>Krankenversicherung im Alter</Typography>
                <Typography variant="caption" color="text.secondary">
                  {isPkv ? 'PKV: Keine SV-Abzüge auf Betriebsrente' : 'GKV: ~19% KV+PV auf Betriebsrente'}
                </Typography>
              </Box>
              <ToggleButtonGroup
                value={isPkv}
                exclusive
                size="small"
                onChange={(_, v) => v != null && setIsPkv(v)}
              >
                <ToggleButton value={true}>PKV</ToggleButton>
                <ToggleButton value={false}>GKV</ToggleButton>
              </ToggleButtonGroup>
            </Stack>
          </SectionCard>
          <SectionCard dense>
            <Stack direction="row" alignItems="center" spacing={2}>
              <ModuleIcon name="percent" />
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>Steuersatz im Alter</Typography>
                <Typography variant="caption" color="text.secondary">
                  Geschätzter persönlicher Steuersatz auf Renteneinkünfte
                </Typography>
              </Box>
              <Stack direction="row" alignItems="center" spacing={1}>
                <TextField
                  type="number"
                  size="small"
                  value={steuerSatzAlter}
                  onChange={(e) => setSteuerSatzAlter(parseInt(e.target.value, 10) || 25)}
                  inputProps={{ min: 0, max: 50, step: 1, style: { textAlign: 'center', fontWeight: 700 } }}
                  sx={{ width: 80 }}
                />
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>%</Typography>
              </Stack>
            </Stack>
          </SectionCard>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{
          display: 'block', mt: 0.75, pl: 0.5, fontStyle: 'italic',
        }}>
          Hinweis: Steuerberechnung basiert auf Schätzwerten. Die tatsächliche Steuerlast hängt vom Gesamteinkommen im Alter ab.
        </Typography>
      </Box>

      {/* Module toggles */}
      <Box>
        <Typography variant="overline" sx={{
          color: 'text.secondary', fontWeight: 700, letterSpacing: '0.1em',
          display: 'block', mb: 1.25, pb: 0.75, borderBottom: 1, borderColor: 'divider',
        }}>
          Module
        </Typography>
        <Stack spacing={1.5}>
          {MODULE_CARDS.map(({ key, label, desc, icon }) => (
            <SectionCard key={key} dense sx={{ opacity: modules[key] ? 1 : 0.55, transition: 'opacity 0.2s' }}>
              <Stack direction="row" alignItems="center" spacing={2}>
                <ModuleIcon name={icon} />
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{label}</Typography>
                  <Typography variant="caption" color="text.secondary">{desc}</Typography>
                </Box>
                <Switch
                  checked={!!modules[key]}
                  onChange={(e) => setModule(key, e.target.checked)}
                />
              </Stack>
            </SectionCard>
          ))}
        </Stack>
      </Box>
    </Stack>
  );
}

// ── Developer tab (admin only) ────────────────────────────────────────────────
function DeveloperTab() {
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc('get_all_user_settings');
    if (!data) { setLoading(false); return; }

    const { data: { user: me } } = await supabase.auth.getUser();
    const enriched = data.map((row) => ({
      ...row,
      email: row.user_id === me?.id ? me.email : null,
      name:  row.user_id === me?.id ? (me.user_metadata?.full_name ?? me.email) : null,
      isMe:  row.user_id === me?.id,
    }));
    setUsers(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
          Registrierte Nutzer
        </Typography>
        {loading ? (
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ color: 'text.secondary' }}>
            <CircularProgress size={16} />
            <Typography variant="body2">Lade Nutzer…</Typography>
          </Stack>
        ) : (
          <TableContainer component={Paper} sx={{ borderRadius: 3 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Nutzer', 'Rolle', 'Aktive Module', 'Dark Mode', 'Letztes Update'].map((h) => (
                    <TableCell key={h}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((u) => {
                  const activeModules = MODULE_CARDS.filter((c) => u[c.key] !== false).map((c) => c.label);
                  const disabledModules = MODULE_CARDS.filter((c) => u[c.key] === false).map((c) => c.label);
                  return (
                    <TableRow key={u.user_id}>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {u.name ?? u.user_id.substring(0, 8) + '…'}
                          {u.isMe && (
                            <Typography component="span" variant="caption" sx={{ ml: 0.75, color: 'primary.main', fontWeight: 700 }}>
                              (Du)
                            </Typography>
                          )}
                        </Typography>
                        {u.email && (
                          <Typography variant="caption" color="text.secondary">{u.email}</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={u.role ?? 'user'}
                          size="small"
                          color={u.role === 'admin' ? 'success' : 'default'}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" title={`Aktiv: ${activeModules.join(', ')}\nDeaktiviert: ${disabledModules.join(', ') || '–'}`}>
                          {activeModules.length}/{MODULE_CARDS.length} Module
                        </Typography>
                        {disabledModules.length > 0 && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            Aus: {disabledModules.join(', ')}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {u.dark_mode === true ? 'Dark' : u.dark_mode === false ? 'Light' : '–'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
                          {u.updated_at ? new Date(u.updated_at).toLocaleDateString('de-DE', {
                            day: '2-digit', month: '2-digit', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          }) : '–'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </Stack>
  );
}

// ── Theme Showcase tab (Admin-only) ──────────────────────────────────────────
function ThemeShowcaseTab({ isDark, onToggleDark }) {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Live-Vorschau aller MUI-Theme-Tokens — Farben, Typografie, Buttons,
        Karten, Eingabefelder. Dient als Design-Referenz.
      </Typography>
      <ThemeShowcase isDark={isDark} onToggleDark={onToggleDark} />
    </Box>
  );
}

// ── Settings page ─────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { isDark, onToggleDark } = useOutletContext();
  const {
    modules, setModule, loading, isAdmin,
    birthday, setBirthday, isPkv, setIsPkv,
    steuerSatzAlter, setSteuerSatzAlter,
  } = useModules();
  const [activeTab, setActiveTab] = useState('modules');

  if (loading) {
    return (
      <Stack alignItems="center" justifyContent="center" sx={{ minHeight: 200, color: 'text.secondary' }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <CircularProgress size={20} />
          <Typography variant="body2">Lade Einstellungen…</Typography>
        </Stack>
      </Stack>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 900 }}>
      <PageHeader
        title="Einstellungen" icon="tune"
        subtitle="Module aktivieren oder deaktivieren. Deaktivierte Module werden aus der Sidebar und dem Dashboard ausgeblendet."
      />

      {isAdmin && (
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2.5 }}>
          <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
            <Tab value="modules"   label="Konfiguration" />
            <Tab value="admin"     label="Admin · Module"  icon={<AdminPanelSettingsOutlinedIcon fontSize="small" />} iconPosition="start" />
            <Tab value="developer" label="Developer"       icon={<CodeIcon fontSize="small" />}                       iconPosition="start" />
            <Tab value="theme"     label="Theme Showcase"  icon={<PaletteOutlinedIcon fontSize="small" />}            iconPosition="start" />
          </Tabs>
        </Box>
      )}

      {activeTab === 'modules' && (
        <ModuleTab
          modules={modules} setModule={setModule}
          birthday={birthday} setBirthday={setBirthday}
          isPkv={isPkv} setIsPkv={setIsPkv}
          steuerSatzAlter={steuerSatzAlter} setSteuerSatzAlter={setSteuerSatzAlter}
        />
      )}

      {activeTab === 'admin' && isAdmin && (
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Globale Feature-Toggles. Änderungen wirken sofort für alle Nutzer.
          </Typography>
          <AdminModulesPanel />
        </Box>
      )}

      {activeTab === 'developer' && isAdmin && (
        <DeveloperTab />
      )}

      {activeTab === 'theme' && isAdmin && (
        <ThemeShowcaseTab isDark={isDark} onToggleDark={onToggleDark} />
      )}
    </Box>
  );
}
