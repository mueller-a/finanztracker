import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Stack, Typography, Alert, Skeleton, Paper, Link as MuiLink,
  Card, CardContent, LinearProgress, List, ListItem, ListItemIcon, ListItemText,
  Chip, IconButton, Tooltip as MuiTooltip, Divider,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip,
} from 'recharts';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import ElderlyOutlinedIcon from '@mui/icons-material/ElderlyOutlined';
import SavingsOutlinedIcon from '@mui/icons-material/SavingsOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import ChecklistRtlOutlinedIcon from '@mui/icons-material/ChecklistRtlOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import { useDashboard } from '../hooks/useDashboard';
import { useModules } from '../context/ModuleContext';
import { useAppModules } from '../context/AppModulesContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt2 = (n) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (n) => Math.round(n).toLocaleString('de-DE');

const TODAY = new Date();

const DATE_FMT = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});

function greeting() {
  const h = TODAY.getHours();
  if (h < 12) return 'Guten Morgen';
  if (h < 18) return 'Guten Tag';
  return 'Guten Abend';
}

// Basierend auf aktuellem Datum + payment_interval die "nächste Fälligkeit"
// abschätzen. Default-Fallback = erster Tag des nächsten Monats, damit die
// Kachel nicht leer bleibt, wenn keine Felder im Schema vorhanden sind.
function estimateNextDue(insEntries) {
  if (!Array.isArray(insEntries) || insEntries.length === 0) return null;
  const first = new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 1);
  return first.toISOString().split('T')[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// SEKTION A — Financial Health Header (Puls-Leiste)
// ─────────────────────────────────────────────────────────────────────────────
function FinancialPulseBar({ insights, loading }) {
  const theme = useTheme();

  function trendIcon(level) {
    if (level === 'good')    return <TrendingUpIcon fontSize="small" sx={{ color: 'success.main' }} />;
    if (level === 'warn')    return <TrendingFlatIcon fontSize="small" sx={{ color: 'warning.main' }} />;
    if (level === 'bad')     return <TrendingDownIcon fontSize="small" sx={{ color: 'error.main' }} />;
    return <TrendingFlatIcon fontSize="small" sx={{ color: 'text.disabled' }} />;
  }

  const nettoPositive = (insights?.nettoVermoegen ?? 0) >= 0;
  const nettoLevel    = !insights ? 'none'
                      : nettoPositive ? 'good' : 'bad';

  const runway = insights?.liquiditaetsreichweite;
  const runwayLevel = runway == null ? 'none'
                    : runway >= 6    ? 'good'
                    : runway >= 3    ? 'warn'
                    : 'bad';

  const quote = insights?.sparquote;
  const quoteLevel = quote == null ? 'none'
                   : quote >= 20   ? 'good'
                   : quote >= 10   ? 'warn'
                   : 'bad';

  const items = [
    {
      label: 'Netto-Vermögen',
      value: loading ? null
           : insights
              ? `${nettoPositive ? '+' : '−'} ${fmt0(Math.abs(insights.nettoVermoegen))} €`
              : '–',
      color: loading ? 'text.primary'
           : insights ? (nettoPositive ? 'success.main' : 'error.main')
           : 'text.secondary',
      trend: nettoLevel,
    },
    {
      label: 'Liquidity Runway',
      value: loading ? null
           : runway != null ? `${runway.toFixed(1).replace('.', ',')} Monate` : '–',
      color: loading ? 'text.primary'
           : runwayLevel === 'good' ? 'success.main'
           : runwayLevel === 'warn' ? 'warning.main'
           : runwayLevel === 'bad'  ? 'error.main'
           : 'text.secondary',
      trend: runwayLevel,
    },
    {
      label: 'Sparquote',
      value: loading ? null
           : quote != null ? `${quote.toFixed(1).replace('.', ',')} %` : '–',
      color: loading ? 'text.primary'
           : quoteLevel === 'good' ? 'success.main'
           : quoteLevel === 'warn' ? 'warning.main'
           : quoteLevel === 'bad'  ? 'error.main'
           : 'text.secondary',
      trend: quoteLevel,
    },
  ];

  return (
    <Card elevation={2} sx={{ borderRadius: 1 }}>
      <CardContent sx={{ py: 2.5, px: 3, '&:last-child': { pb: 2.5 } }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          divider={<Divider orientation="vertical" flexItem />}
          spacing={2}
        >
          {items.map(({ label, value, color, trend }) => (
            <Stack key={label} spacing={0.5} sx={{ flex: 1, minWidth: 188 }}>
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <Typography variant="caption" sx={{
                  color: 'text.secondary', fontWeight: 700, letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}>
                  {label}
                </Typography>
                {!loading && trendIcon(trend)}
              </Stack>
              {loading ? (
                <Skeleton variant="text" width={140} height={40} />
              ) : (
                <Typography variant="h4" sx={{
                  fontWeight: 800, fontFamily: 'monospace', lineHeight: 1.1, color,
                }}>
                  {value}
                </Typography>
              )}
            </Stack>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SEKTION B — Modul-Status-Kacheln
// ─────────────────────────────────────────────────────────────────────────────
function ModuleCard({ icon, title, loading, children, onClick, hiddenFromUsers = false }) {
  return (
    <Card
      elevation={0}
      onClick={onClick}
      sx={(t) => ({
        borderRadius: 3,                             // xl = 12px
        bgcolor: 'background.paper',                 // surface-container-lowest
        minHeight: 188,
        cursor: onClick ? 'pointer' : 'default',
        transition: `box-shadow ${t.transitions.duration.standard}ms, opacity ${t.transitions.duration.short}ms`,
        opacity: hiddenFromUsers ? 0.6 : 1,
        ...(hiddenFromUsers ? { borderStyle: 'dashed', borderWidth: 1, borderColor: 'divider' } : {}),
        '&:hover': onClick ? {
          boxShadow: '0 20px 40px -15px rgba(11, 28, 48, 0.06)',  // tinted shadow per DS §4
          opacity: 1,
        } : {},
      })}
    >
      <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
          {/* Uniform Icon-Box: surface-highest bg + on-surface fg (Fiscal Gallery) */}
          <Box sx={{
            width: 40, height: 40, borderRadius: 2,
            bgcolor: 'surface.highest',
            color: 'text.primary',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {icon}
          </Box>
          <Typography variant="overline" sx={{
            color: 'text.secondary',
            fontWeight: 700,
          }}>
            {title}
          </Typography>
          {hiddenFromUsers && (
            <MuiTooltip title="Modul ist global deaktiviert — nur für Admins sichtbar" arrow>
              <VisibilityOffOutlinedIcon sx={{ fontSize: 14, color: 'text.disabled', ml: 'auto' }} />
            </MuiTooltip>
          )}
        </Stack>
        {loading ? (
          <Stack spacing={1} sx={{ flex: 1 }}>
            <Skeleton variant="text" width="70%" height={30} />
            <Skeleton variant="text" width="55%" />
            <Skeleton variant="text" width="40%" />
          </Stack>
        ) : (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>{children}</Box>
        )}
      </CardContent>
    </Card>
  );
}

function ModuleStatusGrid({ data, loading, navigate }) {
  // Globale Feature-Toggles aus app_modules.
  // Sichtbarkeit folgt SKILL.md §284: Modul.is_active ODER User.role==='admin'.
  // `isHiddenFromUsers` markiert für Admins, was normale User nicht sehen.
  const { isModuleEnabled, isHiddenFromUsers } = useAppModules();

  // Nächste Insurance-Fälligkeit (heuristisch)
  const nextDue = useMemo(() => data ? estimateNextDue(data.ins.entries) : null, [data]);
  const nextDueStr = nextDue
    ? new Date(nextDue).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })
    : '–';

  // Strom: Guthaben/Nachzahlung-Chip
  const stromStatus = useMemo(() => {
    if (!data?.strom?.cost) return { label: 'Kein Tarif', color: 'default', delta: null, isGood: null };
    const c = data.strom.cost;
    return {
      label: c.isGuthaben ? 'Guthaben erwartet' : 'Nachzahlung erwartet',
      color: c.isGuthaben ? 'success' : 'error',
      delta: Math.abs(c.delta),
      isGood: c.isGuthaben,
    };
  }, [data]);

  // Schuldenfrei-Jahr
  const payoffYear = data?.debts?.payoffDate
    ? new Date(data.debts.payoffDate).getFullYear()
    : null;

  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fit, minmax(220px, 1fr))' },
      gap: 2,
    }}>
      {/* Versicherungen */}
      {isModuleEnabled('insurance') && (
      <ModuleCard
        icon={<ShieldOutlinedIcon />}
        title="Versicherungen"

        loading={loading}
        hiddenFromUsers={isHiddenFromUsers('insurance')}
        onClick={() => navigate('/versicherungen')}
      >
        <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: 'monospace', mb: 0.5 }}>
          {data?.ins?.count ?? 0}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
          Aktive Verträge
        </Typography>
        <Box sx={{ mt: 'auto' }}>
          <Typography variant="caption" sx={{
            color: 'text.secondary', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>
            Nächste Fälligkeit
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>{nextDueStr}</Typography>
        </Box>
      </ModuleCard>
      )}

      {/* Strom */}
      {isModuleEnabled('electricity') && (
      <ModuleCard
        icon={<BoltOutlinedIcon />}
        title="Strom"

        loading={loading}
        hiddenFromUsers={isHiddenFromUsers('electricity')}
        onClick={() => navigate('/strom')}
      >
        <Typography variant="h5" sx={{
          fontWeight: 800, fontFamily: 'monospace', mb: 0.5,
          color: stromStatus.isGood === null ? 'text.primary'
               : stromStatus.isGood         ? 'success.main'
               :                               'error.main',
        }}>
          {stromStatus.delta != null
            ? `${stromStatus.isGood ? '+' : '−'} ${fmt2(stromStatus.delta)} €`
            : '–'}
        </Typography>
        <Chip
          label={stromStatus.label}
          color={stromStatus.color}
          size="small"
          variant="outlined"
          sx={{ alignSelf: 'flex-start', mb: 1 }}
        />
        <Box sx={{ mt: 'auto' }}>
          <Typography variant="caption" sx={{
            color: 'text.secondary', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>
            Jahresprognose
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {data?.strom?.forecast ? `${fmt0(data.strom.forecast.total)} kWh` : '–'}
          </Typography>
        </Box>
      </ModuleCard>
      )}

      {/* Verbindlichkeiten */}
      {isModuleEnabled('debts') && (
      <ModuleCard
        icon={<AccountBalanceOutlinedIcon />}
        title="Verbindlichkeiten"

        loading={loading}
        hiddenFromUsers={isHiddenFromUsers('debts')}
        onClick={() => navigate('/verbindlichkeiten')}
      >
        <Typography variant="h5" sx={{
          fontWeight: 800, fontFamily: 'monospace', color: 'error.main', mb: 0.5,
        }}>
          − {fmt0(data?.debts?.total ?? 0)} €
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
          {(data?.debts?.progressPct ?? 0).toFixed(1).replace('.', ',')} % getilgt
        </Typography>
        <LinearProgress
          variant="determinate"
          value={data?.debts?.progressPct ?? 0}
          sx={{
            height: 8, borderRadius: 99,
            bgcolor: 'action.hover',
            '& .MuiLinearProgress-bar': { bgcolor: 'success.main', borderRadius: 99 },
            mb: 1.25,
          }}
        />
        <Box sx={{ mt: 'auto' }}>
          <Typography variant="caption" sx={{
            color: 'text.secondary', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>
            Schuldenfrei
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {payoffYear ? `${payoffYear}` : '–'}
          </Typography>
        </Box>
      </ModuleCard>
      )}

      {/* Ruhestand */}
      {isModuleEnabled('retirement') && (
      <ModuleCard
        icon={<ElderlyOutlinedIcon />}
        title="Ruhestand"

        loading={loading}
        hiddenFromUsers={isHiddenFromUsers('retirement')}
        onClick={() => navigate('/guthaben/rente')}
      >
        <Typography variant="h5" sx={{
          fontWeight: 800, fontFamily: 'monospace', mb: 0.5,
        }}>
          {data?.retirement?.count ?? 0}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
          {(data?.retirement?.count ?? 0) === 1 ? 'Vorsorge-Police' : 'Vorsorge-Policen'}
        </Typography>
        <Box sx={{ mt: 'auto' }}>
          <Typography variant="caption" sx={{
            color: 'text.secondary', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>
            Frühester Rentenbeginn
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {data?.retirement?.nextRentenbeginn ?? '–'}
          </Typography>
        </Box>
      </ModuleCard>
      )}
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SEKTION C — Wealth Progress + Next Steps
// ─────────────────────────────────────────────────────────────────────────────
function WealthProgressChart({ wealthSeries, loading }) {
  const theme = useTheme();

  if (loading) {
    return (
      <Card elevation={2} sx={{ borderRadius: 1, height: '100%' }}>
        <CardContent>
          <Skeleton variant="text" width="40%" />
          <Skeleton variant="rounded" height={260} sx={{ mt: 2 }} />
        </CardContent>
      </Card>
    );
  }

  const latest = wealthSeries?.[wealthSeries.length - 1];
  const nettoDelta = wealthSeries && wealthSeries.length >= 2
    ? latest.net - wealthSeries[0].net
    : 0;

  return (
    <Card elevation={2} sx={{ borderRadius: 1, height: '100%' }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1.5 }}>
          <Stack>
            <Typography variant="caption" sx={{
              color: 'text.secondary', fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}>
              Wealth Progress · 12 Monate
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: 'monospace' }}>
              {latest ? `${latest.net >= 0 ? '+' : '−'} ${fmt0(Math.abs(latest.net))} €` : '–'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Netto-Vermögen aktuell
            </Typography>
          </Stack>
          {wealthSeries && wealthSeries.length >= 2 && (
            <Chip
              label={`${nettoDelta >= 0 ? '+' : '−'}${fmt0(Math.abs(nettoDelta))} €`}
              size="small"
              color={nettoDelta >= 0 ? 'success' : 'error'}
              variant="outlined"
              icon={nettoDelta >= 0 ? <TrendingUpIcon /> : <TrendingDownIcon />}
            />
          )}
        </Stack>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={wealthSeries ?? []} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="wp-assets" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"  stopColor={theme.palette.success.main} stopOpacity={0.35} />
                <stop offset="95%" stopColor={theme.palette.success.main} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.palette.divider} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
              axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
              axisLine={false} tickLine={false} width={64}
              tickFormatter={(v) => `${fmt0(v)} €`} />
            <Tooltip
              formatter={(v, name) => {
                const labels = { assets: 'Vermögen', liabilities: 'Schulden', net: 'Netto' };
                return [`${fmt0(v)} €`, labels[name] ?? name];
              }}
              contentStyle={{
                background: theme.palette.background.paper,
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: 10, fontSize: 12,
              }}
              labelStyle={{ color: theme.palette.text.primary, fontWeight: 700 }}
            />
            <Line type="monotone" dataKey="assets" name="assets"
              stroke={theme.palette.success.main} strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: theme.palette.background.paper }} />
            <Line type="monotone" dataKey="liabilities" name="liabilities"
              stroke={theme.palette.error.main} strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: theme.palette.background.paper }} />
            <Line type="monotone" dataKey="net" name="net"
              stroke={theme.palette.primary.main} strokeWidth={1.75}
              strokeDasharray="4 3"
              dot={false} />
          </LineChart>
        </ResponsiveContainer>
        <Stack direction="row" spacing={2} justifyContent="center" sx={{ mt: 1 }}>
          {[
            { label: 'Vermögen',  color: theme.palette.success.main },
            { label: 'Schulden',  color: theme.palette.error.main },
            { label: 'Netto',     color: theme.palette.primary.main, dashed: true },
          ].map(({ label, color, dashed }) => (
            <Stack key={label} direction="row" alignItems="center" spacing={0.75}>
              <Box sx={{
                width: 18, height: 2,
                bgcolor: color,
                borderTop: dashed ? `2px dashed ${color}` : 'none',
                borderBottom: dashed ? 'none' : 'initial',
              }} />
              <Typography variant="caption" color="text.secondary">{label}</Typography>
            </Stack>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

function NextStepsList({ data, loading, navigate }) {
  const steps = useMemo(() => {
    if (!data) return [];
    const out = [];

    // Zählerstand älter als 30 Tage oder gar keiner → Prio
    if (!data.strom.forecast || data.strom.forecast.daysObserved === 0) {
      out.push({
        label: 'Zählerstand eintragen',
        desc:  'Prognose benötigt aktuellen Stand',
        icon:  <BoltOutlinedIcon color="warning" />,
        path:  '/strom',
        severity: 'warn',
      });
    }

    // Strom-Prognose rot → Tarif prüfen
    if (data.strom.cost && !data.strom.cost.isGuthaben && Math.abs(data.strom.cost.delta) > 50) {
      out.push({
        label: 'Stromabschlag anpassen',
        desc:  `Nachzahlung > ${fmt0(Math.abs(data.strom.cost.delta))} € erwartet`,
        icon:  <BoltOutlinedIcon color="error" />,
        path:  '/strom',
        severity: 'bad',
      });
    }

    // Sparquote unter 10 %
    if (data.insights.sparquote != null && data.insights.sparquote < 10) {
      out.push({
        label: 'Sparquote erhöhen',
        desc:  `Aktuell ${data.insights.sparquote.toFixed(1).replace('.', ',')} % · Ziel ≥ 10 %`,
        icon:  <SavingsOutlinedIcon color="warning" />,
        path:  '/guthaben',
        severity: 'warn',
      });
    }

    // Liquiditätsreichweite < 3 Monate
    if (data.insights.liquiditaetsreichweite != null && data.insights.liquiditaetsreichweite < 3) {
      out.push({
        label: 'Notgroschen aufstocken',
        desc:  `Nur ${data.insights.liquiditaetsreichweite.toFixed(1).replace('.', ',')} Monate Reserve`,
        icon:  <SavingsOutlinedIcon color="error" />,
        path:  '/guthaben',
        severity: 'bad',
      });
    }

    // Debts progress < 10 % und Kredite vorhanden
    if (data.debts.count > 0 && data.debts.progressPct < 10) {
      out.push({
        label: 'Sondertilgung prüfen',
        desc:  `Erst ${data.debts.progressPct.toFixed(1).replace('.', ',')} % getilgt`,
        icon:  <AccountBalanceOutlinedIcon color="warning" />,
        path:  '/verbindlichkeiten',
        severity: 'warn',
      });
    }

    // Keine Versicherungen erfasst
    if (data.ins.count === 0) {
      out.push({
        label: 'Versicherungen hinterlegen',
        desc:  'Zentrale Übersicht für Verträge anlegen',
        icon:  <ShieldOutlinedIcon color="info" />,
        path:  '/versicherungen',
        severity: 'info',
      });
    }

    // Fallback: wenn alles sauber, gib einen positiven Eintrag aus
    if (out.length === 0) {
      out.push({
        label: 'Alles im grünen Bereich',
        desc:  'Keine dringenden Aktionen offen',
        icon:  <TrendingUpIcon color="success" />,
        path:  null,
        severity: 'good',
      });
    }

    return out;
  }, [data]);

  return (
    <Card elevation={2} sx={{ borderRadius: 1, height: '100%' }}>
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <ChecklistRtlOutlinedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
          <Typography variant="caption" sx={{
            color: 'text.secondary', fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            Next Steps
          </Typography>
        </Stack>
        {loading ? (
          <Stack spacing={1.5}>
            {[1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={56} />)}
          </Stack>
        ) : (
          <List dense disablePadding>
            {steps.map((s, idx) => (
              <ListItem
                key={idx}
                disableGutters
                sx={{
                  borderBottom: idx < steps.length - 1 ? 1 : 0,
                  borderColor: 'divider',
                  py: 1.25,
                  cursor: s.path ? 'pointer' : 'default',
                  '&:hover': s.path ? { bgcolor: 'action.hover', borderRadius: 1 } : {},
                  px: 1,
                }}
                onClick={() => s.path && navigate(s.path)}
                secondaryAction={s.path ? (
                  <ArrowForwardIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                ) : null}
              >
                <ListItemIcon sx={{ minWidth: 40 }}>{s.icon}</ListItemIcon>
                <ListItemText
                  primary={s.label}
                  primaryTypographyProps={{ variant: 'body2', fontWeight: 700 }}
                  secondary={s.desc}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
              </ListItem>
            ))}
          </List>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SEKTION D — Quick-Access Footer
// ─────────────────────────────────────────────────────────────────────────────
function QuickAccessFooter({ navigate }) {
  const entries = [
    { label: 'Versicherungen',    icon: <ShieldOutlinedIcon />,          path: '/versicherungen' },
    { label: 'Strom',             icon: <BoltOutlinedIcon />,            path: '/strom' },
    { label: 'Guthaben',          icon: <SavingsOutlinedIcon />,         path: '/guthaben' },
    { label: 'Ruhestand',         icon: <ElderlyOutlinedIcon />,         path: '/guthaben/rente' },
    { label: 'Verbindlichkeiten', icon: <AccountBalanceOutlinedIcon />,  path: '/verbindlichkeiten' },
    { label: 'Immobilien',        icon: <HomeOutlinedIcon />,            path: '/immobilien' },
    { label: 'Budget',            icon: <AssessmentOutlinedIcon />,      path: '/budget' },
    { label: 'Rechner',           icon: <CalculateOutlinedIcon />,       path: '/rechner' },
  ];

  return (
    <Card elevation={2} sx={{ borderRadius: 1 }}>
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Stack direction="row" justifyContent="space-around" flexWrap="wrap" spacing={1}>
          {entries.map(({ label, icon, path }) => (
            <MuiTooltip key={path} title={label} arrow>
              <IconButton
                onClick={() => navigate(path)}
                sx={{
                  flexDirection: 'column',
                  borderRadius: 1,
                  px: 1.5,
                  py: 1,
                  color: 'text.secondary',
                  '&:hover': { color: 'primary.main', bgcolor: 'action.hover' },
                }}
              >
                {icon}
                <Typography variant="caption" sx={{ mt: 0.5, fontSize: '0.65rem' }}>
                  {label}
                </Typography>
              </IconButton>
            </MuiTooltip>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function OverviewPage() {
  const navigate = useNavigate();
  const { data, loading, error } = useDashboard();
  const { birthday } = useModules();

  return (
    <Box>
      <Stack spacing={4}>
        {/* Editorial Header — Fiscal Gallery */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="overline" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
            {DATE_FMT.format(TODAY)}
          </Typography>
          <Typography variant="h3" sx={{
            fontWeight: 800,
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
            mb: 0.5,
          }}>
            {greeting()}.
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary' }}>
            Deine Finanz-Zentrale — kuratiert und auf einen Blick.
          </Typography>
        </Box>

        {/* Missing birthday hint */}
        {!birthday && (
          <Alert severity="info" variant="outlined">
            Bitte ergänze dein{' '}
            <MuiLink href="/settings" sx={{ fontWeight: 700 }}>
              Geburtsdatum in den Einstellungen
            </MuiLink>
            {' '}für präzise Berechnungen in PKV und Ruhestandsplanung.
          </Alert>
        )}

        {/* Error */}
        {error && <Alert severity="error"><strong>Fehler beim Laden:</strong> {error}</Alert>}

        {/* SEKTION A — Financial Health Header */}
        <FinancialPulseBar insights={data?.insights} loading={loading} />

        {/* SEKTION B — Modul-Status-Kacheln */}
        <ModuleStatusGrid data={data} loading={loading} navigate={navigate} />

        {/* SEKTION C — Analyse-Zentrum */}
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '3fr 2fr' },
          gap: 2,
          alignItems: 'stretch',
        }}>
          <WealthProgressChart wealthSeries={data?.wealthSeries} loading={loading} />
          <NextStepsList data={data} loading={loading} navigate={navigate} />
        </Box>

        {/* SEKTION D — Quick-Access-Footer */}
        <QuickAccessFooter navigate={navigate} />
      </Stack>
    </Box>
  );
}
