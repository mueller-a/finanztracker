import { createTheme } from '@mui/material/styles';

// ─── Shared design tokens ─────────────────────────────────────────────────────
// Single source of truth: .claude/skills/design-system/design-tokens.css
// Values mirrored here so MUI's sx/theme API has access at runtime.
// When editing tokens, update BOTH files to keep them in sync.

const borderRadius = 12;  // --radius-xl (0.75rem = 12px)

// "The Fiscal Gallery" palette (DESIGN-SYSTEM.md §2)
const TOKENS = {
  surface:                  '#f8f9ff',
  surfaceContainerLowest:   '#ffffff',
  surfaceContainerLow:      '#eff4ff',
  surfaceContainer:         '#e5eeff',
  surfaceContainerHigh:     '#dce9ff',
  surfaceContainerHighest:  '#d3e4fe',
  onSurface:                '#0b1c30',
  onSurfaceVariant:         '#45464d',
  outlineVariant:           '#c6c6cd',
  primary:                  '#000000',
  primaryContainer:         '#131b2e',
  onPrimary:                '#ffffff',
  onPrimaryContainer:       '#7c839b',
  primaryFixedDim:          '#bec6e0',
  secondary:                '#006c49',
  secondaryContainer:       '#6cf8bb',
  onSecondaryContainer:     '#00714d',
  tertiaryFixed:            '#ffdadb',
  tertiaryFixedDim:         '#ffb2b7',
  onTertiaryContainer:      '#f23d5c',
  onTertiaryFixedVariant:   '#92002a',
  error:                    '#ba1a1a',
  errorContainer:           '#ffdad6',
  onErrorContainer:         '#93000a',
};

const typography = {
  // Body: Inter (per DESIGN-SYSTEM §3)
  fontFamily: '"Inter", "ui-sans-serif", system-ui, sans-serif',
  // Headlines: Manrope — applied via direct styles on h1–h6
  h1: { fontFamily: '"Manrope", sans-serif', fontWeight: 800, letterSpacing: '-0.02em' },
  h2: { fontFamily: '"Manrope", sans-serif', fontWeight: 800, letterSpacing: '-0.02em' },
  h3: { fontFamily: '"Manrope", sans-serif', fontWeight: 700, letterSpacing: '-0.01em' },
  h4: { fontFamily: '"Manrope", sans-serif', fontWeight: 700 },
  h5: { fontFamily: '"Manrope", sans-serif', fontWeight: 700 },
  h6: { fontFamily: '"Manrope", sans-serif', fontWeight: 700 },
  subtitle1: { fontWeight: 600 },
  subtitle2: { fontWeight: 600 },
  button: { fontWeight: 700, textTransform: 'none', letterSpacing: '0' },
  overline: { fontWeight: 700, letterSpacing: '0.08em' },
};

const shape = { borderRadius };

