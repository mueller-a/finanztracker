import { Typography } from '@mui/material';

const FORMATTERS = {};
function getFormatter(decimals) {
  if (!FORMATTERS[decimals]) {
    FORMATTERS[decimals] = new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
  return FORMATTERS[decimals];
}

/**
 * MoneyDisplay — formatiert eine Zahl als deutschen €-Betrag.
 *
 * Props:
 *   value      — number (default 0)
 *   decimals   — Nachkommastellen (default 2; für KPIs gerne 0)
 *   variant    — Typography variant (default 'body1')
 *   color      — sx color (default 'text.primary'); 'auto' färbt rot/grün je nach Vorzeichen
 *   bold       — Boolean (default false)
 *   ...rest    — weitere Typography-Props
 */
export default function MoneyDisplay({
  value = 0,
  decimals = 2,
  variant = 'body1',
  color,
  bold = false,
  sx,
  ...rest
}) {
  const num = Number(value) || 0;
  const formatted = getFormatter(decimals).format(num);

  let resolvedColor = color ?? 'text.primary';
  if (color === 'auto') {
    resolvedColor = num < 0 ? 'error.main' : num > 0 ? 'success.main' : 'text.secondary';
  }

  return (
    <Typography
      variant={variant}
      component="span"
      sx={{
        fontWeight: bold ? 700 : 'inherit',
        color: resolvedColor,
        fontVariantNumeric: 'tabular-nums',
        ...sx,
      }}
      {...rest}
    >
      {formatted}
    </Typography>
  );
}
