// =============================================================
// CRM Module — Types, Constants, Configuration
// Single source of truth. Zero runtime imports.
// =============================================================

// ── Lead statuses ─────────────────────────────────────────────
export const LEAD_STATUS = Object.freeze({
  NEW:           'new',
  CONTACTED:     'contacted',
  QUALIFIED:     'qualified',
  UNQUALIFIED:   'unqualified',
  CONVERTED:     'converted',
  LOST:          'lost',
});

export const LEAD_STATUS_LABELS = {
  [LEAD_STATUS.NEW]:         'جديد',
  [LEAD_STATUS.CONTACTED]:   'تم التواصل',
  [LEAD_STATUS.QUALIFIED]:   'مؤهل',
  [LEAD_STATUS.UNQUALIFIED]: 'غير مؤهل',
  [LEAD_STATUS.CONVERTED]:   'تم تحويله',
  [LEAD_STATUS.LOST]:        'خسارة',
};

export const LEAD_STATUS_COLORS = {
  [LEAD_STATUS.NEW]:         '#3b82f6',
  [LEAD_STATUS.CONTACTED]:   '#a855f7',
  [LEAD_STATUS.QUALIFIED]:   '#22c55e',
  [LEAD_STATUS.UNQUALIFIED]: '#64748b',
  [LEAD_STATUS.CONVERTED]:   '#06b6d4',
  [LEAD_STATUS.LOST]:        '#ef4444',
};

// ── Lead sources ──────────────────────────────────────────────
export const LEAD_SOURCE = Object.freeze({
  MANUAL:   'manual',
  WEBSITE:  'website',
  REFERRAL: 'referral',
  SOCIAL:   'social',
  COLD_CALL:'cold_call',
  AD:       'ad',
  EVENT:    'event',
  PARTNER:  'partner',
});

export const LEAD_SOURCE_LABELS = {
  [LEAD_SOURCE.MANUAL]:   'يدوي',
  [LEAD_SOURCE.WEBSITE]:  'الموقع الإلكتروني',
  [LEAD_SOURCE.REFERRAL]: 'إحالة',
  [LEAD_SOURCE.SOCIAL]:   'التواصل الاجتماعي',
  [LEAD_SOURCE.COLD_CALL]:'اتصال بارد',
  [LEAD_SOURCE.AD]:       'إعلان',
  [LEAD_SOURCE.EVENT]:    'فعالية',
  [LEAD_SOURCE.PARTNER]:  'شريك',
};

export const LEAD_SOURCE_ICONS = {
  [LEAD_SOURCE.MANUAL]:   '✍️',
  [LEAD_SOURCE.WEBSITE]:  '🌐',
  [LEAD_SOURCE.REFERRAL]: '🤝',
  [LEAD_SOURCE.SOCIAL]:   '📱',
  [LEAD_SOURCE.COLD_CALL]:'📞',
  [LEAD_SOURCE.AD]:       '📢',
  [LEAD_SOURCE.EVENT]:    '🎪',
  [LEAD_SOURCE.PARTNER]:  '🏢',
};

// ── Deal statuses ─────────────────────────────────────────────
export const DEAL_STATUS = Object.freeze({
  OPEN:     'open',
  WON:      'won',
  LOST:     'lost',
  ARCHIVED: 'archived',
});

export const DEAL_STATUS_LABELS = {
  [DEAL_STATUS.OPEN]:    'مفتوح',
  [DEAL_STATUS.WON]:     'مكتمل',
  [DEAL_STATUS.LOST]:    'خسارة',
  [DEAL_STATUS.ARCHIVED]:'مؤرشف',
};

export const DEAL_STATUS_COLORS = {
  [DEAL_STATUS.OPEN]:    '#3b82f6',
  [DEAL_STATUS.WON]:     '#22c55e',
  [DEAL_STATUS.LOST]:    '#ef4444',
  [DEAL_STATUS.ARCHIVED]:'#64748b',
};

// ── Customer statuses ─────────────────────────────────────────
export const CUSTOMER_STATUS = Object.freeze({
  ACTIVE:   'active',
  INACTIVE: 'inactive',
  ARCHIVED: 'archived',
});

export const CUSTOMER_STATUS_LABELS = {
  [CUSTOMER_STATUS.ACTIVE]:  'نشط',
  [CUSTOMER_STATUS.INACTIVE]:'غير نشط',
  [CUSTOMER_STATUS.ARCHIVED]:'مؤرشف',
};

