// =============================================================
// Centralized route paths — change once, propagate everywhere.
// =============================================================
export const ROUTES = {
  LOGIN: '/login',
  HOME: '/',
  ATTENDANCE: '/attendance',
  TASKS: '/tasks',
  TEAM: '/team',
  HOLIDAYS: '/holidays',
  CRM: '/crm',
  ACCOUNTING: '/accounting',
  ADMIN: '/admin',
  ADMIN_USERS: '/admin/users',
  ADMIN_SETTINGS: '/admin/settings',
  ADMIN_REPORTS: '/admin/reports',
  ADMIN_AUDIT: '/admin/audit',
  ADMIN_QA:          '/admin/qa',
  ADMIN_MAINTENANCE: '/admin/maintenance',
  ADMIN_OPERATIONS:  '/admin/operations',
  FILES: '/files',
  ANALYTICS: '/analytics',
  WORKSPACE: '/workspace',
  NOTIFICATIONS: '/notifications',
  PROFILE: '/profile',
  NOT_FOUND: '*',

  // Priority 1 modules
  PAYROLL:      '/payroll',
  REQUESTS:     '/requests',
  LEDGER:       '/ledger',
  SALES:        '/sales',
  CAMPAIGNS:    '/campaigns',
  TASKS_REPORT: '/tasks-report',

  // Priority 2 modules
  PERFORMANCE:       '/performance',
  INVENTORY:         '/inventory',
  ATTENDANCE_REPORT: '/attendance-report',
};

export default ROUTES;