// =============================================================
// Permission system — fine-grained capabilities on top of roles.
//
// Each role gets a DEFAULT set of permissions. Individual users can
// be GRANTED extra ones (profiles.extra_permissions) or have some
// REVOKED (profiles.denied_permissions) — so a newly-joined manager
// can be given exactly the powers they need without a code change.
//
// Resolve order:  role defaults  +  extra_permissions  −  denied_permissions
// admin always has everything.
// =============================================================
import { ROLES } from './teams';

// ── Permission keys ───────────────────────────────────────────
export const PERMISSIONS = {
  ASSIGN_TASKS:        'assign_tasks',         // create / assign tasks to others
  EDIT_TASK:           'edit_task',            // edit task title/description/priority/date
  DELETE_TASK:         'delete_task',          // delete tasks permanently
  MANAGE_ORDERS:       'manage_orders',        // advance status, edit orders
  VIEW_ALL_ATTENDANCE: 'view_all_attendance',  // see everyone's attendance + reports
  MANAGE_ATTENDANCE:   'manage_attendance',    // edit attendance records
  APPROVE_LEAVES:      'approve_leaves',        // HR leave approval
  MANAGE_PAYROLL:      'manage_payroll',        // salaries
  MANAGE_KPI:          'manage_kpi',            // enter KPI / commissions
  MANAGE_PRODUCTS:     'manage_products',       // product catalog
  VIEW_FINANCE:        'view_finance',          // accounting / ledger
  VIEW_ANALYTICS:      'view_analytics',        // executive dashboards
  MANAGE_USERS:        'manage_users',          // add/edit employees + PINs
  MANAGE_SETTINGS:     'manage_settings',       // system settings
};

// Human labels (for the admin UI)
export const PERMISSION_LABELS = {
  [PERMISSIONS.ASSIGN_TASKS]:        'إسناد المهام للموظفين',
  [PERMISSIONS.EDIT_TASK]:           'تعديل تفاصيل المهام',
  [PERMISSIONS.DELETE_TASK]:         'حذف المهام',
  [PERMISSIONS.MANAGE_ORDERS]:       'إدارة الطلبات (تغيير الحالة/التعديل)',
  [PERMISSIONS.VIEW_ALL_ATTENDANCE]: 'عرض حضور كل الفريق',
  [PERMISSIONS.MANAGE_ATTENDANCE]:   'تعديل سجلات الحضور',
  [PERMISSIONS.APPROVE_LEAVES]:      'الموافقة على الإجازات',
  [PERMISSIONS.MANAGE_PAYROLL]:      'إدارة الرواتب',
  [PERMISSIONS.MANAGE_KPI]:          'إدخال KPI والعمولات',
  [PERMISSIONS.MANAGE_PRODUCTS]:     'إدارة كتالوج المنتجات',
  [PERMISSIONS.VIEW_FINANCE]:        'عرض الحسابات والسجل المالي',
  [PERMISSIONS.VIEW_ANALYTICS]:      'عرض التحليلات التنفيذية',
  [PERMISSIONS.MANAGE_USERS]:        'إدارة المستخدمين والأرقام السرية',
  [PERMISSIONS.MANAGE_SETTINGS]:     'إعدادات النظام',
};

const ALL = Object.values(PERMISSIONS);

// ── Default permissions per role ──────────────────────────────
export const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: ALL,

  [ROLES.MANAGER]: [
    PERMISSIONS.ASSIGN_TASKS,
    PERMISSIONS.EDIT_TASK,
    PERMISSIONS.DELETE_TASK,
    PERMISSIONS.MANAGE_ORDERS,
    PERMISSIONS.VIEW_ALL_ATTENDANCE,
    PERMISSIONS.MANAGE_ATTENDANCE,
    PERMISSIONS.APPROVE_LEAVES,
    PERMISSIONS.MANAGE_PAYROLL,
    PERMISSIONS.MANAGE_KPI,
    PERMISSIONS.MANAGE_PRODUCTS,
    PERMISSIONS.VIEW_FINANCE,
    PERMISSIONS.VIEW_ANALYTICS,
  ],

  [ROLES.SALES_MANAGER]: [
    PERMISSIONS.ASSIGN_TASKS,
    PERMISSIONS.EDIT_TASK,
    PERMISSIONS.DELETE_TASK,
    PERMISSIONS.MANAGE_ORDERS,
    PERMISSIONS.VIEW_ALL_ATTENDANCE,
    PERMISSIONS.MANAGE_KPI,
    PERMISSIONS.MANAGE_PRODUCTS,
    PERMISSIONS.VIEW_ANALYTICS,
  ],

  [ROLES.SOCIAL_MANAGER]: [
    PERMISSIONS.ASSIGN_TASKS,
    PERMISSIONS.EDIT_TASK,
    PERMISSIONS.DELETE_TASK,
    PERMISSIONS.VIEW_ALL_ATTENDANCE,
    PERMISSIONS.VIEW_ANALYTICS,
  ],

  [ROLES.MEDIA_BUYER]: [
    PERMISSIONS.ASSIGN_TASKS,
    PERMISSIONS.EDIT_TASK,
    PERMISSIONS.DELETE_TASK,
    PERMISSIONS.MANAGE_ORDERS,
    PERMISSIONS.VIEW_ANALYTICS,
  ],

  [ROLES.EMPLOYEE]: [
    // Regular employees have no management permissions by default.
  ],
};

// ── Resolve effective permissions for a user/session ──────────
export function resolvePermissions(session) {
  if (!session) return new Set();
  const role = session.role;
  if (role === ROLES.ADMIN) return new Set(ALL);

  const base   = ROLE_PERMISSIONS[role] ?? [];
  const extra  = Array.isArray(session.extra_permissions)  ? session.extra_permissions  : [];
  const denied = Array.isArray(session.denied_permissions) ? session.denied_permissions : [];

  const set = new Set([...base, ...extra]);
  denied.forEach(p => set.delete(p));
  return set;
}

/** Quick check against a session object. */
export function sessionCan(session, permission) {
  if (session?.role === ROLES.ADMIN) return true;
  return resolvePermissions(session).has(permission);
}
