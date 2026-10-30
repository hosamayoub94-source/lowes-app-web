// =============================================================
// myTargetCalc — حساب تقدّم الموظف نحو هدفه الشهري (بطاقة «هدفي» بالصفحة الرئيسية). دوال بلا واجهة، مُختبَرة:
//   node test-my-target-calc.mjs
//
// قواعد (D-174 / S3c، قرار D7):
//  - سعر الصرف = سعر الشهر لمحاسبة التسليم من fx_monthly_rates (مصدر واحد مع شاشات المبيعات)، لا سعر «اليوم» ولا قيمة احتياطية بالكود.
//  - سعر الشهر المؤكَّد ⇒ رقم عادي. سعر تقريبي معتمد أو مُرحَّل من شهر سابق ⇒ يُحسب «تقديرياً» ويُعلَن (لا يُعرض كمؤكَّد).
//  - لا سعر، أو مبلغ بوحدة قديمة/مشبوهة ⇒ «غير محوَّل»: لا يدخل الرقم ويُعلَن، والرقم يُعرض كحدّ أدنى.
//  - الإمارات خارج الهدف. تركيا: بالليرة كما هي بلا تحويل. سوريا: USD كما هو، SYP عبر سعر الشهر.
// =============================================================
import { convertToUsd, monthKey } from './fxResolve.js';

const cleanCur = (c) => String(c || '').trim().toUpperCase();
const isTryLike = (c) => /try|تركي|₺/i.test(c || '');

/**
 * @param {Array<{amount,currency,market,order_date?}>} orders  طلبات الموظف المسلَّمة هذا الشهر
 * @param {{rows:Array,units:Array}|null} fx  أسعار الشهر (من fxRatesService) أو null إن فشل التحميل
 * @param {{month?:string|Date}} [opts]  الشهر المحاسَب (الافتراضي: شهر اليوم بتوقيت إسطنبول)
 */
export function computeMyTarget(orders, fx, { month = new Date() } = {}) {
  const mk = monthKey(month);
  let syriaUsd = 0, estUsd = 0, turkeyTry = 0, hasSyria = false, hasTurkey = false;
  const un = { syria: { n: 0, cur: new Set() }, turkey: { n: 0, cur: new Set() } };
  const est = { n: 0, approximate: 0, carriedFrom: new Set() };

  for (const o of orders || []) {
    if (o.market === 'uae') continue; // بلا هدف/عمولة (قرار 27 أيلول 2026)
    const amount = Number(o.amount) || 0;
    const cur = cleanCur(o.currency);
    const isTurkey = o.market === 'turkey' || isTryLike(o.currency);
    if (isTurkey) {
      hasTurkey = true;
      if (cur === '' || cur === 'TRY' || isTryLike(o.currency)) turkeyTry += amount;
      else { un.turkey.n += 1; un.turkey.cur.add(cur); } // عملة غير الليرة بطلب تركي: لا تُجمع على أنها ليرة
    } else {
      hasSyria = true;
      const c = cleanCur(o.currency) || 'SYP'; // الافتراضي التاريخي لطلب بلا عملة
      const r = convertToUsd({ amount: o.amount, currency: c, date: mk, unitDate: o.order_date || mk, purpose: 'delivery_accounting' }, fx?.rows || [], fx?.units || []);
      if (r.status === 'ok') syriaUsd += r.usd;
      else if (r.status === 'approximate') { estUsd += r.usd; est.n += 1; est.approximate += 1; }
      else if (r.status === 'carried') { estUsd += r.usd; est.n += 1; est.carriedFrom.add(String(r.periodMonth).slice(0, 7)); }
      else { un.syria.n += 1; un.syria.cur.add(c); } // missing | unit_legacy | unit_suspect | invalid
    }
  }
  return {
    syria: hasSyria || !hasTurkey
      ? { val: syriaUsd + estUsd, confirmed: syriaUsd, estimated: estUsd, estimatedN: est.n, approximateN: est.approximate, carriedFrom: [...est.carriedFrom], unconverted: un.syria.n, currencies: [...un.syria.cur] }
      : null,
    turkey: hasTurkey ? { val: turkeyTry, confirmed: turkeyTry, estimated: 0, estimatedN: 0, approximateN: 0, carriedFrom: [], unconverted: un.turkey.n, currencies: [...un.turkey.cur] } : null,
  };
}

/** النسبة المعروضة: تقريب لأقرب عدد صحيح، وسقف 100. */
export function progressPct(val, target) {
  return target > 0 ? Math.min(100, Math.round((val / target) * 100)) : 0;
}
