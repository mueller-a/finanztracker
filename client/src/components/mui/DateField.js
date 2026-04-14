import { DatePicker } from '@mui/x-date-pickers';
import dayjs from 'dayjs';

/**
 * DateField — MUI DatePicker als Drop-in für `<input type="date">`.
 *
 * Arbeitet API-seitig mit ISO-Strings (`YYYY-MM-DD`), zeigt aber im UI das
 * deutsche Format `DD.MM.YYYY`. Damit können Aufrufer bestehende String-Felder
 * (z. B. `snapshot_date`, `contract_end_date`) ohne Refactor anbinden.
 *
 * Props:
 *   value      — ISO string ('YYYY-MM-DD') oder '' / null
 *   onChange   — (isoString | '') => void
 *   label      — Label
 *   slotProps  — optionaler Override für slotProps.textField (z. B. fullWidth, helperText)
 *   ...rest    — weitere DatePicker-Props
 */
export default function DateField({
  value,
  onChange,
  label,
  slotProps,
  ...rest
}) {
  const dayjsValue = value ? dayjs(value) : null;

  function handleChange(next) {
    if (!next || !next.isValid?.()) {
      onChange?.('');
      return;
    }
    onChange?.(next.format('YYYY-MM-DD'));
  }

  return (
    <DatePicker
      label={label}
      value={dayjsValue}
      onChange={handleChange}
      format="DD.MM.YYYY"
      slotProps={{
        textField: { size: 'small', fullWidth: true, ...slotProps?.textField },
        ...slotProps,
      }}
      {...rest}
    />
  );
}
