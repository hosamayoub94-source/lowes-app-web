// =============================================================
// اختبارات D-090 البند 15 — سعر الصرف اليدوي لكل دورة (محلي بالكامل).
//
//   node scripts/test-payroll-run-rates.mjs
//
// (1) دوال runRates.js الصِّرفة.
// (2) payrollEngine.js مُجمَّع بـesbuild مع Supabase وهمي يسجّل كل نداء —
//     لا اتصال بأي قاعدة بيانات، ولا كتابة حقيقية. يتحقق أن:
//       • دورة أيلول 2026+ بسعر ناقص/صفر تتوقف قبل أي نداء للقاعدة؛
//       • دورة أيلول 2026+ لا تقرأ exchange_rates أبداً وتحسب بسعر الدورة؛
//       • عملة بلا سعر بالدورة ← توقف بلا أي upsert؛
//       • الدورات قبل أيلول ما زالت على المسار القديم (exchange_rates + سعر
//         الدورة إن وُجد) ولا يصل `_rateMissing` للقاعدة.
// =============================================================
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

let pass = 0, fail = 0;
function ok(cond, name, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
}
async function throwsAsync(fn) {
  try { await fn(); return null; } catch (e) { return e; }
}
const near = (a, b) => Math.abs(a - b) < 0.011;

// ── (1) runRates.js ───────────────────────────────────────────
const R = await import(pathToFileURL(join(SRC, 'modules/payroll/services/runRates.js')).href);
console.log('\n[1] runRates.js');

ok(R.parseRate('') === null, "parseRate('') = null");
ok(R.parseRate(null) === null, 'parseRate(null) = null');
ok(R.parseRate(undefined) === null, 'parseRate(undefined) = null');
ok(R.parseRate(0) === null, 'parseRate(0) = null');
ok(R.parseRate('0') === null, "parseRate('0') = null");
ok(R.parseRate(-5) === null, 'parseRate(-5) = null');
ok(R.parseRate('abc') === null, "parseRate('abc') = null");
ok(R.parseRate(NaN) === null, 'parseRate(NaN) = null');
ok(R.parseRate(Infinity) === null, 'parseRate(Infinity) = null');
ok(R.parseRate('46.8') === 46.8, "parseRate('46.8') = 46.8");
ok(R.parseRate(48) === 48, 'parseRate(48) = 48');

{
  const both = R.validateRunRates({});
  ok(!both.ok && both.missing.length === 2, 'validateRunRates: الاثنان ناقصان');
  const oneTry = R.validateRunRates({ rate_usd_try: 48, rate_usd_syp: 0 });
  ok(!oneTry.ok && oneTry.missing.length === 1 && oneTry.missing[0].includes('سوريا'), 'validateRunRates: سوريا صفر → ناقص');
  const oneSyp = R.validateRunRates({ rate_usd_try: -1, rate_usd_syp: 131 });
  ok(!oneSyp.ok && oneSyp.missing[0].includes('تركيا'), 'validateRunRates: تركيا سالب → ناقص');
  ok(R.validateRunRates({ rate_usd_try: '48', rate_usd_syp: '131' }).ok, 'validateRunRates: السعران صالحان');
  ok(!R.validateRunRates(null).ok, 'validateRunRates(null) → ناقص');
}

ok(R.buildRunRateMap.length === 1, 'buildRunRateMap موجودة');
ok(!!(() => { try { R.buildRunRateMap({ rate_usd_try: null, rate_usd_syp: 131 }); return null; } catch (e) { return e; } })(),
  'buildRunRateMap: سعر ناقص → يرمي');
ok(!!(() => { try { R.buildRunRateMap({ rate_usd_try: 48, rate_usd_syp: 0 }); return null; } catch (e) { return e; } })(),
  'buildRunRateMap: سعر صفر → يرمي');
{
  const m = R.buildRunRateMap({ rate_usd_try: 50, rate_usd_syp: 125 });
  ok(m.USD === 1 && m.TRY === 1 / 50 && m.SYP === 1 / 125 && Object.keys(m).length === 3,
    'buildRunRateMap: الخريطة = USD/TRY/SYP من سعرَي الدورة فقط');
}

