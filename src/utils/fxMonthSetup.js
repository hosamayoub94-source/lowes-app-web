// =============================================================
// fxMonthSetup — S3d: قيم أسعار الصرف الأولية لنموذج «إعداد شهر الرواتب» + خطة الكتابة بعد التثبيت. دوال نقية، مُختبَرة:
//   node test-fx-month-setup.mjs
// لا تلمس payroll_runs ولا المحرك ولا أي حسبة؛ هي مقترح للنموذج وسجل للأسعار الشهرية فقط.
// لا سعر افتراضي: لا سعر مسجَّل = حقل فارغ يُدخله المستخدم.
// =============================================================
import { resolveRate } from './fxResolve.js';

export const SETUP_CURRENCIES = ['TRY', 'SYP'];
const pad = (n) => String(n).padStart(2, '0');
export const setupMonthKey = (year, month) => `${year}-${pad(month)}-01`;

/**
 * قيمة مقترحة لكل عملة بترتيب الثقة: (1) سعر الرواتب المؤكَّد لنفس الشهر، (2) سعر محاسبة التسليم لنفس الشهر، (3) مُرحَّل من شهر سابق (تقديري)، (4) لا شيء.
 * يُرجع {TRY:{rate,label,level}, SYP:{…}} حيث level = confirmed | estimate | none.
 */
export function suggestSetupRates(rows, year, month) {
  const mk = setupMonthKey(year, month);
  const out = {};
  for (const cur of SETUP_CURRENCIES) {
    const pay = resolveRate(rows, { purpose: 'payroll', currency: cur, month: mk });
    const del = resolveRate(rows, { purpose: 'delivery_accounting', currency: cur, month: mk });
    if (pay && pay.exact && pay.quality === 'exact') out[cur] = { rate: pay.unitsPerUsd, label: 'من أسعار الرواتب الشهرية (مؤكَّد)', level: 'confirmed' };
    else if (del && del.exact) out[cur] = { rate: del.unitsPerUsd, label: del.quality === 'exact' ? 'من محاسبة التسليم لنفس الشهر (مؤكَّد)' : 'من محاسبة التسليم لنفس الشهر (تقريبي — راجعه)', level: del.quality === 'exact' ? 'confirmed' : 'estimate' };
    else if (pay) out[cur] = { rate: pay.unitsPerUsd, label: `مُرحَّل من ${pay.periodMonth.slice(0, 7)} — تقديري، راجعه`, level: 'estimate' };
    else if (del) out[cur] = { rate: del.unitsPerUsd, label: `مُرحَّل من ${del.periodMonth.slice(0, 7)} (محاسبة التسليم) — تقديري، راجعه`, level: 'estimate' };
    else out[cur] = { rate: null, label: 'لا سعر مسجَّل لهذا الشهر — أدخله يدوياً', level: 'none' };
  }
  return out;
}

const confirmedExact = (rows, purpose, cur, mk) => (rows || []).find((r) => r.purpose === purpose && r.currency === cur && r.status === 'confirmed' && (r.rate_quality || 'exact') === 'exact'
  && (r.currency_unit || 'current') === 'current' && r.market == null && String(r.period_month).slice(0, 10) === mk);

/**
 * بعد تأكيد إعداد الشهر: ماذا نسجّل بالأسعار الشهرية؟ لكل (غرض ∈ {payroll, delivery_accounting}) × عملة:
 *  insert = لا سعر مؤكَّد لهذا الشهر (أو يوجد تقريبي يُستبدَل بالمؤكَّد)؛ same = موجود بنفس القيمة؛ conflict = موجود بقيمة مختلفة (لا نكتب فوقه، نُنبّه).
 *  invalid = سعر الإعداد غير صالح (لا يُكتب).
 */
export function planWriteThrough(rows, { year, month, rates }) {
  const mk = setupMonthKey(year, month);
  const ops = [];
  for (const purpose of ['payroll', 'delivery_accounting']) {
    for (const cur of SETUP_CURRENCIES) {
      const rate = Number(rates?.[cur]);
      if (!Number.isFinite(rate) || rate <= 0) { ops.push({ purpose, currency: cur, rate: null, action: 'invalid' }); continue; }
      const ex = confirmedExact(rows, purpose, cur, mk);
      if (!ex) ops.push({ purpose, currency: cur, rate, action: 'insert', month: mk });
      else if (Math.abs(Number(ex.units_per_usd) - rate) < 1e-9) ops.push({ purpose, currency: cur, rate, action: 'same', month: mk });
      else ops.push({ purpose, currency: cur, rate, action: 'conflict', existing: Number(ex.units_per_usd), month: mk });
    }
  }
  return ops;
}

/** رسالة عربية موجزة لنتيجة الكتابة (results = [{op, ok, error?}]). */
export function summarizeWriteThrough(ops, results = []) {
  const done = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  const conflicts = ops.filter((o) => o.action === 'conflict');
  const parts = [];
  if (done) parts.push(`سُجّل ${done} سعراً شهرياً`);
  if (conflicts.length) parts.push(`⚠️ تعارض لم يُكتب فوقه: ${conflicts.map((c) => `${c.currency}/${c.purpose === 'payroll' ? 'رواتب' : 'تسليم'} (المسجَّل ${c.existing}، الإعداد ${c.rate})`).join('، ')}`);
  if (failed.length) parts.push(`⚠️ تعذّر تسجيل ${failed.length} سعراً شهرياً (${failed[0].error}) — الإعداد والرواتب لم تتأثر`);
  if (ops.some((o) => o.action === 'invalid')) parts.push('⚠️ سعر غير صالح لم يُسجَّل بالأسعار الشهرية');
  return parts.length ? parts.join(' · ') : 'الأسعار الشهرية مطابقة مسبقاً';
}

/**
 * يُستدعى بعد نجاح تأكيد إعداد الشهر. لا يرمي أبداً: يُرجع رسالة (نجاح/تنبيه) فقط. deps = { loadFx: () => {rows,error}, save: (args) => Promise }.
 */
export async function recordMonthlyRatesAfterSetup({ year, month, rates }, { loadFx, save }) {
  let fx;
  try { fx = await loadFx(); } catch (e) { return `⚠️ تعذّر قراءة الأسعار الشهرية (${e?.message || e}) — لم تُسجَّل`; }
  if (fx?.error) return `⚠️ تعذّر قراءة الأسعار الشهرية (${fx.error}) — لم تُسجَّل`;
  const ops = planWriteThrough(fx?.rows || [], { year, month, rates });
  const results = [];
  for (const op of ops.filter((o) => o.action === 'insert')) {
    try { await save({ purpose: op.purpose, currency: op.currency, month: op.month, rate: op.rate, quality: 'exact', note: 'من تأكيد إعداد شهر الرواتب' }); results.push({ op, ok: true }); }
    catch (e) { results.push({ op, ok: false, error: e?.message || String(e) }); }
  }
  return summarizeWriteThrough(ops, results);
}
