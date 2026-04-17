import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Box, Typography, IconButton, SwipeableDrawer,
  AppBar, Toolbar, BottomNavigation, BottomNavigationAction,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import EuroOutlinedIcon from '@mui/icons-material/EuroOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import SavingsOutlinedIcon from '@mui/icons-material/SavingsOutlined';
import Sidebar from './Sidebar';
import { navItems } from '../navItems';

const BOTTOM_NAV_ITEMS = [
  { label: 'Home',          path: '/',              icon: <DashboardOutlinedIcon /> },
  { label: 'Budget',        path: '/budget',        icon: <AccountBalanceWalletOutlinedIcon /> },
  { label: 'Gehalt',        path: '/gehaltsrechner', icon: <EuroOutlinedIcon /> },
  { label: 'Versicherung',  path: '/versicherungen', icon: <ShieldOutlinedIcon /> },
  { label: 'Guthaben',      path: '/guthaben',      icon: <SavingsOutlinedIcon /> },
];

const BOTTOM_NAV_HEIGHT = 56;
const APPBAR_HEIGHT     = 56;

export default function MainLayout({ isDark, onToggleDark }) {
  const theme     = useTheme();
  const location  = useLocation();
  const navigate  = useNavigate();
  const isMobile  = useMediaQuery(theme.breakpoints.down('md'));
  const [drawerOpen, setDrawerOpen] = useState(false);

  const EXTRA_LABELS = { '/settings': 'Einstellungen' };
  const current = EXTRA_LABELS[location.pathname]
    ? { label: EXTRA_LABELS[location.pathname] }
    : navItems.find((item) =>
        item.path === '/'
          ? location.pathname === '/'
          : location.pathname.startsWith(item.path)
      );

  const bottomNavValue = BOTTOM_NAV_ITEMS.findIndex((item) =>
    item.path === '/'
      ? location.pathname === '/'
      : location.pathname.startsWith(item.path)
  );

  // ── Mobile Layout ──────────────────────────────────────────
  if (isMobile) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
        {/* AppBar mit Hamburger */}
        <AppBar
          position="sticky"
          elevation={0}
          sx={{
            bgcolor: 'background.paper',
            color: 'text.primary',
            borderBottom: 1,
            borderColor: 'divider',
            zIndex: theme.zIndex.appBar,
          }}
        >
          <Toolbar sx={{ minHeight: APPBAR_HEIGHT, px: 2 }}>
            <IconButton edge="start" onClick={() => setDrawerOpen(true)} sx={{ mr: 1 }}>
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem' }}>
              {current?.label ?? 'Finanztracker'}
            </Typography>
          </Toolbar>
        </AppBar>

        {/* SwipeableDrawer mit voller Sidebar */}
        <SwipeableDrawer
          anchor="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onOpen={() => setDrawerOpen(true)}
          disableSwipeToOpen={false}
          swipeAreaWidth={20}
          ModalProps={{ keepMounted: true }}
          PaperProps={{ sx: { width: 280 } }}
        >
          <Sidebar
            isDark={isDark}
            onToggleDark={onToggleDark}
            mobile
            onNavigate={() => setDrawerOpen(false)}
          />
        </SwipeableDrawer>

        {/* Scrollable Content */}
        <Box
          component="main"
          sx={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            pb: `${BOTTOM_NAV_HEIGHT + 8}px`,
          }}
        >
          <Outlet context={{ isDark, onToggleDark }} />
        </Box>

        {/* BottomNavigation */}
        <BottomNavigation
          value={bottomNavValue >= 0 ? bottomNavValue : false}
          onChange={(_, idx) => navigate(BOTTOM_NAV_ITEMS[idx].path)}
          showLabels
          sx={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: theme.zIndex.appBar,
            borderTop: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
            height: BOTTOM_NAV_HEIGHT,
            '& .MuiBottomNavigationAction-root': { minWidth: 0, py: 0.5 },
            '& .MuiBottomNavigationAction-label': { fontSize: '0.65rem' },
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          {BOTTOM_NAV_ITEMS.map((item) => (
            <BottomNavigationAction key={item.path} label={item.label} icon={item.icon} />
          ))}
        </BottomNavigation>
      </Box>
    );
  }

  // ── Desktop Layout (bestehendes Layout) ────────────────────
  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden', bgcolor: 'background.default' }}>
      <Sidebar isDark={isDark} onToggleDark={onToggleDark} />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%', overflow: 'hidden' }}>
        <Box
          component="header"
          sx={{
            borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper',
            px: 4, height: APPBAR_HEIGHT, display: 'flex', alignItems: 'center', flexShrink: 0, zIndex: 30,
          }}
        >
          <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem' }}>
            {current?.label ?? 'Finanztracker'}
          </Typography>
        </Box>
        <Box component="main" sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', p: 4 }}>
          <Outlet context={{ isDark, onToggleDark }} />
        </Box>
      </Box>
    </Box>
  );
}