ok(!R.isNewSystemRun({ period_year: 2026, period_month: 8 }), 'isNewSystemRun(آب 2026) = false');
ok(!R.isNewSystemRun({ period_year: 2026, period_month: 7 }), 'isNewSystemRun(تموز 2026) = false');
ok(R.isNewSystemRun({ period_year: 2026, period_month: 9 }), 'isNewSystemRun(أيلول 2026) = true');
ok(R.isNewSystemRun({ period_year: '2026', period_month: '10' }), "isNewSystemRun('2026','10') = true");
ok(R.isNewSystemRun({ period_year: 2027, period_month: 1 }), 'isNewSystemRun(كانون الثاني 2027) = true');
ok(!R.isNewSystemRun(null), 'isNewSystemRun(null) = false');
ok(!R.isNewSystemRun({}), 'isNewSystemRun({}) = false');

{
  const run = { month_setup_confirmed_at: '2026-10-01T10:00:00Z' };
  ok(R.isRunStale({}, []), 'isRunStale: بلا إعداد → stale');
  ok(!R.isRunStale(run, []), 'isRunStale: إعداد بلا بنود → ليس stale');
  ok(!R.isRunStale(run, [{ computed_at: '2026-10-01T10:05:00Z' }]), 'isRunStale: كل البنود بعد الإعداد → سليم');
  ok(R.isRunStale(run, [{ computed_at: '2026-10-01T10:05:00Z' }, { computed_at: '2026-10-01T09:00:00Z' }]), 'isRunStale: بند قبل الإعداد → stale');
  ok(R.isRunStale(run, [{ computed_at: null }]), 'isRunStale: بند بلا computed_at → stale');
}

// ── (2) payrollEngine.js مع Supabase وهمي ─────────────────────
const tmp = mkdtempSync(join(tmpdir(), 'payroll-rates-test-'));
const stubPath = join(tmp, 'supabase-stub.mjs');
writeFileSync(stubPath, `
function builder(table) {
  const st = globalThis.__stub;
  const q = { table, op: 'select', filters: [], payload: null };
  st.calls.push(q);
  const api = {
    select() { return api; },
    eq(c, v) {
      if (st.throwOnEq && st.throwOnEq(table, c, v)) throw new Error('stub: injected failure');
      q.filters.push(['eq', c, v]); return api;
    },
    neq(c, v) { q.filters.push(['neq', c, v]); return api; },
    in(c, v) { q.filters.push(['in', c, v]); return api; },
    gte() { return api; }, lt() { return api; }, lte() { return api; },
    or() { return api; }, order() { return api; }, range() { return api; },
    upsert(row) { q.op = 'upsert'; q.payload = row; return api; },
    single() { return api; }, maybeSingle() { return api; },
    then(res, rej) {
      if (q.op === 'upsert' && st.failUpsert) {
        return Promise.resolve({ data: null, error: { message: 'stub: network error' } }).then(res, rej);
      }
      if (q.op === 'select' && st.errorTables?.includes(table)) {
        return Promise.resolve({ data: null, error: { message: 'stub: fetch failed (' + table + ')' } }).then(res, rej);
      }
      let data;
      if (q.op === 'upsert') {
        data = Array.isArray(q.payload)
          ? q.payload.map((r, i) => ({ id: 'e-' + i, ...r }))
          : { id: 'e-' + st.calls.length, ...q.payload };
      } else data = st.data(q);
      return Promise.resolve({ data, error: null }).then(res, rej);
    },
  };
  return api;
}
export const supabase = { from: builder };
export const supabaseAnon = { from: builder };
`);

const aliasPlugin = {
  name: 'alias',
  setup(b) {
    b.onResolve({ filter: /^@services\/supabase$/ }, () => ({ path: stubPath }));
    b.onResolve({ filter: /^@utils\/(.+)$/ }, a => ({ path: join(SRC, 'utils', a.path.replace('@utils/', '') + '.js') }));
  },
};
const outfile = join(tmp, 'engine.bundle.mjs');
await build({
  entryPoints: [join(SRC, 'modules/payroll/services/payrollEngine.js')],
  bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
  plugins: [aliasPlugin],
  define: { 'import.meta.env': '{"VITE_USE_MOCK_PAYROLL":"false","VITE_USE_MOCK_ATTENDANCE":"false"}' },
});
const E = await import(pathToFileURL(outfile).href);

