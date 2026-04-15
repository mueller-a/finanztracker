/**
 * Navigation configuration — single source of truth.
 * To add a new menu item: append an object here and add a <Route> in index.js.
 * To reorder: change the array order. The sidebar reflects it automatically.
 *
 * Items with a `children` array render as collapsible sub-menus in the sidebar.
 *
 * Visibility-Felder:
 *   moduleKey     → user_module_settings.show_* (persönliche Sidebar-Präferenz)
 *   appModuleKey  → app_modules.module_key (globaler Admin-Toggle, blockiert auch Routing)
 *   adminOnly     → nur Nutzer mit role='admin' sehen den Eintrag
 */

export const navItems = [
  {
    label: 'Overview',
    path:  '/',
    icon:  'overview',
    appModuleKey: 'dashboard',
    // Overview ist immer sichtbar (kein User-moduleKey)
  },
  {
    label: 'Budget',
    path:  '/budget',
    icon:  'budget',
    moduleKey:    'show_budget',
    appModuleKey: 'budget',
    children: [
      { label: 'Budget',     path: '/budget',           icon: 'budget', appModuleKey: 'budget' },
      { label: 'Spar-Radar', path: '/budget/optimizer',  icon: 'radar',  appModuleKey: 'optimizer' },
    ],
  },
  {
    label: 'Gehaltsrechner',
    path:  '/gehaltsrechner',
    icon:  'salary',
    moduleKey:    'show_salary',
    appModuleKey: 'salary',
  },
  {
    label: 'Versicherungen',
    path:  '/versicherungen',
    icon:  'shield',
    moduleKey:    'show_insurance',
    appModuleKey: 'insurance',
    children: [
      { label: 'Übersicht',    path: '/versicherungen',     icon: 'shield', appModuleKey: 'insurance' },
      { label: 'PKV-Rechner',  path: '/versicherungen/pkv', icon: 'calculator', moduleKey: 'show_pkv_calc', appModuleKey: 'pkv' },
    ],
  },
  {
    label: 'Stromübersicht',
    path:  '/strom',
    icon:  'lightning',
    moduleKey:    'show_electricity',
    appModuleKey: 'electricity',
  },
  {
    label: 'Verbindlichkeiten',
    path:  '/verbindlichkeiten',
    icon:  'credit',
    moduleKey:    'show_debts',
    appModuleKey: 'debts',
  },
  {
    label: 'Immobilien',
    path:  '/immobilien',
    icon:  'house',
    moduleKey:    'show_real_estate',
    appModuleKey: 'real_estate',
  },
  {
    label: 'Guthaben',
    path:  '/guthaben',
    icon:  'piggy',
    moduleKey:    'show_savings',
    appModuleKey: 'savings',
    children: [
      { label: 'Asset-Manager',     path: '/guthaben',      icon: 'piggy', appModuleKey: 'savings' },
      { label: 'Ruhestandsplanung', path: '/guthaben/rente', icon: 'chart', moduleKey: 'show_retirement_plan', appModuleKey: 'retirement' },
    ],
  },
];
