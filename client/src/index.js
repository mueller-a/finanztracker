import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { ThemeProvider, CssBaseline, Box, CircularProgress } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import 'dayjs/locale/de';
import { lightTheme } from './theme';
import './index.css';

import { AuthProvider, useAuth } from './context/AuthContext';
import { ModuleProvider, useModules } from './context/ModuleContext';
import { AppModulesProvider } from './context/AppModulesContext';
import { ContractAlertProvider } from './context/ContractAlertContext';
import MainLayout            from './components/MainLayout';
import LoginPage             from './pages/LoginPage';
import OverviewPage          from './pages/OverviewPage';
import InsurancesPage        from './pages/InsurancesPage';
import StromPage             from './pages/StromPage';
import GuthabenPage          from './pages/GuthabenPage';
import VerbindlichkeitenPage from './pages/VerbindlichkeitenPage';
import DebtDetailPage from './pages/DebtDetailPage';
import BudgetPage            from './pages/BudgetPage';
import PlaceholderPage       from './pages/PlaceholderPage';
import ETFRechnerPage        from './pages/ETFRechnerPage';
import SalaryPage            from './pages/SalaryPage';
import PkvCalculatorPage     from './pages/PkvCalculatorPage';
import SettingsPage          from './pages/SettingsPage';
import ContractOptimizerPage from './pages/ContractOptimizerPage';
import HouseholdBudgetPage   from './pages/HouseholdBudgetPage';
import RealEstatePage        from './pages/RealEstatePage';
import AdminModulesPage      from './pages/AdminModulesPage';
import { useAppModules } from './context/AppModulesContext';

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

// Wrapper, der den Zugriff auf eine Route blockiert, wenn das zugehörige
// Modul global deaktiviert ist (`app_modules.is_active = false`). Während
// der initialen Ladephase wird das Kind gerendert, damit kein "Flash to /".
function ProtectedRoute({ moduleKey, children }) {
  const { isModuleEnabled, loading } = useAppModules();
  if (loading)                          return children;
  if (!moduleKey)                       return children;
  if (isModuleEnabled(moduleKey))       return children;
  return <Navigate to="/" replace />;
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
          <Route path="/"                   element={<ProtectedRoute moduleKey="dashboard"><OverviewPage isDark={isDark} /></ProtectedRoute>} />
          <Route path="/versicherungen"     element={<ProtectedRoute moduleKey="insurance"><InsurancesPage /></ProtectedRoute>} />
          <Route path="/versicherungen/pkv" element={<ProtectedRoute moduleKey="pkv"><PkvCalculatorPage isDark={isDark} /></ProtectedRoute>} />
          <Route path="/budget"             element={<ProtectedRoute moduleKey="budget"><BudgetPage /></ProtectedRoute>} />
          <Route path="/budget/household"   element={<ProtectedRoute moduleKey="household_budget"><HouseholdBudgetPage /></ProtectedRoute>} />
          <Route path="/budget/optimizer"   element={<ProtectedRoute moduleKey="optimizer"><ContractOptimizerPage /></ProtectedRoute>} />
          <Route path="/gehaltsrechner"     element={<ProtectedRoute moduleKey="salary"><SalaryPage /></ProtectedRoute>} />
          <Route path="/guthaben/rente"     element={<ProtectedRoute moduleKey="retirement"><ETFRechnerPage isDark={isDark} /></ProtectedRoute>} />
          <Route path="/strom"              element={<ProtectedRoute moduleKey="electricity"><StromPage /></ProtectedRoute>} />
          <Route path="/verbindlichkeiten"            element={<ProtectedRoute moduleKey="debts"><VerbindlichkeitenPage /></ProtectedRoute>} />
          <Route path="/verbindlichkeiten/:debtId"    element={<ProtectedRoute moduleKey="debts"><DebtDetailPage /></ProtectedRoute>} />
          <Route path="/immobilien"         element={<ProtectedRoute moduleKey="real_estate"><RealEstatePage /></ProtectedRoute>} />
          <Route path="/guthaben"           element={<ProtectedRoute moduleKey="savings"><GuthabenPage /></ProtectedRoute>} />
          <Route path="/settings"           element={<SettingsPage />} />
          <Route path="/admin/modules"      element={<AdminModulesPage />} />
          {/* Catch-all → back to overview */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}

function ThemeShell() {
  // Dark Mode ist während des Fiscal-Gallery-Redesigns deaktiviert —
  // alle Seiten werden auf die helle Palette (navy/emerald) optimiert.
  const isDark = false;
  const handleToggle = () => {};
  const theme = lightTheme;

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
        <AppModulesProvider>
          <ThemeShell />
        </AppModulesProvider>
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
