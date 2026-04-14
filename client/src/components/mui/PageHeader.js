import { Stack, Typography, Box } from '@mui/material';

/**
 * PageHeader — einheitlicher Seiten-Header mit Titel, Subtitle und Aktions-Slot rechts.
 *
 * Props:
 *   title    — Page-Titel (h4)
 *   subtitle — optionaler Subtitle unter dem Titel
 *   actions  — ReactNode rechts (Buttons, IconButtons, etc.)
 *   sx       — sx-Override
 */
export default function PageHeader({ title, subtitle, actions, sx }) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      justifyContent="space-between"
      alignItems={{ xs: 'flex-start', sm: 'center' }}
      spacing={2}
      sx={{ mb: 3, ...sx }}
    >
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {actions && (
        <Stack direction="row" spacing={1} alignItems="center">
          {actions}
        </Stack>
      )}
    </Stack>
  );
}
