import { createTheme } from '@mui/material/styles';

// ─── Shared design tokens ─────────────────────────────────────────────────────
const borderRadius = 16;

const typography = {
  fontFamily: '"Inter", "ui-sans-serif", system-ui, sans-serif',
  h1: { fontWeight: 700, letterSpacing: '-0.02em' },
  h2: { fontWeight: 700, letterSpacing: '-0.01em' },
  h3: { fontWeight: 600 },
  h4: { fontWeight: 600 },
  h5: { fontWeight: 600 },
  h6: { fontWeight: 600 },
  button: { fontWeight: 600, textTransform: 'none', letterSpacing: '0.01em' },
  subtitle1: { fontWeight: 500 },
  subtitle2: { fontWeight: 500 },
};

const shape = { borderRadius };

const components = {
  MuiButton: {
    styleOverrides: {
      root: {
        borderRadius: borderRadius,
        boxShadow: 'none',
        '&:hover': { boxShadow: 'none' },
        '&:active': { boxShadow: 'none' },
      },
      containedPrimary: {
        '&:hover': { filter: 'brightness(1.08)' },
      },
    },
  },
  MuiCard: {
    styleOverrides: {
      root: {
        borderRadius: borderRadius * 1.25,
        boxShadow: '0 2px 8px 0 rgba(0,0,0,0.06), 0 8px 32px -4px rgba(0,0,0,0.08)',
      },
    },
  },
  MuiPaper: {
    styleOverrides: {
      root: { borderRadius: borderRadius },
      elevation1: { boxShadow: '0 1px 4px 0 rgba(0,0,0,0.05), 0 4px 16px -2px rgba(0,0,0,0.07)' },
      elevation2: { boxShadow: '0 2px 8px 0 rgba(0,0,0,0.06), 0 8px 32px -4px rgba(0,0,0,0.10)' },
    },
  },
  MuiChip: {
    styleOverrides: {
      root: { fontWeight: 600, borderRadius: 99 },
    },
  },
  MuiTextField: {
    defaultProps: { variant: 'outlined', size: 'small' },
    styleOverrides: {
      root: { '& .MuiOutlinedInput-root': { borderRadius: borderRadius } },
    },
  },
  MuiSelect: {
    styleOverrides: {
      outlined: { borderRadius: borderRadius },
    },
  },
  MuiTooltip: {
    styleOverrides: {
      tooltip: { borderRadius: 8, fontSize: '0.75rem', fontWeight: 500 },
    },
  },
  MuiInputAdornment: {
    styleOverrides: {
      root: ({ theme }) => ({
        color: theme.palette.text.secondary,
        '& .MuiTypography-root': { color: 'inherit', fontWeight: 500 },
      }),
    },
  },
  MuiTableContainer: {
    styleOverrides: {
      root: { borderRadius: borderRadius },
    },
  },
  MuiTableCell: {
    styleOverrides: {
      root: ({ theme }) => ({
        borderColor: theme.palette.divider,
        padding: '8px 12px',
        fontSize: '0.82rem',
      }),
      head: ({ theme }) => ({
        fontWeight: 600,
        fontSize: '0.7rem',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: theme.palette.text.secondary,
        backgroundColor: theme.palette.action.hover,
      }),
    },
  },
  MuiDialog: {
    styleOverrides: {
      paper: { borderRadius: borderRadius * 1.25 },
    },
  },
  MuiDialogTitle: {
    styleOverrides: {
      root: { fontWeight: 600, fontSize: '1.05rem', padding: '20px 24px 8px' },
    },
  },
  MuiDialogContent: {
    styleOverrides: {
      root: { padding: '8px 24px 16px' },
    },
  },
  MuiDialogActions: {
    styleOverrides: {
      root: { padding: '8px 20px 16px' },
    },
  },
  MuiAlert: {
    styleOverrides: {
      root: { borderRadius: borderRadius, fontWeight: 500 },
    },
  },
};

