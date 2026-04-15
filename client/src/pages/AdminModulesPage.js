import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Box, Stack, Typography, Card, CardContent, Switch, Skeleton, Alert,
  Snackbar, CircularProgress,
} from '@mui/material';
import { useModules } from '../context/ModuleContext';
import { useAppModules } from '../context/AppModulesContext';
import { PageHeader } from '../components/mui';

// Wiederverwendbares Panel mit der eigentlichen Toggle-Liste.
// Wird sowohl auf der Standalone-Page (/admin/modules) als auch
// im Admin-Tab unter Einstellungen gerendert.
export function AdminModulesPanel() {
  const { modules, loading, error, setModuleActive } = useAppModules();
  const [savingKey, setSavingKey] = useState(null);
  const [snack, setSnack]         = useState(null);

  async function handleToggle(key, next) {
    setSavingKey(key);
    try {
      await setModuleActive(key, next);
      setSnack({ severity: 'success', text: `Modul „${key}" ${next ? 'aktiviert' : 'deaktiviert'}.` });
    } catch (ex) {
      setSnack({ severity: 'error', text: ex.message || 'Speichern fehlgeschlagen.' });
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card elevation={2} sx={{ borderRadius: 1 }}>
        <CardContent sx={{ p: 0 }}>
          {loading ? (
            <Stack spacing={1} sx={{ p: 2 }}>
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} variant="rounded" height={56} />)}
            </Stack>
          ) : modules.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
              <Typography variant="body2">
                Keine Module gefunden. Stelle sicher, dass <code>app_modules</code> initial befüllt ist
                (siehe <code>setup.sql</code>).
              </Typography>
            </Box>
          ) : (
            <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
              {modules.map((m) => (
                <Stack
                  key={m.id}
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  sx={{ p: 2, minHeight: 64 }}
                >
                  <Box>
                    <Typography variant="body1" sx={{ fontWeight: 700 }}>{m.label}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                      {m.module_key}
                    </Typography>
                  </Box>
                  <Stack direction="row" alignItems="center" spacing={1.5}>
                    {savingKey === m.module_key && <CircularProgress size={16} />}
                    <Typography
                      variant="caption"
                      sx={{ fontWeight: 700, color: m.is_active ? 'success.main' : 'text.disabled', minWidth: 50, textAlign: 'right' }}
                    >
                      {m.is_active ? 'AKTIV' : 'AUS'}
                    </Typography>
                    <Switch
                      checked={!!m.is_active}
                      disabled={savingKey === m.module_key}
                      onChange={(e) => handleToggle(m.module_key, e.target.checked)}
                      inputProps={{ 'aria-label': `${m.label} aktivieren/deaktivieren` }}
                    />
                  </Stack>
                </Stack>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      <Alert severity="info" variant="outlined" sx={{ mt: 2, fontSize: '0.82rem' }}>
        Deaktivierte Module verschwinden aus der Sidebar und vom Dashboard.
        Aufrufe der jeweiligen URL leiten zum Dashboard zurück.
        Persönliche Sidebar-Präferenzen oben unter <strong>Modulauswahl</strong> bleiben
        unberührt und greifen zusätzlich.
      </Alert>

      <Snackbar
        open={!!snack}
        autoHideDuration={3500}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {snack ? <Alert severity={snack.severity} onClose={() => setSnack(null)}>{snack.text}</Alert> : null}
      </Snackbar>
    </Box>
  );
}

// Standalone-Page für /admin/modules (mit eigenem Header).
// Bleibt erhalten als Direktlink-Ziel, ist aber nicht mehr in der Sidebar verlinkt.
export default function AdminModulesPage() {
  const { isAdmin, loading: modulesLoading } = useModules();

  if (modulesLoading) {
    return (
      <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress size={28} />
      </Box>
    );
  }
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <PageHeader
        title="Admin · Module"
        subtitle="Globale Feature-Toggles. Änderungen wirken sofort für alle Nutzer."
      />
      <AdminModulesPanel />
    </Box>
  );
}