// ── Activity types ────────────────────────────────────────────
export const ACTIVITY_TYPE = Object.freeze({
  CALL:         'call',
  EMAIL:        'email',
  MEETING:      'meeting',
  NOTE:         'note',
  STAGE_CHANGE: 'stage_change',
  FILE:         'file',
  TASK:         'task',
  WHATSAPP:     'whatsapp',
  SMS:          'sms',
  VISIT:        'visit',
});

export const ACTIVITY_TYPE_LABELS = {
  [ACTIVITY_TYPE.CALL]:         'مكالمة',
  [ACTIVITY_TYPE.EMAIL]:        'بريد إلكتروني',
  [ACTIVITY_TYPE.MEETING]:      'اجتماع',
  [ACTIVITY_TYPE.NOTE]:         'ملاحظة',
  [ACTIVITY_TYPE.STAGE_CHANGE]: 'تغيير مرحلة',
  [ACTIVITY_TYPE.FILE]:         'ملف',
  [ACTIVITY_TYPE.TASK]:         'مهمة',
  [ACTIVITY_TYPE.WHATSAPP]:     'واتساب',
  [ACTIVITY_TYPE.SMS]:          'رسالة نصية',
  [ACTIVITY_TYPE.VISIT]:        'زيارة',
};

export const ACTIVITY_TYPE_ICONS = {
  [ACTIVITY_TYPE.CALL]:         '📞',
  [ACTIVITY_TYPE.EMAIL]:        '📧',
  [ACTIVITY_TYPE.MEETING]:      '🤝',
  [ACTIVITY_TYPE.NOTE]:         '📝',
  [ACTIVITY_TYPE.STAGE_CHANGE]: '🔄',
  [ACTIVITY_TYPE.FILE]:         '📎',
  [ACTIVITY_TYPE.TASK]:         '✓',
  [ACTIVITY_TYPE.WHATSAPP]:     '💬',
  [ACTIVITY_TYPE.SMS]:          '✉️',
  [ACTIVITY_TYPE.VISIT]:        '🏢',
};

export const ACTIVITY_TYPE_COLORS = {
  [ACTIVITY_TYPE.CALL]:         '#22c55e',
  [ACTIVITY_TYPE.EMAIL]:        '#3b82f6',
  [ACTIVITY_TYPE.MEETING]:      '#a855f7',
  [ACTIVITY_TYPE.NOTE]:         '#f59e0b',
  [ACTIVITY_TYPE.STAGE_CHANGE]: '#06b6d4',
  [ACTIVITY_TYPE.FILE]:         '#ec4899',
  [ACTIVITY_TYPE.TASK]:         '#64748b',
  [ACTIVITY_TYPE.WHATSAPP]:     '#22c55e',
  [ACTIVITY_TYPE.SMS]:          '#64748b',
  [ACTIVITY_TYPE.VISIT]:        '#f59e0b',
};

// ── Followup types ────────────────────────────────────────────
export const FOLLOWUP_TYPE = Object.freeze({
  CALL:    'call',
  EMAIL:   'email',
  MEETING: 'meeting',
  WHATSAPP:'whatsapp',
  SMS:     'sms',
  TASK:    'task',
  VISIT:   'visit',
});

export const FOLLOWUP_TYPE_LABELS = {
  [FOLLOWUP_TYPE.CALL]:    'مكالمة',
  [FOLLOWUP_TYPE.EMAIL]:   'بريد إلكتروني',
  [FOLLOWUP_TYPE.MEETING]: 'اجتماع',
  [FOLLOWUP_TYPE.WHATSAPP]:'واتساب',
  [FOLLOWUP_TYPE.SMS]:     'رسالة نصية',
  [FOLLOWUP_TYPE.TASK]:    'مهمة',
  [FOLLOWUP_TYPE.VISIT]:   'زيارة',
};

export const FOLLOWUP_TYPE_ICONS = {
  [FOLLOWUP_TYPE.CALL]:    '📞',
  [FOLLOWUP_TYPE.EMAIL]:   '📧',
  [FOLLOWUP_TYPE.MEETING]: '🤝',
  [FOLLOWUP_TYPE.WHATSAPP]:'💬',
  [FOLLOWUP_TYPE.SMS]:     '✉️',
  [FOLLOWUP_TYPE.TASK]:    '✓',
  [FOLLOWUP_TYPE.VISIT]:   '🏢',
};