// ─── Shared mixins ────────────────────────────────────────────────────────────
// Used by KpiCard / page layouts to enforce the 188px-min KPI grid (SKILL.md §158)
const mixins = {
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(188px, 1fr))',
    gap: 16,
  },
};

// ─── Light Theme ──────────────────────────────────────────────────────────────
export const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      light:  '#a78bfa',  // violet-400
      main:   '#7c3aed',  // violet-600  ← mutig, lebendig
      dark:   '#5b21b6',  // violet-800
      contrastText: '#ffffff',
    },
    secondary: {
      light:  '#fb7185',  // rose-400
      main:   '#f43f5e',  // rose-500  ← Koralle/Neon-Pink
      dark:   '#e11d48',  // rose-600
      contrastText: '#ffffff',
    },
    success: {
      main: '#10b981',  // emerald-500
      contrastText: '#ffffff',
    },
    warning: {
      main: '#f59e0b',  // amber-500
      contrastText: '#ffffff',
    },
    error: {
      main: '#ef4444',
      contrastText: '#ffffff',
    },
    background: {
      default: '#f8f7ff',  // leichter Violett-Unterton statt reines Weiß
      paper:   '#ffffff',
    },
    text: {
      primary:   '#1e1b4b',  // violet-950 — starker Kontrast
      secondary: '#6d6a8a',  // gedämpftes Violett-Grau
      disabled:  '#b8b5d0',
    },
    divider: '#ede9fe',      // violet-100
  },
  typography,
  shape,
  mixins,
  components: {
    ...components,
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius * 1.25,
          backgroundColor: '#ffffff',
          boxShadow: '0 2px 8px 0 rgba(99,60,255,0.06), 0 8px 32px -4px rgba(99,60,255,0.08)',
          border: '1px solid #ede9fe',
        },
      },
    },
  },
});

// ─── Dark Theme ───────────────────────────────────────────────────────────────
export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      light:  '#c4b5fd',  // violet-300
      main:   '#a78bfa',  // violet-400  ← leuchtend auf dunklem Grund
      dark:   '#7c3aed',  // violet-600
      contrastText: '#1e1b4b',
    },
    secondary: {
      light:  '#fda4af',  // rose-300
      main:   '#fb7185',  // rose-400
      dark:   '#f43f5e',  // rose-500
      contrastText: '#1e1b4b',
    },
    success: {
      main: '#34d399',  // emerald-400
    },
    warning: {
      main: '#fbbf24',  // amber-400
    },
    error: {
      main: '#f87171',  // red-400
    },
    background: {
      default: '#0f0d2e',  // sehr tiefes Indigoblau — kein Grau
      paper:   '#1a1744',  // leicht helleres Indigoblau für Cards/Paper
    },
    text: {
      primary:   '#ede9fe',  // violet-100
      secondary: '#a5a0c8',  // gedämpftes Violett
      disabled:  '#4c4878',
    },
    divider: '#2d2a5e',       // subtile Trenner im Stil des Dunkel-Themes
  },
  typography,
  shape,
  mixins,
  components: {
    ...components,
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius * 1.25,
          backgroundColor: '#1a1744',
          boxShadow: '0 2px 8px 0 rgba(0,0,0,0.3), 0 8px 32px -4px rgba(99,60,255,0.15)',
          border: '1px solid #2d2a5e',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius,
          backgroundColor: '#1a1744',
          backgroundImage: 'none',
        },
        elevation1: {
          boxShadow: '0 1px 4px 0 rgba(0,0,0,0.2), 0 4px 16px -2px rgba(99,60,255,0.12)',
        },
        elevation2: {
          boxShadow: '0 2px 8px 0 rgba(0,0,0,0.3), 0 8px 32px -4px rgba(99,60,255,0.18)',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#0f0d2e',
          borderBottom: '1px solid #2d2a5e',
          boxShadow: 'none',
        },
      },
    },
  },
});
