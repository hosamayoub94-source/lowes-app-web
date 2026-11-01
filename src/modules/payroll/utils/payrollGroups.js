// تبويبات عرض كشف الرواتب حسب المجموعة — للعرض فقط: لا تعزل ولا تغيّر أي رقم، والإجمالي (الكل) يبقى كاملاً.
// المجموعة من فريق الموظف بملفه الشخصي (profiles.team)؛ وإلا من فريق الحسبة (syria/turkey).

export const PAYROLL_GROUPS = [
  { key: 'all',    label: 'الكل',          icon: '📋' },
  { key: 'syria',  label: 'سوريا',         icon: '🇸🇾' },
  { key: 'turkey', label: 'تركيا',         icon: '🇹🇷' },
  { key: 'social', label: 'سوشال ميديا',   icon: '📱' },
  { key: 'uae',    label: 'الإمارات',      icon: '🇦🇪' },
  { key: 'admin',  label: 'الإدارة',       icon: '🏢' },
  { key: 'other',  label: 'أخرى',          icon: '👥' },
];

const TEAM_TO_GROUP = {
  'سوريا': 'syria', syria: 'syria',
  'تركيا': 'turkey', turkey: 'turkey',
  'ميديا': 'social', 'سوشال ميديا': 'social', media: 'social',
  'الإمارات': 'uae', 'الامارات': 'uae', uae: 'uae', UAE: 'uae',
};

// الإدارة (رواتبهم غير مرتبطة بالمبيعات) — بالمعرّف مؤقتاً (قرار المالك 1/11/2026) إلى أن يُضاف حقل «مجموعة الرواتب» بالملف الشخصي:
// Amany alkshki · Wasim Alkshki · Fadi Jarrouge
export const MANAGEMENT_EMPLOYEE_IDS = new Set([
  'cc450ee7-b2ea-40c4-9d4c-3e9fcc016123',
  'a820ceb5-69b7-43a2-8fdf-d53f3f47581a',
  '473d685a-b91f-40ea-9f1e-a797724b606a',
]);

const norm = (v) => String(v ?? '').trim();

/** مفتاح المجموعة لقيد رواتب واحد (never 'all'). */
export function groupOfEntry(entry) {
  if (MANAGEMENT_EMPLOYEE_IDS.has(entry?.employee_id)) return 'admin';
  const byProfile = TEAM_TO_GROUP[norm(entry?.profile_team)] || TEAM_TO_GROUP[norm(entry?.profile_team).toLowerCase()];
  if (byProfile) return byProfile;
  const byCalc = TEAM_TO_GROUP[norm(entry?.team)];
  return byCalc || 'other';
}

export function filterEntriesByGroup(entries = [], key = 'all') {
  if (!key || key === 'all') return entries;
  return entries.filter((e) => groupOfEntry(e) === key);
}

/** { [groupKey]: { count, totals: {currency: net} } } لكل المجموعات + all. */
export function summarizeGroups(entries = [], netOf = (e) => Number(e?.net_salary_usd) || 0, defaultCurrency = 'USD') {
  const out = Object.fromEntries(PAYROLL_GROUPS.map((g) => [g.key, { count: 0, totals: {} }]));
  for (const e of entries) {
    const cur = e.currency || defaultCurrency;
    const net = netOf(e);
    for (const k of ['all', groupOfEntry(e)]) {
      out[k].count += 1;
      out[k].totals[cur] = Math.round(((out[k].totals[cur] || 0) + net) * 100) / 100;
    }
  }
  return out;
}

// ما تدفعه الإمارات (Reem) عن موظفين من هذه الدورة — معلوماتي فقط، لا يدخل إجمالي الدورة ولا الاعتماد/الدفع.
// قرار المالك 1/11/2026 (من أكتوبر 2026): Arwa راتبها كله من الإمارات، وSham نصف راتبها (النصف علينا: 100$ + 5$ إنترنت).
// المبالغ من إعدادات الرواتب (Arwa 130+10، Sham 200+10 قبل التقسيم) — تحتاج تأكيد من حسابات الإمارات؛ تُنقل لاحقاً لجدول بالقاعدة.
export const UAE_PAID_SHARES = [
  { employee_id: '2320f139-c909-4604-8778-f22f00eb689d', name: 'Arwa Mohammed', part: 'كامل الراتب (130$ أساسي + 10$ إنترنت)', usd: 140 },
  { employee_id: 'f9e95205-99e9-4575-97fb-297f55aa8dcd', name: 'Sham', part: 'نصف الراتب (100$ أساسي + 5$ إنترنت) — النصف الآخر علينا', usd: 105 },
];
export const uaePaidTotalUsd = () => UAE_PAID_SHARES.reduce((n, x) => n + x.usd, 0);
