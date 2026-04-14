/**
 * Navigation configuration — single source of truth.
 * To add a new menu item: append an object here and add a <Route> in index.js.
 * To reorder: change the array order. The sidebar reflects it automatically.
 *
 * Items with a `children` array render as collapsible sub-menus in the sidebar.
 */

export const navItems = [
  {
    label: 'Overview',
    path:  '/',
    icon:  'overview',
    // Overview is always visible — no moduleKey
  },
  {
    label: 'Budget',
    path:  '/budget',
    icon:  'budget',
    moduleKey: 'show_budget',
    children: [
      { label: 'Budget',     path: '/budget',           icon: 'budget' },
      { label: 'Spar-Radar', path: '/budget/optimizer',  icon: 'radar' },
    ],
  },
  {
    label: 'Gehaltsrechner',
    path:  '/gehaltsrechner',
    icon:  'salary',
    moduleKey: 'show_salary',
  },
  {
    label: 'Versicherungen',
    path:  '/versicherungen',
    icon:  'shield',
    moduleKey: 'show_insurance',
    children: [
      { label: 'Übersicht',    path: '/versicherungen',     icon: 'shield' },
      { label: 'PKV-Rechner',  path: '/versicherungen/pkv', icon: 'calculator', moduleKey: 'show_pkv_calc' },
    ],
  },
  {
    label: 'Stromübersicht',
    path:  '/strom',
    icon:  'lightning',
    moduleKey: 'show_electricity',
  },
  {
    label: 'Verbindlichkeiten',
    path:  '/verbindlichkeiten',
    icon:  'credit',
    moduleKey: 'show_debts',
  },
  {
    label: 'Immobilien',
    path:  '/immobilien',
    icon:  'house',
    moduleKey: 'show_real_estate',
  },
  {
    label: 'Guthaben',
    path:  '/guthaben',
    icon:  'piggy',
    moduleKey: 'show_savings',
    children: [
      { label: 'Asset-Manager',     path: '/guthaben',      icon: 'piggy'  },
      { label: 'Ruhestandsplanung', path: '/guthaben/rente', icon: 'chart', moduleKey: 'show_retirement_plan' },
    ],
  },
];