// ── Followup statuses ─────────────────────────────────────────
export const FOLLOWUP_STATUS = Object.freeze({
  PENDING:   'pending',
  DONE:      'done',
  OVERDUE:   'overdue',
  CANCELLED: 'cancelled',
});

export const FOLLOWUP_STATUS_LABELS = {
  [FOLLOWUP_STATUS.PENDING]:  'قيد الانتظار',
  [FOLLOWUP_STATUS.DONE]:     'مكتمل',
  [FOLLOWUP_STATUS.OVERDUE]:  'متأخر',
  [FOLLOWUP_STATUS.CANCELLED]:'ملغي',
};

export const FOLLOWUP_STATUS_COLORS = {
  [FOLLOWUP_STATUS.PENDING]:  '#3b82f6',
  [FOLLOWUP_STATUS.DONE]:     '#22c55e',
  [FOLLOWUP_STATUS.OVERDUE]:  '#ef4444',
  [FOLLOWUP_STATUS.CANCELLED]:'#64748b',
};

// ── CRM roles ─────────────────────────────────────────────────
export const CRM_ROLE = Object.freeze({
  SALES_AGENT: 'sales_agent',
  MANAGER:     'manager',
  ADMIN:       'admin',
});

// ── Default pipeline stages ───────────────────────────────────
export const DEFAULT_STAGES = [
  { slug: 'new_lead',         name: 'عميل محتمل جديد',  color: '#64748b', position: 0, probability: 10,  is_won: false, is_lost: false },
  { slug: 'contacted',        name: 'تم التواصل',        color: '#3b82f6', position: 1, probability: 25,  is_won: false, is_lost: false },
  { slug: 'negotiation',      name: 'قيد التفاوض',       color: '#f59e0b', position: 2, probability: 60,  is_won: false, is_lost: false },
  { slug: 'awaiting_payment', name: 'بانتظار الدفع',     color: '#a855f7', position: 3, probability: 85,  is_won: false, is_lost: false },
  { slug: 'won',              name: 'صفقة مكتملة',       color: '#22c55e', position: 4, probability: 100, is_won: true,  is_lost: false },
  { slug: 'lost',             name: 'خسارة',             color: '#ef4444', position: 5, probability: 0,   is_won: false, is_lost: true  },
];

// ── Business constants ─────────────────────────────────────────
export const CRM_CACHE_TTL_MS           = 2 * 60_000;  // 2 minutes
export const CRM_REALTIME_INTERVAL_MS   = 60_000;      // 1 minute poll
export const FOLLOWUP_OVERDUE_CHECK_MS  = 5 * 60_000;  // 5 min overdue check
export const MAX_ACTIVITIES_PER_LOAD    = 50;
export const MAX_DEALS_PER_STAGE        = 100;
export const PIPELINE_VALUE_CURRENCY    = 'USD';

// ── Formatting helpers ────────────────────────────────────────

/** Format currency */
export function formatCurrency(value, currency = 'USD') {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M ${currency}`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K ${currency}`;
  return `${Math.round(n)} ${currency}`;
}

/** Sum deal values in a list */
export function getPipelineValue(deals) {
  return (deals ?? []).reduce((sum, d) => sum + (Number(d.value) || 0), 0);
}

/** Won deals / total closed deals × 100.
 *  Accepts either an array of deals OR (wonCount, lostCount) numbers. */
export function getWinRate(dealsOrWonCount, lostCount) {
  if (typeof dealsOrWonCount === 'number') {
    const total = dealsOrWonCount + (lostCount || 0);
    if (!total) return 0;
    return Math.round((dealsOrWonCount / total) * 100);
  }
  const deals = dealsOrWonCount;
  const closed = (deals ?? []).filter((d) => d.status === DEAL_STATUS.WON || d.status === DEAL_STATUS.LOST);
  if (!closed.length) return 0;
  const won = closed.filter((d) => d.status === DEAL_STATUS.WON);
  return Math.round((won.length / closed.length) * 100);
}

/** Leads converted / total leads × 100.
 *  Accepts either an array of leads OR (convertedCount, totalCount) numbers. */
export function getLeadConversionRate(leadsOrConvertedCount, totalCount) {
  if (typeof leadsOrConvertedCount === 'number') {
    if (!totalCount) return 0;
    return Math.round((leadsOrConvertedCount / totalCount) * 100);
  }
  const leads = leadsOrConvertedCount;
  if (!leads?.length) return 0;
  const converted = leads.filter((l) => l.status === LEAD_STATUS.CONVERTED);
  return Math.round((converted.length / leads.length) * 100);
}

