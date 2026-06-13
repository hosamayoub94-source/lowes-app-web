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
  VIEW_ALL_TASKS:      'view_all_tasks',       // see ALL tasks (not just own) — management/leads
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
  MANAGE_CENTRAL_STOCK: 'manage_central_stock', // receive/allocate from central warehouse
  MANAGE_SALES_STOCK:   'manage_sales_stock',   // adjust sales/distributor warehouse stock
  VIEW_INVENTORY:       'view_inventory',       // see the warehouse dashboard
  MANAGE_CAMPAIGNS:     'manage_campaigns',     // create/edit campaigns + ads + assignments
  VIEW_CAMPAIGN_COST:   'view_campaign_cost',   // see campaign spend/cost (hidden from staff)
  MANAGE_GUIDES:        'manage_guides',         // add/edit app usage guides (feeds /guide + Lozy)
};

// Human labels (for the admin UI)
export const PERMISSION_LABELS = {
  [PERMISSIONS.ASSIGN_TASKS]:        'إسناد المهام للموظفين',
  [PERMISSIONS.VIEW_ALL_TASKS]:      'عرض كل المهام (لا مهامه فقط)',
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
  [PERMISSIONS.MANAGE_CENTRAL_STOCK]: 'إدارة المخزن المركزي (استلام/تخصيص)',
  [PERMISSIONS.MANAGE_SALES_STOCK]:   'إدارة مخازن المبيعات',
  [PERMISSIONS.VIEW_INVENTORY]:       'عرض لوحة المخازن',
  [PERMISSIONS.MANAGE_CAMPAIGNS]:     'إنشاء/إدارة الحملات والإعلانات والإسناد',
  [PERMISSIONS.VIEW_CAMPAIGN_COST]:   'عرض تكلفة الحملات (مخفية عن الموظفين)',
  [PERMISSIONS.MANAGE_GUIDES]:        'إدارة أدلة استخدام التطبيق',
};

// One-line Arabic descriptions — shown in the admin permissions editor so
// the admin knows exactly WHAT each capability unlocks (and why).
export const PERMISSION_DESCRIPTIONS = {
  [PERMISSIONS.ASSIGN_TASKS]:        'إنشاء مهام وإسنادها لأعضاء الفريق.',
  [PERMISSIONS.VIEW_ALL_TASKS]:      'رؤية مهام كل الفريق ومتابعة تقدّمها — للإدارة والمسؤولين. الموظف بدونها يرى مهامه فقط.',
  [PERMISSIONS.EDIT_TASK]:           'تعديل عنوان/وصف/أولوية/تاريخ أي مهمة.',
  [PERMISSIONS.DELETE_TASK]:         'حذف المهام نهائياً — صلاحية حسّاسة.',
  [PERMISSIONS.MANAGE_ORDERS]:       'تغيير حالة الطلبات وتعديل بياناتها.',
  [PERMISSIONS.VIEW_ALL_ATTENDANCE]: 'رؤية حضور وانصراف كل الموظفين وتقاريرهم.',
  [PERMISSIONS.MANAGE_ATTENDANCE]:   'تعديل/تصحيح سجلات الحضور يدوياً.',
  [PERMISSIONS.APPROVE_LEAVES]:      'الموافقة على طلبات الإجازة أو رفضها.',
  [PERMISSIONS.MANAGE_PAYROLL]:      'إعداد الرواتب والبدلات وصرفها.',
  [PERMISSIONS.MANAGE_KPI]:          'إدخال مؤشرات الأداء والعمولات والتارجت.',
  [PERMISSIONS.MANAGE_PRODUCTS]:     'إضافة/تعديل منتجات الكتالوج وأسعارها.',
  [PERMISSIONS.VIEW_FINANCE]:        'الاطّلاع على الحسابات والسجل المالي والخزينة.',
  [PERMISSIONS.VIEW_ANALYTICS]:      'رؤية لوحات التحليلات والتقارير التنفيذية.',
  [PERMISSIONS.MANAGE_USERS]:        'إضافة/تعديل الموظفين وأرقامهم السرية وصلاحياتهم.',
  [PERMISSIONS.MANAGE_SETTINGS]:     'تغيير إعدادات النظام العامة.',
  [PERMISSIONS.MANAGE_CENTRAL_STOCK]:'استلام وتخصيص البضاعة من المخزن المركزي.',
  [PERMISSIONS.MANAGE_SALES_STOCK]:  'تعديل مخزون مخازن المبيعات والمناديب.',
  [PERMISSIONS.VIEW_INVENTORY]:      'عرض لوحة المخازن والأرصدة.',
  [PERMISSIONS.MANAGE_CAMPAIGNS]:    'إنشاء الحملات وإضافة الإعلانات وإسناد الموظفين للتسجيل.',
  [PERMISSIONS.VIEW_CAMPAIGN_COST]:  'رؤية تكلفة/إنفاق الحملة — تُخفى عن الموظفين العاديين.',
  [PERMISSIONS.MANAGE_GUIDES]:       'إضافة وتعديل أدلة استخدام التطبيق (تظهر في الدليل ولوزي تعرفها).',
};

