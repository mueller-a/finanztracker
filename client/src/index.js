import React, { useState, useMemo, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { ThemeProvider, CssBaseline, Box, CircularProgress } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import 'dayjs/locale/de';
import { lightTheme, darkTheme } from './theme';
import './index.css';

import { AuthProvider, useAuth } from './context/AuthContext';
import { ModuleProvider, useModules } from './context/ModuleContext';
import { ContractAlertProvider } from './context/ContractAlertContext';
import MainLayout            from './components/MainLayout';
import LoginPage             from './pages/LoginPage';
import OverviewPage          from './pages/OverviewPage';
import InsurancesPage        from './pages/InsurancesPage';
import StromPage             from './pages/StromPage';
import GuthabenPage          from './pages/GuthabenPage';
import VerbindlichkeitenPage from './pages/VerbindlichkeitenPage';
import BudgetPage            from './pages/BudgetPage';
import PlaceholderPage       from './pages/PlaceholderPage';
import ETFRechnerPage        from './pages/ETFRechnerPage';
import SalaryPage            from './pages/SalaryPage';
import PkvCalculatorPage     from './pages/PkvCalculatorPage';
import SettingsPage          from './pages/SettingsPage';
import ContractOptimizerPage from './pages/ContractOptimizerPage';
import RealEstatePage        from './pages/RealEstatePage';

// ─── Auth guard ───────────────────────────────────────────────────────────────
function AuthGuard() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <Box sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <CircularProgress color="primary" />
      </Box>
    );
  }

  if (!session) return <Navigate to="/login" replace />;
  return <Outlet />;
}

// ─── Routes ───────────────────────────────────────────────────────────────────
// To add a new route: add it to navItems.js AND here
function AppRoutes({ isDark, onToggleDark }) {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected: all routes inside AuthGuard → MainLayout */}
      <Route element={<AuthGuard />}>
        <Route element={<MainLayout isDark={isDark} onToggleDark={onToggleDark} />}>
          <Route path="/"                   element={<OverviewPage isDark={isDark} />} />
          <Route path="/versicherungen"     element={<InsurancesPage />} />
          <Route path="/versicherungen/pkv" element={<PkvCalculatorPage isDark={isDark} />} />
          <Route path="/budget"             element={<BudgetPage />} />
          <Route path="/budget/optimizer"  element={<ContractOptimizerPage />} />
          <Route path="/gehaltsrechner"    element={<SalaryPage />} />
          <Route path="/guthaben/rente"       element={<ETFRechnerPage isDark={isDark} />} />
          <Route path="/strom"              element={<StromPage />} />
          <Route path="/verbindlichkeiten"  element={<VerbindlichkeitenPage />} />
          <Route path="/immobilien"        element={<RealEstatePage />} />
          <Route path="/guthaben"           element={<GuthabenPage />} />
          <Route path="/settings"          element={<SettingsPage />} />
          {/* Catch-all → back to overview */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}

function ThemeShell() {
  const { darkMode, setDarkMode } = useModules();
  const [isDark, setIsDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  );

  // Sync from DB once loaded (overrides OS preference)
  useEffect(() => {
    if (darkMode != null) setIsDark(darkMode);
  }, [darkMode]);

  function handleToggle() {
    const next = !isDark;
    setIsDark(next);
    setDarkMode(next);
  }

  const theme = useMemo(() => (isDark ? darkTheme : lightTheme), [isDark]);

  return (
    <ContractAlertProvider>
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="de">
          <CssBaseline />
          <BrowserRouter>
            <AppRoutes isDark={isDark} onToggleDark={handleToggle} />
          </BrowserRouter>
        </LocalizationProvider>
      </ThemeProvider>
    </ContractAlertProvider>
  );
}

function Root() {
  return (
    <AuthProvider>
      <ModuleProvider>
        <ThemeShell />
      </ModuleProvider>
    </AuthProvider>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
