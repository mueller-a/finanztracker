// ─── Finanztracker MUI Wrappers ────────────────────────────────────────────────
// Zentrale Anlaufstelle für alle UI-Bausteine. Seiten importieren von hier statt
// direkt aus '@mui/material', damit Theme-Tweaks einen einzigen Touchpoint haben.
//
// Gewachsen aus der Migration zu Material UI (siehe Skill "design-system"):
// - Card für Versicherungs-Übersichten   → SectionCard / KpiCard
// - Table für Snapshot-Historie          → DataTable
// - TextField + InputAdornment für €     → CurrencyField
// - DatePicker für Snapshot-Daten        → DateField
// - Layout via Grid2 / Stack             → re-exportiert aus @mui/material

// ─── Eigene Wrapper ───────────────────────────────────────────────────────────
export { default as KpiCard }       from './KpiCard';
export { default as SectionCard }   from './SectionCard';
export { default as PageHeader }    from './PageHeader';
export { default as CurrencyField } from './CurrencyField';
export { default as DateField }     from './DateField';
export { default as MoneyDisplay }  from './MoneyDisplay';
export { default as ConfirmDialog } from './ConfirmDialog';
export { default as DataTable }     from './DataTable';