/** Overdue count in followups list */
export function countOverdueFollowups(followups) {
  const now = new Date();
  return (followups ?? []).filter(
    (f) => f.status === FOLLOWUP_STATUS.PENDING && new Date(f.due_at) < now,
  ).length;
}

/** Days until / since due_at */
export function daysFromNow(isoDate) {
  const diff = Math.round((new Date(isoDate) - Date.now()) / 86_400_000);
  return diff;
}

// ── Mock data ─────────────────────────────────────────────────

const NOW = Date.now();

export const MOCK_PIPELINE = {
  id:          'pipeline_01',
  name:        'خط المبيعات الرئيسي',
  is_default:  true,
  is_active:   true,
};

export const MOCK_STAGES = DEFAULT_STAGES.map((s, i) => ({
  id:          `stage_0${i + 1}`,
  pipeline_id: 'pipeline_01',
  ...s,
}));

export const MOCK_CUSTOMERS = [
  { id: 'cust_01', company_name: 'شركة الفجر للتقنية', industry: 'تقنية المعلومات', city: 'الرياض', status: 'active', total_deals: 3, total_revenue: 450000, assigned_to: null, last_contact_at: new Date(NOW - 2 * 86400000).toISOString(), created_at: new Date(NOW - 30 * 86400000).toISOString() },
  { id: 'cust_02', company_name: 'مجموعة النجمة التجارية', industry: 'تجارة', city: 'جدة', status: 'active', total_deals: 1, total_revenue: 180000, assigned_to: null, last_contact_at: new Date(NOW - 5 * 86400000).toISOString(), created_at: new Date(NOW - 15 * 86400000).toISOString() },
  { id: 'cust_03', company_name: 'البناء الحديث', industry: 'مقاولات', city: 'الدمام', status: 'inactive', total_deals: 2, total_revenue: 320000, assigned_to: null, last_contact_at: new Date(NOW - 20 * 86400000).toISOString(), created_at: new Date(NOW - 60 * 86400000).toISOString() },
];

export const MOCK_LEADS = [
  { id: 'lead_01', title: 'نظام ERP لشركة الأمل', company_name: 'شركة الأمل', contact_name: 'خالد الزهراني', contact_phone: '+966501234567', source: LEAD_SOURCE.WEBSITE, status: LEAD_STATUS.NEW, estimated_value: 95000, score: 72, assigned_to: null, created_at: new Date(NOW - 1 * 86400000).toISOString() },
  { id: 'lead_02', title: 'تطوير موقع تجاري', company_name: 'متاجر الخليج', contact_name: 'نورة المطيري', contact_phone: '+966509876543', source: LEAD_SOURCE.REFERRAL, status: LEAD_STATUS.CONTACTED, estimated_value: 45000, score: 58, assigned_to: null, created_at: new Date(NOW - 3 * 86400000).toISOString() },
  { id: 'lead_03', title: 'حل سحابي متكامل', company_name: 'شركة المستقبل', contact_name: 'أحمد الشمري', contact_phone: '+966512345678', source: LEAD_SOURCE.COLD_CALL, status: LEAD_STATUS.QUALIFIED, estimated_value: 220000, score: 84, assigned_to: null, created_at: new Date(NOW - 7 * 86400000).toISOString() },
  { id: 'lead_04', title: 'دعم تقني سنوي', company_name: 'البنك الأهلي', contact_name: 'سارة القحطاني', contact_phone: '+966556789012', source: LEAD_SOURCE.AD, status: LEAD_STATUS.CONVERTED, estimated_value: 150000, score: 91, assigned_to: null, converted_at: new Date(NOW - 5 * 86400000).toISOString(), customer_id: 'cust_01', created_at: new Date(NOW - 14 * 86400000).toISOString() },
];