// Logical groups — drive the sectioned UI in the permissions editor.
export const PERMISSION_GROUPS = [
  { key: 'tasks',      icon: '✅', label: 'المهام',
    permissions: [PERMISSIONS.ASSIGN_TASKS, PERMISSIONS.VIEW_ALL_TASKS, PERMISSIONS.EDIT_TASK, PERMISSIONS.DELETE_TASK] },
  { key: 'orders',     icon: '📦', label: 'الطلبات والمخزون',
    permissions: [PERMISSIONS.MANAGE_ORDERS, PERMISSIONS.MANAGE_PRODUCTS, PERMISSIONS.VIEW_INVENTORY, PERMISSIONS.MANAGE_CENTRAL_STOCK, PERMISSIONS.MANAGE_SALES_STOCK] },
  { key: 'attendance', icon: '🕐', label: 'الحضور والإجازات',
    permissions: [PERMISSIONS.VIEW_ALL_ATTENDANCE, PERMISSIONS.MANAGE_ATTENDANCE, PERMISSIONS.APPROVE_LEAVES] },
  { key: 'finance',    icon: '💰', label: 'المالية والأداء',
    permissions: [PERMISSIONS.VIEW_FINANCE, PERMISSIONS.MANAGE_PAYROLL, PERMISSIONS.MANAGE_KPI, PERMISSIONS.VIEW_ANALYTICS] },
  { key: 'campaigns',  icon: '📣', label: 'الحملات الإعلانية',
    permissions: [PERMISSIONS.MANAGE_CAMPAIGNS, PERMISSIONS.VIEW_CAMPAIGN_COST] },
  { key: 'system',     icon: '⚙️', label: 'النظام',
    permissions: [PERMISSIONS.MANAGE_USERS, PERMISSIONS.MANAGE_SETTINGS, PERMISSIONS.MANAGE_GUIDES] },
];

const ALL = Object.values(PERMISSIONS);

