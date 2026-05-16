// =============================================================
// Audit Module — rich mock data.
// 50 realistic log entries spanning the last 7 days.
// Includes suspicious clusters and critical events.
// =============================================================

import { ACTION_TYPE, ENTITY_TYPE, SEVERITY } from '../types/audit.types';

// ── Helpers ───────────────────────────────────────────────────
let _seq = 0;
function id() { return `al_${String(++_seq).padStart(3, '0')}`; }
function dt(daysAgo, h = 10, m = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

// ── Users ─────────────────────────────────────────────────────
const USERS = [
  { id: 'u1', name: 'أحمد محمد',    role: 'مدير مبيعات' },
  { id: 'u2', name: 'سارة أحمد',    role: 'موظف سوشال'  },
  { id: 'u3', name: 'محمد علي',     role: 'ميديا باير'  },
  { id: 'u4', name: 'فاطمة حسن',   role: 'موظف مبيعات' },
  { id: 'u5', name: 'عمر خالد',    role: 'موظف عمليات' },
  { id: 'u6', name: 'نور الدين',   role: 'أدمن'         },
];

const [u1, u2, u3, u4, u5, u6] = USERS;

function entry(overrides) {
  return {
    id: id(),
    user_id: null,
    user_name: null,
    action_type: null,
    action_label: null,
    entity_type: null,
    entity_id: null,
    entity_label: null,
    severity: SEVERITY.INFO,
    metadata: {},
    ip_address: null,
    device_info: 'Chrome 124 / Windows',
    session_id: `sess_${Math.random().toString(36).slice(2, 8)}`,
    created_at: dt(0),
    ...overrides,
  };
}

function authEntry(user, action, label, severity = SEVERITY.INFO, meta = {}, daysAgo = 0, h = 9) {
  return entry({
    user_id: user.id, user_name: user.name,
    action_type: action, action_label: label,
    entity_type: ENTITY_TYPE.AUTH, entity_id: user.id, entity_label: user.name,
    severity, metadata: { role: user.role, ...meta },
    created_at: dt(daysAgo, h),
  });
}

function taskEntry(user, action, label, taskId, taskTitle, severity = SEVERITY.INFO, meta = {}, daysAgo = 0, h = 10) {
  return entry({
    user_id: user.id, user_name: user.name,
    action_type: action, action_label: label,
    entity_type: ENTITY_TYPE.TASK, entity_id: taskId, entity_label: taskTitle,
    severity, metadata: meta,
    created_at: dt(daysAgo, h),
  });
}

function adminEntry(user, action, label, severity = SEVERITY.CRITICAL, meta = {}, daysAgo = 1, h = 11) {
  return entry({
    user_id: user.id, user_name: user.name,
    action_type: action, action_label: label,
    entity_type: ENTITY_TYPE.ADMIN, entity_id: user.id, entity_label: user.name,
    severity, metadata: meta,
    created_at: dt(daysAgo, h),
  });
}

// ── Logs array ────────────────────────────────────────────────
export const MOCK_AUDIT_LOGS = [

  // ── Today: Normal morning activity ──────────────────────────
  authEntry(u6, ACTION_TYPE.LOGIN,        'تسجيل دخول ناجح',         SEVERITY.INFO,    {}, 0, 8),
  authEntry(u1, ACTION_TYPE.LOGIN,        'تسجيل دخول ناجح',         SEVERITY.INFO,    {}, 0, 8),
  authEntry(u2, ACTION_TYPE.LOGIN,        'تسجيل دخول ناجح',         SEVERITY.INFO,    {}, 0, 9),
  authEntry(u3, ACTION_TYPE.LOGIN,        'تسجيل دخول ناجح',         SEVERITY.INFO,    {}, 0, 9),
  authEntry(u4, ACTION_TYPE.LOGIN,        'تسجيل دخول ناجح',         SEVERITY.INFO,    {}, 0, 9),
  authEntry(u5, ACTION_TYPE.LOGIN,        'تسجيل دخول ناجح',         SEVERITY.INFO,    {}, 0, 9),

  taskEntry(u1, ACTION_TYPE.TASK_CREATED,        'إنشاء مهمة جديدة',          'task_012', 'الرد على شكاوى العملاء',  SEVERITY.INFO,    { priority: 'urgent' },                   0, 8),
  taskEntry(u2, ACTION_TYPE.TASK_STATUS_CHANGED, 'تغيير حالة مهمة إلى متأخرة','task_002', 'تحديث استراتيجية السوشال', SEVERITY.INFO,   { from: 'in_progress', to: 'overdue' },   0, 9),
  taskEntry(u3, ACTION_TYPE.TASK_PROGRESS,       'تحديث نسبة إنجاز مهمة',     'task_007', 'حملة إعلانية فيسبوك',    SEVERITY.INFO,    { from: 75, to: 80 },                     0, 10),
  taskEntry(u1, ACTION_TYPE.TASK_COMMENTED,      'إضافة تعليق على مهمة',      'task_001', 'تقرير المبيعات الشهري',  SEVERITY.INFO,    { comment_preview: 'سأنتهي قريباً' },    0, 10),
  taskEntry(u5, ACTION_TYPE.TASK_UPDATED,        'تحديث بيانات مهمة',         'task_011', 'تحديث بيانات الموظفين',  SEVERITY.INFO,    { fields: ['progress', 'description'] },  0, 11),

  entry({
    user_id: u1.id, user_name: u1.name,
    action_type: ACTION_TYPE.CHECKED_IN, action_label: 'تسجيل حضور',
    entity_type: ENTITY_TYPE.ATTENDANCE, entity_id: u1.id, entity_label: u1.name,
    severity: SEVERITY.INFO, metadata: { time: '09:02', location: 'المكتب' },
    created_at: dt(0, 9, 2),
  }),

  // ── SUSPICIOUS: 4 failed logins for same user ────────────────
  authEntry(u4, ACTION_TYPE.LOGIN_FAILED, 'محاولة دخول فاشلة — PIN خاطئ', SEVERITY.WARNING,  { attempt: 1, failed_at: dt(0, 7) }, 0, 7),
  authEntry(u4, ACTION_TYPE.LOGIN_FAILED, 'محاولة دخول فاشلة — PIN خاطئ', SEVERITY.WARNING,  { attempt: 2, failed_at: dt(0, 7) }, 0, 7),
  authEntry(u4, ACTION_TYPE.LOGIN_FAILED, 'محاولة دخول فاشلة — PIN خاطئ', SEVERITY.WARNING,  { attempt: 3, failed_at: dt(0, 7) }, 0, 7),
  authEntry(u4, ACTION_TYPE.LOGIN_FAILED, 'تجاوز حد محاولات الدخول — تنبيه أمني', SEVERITY.CRITICAL, { attempt: 4, threshold: 3, blocked: true }, 0, 7),
  authEntry(u4, ACTION_TYPE.LOGIN,        'تسجيل دخول ناجح بعد التحقق', SEVERITY.INFO, { verified: true }, 0, 9),

  // ── CRITICAL: Role change ─────────────────────────────────────
  adminEntry(u6, ACTION_TYPE.ROLE_CHANGED, 'تغيير صلاحية مستخدم من "موظف" إلى "مدير"',
    SEVERITY.CRITICAL,
    { target_user: u5.name, from_role: 'employee', to_role: 'manager', reason: 'ترقية' },
    0, 11,
  ),

  // ── Yesterday ──────────────────────────────────────────────
  authEntry(u6, ACTION_TYPE.LOGIN,   'تسجيل دخول ناجح', SEVERITY.INFO, {}, 1, 8),
  authEntry(u1, ACTION_TYPE.LOGIN,   'تسجيل دخول ناجح', SEVERITY.INFO, {}, 1, 8),
  authEntry(u2, ACTION_TYPE.LOGIN,   'تسجيل دخول ناجح', SEVERITY.INFO, {}, 1, 9),

  taskEntry(u6, ACTION_TYPE.TASK_CREATED, 'إنشاء مهمة جديدة', 'task_005', 'عرض تقديمي للمستثمرين', SEVERITY.INFO, { priority: 'urgent' }, 1, 9),
  taskEntry(u1, ACTION_TYPE.TASK_ASSIGNED, 'تعيين مهمة لموظف', 'task_004', 'مراجعة قاعدة بيانات العملاء', SEVERITY.INFO, { assigned_to: u4.name }, 1, 9),

  entry({
    user_id: u6.id, user_name: u6.name,
    action_type: ACTION_TYPE.SETTINGS_CHANGED,
    action_label: 'تغيير إعدادات النظام — تفعيل الإشعارات',
    entity_type: ENTITY_TYPE.ADMIN, entity_id: 'settings_notifications', entity_label: 'الإشعارات',
    severity: SEVERITY.WARNING,
    metadata: { setting: 'notifications_enabled', from: false, to: true },
    created_at: dt(1, 14),
  }),

  entry({
    user_id: u6.id, user_name: u6.name,
    action_type: ACTION_TYPE.DATA_EXPORTED,
    action_label: 'تصدير بيانات — تقرير الحضور الشهري',
    entity_type: ENTITY_TYPE.ATTENDANCE, entity_id: 'report_attendance_apr', entity_label: 'تقرير أبريل',
    severity: SEVERITY.CRITICAL,
    metadata: { format: 'xlsx', rows: 432, period: 'April 2026' },
    created_at: dt(1, 15),
  }),

  taskEntry(u3, ACTION_TYPE.TASK_STATUS_CHANGED, 'إكمال مهمة إعلانية', 'task_010', 'إصلاح نظام الدفع', SEVERITY.INFO, { from: 'in_progress', to: 'completed' }, 1, 16),

  authEntry(u1, ACTION_TYPE.LOGOUT, 'تسجيل خروج', SEVERITY.INFO, {}, 1, 18),
  authEntry(u2, ACTION_TYPE.LOGOUT, 'تسجيل خروج', SEVERITY.INFO, {}, 1, 18),

  // ── 2 days ago ────────────────────────────────────────────
  authEntry(u3, ACTION_TYPE.LOGIN,  'تسجيل دخول ناجح', SEVERITY.INFO, {}, 2, 8),
  authEntry(u4, ACTION_TYPE.LOGIN,  'تسجيل دخول ناجح', SEVERITY.INFO, {}, 2, 9),

  entry({
    user_id: u6.id, user_name: u6.name,
    action_type: ACTION_TYPE.USER_CREATED,
    action_label: 'إنشاء حساب مستخدم جديد',
    entity_type: ENTITY_TYPE.PROFILE, entity_id: 'u_new_01', entity_label: 'كريم إبراهيم',
    severity: SEVERITY.WARNING,
    metadata: { new_user: 'كريم إبراهيم', role: 'employee', team: 'ops' },
    created_at: dt(2, 10),
  }),

  taskEntry(u4, ACTION_TYPE.TASK_CREATED, 'إنشاء مهمة جديدة', 'task_009', 'محتوى مدونة مايو', SEVERITY.INFO, { priority: 'medium' }, 2, 11),

  entry({
    user_id: u1.id, user_name: u1.name,
    action_type: ACTION_TYPE.PAYROLL_EDITED,
    action_label: 'تعديل كشف الرواتب — تعديل بدل النقل',
    entity_type: ENTITY_TYPE.ACCOUNTING, entity_id: 'payroll_may_2026', entity_label: 'رواتب مايو 2026',
    severity: SEVERITY.WARNING,
    metadata: { employee: u4.name, field: 'transport_allowance', from: 200, to: 250, currency: 'USD' },
    created_at: dt(2, 14),
  }),

  taskEntry(u3, ACTION_TYPE.TASK_UPDATED, 'تحديث مهمة', 'task_007', 'حملة إعلانية فيسبوك', SEVERITY.INFO, { fields: ['description'] }, 2, 15),

  // ── 3 days ago ────────────────────────────────────────────
  authEntry(u2, ACTION_TYPE.LOGIN,  'تسجيل دخول ناجح', SEVERITY.INFO, {}, 3, 9),
  authEntry(u5, ACTION_TYPE.LOGIN,  'تسجيل دخول ناجح', SEVERITY.INFO, {}, 3, 9),

  taskEntry(u6, ACTION_TYPE.TASK_ASSIGNED, 'إعادة تعيين مهمة', 'task_006', 'تدريب موظفين جدد', SEVERITY.INFO, { assigned_to: u3.name, from: u5.name }, 3, 10),

  entry({
    user_id: u2.id, user_name: u2.name,
    action_type: ACTION_TYPE.BULK_OPERATION,
    action_label: 'عملية مجمّعة — تحديث 8 منشورات سوشال ميديا',
    entity_type: ENTITY_TYPE.TASK, entity_id: null, entity_label: 'منشورات سوشال',
    severity: SEVERITY.WARNING,
    metadata: { count: 8, operation: 'schedule_posts', platform: 'Instagram' },
    created_at: dt(3, 13),
  }),

  taskEntry(u6, ACTION_TYPE.TASK_DELETED, 'حذف مهمة ملغاة', 'task_008', 'خطة تسويقية — منتج ملغى', SEVERITY.WARNING, { reason: 'cancelled_product', backup: true }, 3, 15),

  // ── 5 days ago ────────────────────────────────────────────
  authEntry(u6, ACTION_TYPE.LOGIN,  'تسجيل دخول ناجح', SEVERITY.INFO, {}, 5, 8),

  entry({
    user_id: u6.id, user_name: u6.name,
    action_type: ACTION_TYPE.REPORT_EXPORTED,
    action_label: 'تصدير تقرير المبيعات — الربع الأول',
    entity_type: ENTITY_TYPE.ACCOUNTING, entity_id: 'report_q1_2026', entity_label: 'Q1 2026',
    severity: SEVERITY.WARNING,
    metadata: { format: 'pdf', rows: 128, quarter: 'Q1-2026' },
    created_at: dt(5, 11),
  }),

  entry({
    user_id: u6.id, user_name: u6.name,
    action_type: ACTION_TYPE.USER_DEACTIVATED,
    action_label: 'تعطيل حساب مستخدم',
    entity_type: ENTITY_TYPE.PROFILE, entity_id: 'u_old_02', entity_label: 'خالد سعيد',
    severity: SEVERITY.CRITICAL,
    metadata: { reason: 'end_of_contract', deactivated_by: u6.name },
    created_at: dt(5, 14),
  }),

  taskEntry(u1, ACTION_TYPE.TASK_CREATED, 'إنشاء مهمة جديدة', 'task_001', 'تقرير المبيعات الشهري', SEVERITY.INFO, { priority: 'high' }, 5, 9),
  taskEntry(u6, ACTION_TYPE.TASK_CREATED, 'إنشاء مهمة جديدة', 'task_006', 'تدريب موظفين جدد',     SEVERITY.INFO, { priority: 'high' }, 5, 9),

  // ── 7 days ago ────────────────────────────────────────────
  entry({
    user_id: u6.id, user_name: u6.name,
    action_type: ACTION_TYPE.SYSTEM_BOOT,
    action_label: 'بدء تشغيل النظام بعد صيانة مجدولة',
    entity_type: ENTITY_TYPE.SYSTEM, entity_id: 'system', entity_label: 'النظام الرئيسي',
    severity: SEVERITY.INFO,
    metadata: { version: '1.2.0', maintenance_window: '2h', migrated_tables: ['tasks', 'profiles'] },
    created_at: dt(7, 6),
  }),

  authEntry(u6, ACTION_TYPE.LOGIN,  'تسجيل دخول ناجح بعد الصيانة', SEVERITY.INFO, { post_maintenance: true }, 7, 7),

  entry({
    user_id: u6.id, user_name: u6.name,
    action_type: ACTION_TYPE.ROLE_CHANGED,
    action_label: 'تغيير صلاحية — ترقية لمدير سوشال',
    entity_type: ENTITY_TYPE.ADMIN, entity_id: u2.id, entity_label: u2.name,
    severity: SEVERITY.CRITICAL,
    metadata: { target_user: u2.name, from_role: 'employee', to_role: 'social_manager', reason: 'promotion' },
    created_at: dt(7, 10),
  }),
];

export default MOCK_AUDIT_LOGS;
