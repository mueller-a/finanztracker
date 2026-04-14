import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from '@mui/material';

/**
 * ConfirmDialog — Standard-Bestätigungsdialog (z. B. „Wirklich löschen?").
 *
 * Props:
 *   open         — Boolean
 *   title        — Titelzeile (default 'Bist du sicher?')
 *   message      — Beschreibungstext (string oder ReactNode)
 *   confirmLabel — Button-Text (default 'Löschen')
 *   cancelLabel  — Button-Text (default 'Abbrechen')
 *   destructive  — Boolean: Confirm-Button rot (default true)
 *   onConfirm    — () => void | Promise<void>
 *   onCancel     — () => void
 *   loading      — disabled-State während Ausführung
 */
export default function ConfirmDialog({
  open,
  title = 'Bist du sicher?',
  message,
  confirmLabel = 'Löschen',
  cancelLabel = 'Abbrechen',
  destructive = true,
  onConfirm,
  onCancel,
  loading = false,
}) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {typeof message === 'string'
          ? <DialogContentText>{message}</DialogContentText>
          : message}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={loading} color="inherit">
          {cancelLabel}
        </Button>
        <Button
          onClick={onConfirm}
          disabled={loading}
          variant="contained"
          color={destructive ? 'error' : 'primary'}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
