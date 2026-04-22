import { Box, Stack, Typography, Chip, Paper } from '@mui/material';

const CONFIG = {
  '/etf': {
    icon: 'trending_up',
    label: 'ETF Rentenrechner',
    desc:  'Berechne, wie sich dein monatlicher Sparplan langfristig entwickelt.',
    features: ['Sparplan-Simulator', 'Zinseszins-Rechner', 'Entnahmephase planen', 'Portfolioverteilung'],
  },
  '/strom': {
    icon: 'bolt',
    label: 'Stromübersicht',
    desc:  'Behalte deinen Energieverbrauch und deine Kosten im Blick.',
    features: ['Verbrauch pro Monat', 'Kosten-Tracking', 'Anbietervergleich', 'CO₂-Bilanz'],
  },
  '/verbindlichkeiten': {
    icon: 'account_balance',
    label: 'Verbindlichkeiten',
    desc:  'Verwalte Kredite, Ratenkäufe und andere offene Verbindlichkeiten.',
    features: ['Kreditübersicht', 'Tilgungsplan', 'Zinskosten-Analyse', 'Schuldenabbau-Strategie'],
  },
  '/guthaben': {
    icon: 'savings',
    label: 'Guthaben',
    desc:  'Tracke deine Sparziele, Konten und Investments.',
    features: ['Sparziele', 'Kontoverwaltung', 'Entwicklung über Zeit', 'Netto-Vermögen'],
  },
};

export default function PlaceholderPage() {
  const path = window.location.pathname;
  const config = CONFIG[path] ?? {
    icon: 'construction', label: 'Tool in Arbeit', desc: '', features: [],
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <Paper sx={{
        borderRadius: 3,
        p: { xs: 4, sm: 6 },
        maxWidth: 480,
        width: '100%',
        textAlign: 'center',
      }}>
        {/* Icon — Fiscal Gallery Ghost-Box */}
        <Box sx={{
          width: 72, height: 72, borderRadius: '36px',
          bgcolor: 'surface.highest',
          color: 'text.primary',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          mx: 'auto', mb: 3,
        }}>
          <Box component="span" className="material-symbols-outlined" sx={{ fontSize: 36 }}>
            {config.icon}
          </Box>
        </Box>

        {/* Title */}
        <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.01em', mb: 1 }}>
          {config.label}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3, lineHeight: 1.6 }}>
          {config.desc}
        </Typography>

        {/* Planned features */}
        {config.features.length > 0 && (
          <Box sx={{
            bgcolor: 'surface.low',
            borderRadius: 2,
            p: 2.5,
            mb: 3,
            textAlign: 'left',
          }}>
            <Typography variant="overline" sx={{ color: 'text.secondary', display: 'block', mb: 1.25 }}>
              Geplante Features
            </Typography>
            <Stack component="ul" spacing={0.75} sx={{ listStyle: 'none', p: 0, m: 0 }}>
              {config.features.map((f) => (
                <Stack key={f} component="li" direction="row" alignItems="center" spacing={1}>
                  <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'primary.dark', flexShrink: 0 }} />
                  <Typography variant="body2">{f}</Typography>
                </Stack>
              ))}
            </Stack>
          </Box>
        )}

        {/* Status badge — emerald per Fiscal Gallery */}
        <Chip
          label="In Entwicklung"
          size="small"
          color="success"
        />
      </Paper>
    </Box>
  );
}
