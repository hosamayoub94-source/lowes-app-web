/* global process */
// اختبار حفظ قواعد العمولة (src/utils/commissionRulesSave.js) بعميل Supabase وهمي. run: node test-commission-rules-save.mjs
import { saveCommissionRules, buildRulesPayload, validateRules, describeSaveError, RATE_COLUMNS } from './src/utils/commissionRulesSave.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('FAIL', m); } };
const rejects = async (p) => { try { await p; return null; } catch (e) { return e.message; } };

// عميل وهمي: نتيجة كل نداء قابلة للضبط، ويسجّل ما أُرسل
function mockClient({ upsert = { data: [{ id: 'turkey' }], error: null }, update = { data: [{ id: 'syria' }], error: null } } = {}) {
  const calls = [];
  return {
    calls,
    from: (t) => ({
      upsert: (row) => { calls.push({ op: 'upsert', t, row }); return { select: async () => upsert }; },
      update: (row) => ({ eq: (c, v) => { calls.push({ op: 'update', t, row, c, v }); return { select: async () => update }; } }),
    }),
  };
}
const draft = { id: 'turkey', monthly_target_try: 70000, prepaid_target_try: 15000, prepaid_tier1_pct: 5, prepaid_tier2_pct: 10, above_target_pct: 5,
  try_per_usd: 47, syp_per_usd: 130, syria_target_usd: 1000, syria_above_target_pct: 10, created_at: '2026-06-01' };

// 1) نجاح: يكتب الصفّين، ولا يكتب أعمدة الصرف أبداً
{
  const c = mockClient();
  const r = await saveCommissionRules(c, draft, 'حسام');
  ok(c.calls.length === 2, 'نداءان: upsert لتركيا ثم update لسوريا');
  ok(c.calls[0].op === 'upsert' && c.calls[0].row.id === 'turkey' && c.calls[0].row.updated_by === 'حسام', 'upsert لتركيا مع المُحدِّث');
  ok(RATE_COLUMNS.every((k) => !(k in c.calls[0].row) && !(k in c.calls[1].row)), 'أعمدة الصرف لا تُرسَل (D-174)');
  ok(c.calls[0].row.monthly_target_try === 70000 && c.calls[0].row.above_target_pct === 5, 'قيم التارجت/النسب تُرسَل');
  ok(!('syria_target_usd' in c.calls[0].row) && !('syria_above_target_pct' in c.calls[0].row), 'مفاتيح سوريا الافتراضية لا تدخل صف تركيا');
  ok(c.calls[1].row.monthly_target_usd === 1000 && c.calls[1].row.above_target_pct === 10 && c.calls[1].c === 'id' && c.calls[1].v === 'syria', 'update لصف سوريا بقيمه');
  ok(r.turkey.id === 'turkey', 'يُرجع الصفوف المكتوبة');
}
// 2) رفض بخطأ RLS لتركيا ← فشل صريح، ولا يحاول سوريا
{
  const c = mockClient({ upsert: { data: null, error: { code: '42501', message: 'new row violates row-level security policy for table "commission_rules"' } } });
  const m = await rejects(saveCommissionRules(c, draft, 'x'));
  ok(m && /لا صلاحية/.test(m), 'رفض RLS يظهر برسالة «لا صلاحية»: ' + m);
  ok(c.calls.length === 1, 'لا يتابع لسوريا بعد فشل تركيا');
}
// 3) UPDATE محجوب بصمت (0 صف بلا خطأ) = فشل، لا نجاح كاذب
{
  const c = mockClient({ upsert: { data: [], error: null } });
  const m = await rejects(saveCommissionRules(c, draft, 'x'));
  ok(m && /لم يُحفظ/.test(m), '0 صف عند تركيا = فشل صريح: ' + m);
}
{
  const c = mockClient({ update: { data: [], error: null } });
  const m = await rejects(saveCommissionRules(c, draft, 'x'));
  ok(m && /حُفظت إعدادات تركيا/.test(m) && /لم يُحفظ/.test(m), '0 صف عند سوريا = فشل جزئي مُعلَن: ' + m);
}
// 4) خطأ بالصف الثاني = حفظ جزئي معلَن
{
  const c = mockClient({ update: { data: null, error: { code: '42501', message: 'permission denied for table commission_rules' } } });
  const m = await rejects(saveCommissionRules(c, draft, 'x'));
  ok(m && /حُفظت إعدادات تركيا، لكن فشل حفظ سوريا/.test(m) && /لا صلاحية/.test(m), 'فشل سوريا بعد نجاح تركيا يُذكر صراحةً: ' + m);
}
// 5) انقطاع الشبكة
ok(/تعذّر الاتصال/.test(describeSaveError(new TypeError('Failed to fetch'))), 'رسالة الشبكة مفهومة');
// 6) التحقق من القيم
for (const bad of [{ ...draft, monthly_target_try: -1 }, { ...draft, above_target_pct: 150 }, { ...draft, syria_above_target_pct: NaN }, { ...draft, prepaid_tier1_pct: 'abc' }]) {
  const c = mockClient();
  const m = await rejects(saveCommissionRules(c, bad, 'x'));
  ok(m && c.calls.length === 0, 'قيمة غير صالحة تُرفَض قبل أي إرسال: ' + m);
}
ok((() => { try { validateRules({ ...draft }); return true; } catch { return false; } })(), 'القيم الصحيحة تمرّ');
// 7) سوريا بلا قيم = لا update
{
  const c = mockClient();
  await saveCommissionRules(c, { id: 'turkey', monthly_target_try: 1 }, 'x');
  ok(c.calls.length === 1, 'بلا مفاتيح سوريا لا يُنفَّذ update فارغ');
}
ok(Object.keys(buildRulesPayload({ ...draft }, 'x').turkey).includes('created_at'), 'باقي أعمدة الصف الأصلي تُحفظ كما كانت');

console.log(`\nنتيجة: ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
