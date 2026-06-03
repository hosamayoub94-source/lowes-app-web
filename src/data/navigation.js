// =============================================================
// Navigation — role-based, grouped, decluttered.
//   • Each item lists the roles that SEE it (least-privilege).
//   • `group` powers the Sidebar section headers.
//   • Array order = priority (BottomNav shows the first 5 per role).
// Employees get a short, focused menu; managers/admins get the
// full toolset organized into collapsible sections.
// =============================================================
import { ROLES } from './teams';
import { PERMISSIONS as P } from './permissions';

const E   = ROLES.EMPLOYEE;
const M   = ROLES.MANAGER;
const A   = ROLES.ADMIN;
const SM  = ROLES.SALES_MANAGER;
const MB  = ROLES.MEDIA_BUYER;
const SOC = ROLES.SOCIAL_MANAGER;
const ALL = [E, M, A, SM, MB, SOC];

// Group keys → Arabic section headers (shown in the sidebar).
export const NAV_GROUPS = {
  core:      '',                     // no header — daily basics
  sales:     'المبيعات',
  inventory: 'المخزون',
  self:      'التطوير',
  hr:        'الفريق والموارد',
  reports:   'التحليلات والتقارير',
  social:    'السوشال',
  admin:     'الإدارة',
};
export const GROUP_ORDER = ['core', 'sales', 'inventory', 'self', 'hr', 'reports', 'social', 'admin'];

