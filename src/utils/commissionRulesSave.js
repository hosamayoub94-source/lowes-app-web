// =============================================================
// commissionRulesSave — حفظ قواعد العمولة/التارجت (جدول commission_rules) بفحص النتيجة. دوال بلا واجهة، مُختبَرة:
//   node test-commission-rules-save.mjs
//
// لماذا: كان المحرر يتجاهل نتيجة upsert/update فتظهر «تم الحفظ» حتى لو رفضت القاعدة، وUPDATE المحجوب بـRLS لا يُرجع
// خطأً بل 0 صف (صامت). هنا: كل نداء يُطلَب منه `.select('id')`، والخطأ أو 0 صف = فشل صريح برسالة مفهومة.
// أعمدة الصرف (try_per_usd / syp_per_usd) لا تُكتب من هذا المحرر (D-174: مصدر الصرف موحَّد، والقيم المخزّنة تبقى كما هي).
// =============================================================

export const RATE_COLUMNS = ['try_per_usd', 'syp_per_usd'];
const PERCENT_KEYS = ['prepaid_tier1_pct', 'prepaid_tier2_pct', 'above_target_pct', 'syria_above_target_pct'];
const AMOUNT_KEYS = ['monthly_target_try', 'prepaid_target_try', 'syria_target_usd'];

/** يتحقق من القيم قبل الإرسال: أرقام منتهية وغير سالبة، والنِّسب ≤ 100. يرمي Error برسالة عربية. */
export function validateRules(updated) {
  for (const k of [...AMOUNT_KEYS, ...PERCENT_KEYS]) {
    if (updated?.[k] == null) continue;
    const v = Number(updated[k]);
    if (!Number.isFinite(v) || v < 0) throw new Error('قيمة غير صالحة: يجب أن تكون الأرقام صفراً أو أكبر.');
    if (PERCENT_KEYS.includes(k) && v > 100) throw new Error('النسبة المئوية لا تتجاوز 100.');
  }
}

/** يبني صفّي الجدول: تركيا (upsert) وسوريا (update جزئي). لا أعمدة صرف. */
export function buildRulesPayload(updated, actor, now = new Date()) {
  const { syria_target_usd, syria_above_target_pct, ...rest } = updated || {};
  const turkey = { ...rest };
  for (const k of RATE_COLUMNS) delete turkey[k];
  Object.assign(turkey, { id: 'turkey', updated_at: now.toISOString(), updated_by: actor });
  const syria = {};
  if (syria_target_usd != null) syria.monthly_target_usd = Number(syria_target_usd);
  if (syria_above_target_pct != null) syria.above_target_pct = Number(syria_above_target_pct);
  return { turkey, syria };
}

/** رسالة عربية مفهومة من خطأ قاعدة البيانات. */
export function describeSaveError(e) {
  const m = String(e?.message || e || '');
  const code = e?.code || '';
  if (code === '42501' || /row-level security|permission denied/i.test(m)) return 'لا صلاحية لتعديل قواعد العمولة بحسابك.';
  if (e?.noRows) return 'لم يُحفظ أي تغيير (غالباً لا صلاحية، أو الصف غير موجود).';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'تعذّر الاتصال بالخادم — لم يُحفظ شيء، أعد المحاولة.';
  return m || 'تعذّر الحفظ.';
}

const noRows = (what) => Object.assign(new Error(`${what}: لم يُحفظ أي تغيير`), { noRows: true });

/**
 * يحفظ القواعد. يرمي Error (برسالة عربية جاهزة للعرض) إذا فشلت أي خطوة؛ يُرجع الصفوف المكتوبة عند النجاح.
 * الترتيب: تركيا ثم سوريا. لو نجحت الأولى وفشلت الثانية تُذكر الحالة صراحةً (حفظ جزئي).
 */
export async function saveCommissionRules(supabase, updated, actor) {
  validateRules(updated);
  const { turkey, syria } = buildRulesPayload(updated, actor);

  const a = await supabase.from('commission_rules').upsert(turkey).select('id');
  if (a.error) throw new Error(describeSaveError(a.error));
  if (!a.data?.length) throw new Error(describeSaveError(noRows('تركيا')));

  if (Object.keys(syria).length) {
    const b = await supabase.from('commission_rules').update(syria).eq('id', 'syria').select('id');
    if (b.error) throw new Error(`حُفظت إعدادات تركيا، لكن فشل حفظ سوريا: ${describeSaveError(b.error)}`);
    if (!b.data?.length) throw new Error(`حُفظت إعدادات تركيا، لكن لم يُحفظ تغيير سوريا: ${describeSaveError(noRows('سوريا'))}`);
  }
  return { turkey, syria };
}
