import { TextField, InputAdornment } from '@mui/material';

/**
 * CurrencyField — TextField mit Währungs-Adornment (€ default, % als Variante).
 *
 * Liefert/erwartet `value` als Number (oder leeren String). onChange wird mit
 * dem geparsten Number-Wert (oder '' bei leerem Input) aufgerufen — kein Event.
 * Ersatz für die ~50 €-Eingaben im Repo.
 *
 * Props:
 *   value         — number | '' | null
 *   onChange      — (number | '') => void
 *   adornment     — '€' (default) | '%' | string
 *   position      — 'end' (default) | 'start'
 *   decimals      — Anzahl Nachkommastellen für `step` Attribut (default 2)
 *   min, max      — Grenzen (default min=0)
 *   ...rest       — alle weiteren TextField-Props (label, helperText, fullWidth, ...)
 */
export default function CurrencyField({
  value,
  onChange,
  adornment = '€',
  position = 'end',
  decimals = 2,
  min = 0,
  max,
  InputProps,
  inputProps,
  ...rest
}) {
  const adornmentNode = (
    <InputAdornment position={position}>{adornment}</InputAdornment>
  );

  function handleChange(e) {
    const raw = e.target.value;
    if (raw === '') {
      onChange?.('');
      return;
    }
    const parsed = Number(raw);
    onChange?.(Number.isFinite(parsed) ? parsed : '');
  }

  return (
    <TextField
      type="number"
      value={value ?? ''}
      onChange={handleChange}
      InputProps={{
        [position === 'end' ? 'endAdornment' : 'startAdornment']: adornmentNode,
        ...InputProps,
      }}
      inputProps={{
        min,
        max,
        step: decimals > 0 ? Number((1 / Math.pow(10, decimals)).toFixed(decimals)) : 1,
        inputMode: 'decimal',
        ...inputProps,
      }}
      {...rest}
    />
  );
}
