// =============================================================
// Tasks Module — rich mock data for development.
// Toggle USE_MOCK in taskService.js to disable when Supabase is ready.
// All dates are computed relative to "today" so the data stays fresh.
// =============================================================

import { TASK_STATUS, TASK_PRIORITY, ACTIVITY_TYPE } from '../types/task.types';

// ── Helpers ───────────────────────────────────────────────────
function d(offsetDays) {
  const dt = new Date();
  dt.setDate(dt.getDate() + offsetDays);
  return dt.toISOString().split('T')[0];
}

function dt(offsetDays, hours = 10, minutes = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

// ── Employees ─────────────────────────────────────────────────
export const MOCK_EMPLOYEES = [
  { id: 'emp_1', name: 'أحمد محمد',    role: 'مدير مبيعات',   avatar: null },
  { id: 'emp_2', name: 'سارة أحمد',    role: 'موظف سوشال',    avatar: null },
  { id: 'emp_3', name: 'محمد علي',     role: 'ميديا باير',    avatar: null },
  { id: 'emp_4', name: 'فاطمة حسن',   role: 'موظف مبيعات',   avatar: null },
  { id: 'emp_5', name: 'عمر خالد',    role: 'موظف عمليات',   avatar: null },
  { id: 'emp_6', name: 'نور الدين',   role: 'مدير عام',      avatar: null },
  { id: 'emp_7', name: 'ليلى يوسف',   role: 'مصممة جرافيك',  avatar: null },
  { id: 'emp_8', name: 'كريم إبراهيم', role: 'موظف تقني',     avatar: null },
];

const [emp1, emp2, emp3, emp4, emp5, emp6, emp7, emp8] = MOCK_EMPLOYEES;

// ── Mock Tasks ────────────────────────────────────────────────
export const MOCK_TASKS = [
  // ── 1. In Progress · High · Due soon ────────────────────────
  {
    id: 'task_001',
    title: 'إعداد تقرير المبيعات الشهري',
    description: 'تجميع بيانات المبيعات لشهر أبريل وإعداد تقرير تفصيلي يشمل المقارنة مع الشهر السابق وتحليل الأداء الكامل.',
    status: TASK_STATUS.IN_PROGRESS,
    priority: TASK_PRIORITY.HIGH,
    progress: 65,
    due_date: d(2),
    created_at: dt(-5),
    updated_at: dt(-1),
    assigned_to: emp1,
    created_by: emp6,
    tags: ['مبيعات', 'تقارير'],
    seen: true,
    comments_count: 3,
    attachments: [],
    comments: [
      { id: 'c1_1', author: emp6, text: 'الرجاء تضمين مقارنة ربع سنوية أيضاً.', created_at: dt(-3) },
      { id: 'c1_2', author: emp1, text: 'تم، سأضيفها في القسم الثاني من التقرير.', created_at: dt(-2) },
      { id: 'c1_3', author: emp6, text: 'ممتاز، نتطلع لرؤية النتائج قبل نهاية الأسبوع.', created_at: dt(-1) },
    ],
    activity: [
      { id: 'a1_1', type: ACTIVITY_TYPE.CREATED,          actor: emp6, note: 'تم إنشاء المهمة',                              created_at: dt(-5) },
      { id: 'a1_2', type: ACTIVITY_TYPE.ASSIGNED,          actor: emp6, note: `تم تعيين المهمة لـ ${emp1.name}`,             created_at: dt(-5) },
      { id: 'a1_3', type: ACTIVITY_TYPE.STATUS_CHANGED,   actor: emp1, note: 'الحالة: قيد الانتظار → قيد التنفيذ',           created_at: dt(-3) },
      { id: 'a1_4', type: ACTIVITY_TYPE.PROGRESS_UPDATED, actor: emp1, note: 'تحديث التقدم إلى 65%',                         created_at: dt(-1) },
    ],
  },

  // ── 2. Overdue · Urgent ──────────────────────────────────────
  {
    id: 'task_002',
    title: 'تحديث استراتيجية السوشال ميديا للربع الثاني',
    description: 'مراجعة الاستراتيجية الحالية وتحديثها بناءً على أداء الحملات السابقة وتحديد الأهداف الجديدة.',
    status: TASK_STATUS.IN_PROGRESS,
    priority: TASK_PRIORITY.URGENT,
    progress: 20,
    due_date: d(-3),
    created_at: dt(-10),
    updated_at: dt(-4),
    assigned_to: emp2,
    created_by: emp6,
    tags: ['سوشال ميديا', 'استراتيجية'],
    seen: false,
    comments_count: 1,
    attachments: [],
    comments: [
      { id: 'c2_1', author: emp6, text: 'الأمر عاجل جداً، نحتاج هذا قبل نهاية الأسبوع الماضي!', created_at: dt(-4) },
    ],
    activity: [
      { id: 'a2_1', type: ACTIVITY_TYPE.CREATED,        actor: emp6,  note: 'تم إنشاء المهمة',                           created_at: dt(-10) },
      { id: 'a2_2', type: ACTIVITY_TYPE.ASSIGNED,        actor: emp6,  note: `تم تعيين المهمة لـ ${emp2.name}`,           created_at: dt(-10) },
      { id: 'a2_3', type: ACTIVITY_TYPE.STATUS_CHANGED, actor: emp2,  note: 'الحالة: قيد الانتظار → قيد التنفيذ',         created_at: dt(-6)  },
    ],
  },

  // ── 3. Completed · Medium ────────────────────────────────────
  {
    id: 'task_003',
    title: 'تصميم بانرات إعلانية للحملة الرمضانية',
    description: 'إنشاء مجموعة من البانرات الإعلانية بأحجام مختلفة للحملة الرمضانية بما يتناسب مع هوية العلامة التجارية.',
    status: TASK_STATUS.COMPLETED,
    priority: TASK_PRIORITY.MEDIUM,
    progress: 100,
    due_date: d(-5),
    created_at: dt(-15),
    updated_at: dt(-5),
    assigned_to: emp7,
    created_by: emp2,
    tags: ['تصميم', 'إعلانات'],
    seen: true,
    comments_count: 4,
    attachments: [
      { id: 'att_1', name: 'banner_ramadan_v3.zip', size: '2.4 MB', type: 'archive' },
      { id: 'att_2', name: 'brand_guidelines.pdf', size: '1.1 MB', type: 'pdf' },
    ],
    comments: [
      { id: 'c3_1', author: emp2, text: 'الرجاء اتباع الألوان الموجودة في دليل العلامة التجارية.', created_at: dt(-13) },
      { id: 'c3_2', author: emp7, text: 'هل يمكنك إرسال الأبعاد المطلوبة؟', created_at: dt(-11) },
      { id: 'c3_3', author: emp2, text: 'أبعاد: 1080×1080 و 1200×628 و 1080×1920.', created_at: dt(-11) },
      { id: 'c3_4', author: emp7, text: 'تم الانتهاء ورفع الملفات على Google Drive.', created_at: dt(-5) },
    ],
    activity: [
      { id: 'a3_1', type: ACTIVITY_TYPE.CREATED,          actor: emp2,  note: 'تم إنشاء المهمة',                   created_at: dt(-15) },
      { id: 'a3_2', type: ACTIVITY_TYPE.ASSIGNED,          actor: emp2,  note: `تعيين لـ ${emp7.name}`,             created_at: dt(-15) },
      { id: 'a3_3', type: ACTIVITY_TYPE.PROGRESS_UPDATED, actor: emp7,  note: 'التقدم: 50%',                        created_at: dt(-8)  },
      { id: 'a3_4', type: ACTIVITY_TYPE.PROGRESS_UPDATED, actor: emp7,  note: 'التقدم: 100%',                       created_at: dt(-5)  },
      { id: 'a3_5', type: ACTIVITY_TYPE.STATUS_CHANGED,   actor: emp7,  note: 'الحالة: قيد التنفيذ → مكتملة',      created_at: dt(-5)  },
    ],
  },

  // ── 4. Pending · Low ────────────────────────────────────────
  {
    id: 'task_004',
    title: 'مراجعة وتحديث قاعدة بيانات العملاء',
    description: 'التحقق من دقة بيانات العملاء في النظام وإزالة التكرارات وتحديث أرقام الهاتف والبريد الإلكتروني.',
    status: TASK_STATUS.PENDING,
    priority: TASK_PRIORITY.LOW,
    progress: 0,
    due_date: d(14),
    created_at: dt(-1),
    updated_at: dt(-1),
    assigned_to: emp4,
    created_by: emp1,
    tags: ['CRM', 'بيانات'],
    seen: false,
    comments_count: 0,
    attachments: [],
    comments: [],
    activity: [
      { id: 'a4_1', type: ACTIVITY_TYPE.CREATED,  actor: emp1, note: 'تم إنشاء المهمة',       created_at: dt(-1) },
      { id: 'a4_2', type: ACTIVITY_TYPE.ASSIGNED,  actor: emp1, note: `تعيين لـ ${emp4.name}`, created_at: dt(-1) },
    ],
  },

  // ── 5. In Progress · Urgent · Overdue ──────────────────────
  {
    id: 'task_005',
    title: 'إعداد عرض تقديمي لاجتماع المستثمرين',
    description: 'بناء عرض PowerPoint شامل يتضمن نتائج الربع الأول والتوقعات المالية للعام القادم وخطة التوسع.',
    status: TASK_STATUS.IN_PROGRESS,
    priority: TASK_PRIORITY.URGENT,
    progress: 45,
    due_date: d(-1),
    created_at: dt(-7),
    updated_at: dt(-2),
    assigned_to: emp5,
    created_by: emp6,
    tags: ['عرض', 'مالية', 'مستثمرين'],
    seen: false,
    comments_count: 2,
    attachments: [],
    comments: [
      { id: 'c5_1', author: emp6, text: 'تأكد من تضمين مقارنة بالمنافسين في الشريحة السادسة.', created_at: dt(-4) },
      { id: 'c5_2', author: emp5, text: 'سأحتاج إلى أرقام الربع الثالث من المحاسبة.', created_at: dt(-2) },
    ],
    activity: [
      { id: 'a5_1', type: ACTIVITY_TYPE.CREATED,          actor: emp6, note: 'تم إنشاء المهمة',              created_at: dt(-7) },
      { id: 'a5_2', type: ACTIVITY_TYPE.ASSIGNED,          actor: emp6, note: `تعيين لـ ${emp5.name}`,        created_at: dt(-7) },
      { id: 'a5_3', type: ACTIVITY_TYPE.STATUS_CHANGED,   actor: emp5, note: 'الحالة: قيد الانتظار → قيد التنفيذ', created_at: dt(-5) },
      { id: 'a5_4', type: ACTIVITY_TYPE.PROGRESS_UPDATED, actor: emp5, note: 'التقدم: 45%',                   created_at: dt(-2) },
    ],
  },

  // ── 6. Pending · High ───────────────────────────────────────
  {
    id: 'task_006',
    title: 'تدريب الموظفين الجدد على نظام الحضور',
    description: 'تنظيم جلسة تدريبية لإرشاد الموظفين الجدد حول آلية تسجيل الحضور والانصراف وسياسات الإجازات.',
    status: TASK_STATUS.PENDING,
    priority: TASK_PRIORITY.HIGH,
    progress: 0,
    due_date: d(5),
    created_at: dt(-2),
    updated_at: dt(-2),
    assigned_to: emp3,
    created_by: emp6,
    tags: ['تدريب', 'HR'],
    seen: true,
    comments_count: 1,
    attachments: [],
    comments: [
      { id: 'c6_1', author: emp6, text: 'عدد الموظفين الجدد 4، يرجى تجهيز المواد اللازمة.', created_at: dt(-2) },
    ],
    activity: [
      { id: 'a6_1', type: ACTIVITY_TYPE.CREATED,  actor: emp6, note: 'تم إنشاء المهمة',       created_at: dt(-2) },
      { id: 'a6_2', type: ACTIVITY_TYPE.ASSIGNED,  actor: emp6, note: `تعيين لـ ${emp3.name}`, created_at: dt(-2) },
    ],
  },

  // ── 7. In Progress · Medium ─────────────────────────────────
  {
    id: 'task_007',
    title: 'بناء حملة إعلانية جديدة على فيسبوك',
    description: 'تصميم وإطلاق حملة إعلانية مدفوعة على فيسبوك وإنستغرام للترويج للمنتج الجديد بميزانية 5000 دولار.',
    status: TASK_STATUS.IN_PROGRESS,
    priority: TASK_PRIORITY.MEDIUM,
    progress: 80,
    due_date: d(1),
    created_at: dt(-6),
    updated_at: dt(0),
    assigned_to: emp3,
    created_by: emp2,
    tags: ['إعلانات', 'فيسبوك', 'ميديا باي'],
    seen: true,
    comments_count: 2,
    attachments: [],
    comments: [
      { id: 'c7_1', author: emp2, text: 'تأكد من استهداف الفئة العمرية 25-40 سنة.', created_at: dt(-5) },
      { id: 'c7_2', author: emp3, text: 'تم إعداد 3 إعلانات للاختبار A/B.', created_at: dt(-1) },
    ],
    activity: [
      { id: 'a7_1', type: ACTIVITY_TYPE.CREATED,          actor: emp2, note: 'تم إنشاء المهمة',         created_at: dt(-6) },
      { id: 'a7_2', type: ACTIVITY_TYPE.ASSIGNED,          actor: emp2, note: `تعيين لـ ${emp3.name}`,   created_at: dt(-6) },
      { id: 'a7_3', type: ACTIVITY_TYPE.STATUS_CHANGED,   actor: emp3, note: 'الحالة: قيد التنفيذ',       created_at: dt(-4) },
      { id: 'a7_4', type: ACTIVITY_TYPE.PROGRESS_UPDATED, actor: emp3, note: 'التقدم: 80%',               created_at: dt(0)  },
    ],
  },

  // ── 8. Cancelled · High ──────────────────────────────────────
  {
    id: 'task_008',
    title: 'إعداد خطة تسويقية لمنتج تم إلغاؤه',
    description: 'كانت المهمة تتضمن إعداد خطة تسويقية متكاملة، إلا أن المنتج ألغي من الخط الإنتاجي.',
    status: TASK_STATUS.CANCELLED,
    priority: TASK_PRIORITY.HIGH,
    progress: 15,
    due_date: d(-10),
    created_at: dt(-20),
    updated_at: dt(-12),
    assigned_to: emp2,
    created_by: emp1,
    tags: ['تسويق', 'ملغاة'],
    seen: true,
    comments_count: 2,
    attachments: [],
    comments: [
      { id: 'c8_1', author: emp1, text: 'تم إلغاء المنتج من الإدارة العليا.', created_at: dt(-12) },
      { id: 'c8_2', author: emp2, text: 'حسناً، سأوقف العمل على الخطة.', created_at: dt(-12)  },
    ],
    activity: [
      { id: 'a8_1', type: ACTIVITY_TYPE.CREATED,        actor: emp1, note: 'تم إنشاء المهمة',           created_at: dt(-20) },
      { id: 'a8_2', type: ACTIVITY_TYPE.ASSIGNED,        actor: emp1, note: `تعيين لـ ${emp2.name}`,     created_at: dt(-20) },
      { id: 'a8_3', type: ACTIVITY_TYPE.STATUS_CHANGED, actor: emp1, note: 'الحالة: قيد التنفيذ → ملغاة', created_at: dt(-12) },
    ],
  },

  // ── 9. Pending · Medium ─────────────────────────────────────
  {
    id: 'task_009',
    title: 'كتابة محتوى مدونة الشركة لشهر مايو',
    description: 'كتابة 4 مقالات مدونة عالية الجودة تغطي موضوعات المبيعات والتسويق والتحولات الرقمية في قطاع الأعمال.',
    status: TASK_STATUS.PENDING,
    priority: TASK_PRIORITY.MEDIUM,
    progress: 0,
    due_date: d(10),
    created_at: dt(-1),
    updated_at: dt(-1),
    assigned_to: emp8,
    created_by: emp2,
    tags: ['محتوى', 'مدونة'],
    seen: false,
    comments_count: 0,
    attachments: [],
    comments: [],
    activity: [
      { id: 'a9_1', type: ACTIVITY_TYPE.CREATED,  actor: emp2, note: 'تم إنشاء المهمة',       created_at: dt(-1) },
      { id: 'a9_2', type: ACTIVITY_TYPE.ASSIGNED,  actor: emp2, note: `تعيين لـ ${emp8.name}`, created_at: dt(-1) },
    ],
  },

  // ── 10. Completed · Urgent ──────────────────────────────────
  {
    id: 'task_010',
    title: 'إصلاح خلل في نظام الدفع الإلكتروني',
    description: 'معالجة عطل أدى إلى فشل بعض عمليات الدفع. كان يؤثر على 8% من المعاملات اليومية.',
    status: TASK_STATUS.COMPLETED,
    priority: TASK_PRIORITY.URGENT,
    progress: 100,
    due_date: d(-2),
    created_at: dt(-4),
    updated_at: dt(-2),
    assigned_to: emp8,
    created_by: emp6,
    tags: ['تقني', 'حرج', 'دفع'],
    seen: true,
    comments_count: 3,
    attachments: [],
    comments: [
      { id: 'c10_1', author: emp6,  text: 'هذا عاجل جداً، يؤثر على إيرادات الشركة مباشرةً!', created_at: dt(-4) },
      { id: 'c10_2', author: emp8,  text: 'تم تحديد السبب: مشكلة في API بوابة الدفع.', created_at: dt(-3) },
      { id: 'c10_3', author: emp8,  text: 'تم الإصلاح ونشر التحديث على الخادم الإنتاجي.', created_at: dt(-2) },
    ],
    activity: [
      { id: 'a10_1', type: ACTIVITY_TYPE.CREATED,          actor: emp6, note: 'تم إنشاء المهمة (طارئ)',        created_at: dt(-4) },
      { id: 'a10_2', type: ACTIVITY_TYPE.ASSIGNED,          actor: emp6, note: `تعيين لـ ${emp8.name}`,        created_at: dt(-4) },
      { id: 'a10_3', type: ACTIVITY_TYPE.STATUS_CHANGED,   actor: emp8, note: 'الحالة: قيد الانتظار → قيد التنفيذ', created_at: dt(-4) },
      { id: 'a10_4', type: ACTIVITY_TYPE.PROGRESS_UPDATED, actor: emp8, note: 'التقدم: 100%',                  created_at: dt(-2) },
      { id: 'a10_5', type: ACTIVITY_TYPE.STATUS_CHANGED,   actor: emp8, note: 'الحالة: قيد التنفيذ → مكتملة', created_at: dt(-2) },
    ],
  },

  // ── 11. In Progress · Low ───────────────────────────────────
  {
    id: 'task_011',
    title: 'تحديث بيانات الموظفين على النظام الداخلي',
    description: 'مراجعة وتحديث معلومات الاتصال والصور الشخصية والمسميات الوظيفية للموظفين في قاعدة البيانات الداخلية.',
    status: TASK_STATUS.IN_PROGRESS,
    priority: TASK_PRIORITY.LOW,
    progress: 35,
    due_date: d(7),
    created_at: dt(-3),
    updated_at: dt(-1),
    assigned_to: emp5,
    created_by: emp6,
    tags: ['HR', 'بيانات'],
    seen: true,
    comments_count: 1,
    attachments: [],
    comments: [
      { id: 'c11_1', author: emp5, text: 'انتهيت من تحديث بيانات 6 موظفين من أصل 17.', created_at: dt(-1) },
    ],
    activity: [
      { id: 'a11_1', type: ACTIVITY_TYPE.CREATED,          actor: emp6, note: 'تم إنشاء المهمة',    created_at: dt(-3) },
      { id: 'a11_2', type: ACTIVITY_TYPE.ASSIGNED,          actor: emp6, note: `تعيين لـ ${emp5.name}`, created_at: dt(-3) },
      { id: 'a11_3', type: ACTIVITY_TYPE.STATUS_CHANGED,   actor: emp5, note: 'الحالة: قيد التنفيذ',  created_at: dt(-2) },
      { id: 'a11_4', type: ACTIVITY_TYPE.PROGRESS_UPDATED, actor: emp5, note: 'التقدم: 35%',           created_at: dt(-1) },
    ],
  },

  // ── 12. Pending · Urgent ────────────────────────────────────
  {
    id: 'task_012',
    title: 'الرد على شكاوى العملاء المتراكمة',
    description: 'لدينا 23 شكوى عميل لم يتم الرد عليها منذ أكثر من 48 ساعة، يجب المعالجة الفورية والتصنيف.',
    status: TASK_STATUS.PENDING,
    priority: TASK_PRIORITY.URGENT,
    progress: 0,
    due_date: d(0),
    created_at: dt(0, 8),
    updated_at: dt(0, 8),
    assigned_to: emp4,
    created_by: emp1,
    tags: ['خدمة العملاء', 'عاجل'],
    seen: false,
    comments_count: 0,
    attachments: [],
    comments: [],
    activity: [
      { id: 'a12_1', type: ACTIVITY_TYPE.CREATED,  actor: emp1, note: 'تم إنشاء المهمة',       created_at: dt(0, 8) },
      { id: 'a12_2', type: ACTIVITY_TYPE.ASSIGNED,  actor: emp1, note: `تعيين لـ ${emp4.name}`, created_at: dt(0, 8) },
    ],
  },
];

export default MOCK_TASKS;
