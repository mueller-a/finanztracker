import { Stack, Typography, Box } from '@mui/material';

/**
 * PageHeader — einheitlicher Seiten-Header mit Titel, Subtitle und Aktions-Slot rechts.
 *
 * Props:
 *   title    — Page-Titel (h4)
 *   subtitle — optionaler Subtitle unter dem Titel
 *   icon     — Material Symbol Name (z.B. "account_balance"). Rendert links
 *              vom Titel eine 40×40 Ghost-Box im Fiscal-Gallery-Stil.
 *   actions  — ReactNode rechts (Buttons, IconButtons, etc.)
 *   sx       — sx-Override
 */
export default function PageHeader({ title, subtitle, icon, actions, sx }) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      justifyContent="space-between"
      alignItems={{ xs: 'flex-start', sm: 'center' }}
      spacing={2}
      sx={{ mb: 3, ...sx }}
    >
      <Stack direction="row" alignItems="center" spacing={2} sx={{ minWidth: 0 }}>
        {icon && (
          <Box sx={{
            width: 64,
            height: 64,
            borderRadius: '32px',
            bgcolor: 'accent.positiveSurface',
            color: 'text.primary',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Box component="span" className="material-symbols-outlined" sx={{ fontSize: 32 }}>
              {icon}
            </Box>
          </Box>
        )}
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
      </Stack>
      {actions && (
        <Stack direction="row" spacing={1} alignItems="center">
          {actions}
        </Stack>
      )}
    </Stack>
  );
}
