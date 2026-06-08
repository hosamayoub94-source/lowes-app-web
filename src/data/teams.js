// =============================================================
// Static team / role config. Derived from index_v4.html constants.
// Keep this server-driven later — the shape stays the same.
// =============================================================

export const TEAM_KEYS = {
  SOCIAL: 'social',
  SALES: 'sales',
  OPS: 'ops',
};

export const TEAMS = {
  [TEAM_KEYS.SOCIAL]: {
    key: TEAM_KEYS.SOCIAL,
    name: 'تيم السوشال ميديا',
    members: [], // populated from Supabase profiles at runtime
  },
  [TEAM_KEYS.SALES]: {
    key: TEAM_KEYS.SALES,
    name: 'تيم المبيعات',
    members: [],
  },
  [TEAM_KEYS.OPS]: {
    key: TEAM_KEYS.OPS,
    name: 'تيم العمليات',
    members: [],
  },
};

// Roles known to the system (mirrors profiles.role_type).
export const ROLES = {
  EMPLOYEE: 'employee',
  MANAGER: 'manager',
  ADMIN: 'admin',
  MEDIA_BUYER: 'media_buyer',
  SALES_MANAGER: 'sales_manager',
  SOCIAL_MANAGER: 'social_manager',
  // ── Distribution network roles (منظومة المندوبين والمسوّقين) ──
  FIELD_REP: 'field_rep',                  // مندوب ميداني (صيدليات/مناطق)
  MARKETER: 'marketer',                    // مسوّقة (شبكة MLM)
  SUPERVISOR: 'supervisor',                // مشرفة مجموعة
  SUPERVISOR_MANAGER: 'supervisor_manager',// مديرة المشرفات
  AREA_AGENT: 'area_agent',                // وكيل منطقة
  // ── Management positions (الهيكل الإداري) ──
  ACCOUNTANT: 'accountant',                // محاسب
  HR_MANAGER: 'hr_manager',                // مدير موارد بشرية
  WAREHOUSE_MANAGER: 'warehouse_manager',  // مدير المخزن
  MARKETING_MANAGER: 'marketing_manager',  // مدير التسويق
};

export const ROLE_LABELS = {
  [ROLES.EMPLOYEE]: 'موظف',
  [ROLES.MANAGER]: 'مدير',
  [ROLES.ADMIN]: 'أدمن',
  [ROLES.MEDIA_BUYER]: 'ميديا باير',
  [ROLES.SALES_MANAGER]: 'مدير مبيعات',
  [ROLES.SOCIAL_MANAGER]: 'مدير سوشال',
  [ROLES.FIELD_REP]: 'مندوب ميداني',
  [ROLES.MARKETER]: 'مسوّقة',
  [ROLES.SUPERVISOR]: 'مشرفة مجموعة',
  [ROLES.SUPERVISOR_MANAGER]: 'مديرة المشرفات',
  [ROLES.AREA_AGENT]: 'وكيل منطقة',
  [ROLES.ACCOUNTANT]: 'محاسب',
  [ROLES.HR_MANAGER]: 'مدير موارد بشرية',
  [ROLES.WAREHOUSE_MANAGER]: 'مدير المخزن',
  [ROLES.MARKETING_MANAGER]: 'مدير التسويق',
};

// ── Login groups — لوحة الدخول مجمّعة بـ4 فئات (≤6) بمسميات إنجليزية ──
// كل فئة تضم عدة أدوار؛ النقر يعرض أسماء تلك الأدوار ثم PIN.
export const LOGIN_GROUPS = [
  // كل أفراد الشركة (الإدارة + الموظفون) يدخلون من Team.
  { key: 'team', label: 'Team', icon: '👥',
    roles: [ROLES.EMPLOYEE, ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_MANAGER, ROLES.MEDIA_BUYER, ROLES.SOCIAL_MANAGER,
            ROLES.ACCOUNTANT, ROLES.HR_MANAGER, ROLES.WAREHOUSE_MANAGER, ROLES.MARKETING_MANAGER] },
  { key: 'stars', label: 'Stars Network', icon: '⭐',
    roles: [ROLES.MARKETER, ROLES.SUPERVISOR, ROLES.SUPERVISOR_MANAGER] },
  { key: 'field', label: 'Field Sales', icon: '🚚',
    roles: [ROLES.FIELD_REP, ROLES.AREA_AGENT] },
];

// Attendance status types (from index_v4.html).
export const ATTENDANCE_TYPES = {
  IN: 'in',
  OUT: 'out',
  VACATION: 'vacation',
  ABSENT: 'absent',
};

export const ATTENDANCE_LABELS = {
  [ATTENDANCE_TYPES.IN]: 'حضور',
  [ATTENDANCE_TYPES.OUT]: 'انصراف',
  [ATTENDANCE_TYPES.VACATION]: 'إجازة',
  [ATTENDANCE_TYPES.ABSENT]: 'غياب',
};