export const MOCK_DEALS = [
  { id: 'deal_01', title: 'حل سحابي متكامل', pipeline_id: 'pipeline_01', stage_id: 'stage_03', customer_id: 'cust_01', value: 220000, currency: 'USD', status: DEAL_STATUS.OPEN, probability: 60, expected_close_date: new Date(NOW + 10 * 86400000).toISOString().slice(0,10), created_at: new Date(NOW - 7 * 86400000).toISOString(), updated_at: new Date(NOW - 2 * 86400000).toISOString() },
  { id: 'deal_02', title: 'دعم تقني سنوي',   pipeline_id: 'pipeline_01', stage_id: 'stage_04', customer_id: 'cust_01', value: 150000, currency: 'USD', status: DEAL_STATUS.OPEN, probability: 85, expected_close_date: new Date(NOW + 5 * 86400000).toISOString().slice(0,10),  created_at: new Date(NOW - 14 * 86400000).toISOString(), updated_at: new Date(NOW - 1 * 86400000).toISOString() },
  { id: 'deal_03', title: 'نظام ERP',         pipeline_id: 'pipeline_01', stage_id: 'stage_02', customer_id: 'cust_02', value: 95000,  currency: 'USD', status: DEAL_STATUS.OPEN, probability: 25, expected_close_date: new Date(NOW + 20 * 86400000).toISOString().slice(0,10), created_at: new Date(NOW - 3 * 86400000).toISOString(), updated_at: new Date(NOW - 1 * 86400000).toISOString() },
  { id: 'deal_04', title: 'تطوير موقع',       pipeline_id: 'pipeline_01', stage_id: 'stage_05', customer_id: 'cust_03', value: 45000,  currency: 'USD', status: DEAL_STATUS.WON,  probability: 100, closed_at: new Date(NOW - 2 * 86400000).toISOString(), created_at: new Date(NOW - 20 * 86400000).toISOString(), updated_at: new Date(NOW - 2 * 86400000).toISOString() },
  { id: 'deal_05', title: 'استشارات أمن المعلومات', pipeline_id: 'pipeline_01', stage_id: 'stage_01', customer_id: null, value: 60000, currency: 'USD', status: DEAL_STATUS.OPEN, probability: 10, expected_close_date: new Date(NOW + 30 * 86400000).toISOString().slice(0,10), created_at: new Date(NOW - 1 * 86400000).toISOString(), updated_at: new Date(NOW - 1 * 86400000).toISOString() },
];

export const MOCK_FOLLOWUPS = [
  { id: 'fu_01', deal_id: 'deal_01', title: 'مكالمة متابعة للعرض', followup_type: FOLLOWUP_TYPE.CALL,    status: FOLLOWUP_STATUS.PENDING, due_at: new Date(NOW + 2 * 3600000).toISOString(),   assigned_to: null, created_at: new Date(NOW - 86400000).toISOString() },
  { id: 'fu_02', deal_id: 'deal_02', title: 'إرسال العقد للمراجعة', followup_type: FOLLOWUP_TYPE.EMAIL,   status: FOLLOWUP_STATUS.OVERDUE, due_at: new Date(NOW - 1 * 86400000).toISOString(), assigned_to: null, created_at: new Date(NOW - 3 * 86400000).toISOString() },
  { id: 'fu_03', deal_id: 'deal_03', title: 'اجتماع تقديم العرض',  followup_type: FOLLOWUP_TYPE.MEETING, status: FOLLOWUP_STATUS.PENDING, due_at: new Date(NOW + 1 * 86400000).toISOString(),  assigned_to: null, created_at: new Date(NOW - 86400000).toISOString() },
];

export const MOCK_ACTIVITIES = [
  { id: 'act_01', deal_id: 'deal_01', user_id: 'user_01', activity_type: ACTIVITY_TYPE.CALL,         title: 'مكالمة أولية مع العميل',        description: 'تم مناقشة متطلبات المشروع',   created_at: new Date(NOW - 7 * 86400000).toISOString() },
  { id: 'act_02', deal_id: 'deal_01', user_id: 'user_01', activity_type: ACTIVITY_TYPE.EMAIL,        title: 'إرسال عرض الأسعار',             description: 'تم إرسال عرض أسعار مفصل',    created_at: new Date(NOW - 5 * 86400000).toISOString() },
  { id: 'act_03', deal_id: 'deal_01', user_id: 'user_01', activity_type: ACTIVITY_TYPE.STAGE_CHANGE, title: 'تحرك الصفقة إلى قيد التفاوض',  description: 'من: تم التواصل → قيد التفاوض', created_at: new Date(NOW - 2 * 86400000).toISOString() },
  { id: 'act_04', deal_id: 'deal_02', user_id: 'user_01', activity_type: ACTIVITY_TYPE.MEETING,      title: 'اجتماع التفاوض النهائي',        description: 'تم الاتفاق على الشروط',       created_at: new Date(NOW - 1 * 86400000).toISOString() },
];
