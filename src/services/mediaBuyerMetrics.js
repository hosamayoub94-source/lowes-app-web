// =============================================================
// mediaBuyerMetrics — منطق نقي للوحة الميديا باير v2 (15 تشرين الأول 2026).
// بلا Supabase: حساب أيام تشغيل الحملة، إنفاق الميزانية اليومية (₺)، تكلفة
// التأكيد، والتزام الموظفات بالتسجيل على فترة. مُختبَر بـtest-media-buyer-metrics.mjs.
// =============================================================

const DAY_MS = 86400000;

// 'YYYY-MM-DD' من تاريخ/طابع زمني (محلي، لا UTC — نفس todayISO بالخدمة).
export function toISODate(v) {
  if (!v) return null;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// عدد الأيام بين تاريخين شاملاً الطرفين (0 لو النهاية قبل البداية).
export function daysInclusive(fromISO, toISO) {
  if (!fromISO || !toISO || toISO < fromISO) return 0;
  const a = Date.parse(fromISO + 'T00:00:00Z');
  const b = Date.parse(toISO + 'T00:00:00Z');
  return Math.round((b - a) / DAY_MS) + 1;
}

/** الحملة موقوفة؟ (is_active=false أو حالة غير «active»). */
export function isPaused(c) {
  return c?.is_active === false || (c?.status && c.status !== 'active');
}

/**
 * أيام تشغيل الحملة داخل الفترة [from, to]:
 * من max(from, يوم الإنشاء) إلى min(to, اليوم، يوم الوقف إن كانت موقوفة).
 * حملة موقوفة بلا تاريخ وقف مسجّل (حملات قديمة قبل v2) ⇒ 0 — لا نخترع إنفاقاً.
 */
export function activeDaysInRange(c, from, to, today) {
  const created = toISODate(c?.created_at);
  let start = from;
  if (created && created > start) start = created;
  let end = to < today ? to : today;
  if (isPaused(c)) {
    const paused = toISODate(c?.paused_at);
    if (!paused) return 0;
    if (paused < end) end = paused;
  }
  return daysInclusive(start, end);
}

/** إنفاق الحملة بالليرة التركية على الفترة = الميزانية اليومية × أيام التشغيل. */
export function budgetSpendTry(c, from, to, today) {
  const b = Number(c?.daily_budget_try);
  if (!(b > 0)) return 0;
  return +(b * activeDaysInRange(c, from, to, today)).toFixed(2);
}

/** تكلفة التأكيد (₺) — null لو لا إنفاق أو لا تأكيدات. */
export function costPerConfirmation(spendTry, confirmations) {
  const s = Number(spendTry) || 0;
  const n = Number(confirmations) || 0;
  if (!(s > 0) || !(n > 0)) return null;
  return +(s / n).toFixed(2);
}

/**
 * التزام التسجيل:
 *  expected — أسماء الموظفات المكلّفات بحملات شغّالة
 *  reports  — [{ employee_name, report_date }] ضمن الفترة
 * يرجع لكل اسم: أيام سجّلت / الأيام المطلوبة (من from حتى min(to, today)) + هل سجّلت اليوم.
 * ملتزمة = سجّلت اليوم (إن كان اليوم ضمن الفترة) وإلا نسبة ≥ 80% على الفترة.
 */
export function complianceDetail({ expected = [], reports = [], from, to, today }) {
  const end = to < today ? to : today;
  const required = daysInclusive(from, end);
  const todayInRange = today >= from && today <= to;
  const days = {};
  for (const r of reports) {
    if (!r?.employee_name || !r.report_date) continue;
    if (r.report_date < from || r.report_date > end) continue;
    (days[r.employee_name] ??= new Set()).add(r.report_date);
  }
  const rows = [...new Set(expected)].map(name => {
    const set = days[name] || new Set();
    const reported = set.size;
    const rate = required > 0 ? Math.round((reported / required) * 100) : 0;
    const reportedToday = set.has(today);
    const committed = todayInRange ? reportedToday : rate >= 80;
    const lastDate = [...set].sort().pop() || null;
    return { name, reported, required, rate, reportedToday, committed, lastDate };
  }).sort((a, b) => a.rate - b.rate || a.name.localeCompare(b.name));
  return {
    todayInRange,
    required,
    rows,
    committed: rows.filter(r => r.committed),
    notCommitted: rows.filter(r => !r.committed),
  };
}

/** إحصاءات اليوم لكل حملة من سطور النتائج + معرّفات تقارير اليوم. */
export function todayStatsByCampaign(results = [], todayReportIds = new Set()) {
  const out = {};
  for (const r of results) {
    if (!todayReportIds.has(r.report_id)) continue;
    const x = (out[r.campaign_id] ??= { messages: 0, confirmations: 0 });
    x.messages += Number(r.messages) || 0;
    x.confirmations += Number(r.confirmations) || 0;
  }
  return out;
}

/**
 * سطور تقرير موجودة لإعلانات غير ظاهرة بشاشة التقرير اليومي (إعلان محذوف ناعماً،
 * حملة موقوفة، أو إلغاء تكليف). تُعاد كما هي عند الحفظ حتى لا يمسحها
 * replaceAdResults — بند «الإعلان المحذوف يضل محسوب».
 */
export function preservedHiddenResults(loadedResults = [], visibleAdIds = new Set()) {
  return loadedResults
    .filter(r => r.ad_id && !visibleAdIds.has(r.ad_id))
    .map(r => ({
      campaign_id: r.campaign_id, ad_id: r.ad_id,
      messages: Number(r.messages) || 0, confirmations: Number(r.confirmations) || 0,
      amount_try: Number(r.amount_try) || 0, amount_syp: Number(r.amount_syp) || 0, amount_usd: Number(r.amount_usd) || 0,
      currency: r.currency || 'TRY', star_rating: r.star_rating || null, notes: r.notes || null,
      image_urls: Array.isArray(r.image_urls) ? r.image_urls : [],
    }));
}
