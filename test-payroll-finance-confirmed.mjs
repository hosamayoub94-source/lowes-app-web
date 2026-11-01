/* global process */
// D-179: بروفة محرّك الرواتب الحقيقي (runPayrollForMonth) على نسخة بالذاكرة — لا شبكة ولا إنتاج.
// تثبت أن (أ) تأكيدات المالية لتاريخ التسليم و(ب) تعبئة أصناف طلبات الإمارات الفارغة
// لا تغيّران أي رقم براتب/عمولة، وأن المحرّك لا يكتب إلا جداول الرواتب (لا مخزون ولا طلبات).
import { createServer } from 'vite';
import path from 'node:path';
import { makeDb } from './test-support/fakeSupabase.mjs';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.error('FAIL', m); } };
const near = (a, b, m, eps = 0.011) => ok(Math.abs(Number(a) - b) <= eps, `${m} (got ${a}, want ${b})`);

const RUN = {
  id: 'fc-run', status: 'draft', period_year: 2026, period_month: 10, month_setup_confirmed_at: '2026-11-01T08:00:00Z',
  target_syria_usd: 1000, above_target_pct_syria: 5, target_turkey_try: 65000, above_target_pct_turkey: 5, rate_usd_try: 46.8, rate_usd_syp: 131,
};
const mk = (id, name, extra = {}) => ({ id, employee_name: name, role_type: 'employee', is_active: true, team: 'سوريا', seller_alias: null, base_salary_usd: 0, housing_allowance_usd: 0, transport_allowance_usd: 0, commission_pct: 0, payroll_commission_exempt: false, payroll_excluded: false, join_date: '2025-01-01', resigned_at: null, ...extra });
let n = 0;
const order = (handler, amount, extra = {}) => ({ id: `o${++n}`, order_id: `SL-${n}`, handler_name: handler, amount, currency: 'USD', status: 'delivered', market: 'syria', payment_method: 'cash', order_date: '2026-10-10', items: [{ name: 'منتج', qty: 1 }], ...extra });

const baseOrders = () => [
  ...Array.from({ length: 10 }, () => order('Ali Syria', 150)),
  order('Ali Syria', 80, { status: 'returned' }),
  // طلبات الإمارات بلا أصناف (الحالة الفعلية لـ19 طلباً) — خارج العمولة
  ...Array.from({ length: 3 }, () => order('Ali Syria', 200, { market: 'uae', items: [] })),
];
const seedFor = (orders) => ({
  profiles: [mk('ali', 'Ali Syria')],
  employee_salary_settings: [{ employee_id: 'ali', base_salary: 300, currency: 'USD', internet_allowance: 0, food_allowance: 0, sales_commission_pct: 0, is_active: true, effective_from: '2026-01-01' }],
  payroll_allowances: [], exchange_rates: [],
  orders, employee_requests: [], payroll_absence_reviews: [], commission_rules: [], attendance: [], attendance_records: [], payroll_entries: [],
  payroll_runs: [{ id: 'fc-run', period_year: 2026, period_month: 10, status: 'draft', employee_count: 0, total_net_usd: 0 }],
});

const server = await createServer({
  configFile: false, logLevel: 'silent', appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null },
  resolve: { alias: { '@utils': path.resolve('src/utils'), '@': path.resolve('src') } },
  plugins: [{
    name: 'fake-supabase', enforce: 'pre',
    resolveId(s) { return s === '@services/supabase' ? '\0fake-sb' : s === '@services/deliveryAccountingService' ? path.resolve('src/services/deliveryAccountingService.js') : null; },
    load(id) { return id === '\0fake-sb' ? 'const p = new Proxy({}, { get: (_, k) => globalThis.__fakeSb[k] }); export const supabase = p; export const supabaseAnon = p;' : null; },
  }],
});