const components = {
  MuiButton: {
    defaultProps: { disableElevation: true },
    styleOverrides: {
      root: {
        borderRadius: borderRadius,                 // xl = 12px
        fontWeight: 700,
        textTransform: 'none',
        letterSpacing: 0,
        boxShadow: 'none',
        '&:hover':  { boxShadow: 'none' },
        '&:active': { boxShadow: 'none' },
      },
      // Primary CTA — Gradient (DESIGN-SYSTEM §5)
      containedPrimary: {
        background: `linear-gradient(135deg, ${TOKENS.primary} 0%, ${TOKENS.primaryContainer} 100%)`,
        color: TOKENS.onPrimary,
        '&:hover': {
          background: `linear-gradient(135deg, ${TOKENS.primary} 0%, ${TOKENS.primaryContainer} 100%)`,
          filter: 'brightness(1.2)',
        },
      },
      // Secondary — surface_container_high, no border
      outlinedPrimary: {
        backgroundColor: TOKENS.surfaceContainerHigh,
        color: TOKENS.onSurface,
        border: 'none',
        '&:hover': {
          backgroundColor: TOKENS.surfaceContainer,
          border: 'none',
        },
      },
      // Tertiary — ghost style (no bg)
      textPrimary: {
        color: TOKENS.onSurfaceVariant,
        '&:hover': { backgroundColor: TOKENS.surfaceContainerLow, color: TOKENS.onSurface },
      },
    },
  },
  // Cards: xl radius, no border (DESIGN-SYSTEM §5)
  MuiCard: {
    defaultProps: { elevation: 0 },
    styleOverrides: {
      root: {
        borderRadius: borderRadius,
        backgroundColor: TOKENS.surfaceContainerLowest,
        border: 'none',
        boxShadow: 'none',
      },
    },
  },
  MuiPaper: {
    defaultProps: { elevation: 0 },
    styleOverrides: {
      root: {
        borderRadius: borderRadius,
        backgroundColor: TOKENS.surfaceContainerLowest,
        backgroundImage: 'none',
        border: 'none',
      },
      // Tinted shadows only — DESIGN-SYSTEM §4
      elevation1: { boxShadow: '0 4px 12px -4px rgba(11, 28, 48, 0.06)' },
      elevation2: { boxShadow: '0 12px 24px -8px rgba(11, 28, 48, 0.06)' },
      elevation3: { boxShadow: '0 20px 40px -15px rgba(11, 28, 48, 0.06)' },
      // Outlined variant: "Ghost border" at 15% opacity (DESIGN-SYSTEM §4)
      outlined: { border: `1px solid ${TOKENS.outlineVariant}26` },  // 26 hex = ~15%
    },
  },
  // Chips: full rounded pill
  MuiChip: {
    styleOverrides: {
      root: {
        fontWeight: 700,
        borderRadius: 9999,
        fontFamily: '"Inter", sans-serif',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        fontSize: '0.625rem',
      },
      filledSuccess: {
        backgroundColor: TOKENS.secondaryContainer,
        color: TOKENS.onSecondaryContainer,
      },
      filledError: {
        backgroundColor: TOKENS.tertiaryFixed,
        color: TOKENS.onTertiaryFixedVariant,
      },
    },
  },
  MuiTextField: {
    defaultProps: { variant: 'outlined', size: 'small' },
    styleOverrides: {
      root: {
        '& .MuiOutlinedInput-root': { borderRadius: borderRadius },
        // iOS Safari zoomt bei font-size < 16px in Inputs — 1rem (= 16px) verhindert das
        '& .MuiInputBase-input': { fontSize: '1rem' },
      },
    },
  },
  MuiSelect: {
    styleOverrides: {
      outlined: { borderRadius: borderRadius },
    },
  },
  MuiTooltip: {
    styleOverrides: {
      tooltip: { borderRadius: borderRadius, fontSize: '0.75rem', fontWeight: 500 },
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
      root: { borderRadius: borderRadius, overflowX: 'auto' },
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
      paper: { borderRadius: borderRadius },
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

// ─── Light Theme — "The Fiscal Gallery" ───────────────────────────────────────
export const lightTheme = createTheme({
  palette: {
    mode: 'light',
    // Primary: deep navy (primary_container) as main for buttons
    primary: {
      light: TOKENS.primaryFixedDim,
      main:  TOKENS.primaryContainer,
      dark:  TOKENS.primary,
      contrastText: TOKENS.onPrimary,
    },
    // Secondary: emerald — positive cashflow
    secondary: {
      light: TOKENS.secondaryContainer,
      main:  TOKENS.secondary,
      dark:  '#005236',
      contrastText: '#ffffff',
    },
    success: {
      main:   TOKENS.secondary,
      light:  TOKENS.secondaryContainer,
      contrastText: '#ffffff',
    },
    warning: {
      main: '#b45309',
      light: '#fef3c7',
      contrastText: '#ffffff',
    },
    error: {
      main:  TOKENS.error,
      light: TOKENS.errorContainer,
      dark:  TOKENS.onErrorContainer,
      contrastText: '#ffffff',
    },
    background: {
      default: TOKENS.surface,
      paper:   TOKENS.surfaceContainerLowest,
    },
    text: {
      primary:   TOKENS.onSurface,
      secondary: TOKENS.onSurfaceVariant,
      disabled:  '#9098a3',
    },
    divider: TOKENS.outlineVariant,
    // Custom slots for Fiscal Gallery surface tiers
    surface: {
      base:    TOKENS.surface,
      low:     TOKENS.surfaceContainerLow,
      default: TOKENS.surfaceContainer,
      high:    TOKENS.surfaceContainerHigh,
      highest: TOKENS.surfaceContainerHighest,
      lowest:  TOKENS.surfaceContainerLowest,
    },
    accent: {
      positive:        TOKENS.secondary,
      positiveSurface: TOKENS.secondaryContainer,
      positiveOn:      TOKENS.onSecondaryContainer,
      negative:        TOKENS.onTertiaryContainer,
      negativeSurface: TOKENS.tertiaryFixed,
      negativeDim:     TOKENS.tertiaryFixedDim,
    },
  },
  typography,
  shape,
  mixins,
  components,
});

// ─── Dark Theme — Fiscal Gallery (inverted) ───────────────────────────────────
const DARK_TOKENS = {
  surface:                  '#0b1c30',
  surfaceContainerLowest:   '#131b2e',
  surfaceContainerLow:      '#1a2438',
  surfaceContainer:         '#213145',
  surfaceContainerHigh:     '#2a3a54',
  surfaceContainerHighest:  '#36486a',
  onSurface:                '#eaf1ff',
  onSurfaceVariant:         '#c6c6cd',
};

export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      light: TOKENS.primaryFixedDim,
      main:  TOKENS.primaryFixedDim,
      dark:  TOKENS.primaryContainer,
      contrastText: TOKENS.primaryContainer,
    },
    secondary: {
      light: TOKENS.secondaryContainer,
      main:  TOKENS.secondaryContainer,
      dark:  TOKENS.secondary,
      contrastText: TOKENS.onSecondaryContainer,
    },
    success: { main: TOKENS.secondaryContainer, light: TOKENS.secondary, contrastText: TOKENS.onSecondaryContainer },
    warning: { main: '#fbbf24', contrastText: TOKENS.primaryContainer },
    error:   { main: '#ffb4ab', light: TOKENS.errorContainer, dark: TOKENS.error, contrastText: TOKENS.primaryContainer },
    background: {
      default: DARK_TOKENS.surface,
      paper:   DARK_TOKENS.surfaceContainerLowest,
    },
    text: {
      primary:   DARK_TOKENS.onSurface,
      secondary: DARK_TOKENS.onSurfaceVariant,
      disabled:  '#76777d',
    },
    divider: DARK_TOKENS.surfaceContainerHigh,
    surface: {
      base:    DARK_TOKENS.surface,
      low:     DARK_TOKENS.surfaceContainerLow,
      default: DARK_TOKENS.surfaceContainer,
      high:    DARK_TOKENS.surfaceContainerHigh,
      highest: DARK_TOKENS.surfaceContainerHighest,
      lowest:  DARK_TOKENS.surfaceContainerLowest,
    },
    accent: {
      positive:        TOKENS.secondaryContainer,
      positiveSurface: TOKENS.secondary,
      positiveOn:      '#ffffff',
      negative:        TOKENS.tertiaryFixedDim,
      negativeSurface: TOKENS.tertiaryContainer,
      negativeDim:     TOKENS.onTertiaryContainer,
    },
  },
  typography,
  shape,
  mixins,
  components,
});
