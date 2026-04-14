import { Card, CardContent, Stack, Typography } from '@mui/material';

/**
 * KpiCard — kompakte Kennzahlen-Karte für das 188px-min KPI-Grid (SKILL.md §158).
 * Title oben in Caption-Optik, große Wertanzeige darunter, optionales Sublabel.
 *
 * Props:
 *   title    — Label oben (uppercase caption)
 *   value    — Hauptwert (string oder ReactNode, z. B. <MoneyDisplay/>)
 *   sub      — optionaler Untertext
 *   icon     — optionaler ReactNode neben dem Title
 *   accent   — optionale Farbe (theme palette key, z. B. 'primary' | 'success' | 'error')
 *   sx       — sx-Override
 */
export default function KpiCard({ title, value, sub, icon, accent, sx, ...rest }) {
  return (
    <Card sx={{ minWidth: 188, height: '100%', ...sx }} {...rest}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
          {icon}
          <Typography
            variant="caption"
            sx={{
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontWeight: 600,
              color: 'text.secondary',
            }}
          >
            {title}
          </Typography>
        </Stack>
        <Typography
          variant="h5"
          sx={{
            fontWeight: 700,
            color: accent ? `${accent}.main` : 'text.primary',
            lineHeight: 1.2,
          }}
        >
          {value}
        </Typography>
        {sub != null && (
          <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
            {sub}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