export const NAV_ITEMS = [
  // ── Daily basics (everyone) — first items feed the mobile bottom bar
  { id: 'workspace',    label: 'الرئيسية',   icon: '🏠', path: '/',            roles: ALL,                 group: 'core' },
  { id: 'attendance',   label: 'الحضور',     icon: '🕒', path: '/attendance',  roles: ALL,                 group: 'core' },
  { id: 'tasks',        label: 'المهام',     icon: '📋', path: '/tasks',       roles: ALL,                 group: 'core' },
  { id: 'orders',       label: 'الطلبات',    icon: '🛒', path: '/orders',      roles: [E, M, A, SM, MB],   group: 'sales' },
  { id: 'customers',    label: 'العملاء',    icon: '⭐', path: '/customers',   roles: ALL,                 group: 'sales' },
  { id: 'chat',         label: 'المحادثات',  icon: '💬', path: '/chat',        roles: ALL,                 group: 'core' },
  { id: 'training',     label: 'التدريب',    icon: '🧠', path: '/training',    roles: ALL,                 group: 'self' },
  { id: 'performance',  label: 'أدائي (KPI)', icon: '🎯', path: '/performance', roles: ALL,                group: 'self' },
  { id: 'field-crm',    label: 'الزيارات',   icon: '🚶', path: '/field-crm',   roles: [E, M, A, SM, SOC, MB], group: 'sales' },
  { id: 'announcements', label: 'الإعلانات', icon: '📢', path: '/announcements', roles: ALL,               group: 'core' },
  { id: 'requests',     label: 'طلباتي وإجازاتي', icon: '📝', path: '/requests', roles: ALL,              group: 'hr' },
  { id: 'schedule',     label: 'الورديات',   icon: '🗓️', path: '/schedule',    roles: ALL,                 group: 'hr' },
  { id: 'team',         label: 'الفريق',     icon: '👥', path: '/team',        roles: ALL,                 group: 'hr' },

  // ── Sales / management
  { id: 'sales',         label: 'تقارير المبيعات', icon: '📈', path: '/sales',        roles: [A, M, SM, MB], group: 'sales', perm: P.VIEW_ANALYTICS },
  { id: 'campaigns',     label: 'الحملات',          icon: '📣', path: '/campaigns',    roles: [A, M, SM, MB], group: 'sales' },
  { id: 'crm',           label: 'CRM',              icon: '🤝', path: '/crm',          roles: [M, A, SM],     group: 'sales' },
  { id: 'profitability', label: 'ربحية المنتج',     icon: '💎', path: '/profitability', roles: [M, A, SM],    group: 'sales', perm: P.VIEW_ANALYTICS },

  // ── Inventory (NOT regular employees — revealed by stock permissions)
  { id: 'inventory',  label: 'المنتجات', icon: '📦', path: '/inventory',  roles: [A, M, SM], group: 'inventory', perm: P.VIEW_INVENTORY },
  { id: 'warehouses', label: 'المخازن',  icon: '🏬', path: '/warehouses', roles: [A, M, SM], group: 'inventory', perm: P.VIEW_INVENTORY },

  // ── HR / managers
  { id: 'payroll',           label: 'الرواتب',       icon: '💵', path: '/payroll',           roles: [A, M], group: 'hr', perm: P.MANAGE_PAYROLL },
  { id: 'hr',                label: 'الموارد البشرية', icon: '🧑‍💼', path: '/hr',              roles: [A, M], group: 'hr', perm: P.APPROVE_LEAVES },
  { id: 'attendance-report', label: 'تقرير الحضور',  icon: '📅', path: '/attendance-report', roles: [A, M], group: 'hr', perm: P.VIEW_ALL_ATTENDANCE },
  { id: 'holidays',          label: 'العطل الرسمية', icon: '🏖️', path: '/holidays',          roles: [A, M], group: 'hr' },
  { id: 'reviews',           label: 'تقييم الأداء',  icon: '📊', path: '/reviews',           roles: [A, M], group: 'hr' },

  // ── Analytics & reports
  { id: 'manager-board',   label: 'لوحة المدير',     icon: '📈', path: '/manager-board',   roles: [M, A, SM], group: 'reports', perm: P.VIEW_ANALYTICS },
  { id: 'analytics',       label: 'التحليلات',       icon: '📊', path: '/analytics',       roles: [M, A, SM], group: 'reports', perm: P.VIEW_ANALYTICS },
  { id: 'tasks-report',    label: 'تقرير المهام',    icon: '📉', path: '/tasks-report',    roles: [A, M, SM], group: 'reports' },
  { id: 'mystery-shopper', label: 'Mystery Shopper', icon: '🕵️', path: '/mystery-shopper', roles: [A, M, SM], group: 'reports' },

  // ── Social
  { id: 'social-team',   label: 'فريق السوشال',    icon: '🌐', path: '/social-team',   roles: [A, M, SOC],     group: 'social' },
  { id: 'social-studio', label: 'استوديو السوشال', icon: '🌸', path: '/social-studio', roles: [A, M, SOC, MB], group: 'social' },

  // ── Admin / finance
  { id: 'accounting',     label: 'الحسابات',     icon: '💰', path: '/accounting', roles: [M, A, SM], group: 'admin', perm: P.VIEW_FINANCE },
  { id: 'ledger',         label: 'الحسابات+',    icon: '📒', path: '/ledger',     roles: [A, M],     group: 'admin', perm: P.VIEW_FINANCE },
  { id: 'files',          label: 'الملفات',      icon: '📁', path: '/files',      roles: [A, M],     group: 'admin' },
  { id: 'daily-workspace', label: 'مساحة العمل', icon: '🗂️', path: '/workspace',  roles: [A, M],     group: 'admin' },
  { id: 'admin',          label: 'الإدارة',      icon: '⚙️', path: '/admin',      roles: [A],        group: 'admin' },
];

// An item is visible if the role sees it by default, OR the user has been
// granted the item's permission (so admins can reveal tools per-user without
// changing roles). permSet is an optional Set of permission keys.
function _visible(item, role, permSet) {
  if (item.roles.includes(role)) return true;
  if (item.perm && permSet && permSet.has(item.perm)) return true;
  return false;
}

export function navItemsForRole(role, permSet = null) {
  if (!role) return [];
  return NAV_ITEMS.filter((item) => _visible(item, role, permSet));
}

// Grouped view for the sidebar: [{ key, label, items }] in GROUP_ORDER,
// skipping empty groups. Pass the user's permission set to reveal granted tools.
export function groupedNavForRole(role, permSet = null) {
  const items = navItemsForRole(role, permSet);
  return GROUP_ORDER
    .map((key) => ({ key, label: NAV_GROUPS[key], items: items.filter((i) => i.group === key) }))
    .filter((g) => g.items.length > 0);
}
