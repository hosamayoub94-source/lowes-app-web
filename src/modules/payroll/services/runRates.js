// =============================================================
// Run exchange rates — D-090 البند 15 (29 أيلول 2026)
//
// سعر الصرف يدوي لكل دورة: سعر تركيا (1$ = ? ₺) وسعر سوريا (1$ = ? ل.س)
// يُدخلان يدوياً بـ«⚙️ إعداد الشهر» ويُحفظان مع الدورة فقط. لا سعر ثابت ولا
// افتراضي، ولا fallback إلى جدول exchange_rates أو أي سعر حي/قديم. سعر
// ناقص = الحسبة تتوقف ولا تُحفظ، والاعتماد ممنوع.
//
// يُطبَّق على دورة أيلول 2026 وما بعد فقط — الدورات الأقدم (ومنها مسودة
// آب) تبقى على مسارها الحالي كما هي (قرار حسام 29 أيلول 2026).
//
// لا اتصال بقاعدة البيانات هنا عمداً — دوال صِرفة قابلة للاختبار بـNode
// (scripts/test-payroll-run-rates.mjs).
// =============================================================

/** أول دورة للنظام الجديد: أيلول 2026 (YYYYMM). */
export const NEW_SYSTEM_START = 202609;

/** هل الدورة من النظام الجديد (أيلول 2026 وما بعد)؟ */
export function isNewSystemRun(run) {
  if (!run) return false;
  const y = Number(run.period_year);
  const m = Number(run.period_month);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return false;
  return y * 100 + m >= NEW_SYSTEM_START;
}

/** سعر صالح = رقم موجب فقط. الفارغ/الصفر/السالب/غير الرقمي → null. */
export function parseRate(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** يفحص سعرَي الدورة معاً ويرجّع أسماء الناقص منهما. */
export function validateRunRates(src) {
  const missing = [];
  if (!parseRate(src?.rate_usd_try)) missing.push('سعر تركيا (1$ = ? ₺)');
  if (!parseRate(src?.rate_usd_syp)) missing.push('سعر سوريا (1$ = ? ل.س)');
  return { ok: missing.length === 0, missing };
}

/**
 * خريطة { عملة → قيمة 1 وحدة بالدولار } من سعرَي الدورة فقط.
 * سعر ناقص/صفر/سالب → خطأ يوقف الحسبة قبل أي حفظ.
 */
export function buildRunRateMap(run) {
  const v = validateRunRates(run);
  if (!v.ok) {
    throw new Error(`⛔ سعر الصرف للدورة ناقص: ${v.missing.join('، ')} — أدخله يدوياً من «⚙️ إعداد الشهر». لم يُحفظ أي شيء.`);
  }
  return {
    USD: 1,
    TRY: 1 / parseRate(run.rate_usd_try),
    SYP: 1 / parseRate(run.rate_usd_syp),
  };
}

/**
 * true = إعداد الشهر (ومنه السعر) حُفظ بعد آخر حسبة لأحد البنود، أو لا
 * إعداد أصلاً → الاعتماد ممنوع حتى إعادة تشغيل الدورة.
 */
export function isRunStale(run, entries) {
  const setupAt = Date.parse(run?.month_setup_confirmed_at || '');
  if (!Number.isFinite(setupAt)) return true;
  return (entries || []).some(e => {
    const at = Date.parse(e?.computed_at || '');
    return !Number.isFinite(at) || at < setupAt;
  });
}