// بيانات وهمية: بائعة تركية (أساسي $130) مبيعاتها ₺10,000 + موظف معفى.
function setStub({ salaryCurrency = null, failUpsert = false, throwOnEq = null, errorTables = [] } = {}) {
  globalThis.__stub = {
    calls: [], failUpsert, throwOnEq, errorTables,
    data(q) {
      switch (q.table) {
        case 'profiles': return [
          { id: 'emp-t', employee_name: 'Test Seller', role_type: 'employee', is_active: true, seller_alias: null,
            team: 'تركيا', base_salary_usd: 130, housing_allowance_usd: 0, transport_allowance_usd: 0,
            commission_pct: 0, payroll_commission_exempt: false, join_date: null, resigned_at: null },
          { id: 'emp-x', employee_name: 'Test Exempt', role_type: 'employee', is_active: true, seller_alias: null,
            team: null, base_salary_usd: 200, housing_allowance_usd: 0, transport_allowance_usd: 0,
            commission_pct: 0, payroll_commission_exempt: true, join_date: null, resigned_at: null },
        ];
        case 'employee_salary_settings': return salaryCurrency
          ? [{ employee_id: 'emp-x', base_salary: 200, currency: salaryCurrency, internet_allowance: 0, food_allowance: 0, sales_commission_pct: 0, is_active: true }]
          : [];
        case 'orders': {
          const isReturns = q.filters.some(f => f[0] === 'eq' && f[1] === 'status');
          return isReturns ? [] : [{ handler_name: 'Test Seller', amount: 10000, currency: 'TRY', status: 'delivered', market: 'turkey', payment_method: 'cod', order_id: 'T-1' }];
        }
        case 'exchange_rates': return [{ from_cur: 'USD', to_cur: 'TRY', rate: 46.8 }];
        default: return [];
      }
    },
  };
  return globalThis.__stub;
}
const tables = st => st.calls.map(c => c.table);
const upsertCalls = st => st.calls.filter(c => c.op === 'upsert');
const upserts = st => upsertCalls(st).flatMap(c => (Array.isArray(c.payload) ? c.payload : [c.payload]));
const run = (y, m, extra = {}) => ({ id: 'run-x', period_year: y, period_month: m, status: 'draft',
  month_setup_confirmed_at: '2026-10-01T00:00:00Z', ...extra });

console.log('\n[2] runPayrollForMonth — دورة أيلول 2026 وما بعد');
for (const [label, extra] of [
  ['السعران ناقصان', { rate_usd_try: null, rate_usd_syp: null }],
  ['سعر تركيا صفر', { rate_usd_try: 0, rate_usd_syp: 131 }],
  ['سعر سوريا سالب', { rate_usd_try: 50, rate_usd_syp: -1 }],
  ['إعداد الشهر غير مؤكَّد', { rate_usd_try: 50, rate_usd_syp: 131, month_setup_confirmed_at: null }],
]) {
  const st = setStub();
  const err = await throwsAsync(() => E.runPayrollForMonth({ runId: 'run-x', year: 2026, month: 9, run: run(2026, 9, extra) }));
  ok(!!err && st.calls.length === 0, `${label} → توقف قبل أي نداء للقاعدة`, `calls=${st.calls.length} err=${err?.message}`);
}
{
  const st = setStub();
  const res = await E.runPayrollForMonth({ runId: 'run-x', year: 2026, month: 9, run: run(2026, 9, { rate_usd_try: 50, rate_usd_syp: 125 }) });
  const ups = upserts(st);
  const seller = ups.find(u => u.employee_id === 'emp-t');
  ok(!tables(st).includes('exchange_rates'), 'سعر صالح → لا قراءة لـexchange_rates إطلاقاً');
  ok(res.count === 2 && ups.length === 2, 'سعر صالح → بندان محفوظان', `count=${res.count}`);
  // نقص ₺55,000 × 10% = ₺5,500 ÷ 50 = $110
  ok(seller && near(seller.shortfall_deduction_usd, 110), 'حسم النقص محسوب بسعر الدورة (50) = $110', `got ${seller?.shortfall_deduction_usd}`);
  ok(ups.every(u => !('_rateMissing' in u)), '`_rateMissing` لا يصل للقاعدة');
  const firstUpsert = st.calls.findIndex(c => c.op === 'upsert');
  const lastRead = st.calls.map(c => c.op).lastIndexOf('select');
  ok(firstUpsert > lastRead, 'كل الحسبة بالذاكرة قبل أول حفظ');
}
{
  const st = setStub({ salaryCurrency: 'EUR' });
  const err = await throwsAsync(() => E.runPayrollForMonth({ runId: 'run-x', year: 2026, month: 9, run: run(2026, 9, { rate_usd_try: 50, rate_usd_syp: 125 }) }));
  ok(!!err && upserts(st).length === 0, 'عملة بلا سعر بالدورة (EUR) → توقف بلا أي حفظ', `upserts=${upserts(st).length}`);
  ok(!tables(st).includes('exchange_rates'), 'ولا fallback لـexchange_rates حتى عند العملة الناقصة');
}
{
  const st = setStub();
  await E.runPayrollForMonth({ runId: 'run-x', year: 2026, month: 10, run: run(2026, 10, { rate_usd_try: 50, rate_usd_syp: 125 }) });
  ok(!tables(st).includes('exchange_rates'), 'تشرين الأول 2026 أيضاً على المسار الجديد');
}

