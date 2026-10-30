// =============================================================
// myTargetCalc — حساب تقدّم الموظف نحو هدفه الشهري (بطاقة «هدفي» بالصفحة الرئيسية). دوال بلا واجهة، مُختبَرة:
//   node test-my-target-calc.mjs
//
// قواعد (D-174):
//  - سعر الصرف يأتي حصراً من خريطة exchange_rates (قيمة العملة بالدولار). لا أسعار احتياطية ثابتة.
//  - طلب لا يتوفر سعر لعملته لا يُحوَّل ولا يُخمَّن: يُعدّ «غير محوَّل» ويُعلَن للمستخدم، والرقم يُعرض كحدّ أدنى.
//  - الإمارات خارج الهدف. تركيا: بالليرة كما هي. سوريا: بالدولار (USD كما هو، SYP عبر السعر).
// =============================================================

const cleanCur = (c) => String(c || '').trim().toUpperCase();
const isTryLike = (c) => /try|تركي|₺/i.test(c || '');

/** سعر العملة بالدولار من الخريطة، أو null إن لم يتوفر سعر صالح (لا قيمة احتياطية). */
export function rateOf(currency, rateMap) {
  const cur = cleanCur(currency);
  if (cur === 'USD') return 1;
  const r = Number(rateMap?.[cur]);
  return Number.isFinite(r) && r > 0 ? r : null;
}

/**
 * @param {Array<{amount,currency,market}>} orders  طلبات الموظف المسلَّمة هذا الشهر
 * @param {Object|null} rateMap  خريطة {SYP: usdPerUnit,...} أو null إن فشل التحميل
 * @returns {{syria:null|{val:number,unconverted:number,currencies:string[]}, turkey:null|{val:number,unconverted:number,currencies:string[]}}}
 */
export function computeMyTarget(orders, rateMap) {
  let syriaUsd = 0, turkeyTry = 0, hasSyria = false, hasTurkey = false;
  const un = { syria: { n: 0, cur: new Set() }, turkey: { n: 0, cur: new Set() } };

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
      const c = cur || 'SYP'; // الافتراضي التاريخي لطلب بلا عملة
      const r = rateOf(c, rateMap);
      if (r == null) { un.syria.n += 1; un.syria.cur.add(c); } else syriaUsd += amount * r;
    }
  }
  return {
    syria: hasSyria || !hasTurkey ? { val: syriaUsd, unconverted: un.syria.n, currencies: [...un.syria.cur] } : null,
    turkey: hasTurkey ? { val: turkeyTry, unconverted: un.turkey.n, currencies: [...un.turkey.cur] } : null,
  };
}

/** النسبة المعروضة: تقريب لأقرب عدد صحيح، وسقف 100. */
export function progressPct(val, target) {
  return target > 0 ? Math.min(100, Math.round((val / target) * 100)) : 0;
}
