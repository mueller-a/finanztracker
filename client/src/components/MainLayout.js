import { Outlet, useLocation } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import Sidebar from './Sidebar';
import { navItems } from '../navItems';

export default function MainLayout({ isDark, onToggleDark }) {
  const location = useLocation();

  // Derive current page title from navItems + special routes
  const EXTRA_LABELS = { '/settings': 'Einstellungen' };
  const current = EXTRA_LABELS[location.pathname]
    ? { label: EXTRA_LABELS[location.pathname] }
    : navItems.find((item) =>
        item.path === '/'
          ? location.pathname === '/'
          : location.pathname.startsWith(item.path)
      );

  return (
    <Box sx={{
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
      bgcolor: 'background.default',
    }}>
      {/* Sidebar — fills height, never scrolls */}
      <Sidebar isDark={isDark} onToggleDark={onToggleDark} />

      {/* Right column: topbar + scrollable content */}
      <Box sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        height: '100%',
        overflow: 'hidden',
      }}>
        {/* Top bar */}
        <Box
          component="header"
          sx={{
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
            px: 4,
            height: 56,
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
            zIndex: 30,
          }}
        >
          <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem', m: 0 }}>
            {current?.label ?? 'Finanztracker'}
          </Typography>
        </Box>

        {/* Page content — only scrolling region */}
        <Box
          component="main"
          sx={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            p: 4,
          }}
        >
          <Outlet context={{ isDark, onToggleDark }} />
        </Box>
      </Box>
    </Box>
  );
}