console.log('\n[2ب] الحفظ الذرّي all-or-nothing — دورة أيلول 2026 وما بعد');
const goodRun = () => run(2026, 9, { rate_usd_try: 50, rate_usd_syp: 125 });
{
  const st = setStub();
  const res = await E.runPayrollForMonth({ runId: 'run-x', year: 2026, month: 9, run: goodRun() });
  const calls = upsertCalls(st);
  ok(calls.length === 1 && Array.isArray(calls[0].payload) && calls[0].payload.length === 2,
    'كل البنود تُحفظ بطلب upsert واحد (جملة SQL واحدة)', `requests=${calls.length}`);
  const keySets = calls[0].payload.map(r => Object.keys(r).sort().join(','));
  ok(new Set(keySets).size === 1, 'كل البنود بنفس الأعمدة (لا عمود يُملأ null بالغلط)');
  ok(calls[0].payload.every(r => !('employee_name' in r) && !('_rateMissing' in r)),
    'لا حقول عرض/داخلية بطلب الحفظ');
  ok(res.count === 2 && res.entries.every(e => e.employee_name), 'النتيجة ترجع بأسماء الموظفين للعرض');
}
{
  const st = setStub({ failUpsert: true });
  const err = await throwsAsync(() => E.runPayrollForMonth({ runId: 'run-x', year: 2026, month: 9, run: goodRun() }));
  ok(!!err && upsertCalls(st).length === 1, 'فشل الحفظ (شبكة/قاعدة) → خطأ ظاهر، ومحاولة حفظ واحدة فقط (لا حفظ جزئي)',
    `err=${err?.message}`);
}
{
  // حسبة موظف واحد تفشل (خطأ بجلب سلفه) → لا يُحفظ أي بند.
  const st = setStub({ throwOnEq: (t, c, v) => t === 'employee_requests' && c === 'employee_id' && v === 'emp-t' });
  const err = await throwsAsync(() => E.runPayrollForMonth({ runId: 'run-x', year: 2026, month: 9, run: goodRun() }));
  ok(!!err && upsertCalls(st).length === 0, 'تعذّرت حسبة موظف واحد → لا يُحفظ أي بند', `err=${err?.message} upserts=${upsertCalls(st).length}`);
}
{
  const st = setStub({ throwOnEq: (t, c, v) => t === 'employee_requests' && c === 'employee_id' && v === 'emp-t' });
  const res = await E.runPayrollForMonth({ runId: 'run-a', year: 2026, month: 8, run: run(2026, 8, { rate_usd_try: 48, rate_usd_syp: 131 }) });
  ok(res.count === 1 && upsertCalls(st).length === 1 && res.errors.length === 1,
    'آب بنفس الفشل: السلوك القديم كما هو (يحفظ الباقي ويبلّغ)');
}

console.log('\n[2ج] فشل جلب البيانات الأساسية — دورة أيلول 2026 وما بعد');
for (const [label, table, needle] of [
  ['فشل جلب المبيعات', 'orders', 'المبيعات'],
  ['فشل جلب إعدادات الرواتب', 'employee_salary_settings', 'إعدادات الرواتب'],
]) {
  const st = setStub({ errorTables: [table] });
  const err = await throwsAsync(() => E.runPayrollForMonth({ runId: 'run-x', year: 2026, month: 9, run: goodRun() }));
  ok(!!err && err.message.includes(needle), `${label} → الحسبة تتوقف بخطأ ظاهر`, `err=${err?.message}`);
  ok(upsertCalls(st).length === 0, `${label} → عدد عمليات الحفظ = 0`, `upserts=${upsertCalls(st).length}`);
}
console.log('\n[2د] نفس الفشل على الدورات القديمة — السلوك القديم كما هو');
for (const [label, table, needle] of [
  ['آب: فشل جلب المبيعات', 'orders', 'تعذّر جلب المبيعات'],
  ['آب: فشل جلب إعدادات الرواتب', 'employee_salary_settings', 'تعذّر جلب إعدادات الرواتب'],
]) {
  const st = setStub({ errorTables: [table] });
  const res = await E.runPayrollForMonth({ runId: 'run-a', year: 2026, month: 8, run: run(2026, 8, { rate_usd_try: 48, rate_usd_syp: 131 }) });
  ok(res.count === 2 && upsertCalls(st).length === 2 && res.errors.some(m => m.includes(needle)),
    `${label} → يكمل ويحفظ مع تنبيه (كما قبل)`);
}