// ── Default permissions per role ──────────────────────────────
export const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: ALL,

  [ROLES.MANAGER]: [
    PERMISSIONS.ASSIGN_TASKS,
    PERMISSIONS.VIEW_ALL_TASKS,
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
    PERMISSIONS.MANAGE_CENTRAL_STOCK,
    PERMISSIONS.MANAGE_SALES_STOCK,
    PERMISSIONS.VIEW_INVENTORY,
    PERMISSIONS.MANAGE_CAMPAIGNS,
    PERMISSIONS.VIEW_CAMPAIGN_COST,
    PERMISSIONS.MANAGE_GUIDES,
  ],

  [ROLES.SALES_MANAGER]: [
    PERMISSIONS.ASSIGN_TASKS,
    PERMISSIONS.VIEW_ALL_TASKS,
    PERMISSIONS.EDIT_TASK,
    PERMISSIONS.DELETE_TASK,
    PERMISSIONS.MANAGE_ORDERS,
    PERMISSIONS.VIEW_ALL_ATTENDANCE,
    PERMISSIONS.MANAGE_KPI,
    PERMISSIONS.MANAGE_PRODUCTS,
    PERMISSIONS.VIEW_ANALYTICS,
    PERMISSIONS.VIEW_INVENTORY,
    PERMISSIONS.MANAGE_CAMPAIGNS,
  ],

  [ROLES.SOCIAL_MANAGER]: [
    PERMISSIONS.ASSIGN_TASKS,
    PERMISSIONS.VIEW_ALL_TASKS,
    PERMISSIONS.EDIT_TASK,
    PERMISSIONS.DELETE_TASK,
    PERMISSIONS.VIEW_ALL_ATTENDANCE,
    PERMISSIONS.VIEW_ANALYTICS,
    PERMISSIONS.MANAGE_CAMPAIGNS,
  ],

  [ROLES.MEDIA_BUYER]: [
    PERMISSIONS.ASSIGN_TASKS,
    PERMISSIONS.VIEW_ALL_TASKS,
    PERMISSIONS.EDIT_TASK,
    PERMISSIONS.DELETE_TASK,
    PERMISSIONS.MANAGE_ORDERS,
    PERMISSIONS.VIEW_ANALYTICS,
    PERMISSIONS.MANAGE_CAMPAIGNS,
    PERMISSIONS.VIEW_CAMPAIGN_COST,
  ],

  [ROLES.EMPLOYEE]: [
    // Regular employees have no management permissions by default.
  ],

  // ── Management positions ──
  [ROLES.ACCOUNTANT]: [
    PERMISSIONS.VIEW_FINANCE,
    PERMISSIONS.MANAGE_PAYROLL,
  ],
  [ROLES.HR_MANAGER]: [
    PERMISSIONS.VIEW_ALL_ATTENDANCE,
    PERMISSIONS.APPROVE_LEAVES,
    PERMISSIONS.MANAGE_PAYROLL,
  ],
  [ROLES.WAREHOUSE_MANAGER]: [
    PERMISSIONS.VIEW_INVENTORY,
    PERMISSIONS.MANAGE_CENTRAL_STOCK,
    PERMISSIONS.MANAGE_SALES_STOCK,
  ],
  [ROLES.MARKETING_MANAGER]: [
    PERMISSIONS.VIEW_ALL_TASKS,
    PERMISSIONS.MANAGE_CAMPAIGNS,
    PERMISSIONS.VIEW_CAMPAIGN_COST,
    PERMISSIONS.VIEW_ANALYTICS,
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

// ── Role templates (for the admin UI) ─────────────────────────
// Each role carries a human label + a one-line "responsibility" so the
// admin can pick a ready template and instantly understand the scope.
export const ROLE_TEMPLATES = {
  [ROLES.ADMIN]: {
    label: 'أدمن', icon: '👑',
    responsibility: 'تحكّم كامل بالنظام والمستخدمين والصلاحيات (حسام/أماني/ريم).',
  },
  [ROLES.MANAGER]: {
    label: 'مدير', icon: '🏅',
    responsibility: 'إدارة شاملة: مهام، طلبات، حضور، رواتب، مخازن، تحليلات.',
  },
  [ROLES.SALES_MANAGER]: {
    label: 'مدير مبيعات', icon: '📈',
    responsibility: 'قيادة فريق المبيعات: مهام، طلبات، KPI، منتجات، مخزون.',
  },
  [ROLES.SOCIAL_MANAGER]: {
    label: 'مدير سوشال', icon: '📱',
    responsibility: 'إدارة فريق السوشال والمهام ومتابعة الحضور والتحليلات.',
  },
  [ROLES.MEDIA_BUYER]: {
    label: 'ميديا باير', icon: '🎯',
    responsibility: 'إدارة الحملات والطلبات ومتابعة الأداء والتحليلات.',
  },
  [ROLES.EMPLOYEE]: {
    label: 'موظف', icon: '🌱',
    responsibility: 'الوصول الأساسي: حضوره، مهامه، طلباته — بلا صلاحيات إدارية.',
  },
  [ROLES.ACCOUNTANT]: {
    label: 'محاسب', icon: '🧾',
    responsibility: 'الحسابات والخزينة والرواتب — Finance / Accountant.',
  },
  [ROLES.HR_MANAGER]: {
    label: 'مدير موارد بشرية', icon: '🧑‍💼',
    responsibility: 'الحضور والإجازات والرواتب وشؤون الموظفين — HR Manager.',
  },
  [ROLES.WAREHOUSE_MANAGER]: {
    label: 'مدير المخزن', icon: '🏬',
    responsibility: 'المخازن واستلام/تخصيص البضاعة — Warehouse Manager.',
  },
  [ROLES.MARKETING_MANAGER]: {
    label: 'مدير التسويق', icon: '📣',
    responsibility: 'الحملات والتسويق والتحليلات — Marketing Manager.',
  },
};

/** Base (role-default) permissions for a role_type. */
export function basePermissionsFor(roleType) {
  if (roleType === ROLES.ADMIN) return new Set(ALL);
  return new Set(ROLE_PERMISSIONS[roleType] ?? []);
}

/**
 * Resolve effective permissions for a profile-shaped object
 * ({ role_type, extra_permissions, denied_permissions }) — used by the
 * admin preview ("ماذا يرى هذا المستخدم").
 */
export function resolveProfilePermissions(profile) {
  if (!profile) return new Set();
  if (profile.role_type === ROLES.ADMIN) return new Set(ALL);
  const base   = ROLE_PERMISSIONS[profile.role_type] ?? [];
  const extra  = Array.isArray(profile.extra_permissions)  ? profile.extra_permissions  : [];
  const denied = Array.isArray(profile.denied_permissions) ? profile.denied_permissions : [];
  const set = new Set([...base, ...extra]);
  denied.forEach(p => set.delete(p));
  return set;
}

/**
 * Classify a single permission for the 3-state editor:
 *   'base'    — comes from the role (on by default)
 *   'granted' — added on top via extra_permissions
 *   'denied'  — explicitly revoked from the role default
 *   'off'     — not granted (neither base nor extra)
 */
export function permissionState(roleType, permKey, extra = [], denied = []) {
  const isBase = (ROLE_PERMISSIONS[roleType] ?? []).includes(permKey) || roleType === ROLES.ADMIN;
  if (denied.includes(permKey)) return 'denied';
  if (isBase) return 'base';
  if (extra.includes(permKey)) return 'granted';
  return 'off';
}

export const ALL_PERMISSIONS = ALL;
