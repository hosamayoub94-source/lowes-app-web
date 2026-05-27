// =============================================================
// Navigation items used by the Sidebar (desktop) and BottomNav
// (mobile). Keys map to React Router routes in routes/AppRoutes.
// =============================================================
import { ROLES } from './teams';

export const NAV_ITEMS = [
  {
    id: 'workspace',
    label: 'الرئيسية',
    icon: '🏠',
    path: '/',
    roles: [ROLES.EMPLOYEE, ROLES.MANAGER, ROLES.ADMIN, ROLES.MEDIA_BUYER, ROLES.SALES_MANAGER, ROLES.SOCIAL_MANAGER],
  },
  {
    id: 'attendance',
    label: 'الحضور',
    icon: '🕒',
    path: '/attendance',
    roles: [ROLES.EMPLOYEE, ROLES.MANAGER, ROLES.ADMIN, ROLES.MEDIA_BUYER, ROLES.SALES_MANAGER, ROLES.SOCIAL_MANAGER],
  },
  {
    id: 'tasks',
    label: 'المهام',
    icon: '📋',
    path: '/tasks',
    roles: [ROLES.EMPLOYEE, ROLES.MANAGER, ROLES.ADMIN, ROLES.MEDIA_BUYER, ROLES.SALES_MANAGER, ROLES.SOCIAL_MANAGER],
  },
  {
    id: 'team',
    label: 'الفريق',
    icon: '👥',
    path: '/team',
    roles: [ROLES.EMPLOYEE, ROLES.MANAGER, ROLES.ADMIN, ROLES.MEDIA_BUYER, ROLES.SALES_MANAGER, ROLES.SOCIAL_MANAGER],
  },
  {
    id: 'holidays',
    label: 'الإجازات',
    icon: '🏖️',
    path: '/holidays',
    roles: [ROLES.EMPLOYEE, ROLES.MANAGER, ROLES.ADMIN, ROLES.MEDIA_BUYER, ROLES.SALES_MANAGER, ROLES.SOCIAL_MANAGER],
  },
  {
    id: 'announcements',
    label: 'الإعلانات',
    icon: '📢',
    path: '/announcements',
    roles: [ROLES.EMPLOYEE, ROLES.MANAGER, ROLES.ADMIN, ROLES.MEDIA_BUYER, ROLES.SALES_MANAGER, ROLES.SOCIAL_MANAGER],
  },
  {
    id: 'chat',
    label: 'المحادثات',
    icon: '💬',
    path: '/chat',
    roles: [ROLES.EMPLOYEE, ROLES.MANAGER, ROLES.ADMIN, ROLES.MEDIA_BUYER, ROLES.SALES_MANAGER, ROLES.SOCIAL_MANAGER],
  },
  {
    id: 'achievements',
    label: 'الإنجازات',
    icon: '🏆',
    path: '/achievements',
    roles: [ROLES.EMPLOYEE, ROLES.MANAGER, ROLES.ADMIN, ROLES.MEDIA_BUYER, ROLES.SALES_MANAGER, ROLES.SOCIAL_MANAGER],
  },
  {
    id: 'files',
    label: 'الملفات',
    icon: '📁',
    path: '/files',
    roles: [ROLES.EMPLOYEE, ROLES.MANAGER, ROLES.ADMIN, ROLES.MEDIA_BUYER, ROLES.SALES_MANAGER, ROLES.SOCIAL_MANAGER],
  },
  {
    id: 'daily-workspace',
    label: 'مساحة العمل',
    icon: '🗂️',
    path: '/workspace',
    roles: [ROLES.EMPLOYEE, ROLES.MANAGER, ROLES.ADMIN, ROLES.MEDIA_BUYER, ROLES.SALES_MANAGER, ROLES.SOCIAL_MANAGER],
  },
  {
    id: 'crm',
    label: 'CRM',
    icon: '🤝',
    path: '/crm',
    roles: [ROLES.MANAGER, ROLES.ADMIN, ROLES.SALES_MANAGER],
  },
  {
    id: 'analytics',
    label: 'التحليلات',
    icon: '📊',
    path: '/analytics',
    roles: [ROLES.MANAGER, ROLES.ADMIN, ROLES.SALES_MANAGER],
  },
  {
    id: 'accounting',
    label: 'الحسابات',
    icon: '💰',
    path: '/accounting',
    roles: [ROLES.MANAGER, ROLES.ADMIN, ROLES.SALES_MANAGER],
  },
  {
    id: 'admin',
    label: 'الإدارة',
    icon: '⚙️',
    path: '/admin',
    roles: [ROLES.ADMIN],
  },

  // Priority 1 modules
  {
    id: 'payroll',
    label: 'الرواتب',
    icon: '💵',
    path: '/payroll',
    roles: [ROLES.ADMIN, ROLES.MANAGER],
  },
  {
    id: 'requests',
    label: 'الطلبات',
    icon: '📝',
    path: '/requests',
    roles: [ROLES.EMPLOYEE, ROLES.MANAGER, ROLES.ADMIN, ROLES.MEDIA_BUYER, ROLES.SALES_MANAGER, ROLES.SOCIAL_MANAGER],
  },
  {
    id: 'ledger',
    label: 'الحسابات+',
    icon: '📒',
    path: '/ledger',
    roles: [ROLES.ADMIN, ROLES.MANAGER],
  },
  {
    id: 'sales',
    label: 'المبيعات',
    icon: '📈',
    path: '/sales',
    roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_MANAGER, ROLES.MEDIA_BUYER],
  },
  {
    id: 'campaigns',
    label: 'الحملات',
    icon: '📣',
    path: '/campaigns',
    roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_MANAGER, ROLES.MEDIA_BUYER],
  },
  {
    id: 'tasks-report',
    label: 'تقرير المهام',
    icon: '📉',
    path: '/tasks-report',
    roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_MANAGER],
  },
  {
    id: 'performance',
    label: 'أداء الفريق',
    icon: '🏆',
    path: '/performance',
    roles: [ROLES.ADMIN, ROLES.MANAGER],
  },
  {
    id: 'inventory',
    label: 'المخزون',
    icon: '📦',
    path: '/inventory',
    roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_MANAGER],
  },
  {
    id: 'attendance-report',
    label: 'تقرير الحضور',
    icon: '📅',
    path: '/attendance-report',
    roles: [ROLES.ADMIN, ROLES.MANAGER],
  },
  {
    id: 'leave',
    label: 'طلبات الإجازة',
    icon: '🏖️',
    path: '/leave',
    roles: [ROLES.EMPLOYEE, ROLES.MANAGER, ROLES.ADMIN, ROLES.MEDIA_BUYER, ROLES.SALES_MANAGER, ROLES.SOCIAL_MANAGER],
  },
  {
    id: 'hr',
    label: 'الموارد البشرية',
    icon: '👥',
    path: '/hr',
    roles: [ROLES.ADMIN, ROLES.MANAGER],
  },
];

export function navItemsForRole(role) {
  if (!role) return [];
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
