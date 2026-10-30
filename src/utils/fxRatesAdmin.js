// =============================================================
// fxRatesAdmin — منطق شاشة الأسعار الشهرية للأدمن (S3a). دوال نقية بلا واجهة، مُختبَرة:
//   node test-fx-admin.mjs
// لا قيم افتراضية للأسعار هنا. حدود «المعقولية» حاجز ضد أخطاء الإدخال (مثل 13000 بدل 130) لا سعر مفترض.
// =============================================================
import { resolveRate, monthKey } from './fxResolve.js';

export const FX_CURRENCIES = ['TRY', 'SYP', 'AED'];
export const FX_PURPOSES = [
  ['delivery_accounting', 'محاسبة التسليمات'],
  ['payroll', 'الرواتب'],
  ['commission', 'العمولات'],
];
// عملات كل غرض: الرواتب تجمّد TRY وSYP فقط (الإمارات بلا هدف/عمولة) — لا تذكير ولا خلايا «لا سعر» للدرهم هناك.
export const PURPOSE_CURRENCIES = { delivery_accounting: ['TRY', 'SYP', 'AED'], payroll: ['TRY', 'SYP'], commission: ['TRY', 'SYP'] };
export const currenciesFor = (purpose) => PURPOSE_CURRENCIES[purpose] || FX_CURRENCIES;
export const PURPOSE_LABEL = Object.fromEntries([...FX_PURPOSES, ['profitability', 'الربحية (جدولها الخاص)']]);

// نطاق مقبول للإدخال: خارجه يُرفض (خطأ مرجَّح بالوحدة/الفاصلة). داخل نطاق أضيق يُحذَّر فقط.
const HARD = { TRY: [5, 500], SYP: [10, 1000], AED: [3, 5] };
const SOFT = { TRY: [20, 200], SYP: [50, 400], AED: [3.6, 3.75] };

/** أول الشهر 'YYYY-MM-01' لشهر اليوم بتوقيت إسطنبول. */
export const currentMonthKey = (now = new Date()) => monthKey(now);

/** n شهراً تنازلياً ابتداءً من month ('YYYY-MM-01'). */
export function monthsBack(n, month = currentMonthKey()) {
  const [y, m] = month.slice(0, 7).split('-').map(Number);
  return Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(y, m - 1 - i, 1)); return d.toISOString().slice(0, 10); });
}

/** تحقق من مدخلات نموذج الإدخال. {ok, errors[], warnings[]} */
export function validateRateInput({ purpose, currency, month, rate, quality = 'exact' }) {
  const errors = []; const warnings = [];
  if (!FX_PURPOSES.some(([p]) => p === purpose)) errors.push('غرض غير مدعوم (الربحية لها جدولها الخاص).');
  if (!FX_CURRENCIES.includes(currency)) errors.push('عملة غير مدعومة.');
  else if (FX_PURPOSES.some(([p]) => p === purpose) && !currenciesFor(purpose).includes(currency)) errors.push(`${currency} غير مستعملة لغرض ${PURPOSE_LABEL[purpose]}.`);
  if (!/^\d{4}-\d{2}(-01)?$/.test(String(month || ''))) errors.push('شهر غير صالح.');
  const r = Number(rate);
  if (rate === '' || rate == null || !Number.isFinite(r) || r <= 0) errors.push('أدخل سعراً موجباً (وحدات العملة لكل 1 دولار).');
  else if (HARD[currency] && (r < HARD[currency][0] || r > HARD[currency][1])) {
    errors.push(currency === 'SYP' && r > HARD.SYP[1] ? 'السعر يبدو بوحدات الليرة السورية القديمة (قسمه على 100).' : `السعر خارج المعقول لـ${currency} (${HARD[currency][0]}–${HARD[currency][1]}).`);
  } else if (SOFT[currency] && (r < SOFT[currency][0] || r > SOFT[currency][1])) warnings.push(`السعر خارج المعتاد لـ${currency} — تأكد منه.`);
  if (!['exact', 'approximate'].includes(quality)) errors.push('جودة غير صالحة.');
  return { ok: errors.length === 0, errors, warnings };
}

/** العملات التي ينقصها سعر مؤكَّد (exact) لهذا الشهر نفسه بالضبط لهذا الغرض. */
export function missingExactForMonth(rows, purpose, month, currencies = FX_CURRENCIES) {
  const mk = monthKey(month);
  return currencies.filter((c) => !(rows || []).some((r) => r.purpose === purpose && r.currency === c && r.status === 'confirmed' && (r.rate_quality || 'exact') === 'exact'
    && (r.currency_unit || 'current') === 'current' && r.market == null && String(r.period_month).slice(0, 10) === mk));
}

/** شبكة العرض: لكل شهر وعملة: السعر وحالته (exact|approximate|carried|missing) ومصدر الترحيل. */
export function buildMonthlyGrid(rows, purpose, months, currencies = FX_CURRENCIES) {
  return months.map((month) => ({
    month,
    cells: Object.fromEntries(currencies.map((cur) => {
      const r = resolveRate(rows, { purpose, currency: cur, month });
      if (!r) return [cur, { state: 'missing' }];
      const state = r.exact ? (r.quality === 'approximate' ? 'approximate' : 'exact') : 'carried';
      return [cur, { state, rate: r.unitsPerUsd, from: r.exact ? null : r.periodMonth, source: r.source }];
    })),
  }));
}

/**
 * اتساق مع الجدول القديم (exchange_rates الذي تقرؤه الشاشات غير المنقولة): سعر الشهر الحالي لمحاسبة التسليم مقابل آخر USD→X قديم.
 * legacyLatest = [{from_cur,to_cur,rate}] الأحدث لكل زوج. يُرجع الفروق فقط.
 */
export function legacyConsistency(rows, legacyLatest, month = currentMonthKey(), currencies = FX_CURRENCIES) {
  const out = [];
  for (const cur of currencies) {
    const r = resolveRate(rows, { purpose: 'delivery_accounting', currency: cur, month });
    const old = (legacyLatest || []).find((x) => x.from_cur === 'USD' && x.to_cur === cur);
    if (!r || !r.exact || r.quality !== 'exact' || !old) continue;
    if (Math.abs(Number(old.rate) - r.unitsPerUsd) > 1e-9) out.push({ currency: cur, monthly: r.unitsPerUsd, legacy: Number(old.rate) });
  }
  return out;
}
