import { Card, CardContent, CardHeader } from '@mui/material';

/**
 * SectionCard — Card mit optionalem Header (Titel + Action-Slot).
 * Ersatz für die ~50 inline-styled Panels (`<div style={{ background, border, borderRadius }}>`).
 *
 * Props:
 *   title       — Titelzeile (string oder ReactNode)
 *   subheader   — optionaler Untertitel
 *   action      — ReactNode rechts im Header (z. B. Buttons)
 *   children    — Inhalt der Sektion
 *   dense       — kompakteres Padding (CardContent p:1.5 statt p:2)
 *   noPadding   — entfernt das CardContent-Padding ganz (für DataTable etc.)
 *   sx, headerSx, contentSx — Overrides
 */
export default function SectionCard({
  title,
  subheader,
  action,
  children,
  dense = false,
  noPadding = false,
  sx,
  headerSx,
  contentSx,
  ...rest
}) {
  const contentPadding = noPadding ? 0 : dense ? 1.5 : 2;
  return (
    <Card sx={sx} {...rest}>
      {(title || action) && (
        <CardHeader
          title={title}
          subheader={subheader}
          action={action}
          titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
          subheaderTypographyProps={{ variant: 'caption', color: 'text.secondary' }}
          sx={{ pb: 0.5, ...headerSx }}
        />
      )}
      <CardContent sx={{ p: contentPadding, '&:last-child': { pb: contentPadding }, ...contentSx }}>
        {children}
      </CardContent>
    </Card>
  );
}
