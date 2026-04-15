import { Box, Stack, Typography, Chip, Paper } from '@mui/material';

const CONFIG = {
  '/etf': {
    emoji: '📈',
    label: 'ETF Rentenrechner',
    desc:  'Berechne, wie sich dein monatlicher Sparplan langfristig entwickelt.',
    color: '#0ea5e9',
    features: ['Sparplan-Simulator', 'Zinseszins-Rechner', 'Entnahmephase planen', 'Portfolioverteilung'],
  },
  '/strom': {
    emoji: '⚡',
    label: 'Stromübersicht',
    desc:  'Behalte deinen Energieverbrauch und deine Kosten im Blick.',
    color: '#f59e0b',
    features: ['Verbrauch pro Monat', 'Kosten-Tracking', 'Anbietervergleich', 'CO₂-Bilanz'],
  },
  '/verbindlichkeiten': {
    emoji: '💳',
    label: 'Verbindlichkeiten',
    desc:  'Verwalte Kredite, Ratenkäufe und andere offene Verbindlichkeiten.',
    color: '#f43f5e',
    features: ['Kreditübersicht', 'Tilgungsplan', 'Zinskosten-Analyse', 'Schuldenabbau-Strategie'],
  },
  '/guthaben': {
    emoji: '🐷',
    label: 'Guthaben',
    desc:  'Tracke deine Sparziele, Konten und Investments.',
    color: '#10b981',
    features: ['Sparziele', 'Kontoverwaltung', 'Entwicklung über Zeit', 'Netto-Vermögen'],
  },
};

export default function PlaceholderPage() {
  const path = window.location.pathname;
  const config = CONFIG[path] ?? {
    emoji: '🔧', label: 'Tool in Arbeit', desc: '', color: '#7c3aed', features: [],
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <Paper
        variant="outlined"
        sx={{
          borderRadius: 1,
          p: '3rem 2.5rem',
          maxWidth: 480,
          width: '100%',
          textAlign: 'center',
        }}
      >
        {/* Icon */}
        <Box sx={{
          width: 72, height: 72, borderRadius: 1,
          bgcolor: `${config.color}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '2rem',
          mx: 'auto',
          mb: 2.5,
        }}>
          {config.emoji}
        </Box>

        {/* Title */}
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
          {config.label}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5, lineHeight: 1.6 }}>
          {config.desc}
        </Typography>

        {/* Planned features */}
        {config.features.length > 0 && (
          <Box sx={{
            bgcolor: `${config.color}08`,
            borderRadius: 1,
            p: 2,
            mb: 2.5,
            textAlign: 'left',
          }}>
            <Typography variant="overline" sx={{
              color: 'text.secondary', fontWeight: 700, letterSpacing: '0.08em', display: 'block', mb: 1,
            }}>
              Geplante Features
            </Typography>
            <Stack component="ul" spacing={0.75} sx={{ listStyle: 'none', p: 0, m: 0 }}>
              {config.features.map((f) => (
                <Stack key={f} component="li" direction="row" alignItems="center" spacing={1}>
                  <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: config.color, flexShrink: 0 }} />
                  <Typography variant="body2">{f}</Typography>
                </Stack>
              ))}
            </Stack>
          </Box>
        )}

        {/* Status badge */}
        <Chip
          label="In Entwicklung"
          size="small"
          sx={{
            bgcolor: `${config.color}15`,
            color: config.color,
            fontWeight: 700,
            '&::before': {
              content: '""',
              display: 'inline-block',
              width: 6, height: 6,
              borderRadius: '50%',
              bgcolor: config.color,
              mr: 0.75,
            },
          }}
        />
      </Paper>
    </Box>
  );
}
