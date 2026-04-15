import { useState } from 'react';
import {
  Box, Stack, Typography, Button, Alert, CircularProgress, Divider, Paper,
} from '@mui/material';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import { useAuth } from '../context/AuthContext';

// Google "G" logo SVG
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
      background: 'linear-gradient(135deg, #0f0d2e 0%, #1a1744 50%, #0f0d2e 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      p: 3,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background decoration */}
      <Box sx={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <Box sx={{
          position: 'absolute', top: '-10%', right: '-5%', width: 400, height: 400,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%)',
        }} />
        <Box sx={{
          position: 'absolute', bottom: '-5%', left: '-5%', width: 500, height: 500,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(167,139,250,0.1) 0%, transparent 70%)',
        }} />
      </Box>

      <Paper
        elevation={24}
        sx={{
          background: 'rgba(26,23,68,0.85)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(124,58,237,0.25)',
          borderRadius: 4,
          p: '3rem 2.5rem',
          width: '100%',
          maxWidth: 400,
          position: 'relative',
        }}
      >
        {/* Logo */}
        <Stack alignItems="center" spacing={1.5} sx={{ mb: 4 }}>
          <Box sx={{
            width: 56, height: 56, borderRadius: 1,
            background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(124,58,237,0.4)',
          }}>
            <ShieldOutlinedIcon sx={{ fontSize: 28, color: '#fff' }} />
          </Box>
          <Typography variant="h5" sx={{
            color: '#ede9fe', fontWeight: 800, letterSpacing: '-0.02em',
          }}>
            Finanztracker
          </Typography>
          <Typography variant="caption" sx={{
            color: '#6d6a8a', textAlign: 'center', lineHeight: 1.5,
          }}>
            Dein persönliches Finanz-Cockpit.<br />
            Bitte melde dich an, um fortzufahren.
          </Typography>
        </Stack>

        {/* Divider */}
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
          <Divider sx={{ flex: 1, borderColor: 'rgba(124,58,237,0.2)' }} />
          <Typography variant="overline" sx={{
            color: '#6d6a8a', fontWeight: 700, letterSpacing: '0.08em', whiteSpace: 'nowrap',
          }}>
            Anmelden mit
          </Typography>
          <Divider sx={{ flex: 1, borderColor: 'rgba(124,58,237,0.2)' }} />
        </Stack>

        {/* Google button */}
        <Button
          fullWidth
          onClick={handleGoogleLogin}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={18} /> : <GoogleLogo />}
          sx={{
            py: 1.5,
            bgcolor: loading ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.97)',
            color: '#1f2937',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 1,
            fontSize: '0.925rem',
            fontWeight: 600,
            boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
            '&:hover': {
              bgcolor: 'rgba(255,255,255,1)',
              transform: 'translateY(-1px)',
              boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
            },
            '&.Mui-disabled': {
              bgcolor: 'rgba(255,255,255,0.05)',
              color: '#6d6a8a',
            },
          }}
        >
          {loading ? 'Weiterleitung…' : 'Mit Google anmelden'}
        </Button>

        {error && (
          <Alert severity="error" variant="outlined" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}

        {/* Footer */}
        <Typography variant="caption" sx={{
          display: 'block', color: '#4c4878', textAlign: 'center', mt: 3, lineHeight: 1.6,
        }}>
          Nur für private Nutzung. Deine Daten bleiben in deiner Supabase-Instanz.
        </Typography>
      </Paper>
    </Box>
  );
}
