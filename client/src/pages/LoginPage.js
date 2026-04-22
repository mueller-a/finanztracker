import { useState } from 'react';
import {
  Box, Stack, Typography, Button, Alert, CircularProgress, Paper,
} from '@mui/material';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import { useAuth } from '../context/AuthContext';

// Google "G" logo — official brand mark (these are Google's fixed brand
// colors, not UI chrome, so they're allowed to stay as literal hex values.)
function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" />
      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
    </svg>
  );
}

export default function LoginPage() {
  const { signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  async function handleGoogleLogin() {
    setLoading(true);
    setError('');
    const { error: sbError } = await signInWithGoogle();
    if (sbError) {
      setError(sbError.message);
      setLoading(false);
    }
  }

  return (
    <Box sx={{
      minHeight: '100vh',
      bgcolor: 'background.default',    // surface = offwhite
      display: 'grid',
      gridTemplateColumns: { xs: '1fr', md: '7fr 5fr' },
    }}>
      {/* ── LEFT: Editorial Navy Hero ── */}
      <Paper sx={(t) => ({
        position: 'relative',
        overflow: 'hidden',
        bgcolor: 'primary.dark',           // #000 (Fiscal Gallery primary)
        color: 'primary.contrastText',
        borderRadius: 0,
        display: { xs: 'none', md: 'flex' },
        flexDirection: 'column',
        justifyContent: 'space-between',
        p: { md: 8, lg: 10 },
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(135deg, ${t.palette.primary.dark} 0%, ${t.palette.primary.main} 100%)`,
          opacity: 0.6,
          pointerEvents: 'none',
        },
      })}>
        {/* Brand lockup */}
        <Stack direction="row" alignItems="center" spacing={2} sx={{ position: 'relative', zIndex: 1 }}>
          <Paper sx={{
            width: 48, height: 48, borderRadius: 2,
            bgcolor: 'primary.main',       // darker navy inside the lighter navy
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ShieldOutlinedIcon sx={{ fontSize: 24, color: 'primary.contrastText' }} />
          </Paper>
          <Box>
            <Typography sx={{
              fontFamily: 'headline', fontWeight: 800, fontSize: '1.25rem',
              letterSpacing: '-0.01em',
            }}>
              Finanztracker
            </Typography>
            <Typography variant="overline" sx={{ color: 'primary.light', fontSize: '0.625rem' }}>
              The Fiscal Gallery
            </Typography>
          </Box>
        </Stack>

        {/* Editorial headline */}
        <Box sx={{ position: 'relative', zIndex: 1, maxWidth: 560 }}>
          <Typography variant="overline" sx={{ color: 'primary.light', display: 'block', mb: 3 }}>
            Dein persönliches Finanz-Cockpit
          </Typography>
          <Typography variant="h2" sx={{
            fontWeight: 900,
            letterSpacing: '-0.02em',
            lineHeight: 1.05,
            mb: 3,
          }}>
            Finanzen wie eine Galerie.
          </Typography>
          <Typography sx={{
            fontSize: '1.05rem',
            lineHeight: 1.7,
            color: 'primary.light',
          }}>
            Keine Spreadsheets mehr. Stattdessen: kuratierte Einblicke,
            ruhiges Layout und Zahlen, die sich wie ein Finanz-Journal lesen.
          </Typography>
        </Box>

        {/* Footer meta */}
        <Typography variant="caption" sx={{ color: 'primary.light', position: 'relative', zIndex: 1 }}>
          Privat gehostet · Deine Daten bleiben in deiner Supabase-Instanz.
        </Typography>
      </Paper>

      {/* ── RIGHT: Login form ── */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: { xs: 3, sm: 6 },
      }}>
        <Stack spacing={4} sx={{ width: '100%', maxWidth: 380 }}>
          {/* Mobile-only brand */}
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ display: { xs: 'flex', md: 'none' } }}>
            <Paper sx={{
              width: 40, height: 40, borderRadius: 2,
              bgcolor: 'primary.dark',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ShieldOutlinedIcon sx={{ fontSize: 22, color: 'primary.contrastText' }} />
            </Paper>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>Finanztracker</Typography>
          </Stack>

          <Box>
            <Typography variant="overline" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
              Willkommen zurück
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: '-0.02em', mb: 1 }}>
              Anmelden
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
              Nutze deinen Google-Account, um fortzufahren.
            </Typography>
          </Box>

          <Button
            fullWidth
            variant="outlined"
            color="primary"
            size="large"
            onClick={handleGoogleLogin}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={18} /> : <GoogleLogo />}
            sx={{
              py: 1.75,
              bgcolor: 'background.paper',     // surface-container-lowest
              color: 'text.primary',
              border: 'none',
              '&:hover': {
                bgcolor: 'surface.low',
                border: 'none',
              },
            }}
          >
            {loading ? 'Weiterleitung…' : 'Mit Google anmelden'}
          </Button>

          {error && (
            <Alert severity="error" variant="outlined">{error}</Alert>
          )}

          {/* Mobile-only footer */}
          <Typography variant="caption" sx={{
            display: { xs: 'block', md: 'none' },
            color: 'text.secondary',
            textAlign: 'center',
            lineHeight: 1.6,
          }}>
            Privat gehostet · Deine Daten bleiben in deiner Supabase-Instanz.
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
}