const pick = (e) => e && ({ sales: e.sales_total_usd, count: e.sales_count ?? null, ret: e.returns_count, comm: e.commission_usd, net: e.net_salary_usd, inc: e.adjusted_increase_local });
const runWith = async (orders) => {
  const db = makeDb(seedFor(orders), { syncRunSummary: true });
  globalThis.__fakeSb = db.client;
  const { runPayrollForMonth } = await server.ssrLoadModule('/src/modules/payroll/services/payrollEngine.js');
  const r = await runPayrollForMonth({ now: new Date(2026, 10, 2, 12), runId: 'fc-run', year: 2026, month: 10, run: RUN });
  return { r, db, ali: db.tables.payroll_entries.find((e) => e.employee_id === 'ali' && e.source !== 'manual') };
};

try {
  // خط الأساس
  const A = await runWith(baseOrders());
  ok(A.r.errors.length === 0, 'A: بلا أخطاء ' + A.r.errors.join('|'));
  near(A.ali.sales_total_usd, 1500, 'A: مبيعات علي = 1500 (الإمارات خارج العمولة)');

  // (أ) تأكيد مالي لتاريخ تسليم أكتوبر لثلاثة طلبات أُنشئت أيلول: الراتب لا يتغير (تبقى بشهرها القديم أيلول، لا تنتقل لأكتوبر)
  const withFc = [...baseOrders(), ...Array.from({ length: 3 }, () => order('Ali Syria', 150, { order_date: '2026-09-20', fc_delivered_at: '2026-10-12T12:00:00+03:00' }))];
  const B = await runWith(withFc);
  // قرار المالك 1/11/2026: التأكيد المالي معتمد بالرواتب — الطلبات الثلاثة (150$ لكل) تنتقل من سبتمبر إلى أكتوبر
  near(B.ali.sales_total_usd, 1950, 'B: بعد قرار المالك تدخل الطلبات المؤكَّدة أكتوبر (1500 + 3×150)');
  near(B.ali.commission_usd, 47.5, 'B: العمولة = (1950−1000)×5%');
  near(B.ali.net_salary_usd - A.ali.net_salary_usd, 22.5, 'B: فرق الصافي = 22.5$ (الزيادة 450$×5%)');
  // طلبات أكتوبر نفسها المؤكَّدة بتاريخ أكتوبر (نفس الشهر): كذلك لا تغيير
  const sameMonth = [...baseOrders().filter((o) => o.market !== 'uae'), ...baseOrders().filter((o) => o.market === 'uae')].map((o, i) => (i === 0 ? { ...o, fc_delivered_at: '2026-10-25T12:00:00+03:00' } : o));
  const C = await runWith(sameMonth);
  ok(JSON.stringify(pick(C.ali)) === JSON.stringify(pick(A.ali)), 'C: تأكيد داخل نفس الشهر لا يغيّر شيئاً');

  // (ب) تعبئة أصناف الإمارات (كانت [] ) ← لا أثر على الرواتب
  const filled = baseOrders().map((o) => (o.market === 'uae' ? { ...o, items: [{ name: 'منتج معتمد', qty: 2 }] } : o));
  const D = await runWith(filled);
  ok(JSON.stringify(pick(D.ali)) === JSON.stringify(pick(A.ali)), 'D: تعبئة أصناف الإمارات لا تغيّر الراتب');
  near(D.ali.net_salary_usd, A.ali.net_salary_usd, 'D: الصافي مطابق');

  // لا كتابة على غير جداول الرواتب (لا مخزون ولا طلبات ولا حركات)
  for (const [k, X] of Object.entries({ A, B, C, D })) {
    const writes = X.db.log.filter((l) => l.op !== 'select' && l.op !== 'rpc');
    ok(writes.every((l) => ['payroll_entries', 'payroll_runs'].includes(l.table)), `${k}: الكتابة محصورة بجداول الرواتب (${[...new Set(writes.map((l) => l.table))].join(',')})`);
  }
} finally {
  await server.close();
}

console.log(`payroll finance-confirmed rehearsal: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
