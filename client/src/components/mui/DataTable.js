import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Box,
} from '@mui/material';

/**
 * DataTable — dünner Wrapper um MUI Table für die typischen, statischen
 * Tabellen im Repo (Snapshot-Historie, Insurance-Liste, Tilgungsplan).
 *
 * Spalten werden via `columns` prop deklariert:
 *   { key, label, align?, width?, render?: (row) => ReactNode }
 *
 * `render` ist optional; default ist `row[key]`.
 *
 * Props:
 *   columns      — Array<ColumnDef>
 *   rows         — Array<Object> (jede Row braucht ein eindeutiges `id`-Feld
 *                  oder `getRowId(row)` Prop)
 *   getRowId     — (row, index) => string|number — default: row.id ?? index
 *   onRowClick   — (row) => void
 *   emptyMessage — angezeigter Text, wenn rows.length === 0
 *   dense        — Boolean (default true) — kompakte Höhe
 *   stickyHeader — Boolean (default false)
 *   sx           — sx-Override für TableContainer
 */
export default function DataTable({
  columns,
  rows,
  getRowId,
  onRowClick,
  emptyMessage = 'Keine Daten vorhanden.',
  dense = true,
  stickyHeader = false,
  sx,
}) {
  if (!rows || rows.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
        <Typography variant="body2">{emptyMessage}</Typography>
      </Box>
    );
  }

  const resolveId = getRowId || ((row, idx) => row.id ?? idx);

  return (
    <TableContainer component={Paper} elevation={0} sx={{ border: 1, borderColor: 'divider', ...sx }}>
      <Table size={dense ? 'small' : 'medium'} stickyHeader={stickyHeader}>
        <TableHead>
          <TableRow>
            {columns.map((col) => (
              <TableCell
                key={col.key}
                align={col.align || 'left'}
                style={col.width ? { width: col.width } : undefined}
              >
                {col.label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, idx) => (
            <TableRow
              key={resolveId(row, idx)}
              hover={!!onRowClick}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              sx={onRowClick ? { cursor: 'pointer' } : undefined}
            >
              {columns.map((col) => (
                <TableCell key={col.key} align={col.align || 'left'}>
                  {col.render ? col.render(row) : row[col.key]}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