console.log('\n[3] runPayrollForMonth — الدورات قبل أيلول (المسار القديم كما هو)');
{
  const st = setStub();
  const res = await E.runPayrollForMonth({ runId: 'run-a', year: 2026, month: 8, run: run(2026, 8, { rate_usd_try: 48, rate_usd_syp: 131 }) });
  const seller = upserts(st).find(u => u.employee_id === 'emp-t');
  ok(tables(st).includes('exchange_rates'), 'آب: ما زال يقرأ exchange_rates (المسار القديم)');
  ok(seller && near(seller.shortfall_deduction_usd, 5500 / 48), 'آب: سعر الدورة (48) يغلب كما قبل', `got ${seller?.shortfall_deduction_usd}`);
  ok(res.count === 2 && upserts(st).every(u => !('_rateMissing' in u)), 'آب: الحفظ كما قبل وبلا `_rateMissing`');
}
{
  const st = setStub();
  const res = await E.runPayrollForMonth({ runId: 'run-j', year: 2026, month: 7, run: run(2026, 7, { rate_usd_try: null, rate_usd_syp: null, month_setup_confirmed_at: null }) });
  const seller = upserts(st).find(u => u.employee_id === 'emp-t');
  ok(res.count === 2, 'تموز بلا سعر ولا إعداد: لا توقف (السلوك القديم)');
  ok(seller && near(seller.shortfall_deduction_usd, 5500 / 46.8), 'تموز بلا سعر: يأخذ السعر الحي كما قبل (46.8)', `got ${seller?.shortfall_deduction_usd}`);
  ok(res.errors.some(e => e.includes('إعداد الشهر')), 'تموز: تنبيه «إعداد الشهر» القديم كما هو');
}
{
  const st = setStub({ salaryCurrency: 'EUR' });
  const res = await E.runPayrollForMonth({ runId: 'run-a', year: 2026, month: 8, run: run(2026, 8, { rate_usd_try: 48, rate_usd_syp: 131 }) });
  ok(res.count === 2 && upserts(st).length === 2, 'آب مع عملة ناقصة: يكمل ويحفظ كما قبل (بلا توقف)');
}

console.log('\n[4] fetchEmployeeSalesStatement');
{
  const emp = { id: 'emp-t', employee_name: 'Test Seller' };
  let st = setStub();
  const err = await throwsAsync(() => E.fetchEmployeeSalesStatement(emp, 2026, 9, run(2026, 9, { rate_usd_try: null, rate_usd_syp: 131 })));
  ok(!!err && !tables(st).includes('exchange_rates'), 'أيلول بسعر ناقص → خطأ ظاهر بلا fallback');
  st = setStub();
  const s = await E.fetchEmployeeSalesStatement(emp, 2026, 9, run(2026, 9, { rate_usd_try: 50, rate_usd_syp: 125 }));
  ok(!tables(st).includes('exchange_rates') && near(s.totalUsd, 200), 'أيلول: الكشف بسعر الدورة (₺10,000 ÷ 50 = $200)', `got ${s.totalUsd}`);
  st = setStub();
  const o = await E.fetchEmployeeSalesStatement(emp, 2026, 8, run(2026, 8, { rate_usd_try: 48, rate_usd_syp: 131 }));
  ok(tables(st).includes('exchange_rates') && near(o.totalUsd, 10000 / 46.8), 'آب: الكشف على سلوكه القديم (السعر الحي)', `got ${o.totalUsd}`);
  st = setStub();
  await E.fetchEmployeeSalesStatement(emp, 2026, 8);
  ok(tables(st).includes('exchange_rates'), 'نداء بلا run (توافق قديم) → المسار القديم');
}

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
