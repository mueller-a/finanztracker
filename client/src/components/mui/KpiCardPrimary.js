import { Box, Paper, Stack, Typography } from '@mui/material';

/**
 * KpiCardPrimary — Hero-/Editorial-KPI im Navy-Look (siehe Skill "design-system").
 * Dunkler Background mit Gradient-Overlay, weiße Schrift, optionale Badge-Pill.
 *
 * Einsatz: maximal *eine* Hero-KPI pro Page (z. B. Top-Kennzahl im Dashboard).
 * Für sekundäre/kompakte KPIs → `KpiCard`.
 *
 * Zwei Größen:
 *   - 'compact' (default): kompakte KPI-Tile für 188px-Grid.
 *   - 'hero': dominante Summary-Bar mit optionalen Side-Metriken (z. B. Verbindlichkeiten-Top).
 *
 * Props:
 *   label     — Label oben (uppercase overline)
 *   value     — Hauptwert (string oder ReactNode)
 *   valueIcon — optionaler ReactNode neben dem Value (z. B. Trend-Indikator)
 *   sub       — optionaler Untertext
 *   badge     — optionale Pill (string) vor dem Sub-Text
 *   tone      — Badge-Ton: 'positive' | 'warning' | 'error' (default 'positive')
 *   size      — 'compact' (default) | 'hero'
 *   metrics   — optionale Array<{ label, value }> — Side-Metriken (nur bei size='hero')
 *   sx        — sx-Override
 */
export default function KpiCardPrimary({
  label, value, valueIcon, sub, badge, tone = 'positive',
  size = 'compact', metrics, sx, ...rest
}) {
  const isHero = size === 'hero';

  const badgeStyles = {
    positive: { bg: 'accent.positiveSurface', fg: 'primary.dark' },
    warning:  { bg: 'warning.main',           fg: 'warning.contrastText' },
    error:    { bg: 'error.main',             fg: 'error.contrastText' },
  }[tone] ?? { bg: 'accent.positiveSurface', fg: 'primary.dark' };

  const Inner = (
    <Box sx={{ position: 'relative', zIndex: 1, flex: 1, minWidth: 0 }}>
      <Typography
        variant="overline"
        sx={{
          color: 'primary.light',
          display: 'block',
          fontSize: '0.625rem',
          letterSpacing: '0.08em',
          lineHeight: 1.15,
          mb: isHero ? 0.5 : 1,
        }}
      >
        {label}
      </Typography>
      <Stack direction="row" alignItems="baseline" spacing={1}>
        <Typography
          sx={{
            fontFamily: '"Manrope", sans-serif',
            fontWeight: isHero ? 900 : 800,
            letterSpacing: isHero ? '-0.02em' : '-0.01em',
            lineHeight: 1.1,
            fontSize: isHero
              ? { xs: '1.75rem', sm: '2rem', md: '2.25rem' }
              : { xs: '1.5rem',  sm: '1.75rem' },
            color: 'primary.contrastText',
          }}
        >
          {value}
        </Typography>
        {valueIcon}
      </Stack>
      {(badge || sub) && (
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{ flexWrap: 'wrap', rowGap: 0.5, mt: isHero ? 0.25 : 1.5 }}
        >
          {badge && (
            <Box
              sx={{
                px: 1.25, py: 0.5, borderRadius: 99,
                bgcolor: badgeStyles.bg, color: badgeStyles.fg,
                fontWeight: 700, fontSize: '0.72rem',
                letterSpacing: '0.01em', lineHeight: 1, whiteSpace: 'nowrap',
              }}
            >
              {badge}
            </Box>
          )}
          {sub && (
            <Typography
              variant="caption"
              sx={{ color: 'primary.light', lineHeight: 1.3, fontSize: '0.72rem' }}
            >
              {sub}
            </Typography>
          )}
        </Stack>
      )}
    </Box>
  );

  const MetricsBlock = metrics?.length > 0 && (
    <Stack
      direction="row"
      spacing={3}
      sx={{ position: 'relative', zIndex: 1, flexShrink: 0 }}
    >
      {metrics.map(({ label: ml, value: mv }) => (
        <Box key={ml}>
          <Typography
            variant="caption"
            sx={{ color: 'primary.light', display: 'block', fontSize: '0.625rem' }}
          >
            {ml}
          </Typography>
          <Typography
            sx={{
              fontFamily: '"Manrope", sans-serif',
              fontWeight: 700,
              fontSize: '1.05rem',
              lineHeight: 1.2,
              mt: 0.25,
            }}
          >
            {mv}
          </Typography>
        </Box>
      ))}
    </Stack>
  );

  return (
    <Paper
      sx={(t) => ({
        position: 'relative',
        overflow: 'hidden',
        bgcolor: 'primary.dark',
        color: 'primary.contrastText',
        borderRadius: isHero ? '16px' : '12px',
        p: isHero ? { xs: 3, sm: 3.5 } : { xs: 2, sm: 2.25 },
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
        ...sx,
      })}
      {...rest}
    >
      {MetricsBlock ? (
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={3}
          alignItems={{ sm: 'center' }}
          justifyContent="space-between"
        >
          {Inner}
          {MetricsBlock}
        </Stack>
      ) : Inner}
    </Paper>
  );
}
