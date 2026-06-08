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
};

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
