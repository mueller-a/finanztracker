import { useState, useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Box, Stack, Typography, IconButton, Avatar, Tooltip,
  List, ListItemButton, ListItemIcon, ListItemText, Collapse, Badge, Divider,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import RadarOutlinedIcon from '@mui/icons-material/RadarOutlined';
import EuroOutlinedIcon from '@mui/icons-material/EuroOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import ShowChartOutlinedIcon from '@mui/icons-material/ShowChartOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import CreditCardOutlinedIcon from '@mui/icons-material/CreditCardOutlined';
import SavingsOutlinedIcon from '@mui/icons-material/SavingsOutlined';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import { Tooltip as MuiTooltip } from '@mui/material';
import { navItems } from '../navItems';
import { useAuth } from '../context/AuthContext';
import { useModules } from '../context/ModuleContext';
import { useAppModules } from '../context/AppModulesContext';
import { useContractAlert } from '../context/ContractAlertContext';

// Map navItem.icon string → MUI Icon component
const ICON_MAP = {
  overview:   DashboardOutlinedIcon,
  budget:     AccountBalanceWalletOutlinedIcon,
  radar:      RadarOutlinedIcon,
  salary:     EuroOutlinedIcon,
  shield:     ShieldOutlinedIcon,
  calculator: CalculateOutlinedIcon,
  chart:      ShowChartOutlinedIcon,
  lightning:  BoltOutlinedIcon,
  credit:     CreditCardOutlinedIcon,
  piggy:      SavingsOutlinedIcon,
  house:      HomeOutlinedIcon,
  household:  PeopleOutlinedIcon,
};

function NavIcon({ name, ...props }) {
  const Cmp = ICON_MAP[name] ?? DashboardOutlinedIcon;
  return <Cmp fontSize="small" {...props} />;
}

const COLLAPSED_WIDTH = 64;
const EXPANDED_WIDTH  = 280;

export default function Sidebar({ isDark, onToggleDark }) {
  const theme = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState(() => {
    const initial = {};
    navItems.forEach((item) => { if (item.children) initial[item.path] = true; });
    return initial;
  });

  const { user, signOut } = useAuth();
  const { modules, isAdmin } = useModules();
  const { isModuleEnabled, isHiddenFromUsers } = useAppModules();
  const { redCount } = useContractAlert();
  const location = useLocation();

  // Filter-Reihenfolge:
  //   1. adminOnly  → nur Admins sehen den Eintrag
  //   2. appModuleKey → globaler Toggle (app_modules)
  //   3. moduleKey    → persönliche User-Präferenz (user_module_settings.show_*)
  const visibleItems = useMemo(() => {
    function passes(item) {
      if (item.adminOnly && !isAdmin)                            return false;
      if (item.appModuleKey && !isModuleEnabled(item.appModuleKey)) return false;
      if (item.moduleKey && !modules[item.moduleKey])             return false;
      return true;
    }
    return navItems
      .filter(passes)
      .map((item) => {
        if (!item.children) return item;
        const visibleChildren = item.children.filter(passes);
        return visibleChildren.length > 0 ? { ...item, children: visibleChildren } : item;
      });
  }, [modules, isAdmin, isModuleEnabled]);

  // Wrappt einen Label-Text in ein JSX, das bei "vor User versteckten" Modulen
  // ein dezentes "Hidden"-Icon anhängt (nur Admins sehen das).
  function labelWithHiddenBadge(label, appModuleKey) {
    if (!isHiddenFromUsers(appModuleKey)) return label;
    return (
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
        {label}
        <MuiTooltip title="Für normale Nutzer ausgeblendet" arrow>
          <VisibilityOffOutlinedIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
        </MuiTooltip>
      </Box>
    );
  }

  function isAnyChildActive(children) {
    return children.some((c) => location.pathname === c.path || location.pathname.startsWith(c.path + '/'));
  }

  function toggleGroup(path) {
    setOpenGroups((prev) => ({ ...prev, [path]: !prev[path] }));
  }

  // ── Shared list-item button (top-level) ────────────────────────────────────
  function NavButton({ to, active, icon, label, badgeContent, onClick, title }) {
    // Only forward router-specific props when we actually render a NavLink.
    // A plain <button> would otherwise receive `end="false"` / `to=undefined` as DOM attrs.
    const routerProps = to
      ? { component: NavLink, to, end: to === '/' }
      : { component: 'button', type: 'button' };
    const content = (
      <ListItemButton
        {...routerProps}
        selected={active}
        onClick={onClick}
        sx={{
          borderRadius: 1,
          mb: 0.25,
          minHeight: 40,
          justifyContent: collapsed ? 'center' : 'flex-start',
          px: collapsed ? 0 : 1.5,
          color: active ? 'primary.main' : 'text.secondary',
          bgcolor: active ? (theme.palette.mode === 'dark' ? 'rgba(167,139,250,0.12)' : 'rgba(124,58,237,0.08)') : 'transparent',
          '&:hover': {
            bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
          },
          '&.Mui-selected': {
            bgcolor: theme.palette.mode === 'dark' ? 'rgba(167,139,250,0.12)' : 'rgba(124,58,237,0.08)',
            color: 'primary.main',
            '&:hover': {
              bgcolor: theme.palette.mode === 'dark' ? 'rgba(167,139,250,0.18)' : 'rgba(124,58,237,0.12)',
            },
          },
          position: 'relative',
        }}
      >
        {/* Active accent bar */}
        {active && (
          <Box sx={{
            position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
            width: 3, height: 18, borderRadius: 99,
            bgcolor: 'primary.main',
          }} />
        )}
        <ListItemIcon sx={{
          minWidth: collapsed ? 0 : 32,
          color: active ? 'primary.main' : 'inherit',
          justifyContent: 'center',
        }}>
          {badgeContent ? (
            <Badge badgeContent={badgeContent} color="error" overlap="circular">
              {icon}
            </Badge>
          ) : icon}
        </ListItemIcon>
        {!collapsed && (
          <ListItemText
            primary={label}
            primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 600 }}
          />
        )}
      </ListItemButton>
    );

    if (collapsed && title) {
      return <Tooltip title={title} placement="right" arrow>{content}</Tooltip>;
    }
    return content;
  }

  // ── Sub-list item ──────────────────────────────────────────────────────────
  function SubNavButton({ to, active, icon, label, badgeContent }) {
    return (
      <ListItemButton
        component={NavLink}
        to={to}
        selected={active}
        sx={{
          borderRadius: 1.25,
          minHeight: 36,
          pl: 4.5,
          py: 0.75,
          color: active ? 'primary.main' : 'text.secondary',
          '&:hover': {
            bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
          },
          '&.Mui-selected': {
            bgcolor: theme.palette.mode === 'dark' ? 'rgba(167,139,250,0.10)' : 'rgba(124,58,237,0.06)',
            color: 'primary.main',
            '&:hover': {
              bgcolor: theme.palette.mode === 'dark' ? 'rgba(167,139,250,0.16)' : 'rgba(124,58,237,0.10)',
            },
          },
        }}
      >
        <ListItemIcon sx={{ minWidth: 28, color: active ? 'primary.main' : 'inherit' }}>
          {icon}
        </ListItemIcon>
        <ListItemText
          primary={label}
          primaryTypographyProps={{ fontSize: '0.81rem', fontWeight: 500 }}
        />
        {badgeContent && (
          <Badge badgeContent={badgeContent} color="error" sx={{ '& .MuiBadge-badge': { position: 'static', transform: 'none' } }} />
        )}
      </ListItemButton>
    );
  }

  return (
    <Box
      component="nav"
      aria-label="Hauptnavigation"
      sx={{
        width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH,
        minHeight: '100vh',
        bgcolor: 'background.paper',
        borderRight: 1,
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        p: collapsed ? '20px 12px' : '20px 16px',
        position: 'relative',
        transition: 'width 0.3s cubic-bezier(0.4,0,0.2,1)',
        flexShrink: 0,
      }}
    >
      {/* ── Collapse toggle ─────────────────────────────────────────────── */}
      <IconButton
        onClick={() => setCollapsed((v) => !v)}
        size="small"
        aria-label={collapsed ? 'Sidebar ausklappen' : 'Sidebar einklappen'}
        sx={{
          position: 'absolute',
          top: 14,
          right: -12,
          width: 24,
          height: 24,
          bgcolor: 'background.paper',
          color: 'primary.main',
          border: 1,
          borderColor: 'divider',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          zIndex: 10,
          '&:hover': { bgcolor: 'background.paper' },
        }}
      >
        {collapsed ? <ChevronRightIcon sx={{ fontSize: 14 }} /> : <ChevronLeftIcon sx={{ fontSize: 14 }} />}
      </IconButton>

      {/* ── Logo ────────────────────────────────────────────────────────── */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.25}
        justifyContent={collapsed ? 'center' : 'flex-start'}
        sx={{ mb: 4, pl: collapsed ? 0 : 0.5 }}
      >
        <Box sx={{
          width: 32, height: 32, borderRadius: 1.25,
          bgcolor: 'primary.main',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <ShieldOutlinedIcon sx={{ fontSize: 18, color: '#fff' }} />
        </Box>
        {!collapsed && (
          <Typography sx={{
            fontWeight: 700, fontSize: '1rem',
            letterSpacing: '-0.01em', whiteSpace: 'nowrap',
          }}>
            Finanztracker
          </Typography>
        )}
      </Stack>

      {/* ── Section label ───────────────────────────────────────────────── */}
      {!collapsed && (
        <Typography variant="overline" sx={{
          color: 'text.disabled',
          fontWeight: 700,
          letterSpacing: '0.1em',
          pl: 1.5,
          mb: 0.5,
          display: 'block',
        }}>
          Tools
        </Typography>
      )}

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <List dense disablePadding sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {visibleItems.map((item) => {
          if (item.children) {
            const anyChildActive = isAnyChildActive(item.children);
            const isOpen = openGroups[item.path] ?? true;
            const groupBadge = item.children.some((c) => c.path === '/budget/optimizer') && redCount > 0
              ? redCount
              : undefined;

            if (collapsed) {
              // Collapsed: link directly to first active child or first child
              const activePath = item.children.find((c) => location.pathname === c.path || location.pathname.startsWith(c.path + '/'));
              const target = activePath?.path ?? item.children[0].path;
              return (
                <NavButton
                  key={item.path}
                  to={target}
                  active={anyChildActive}
                  icon={<NavIcon name={item.icon} />}
                  label={labelWithHiddenBadge(item.label, item.appModuleKey)}
                  title={item.label}
                  badgeContent={groupBadge}
                />
              );
            }

            return (
              <Box key={item.path}>
                <ListItemButton
                  onClick={() => toggleGroup(item.path)}
                  sx={{
                    borderRadius: 1,
                    mb: 0.25,
                    minHeight: 40,
                    px: 1.5,
                    color: anyChildActive ? 'primary.main' : 'text.secondary',
                    bgcolor: anyChildActive ? (theme.palette.mode === 'dark' ? 'rgba(167,139,250,0.12)' : 'rgba(124,58,237,0.08)') : 'transparent',
                    '&:hover': {
                      bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                    },
                    position: 'relative',
                  }}
                >
                  {anyChildActive && (
                    <Box sx={{
                      position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                      width: 3, height: 18, borderRadius: 99,
                      bgcolor: 'primary.main',
                    }} />
                  )}
                  <ListItemIcon sx={{
                    minWidth: 32,
                    color: anyChildActive ? 'primary.main' : 'inherit',
                  }}>
                    {groupBadge ? (
                      <Badge badgeContent={groupBadge} color="error" overlap="circular">
                        <NavIcon name={item.icon} />
                      </Badge>
                    ) : <NavIcon name={item.icon} />}
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                        {item.label}
                        {isHiddenFromUsers(item.appModuleKey) && (
                          <MuiTooltip title="Für normale Nutzer ausgeblendet" arrow>
                            <VisibilityOffOutlinedIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                          </MuiTooltip>
                        )}
                      </Box>
                    }
                    primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 600 }}
                  />
                  {isOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                </ListItemButton>
                <Collapse in={isOpen} timeout="auto" unmountOnExit>
                  <List dense disablePadding sx={{ mt: 0.25 }}>
                    {item.children.map((child) => {
                      const childActive = location.pathname === child.path || location.pathname.startsWith(child.path + '/');
                      const childBadge = child.path === '/budget/optimizer' && redCount > 0 ? redCount : undefined;
                      return (
                        <SubNavButton
                          key={child.path}
                          to={child.path}
                          active={childActive}
                          icon={<NavIcon name={child.icon} />}
                          label={labelWithHiddenBadge(child.label, child.appModuleKey)}
                          badgeContent={childBadge}
                        />
                      );
                    })}
                  </List>
                </Collapse>
              </Box>
            );
          }

          // Regular flat item
          const active = item.path === '/'
            ? location.pathname === '/'
            : location.pathname === item.path || location.pathname.startsWith(item.path + '/');

          return (
            <NavButton
              key={item.path}
              to={item.path}
              active={active}
              icon={<NavIcon name={item.icon} />}
              label={labelWithHiddenBadge(item.label, item.appModuleKey)}
              title={item.label}
            />
          );
        })}
      </List>

      {/* ── Bottom: user + dark-mode + logout ───────────────────────────── */}
      <Box sx={{ mt: 'auto', pt: 2, borderTop: 1, borderColor: 'divider' }}>
        {/* User row */}
        {user && (
          <Stack
            direction="row"
            alignItems="center"
            spacing={collapsed ? 0 : 1.25}
            justifyContent={collapsed ? 'center' : 'flex-start'}
            sx={{ p: collapsed ? '8px 0' : '8px 12px', mb: 0.25 }}
          >
            {user.user_metadata?.avatar_url ? (
              <Avatar
                src={user.user_metadata.avatar_url}
                alt="Avatar"
                sx={{ width: 28, height: 28, border: 2, borderColor: 'divider' }}
              />
            ) : (
              <Avatar sx={{ width: 28, height: 28, bgcolor: 'primary.main', fontSize: '0.75rem' }}>
                {(user.user_metadata?.full_name ?? user.email ?? '?')[0].toUpperCase()}
              </Avatar>
            )}
            {!collapsed && (
              <Box sx={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                <Typography sx={{
                  fontSize: '0.78rem', fontWeight: 600,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {user.user_metadata?.full_name ?? user.email}
                </Typography>
                <Typography variant="caption" sx={{
                  display: 'block', color: 'text.disabled',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {user.email}
                </Typography>
              </Box>
            )}
          </Stack>
        )}

        {/* Settings link */}
        <NavButton
          to="/settings"
          active={location.pathname === '/settings'}
          icon={<SettingsOutlinedIcon fontSize="small" />}
          label="Einstellungen"
          title="Einstellungen"
        />

        {/* Dark mode toggle */}
        <NavButton
          onClick={onToggleDark}
          active={false}
          icon={isDark ? <Brightness7Icon fontSize="small" /> : <Brightness4Icon fontSize="small" />}
          label={isDark ? 'Light Mode' : 'Dark Mode'}
          title={isDark ? 'Light Mode' : 'Dark Mode'}
        />

        {/* Logout */}
        <NavButton
          onClick={signOut}
          active={false}
          icon={<LogoutOutlinedIcon fontSize="small" />}
          label="Abmelden"
          title="Abmelden"
        />
      </Box>
    </Box>
  );
}
