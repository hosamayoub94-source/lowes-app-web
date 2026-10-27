// الرواتب تعتمد تاريخ انتقال الطلب إلى delivered — محاكاة المحرّك الحقيقي على قاعدة وهمية (بلا شبكة ولا بيانات إنتاج).
// node test-delivery-payroll.mjs
import { createServer } from 'vite';
import path from 'node:path';
import { makeDb } from './test-support/fakeSupabase.mjs';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.error('FAIL', m); } };
const near = (a, b, m, eps = 0.011) => ok(Math.abs(Number(a) - b) <= eps, `${m} (got ${a}, want ${b})`);

const RUN = { id: 'r1', status: 'draft', period_year: 2026, period_month: 10, month_setup_confirmed_at: '2026-11-01T08:00:00Z', target_syria_usd: 100, above_target_pct_syria: 5, target_turkey_try: 65000, above_target_pct_turkey: 5, rate_usd_try: 46.8, rate_usd_syp: 131 };
const prof = { id: 'ali', employee_name: 'Ali Syria', role_type: 'employee', is_active: true, team: 'سوريا', seller_alias: null, base_salary_usd: 300, housing_allowance_usd: 0, transport_allowance_usd: 0, commission_pct: 0, payroll_commission_exempt: false, payroll_excluded: false, join_date: '2025-01-01', resigned_at: null };
const o = (id, status, amount, order_date, extra = {}) => ({ id, order_id: id, handler_name: 'Ali Syria', amount, currency: 'USD', status, market: 'syria', payment_method: 'cash', order_date, ...extra });
const seed = {
  profiles: [prof],
  employee_salary_settings: [{ employee_id: 'ali', base_salary: 300, currency: 'USD', internet_allowance: 0, food_allowance: 0, sales_commission_pct: 0, is_active: true, effective_from: '2026-01-01' }],
  exchange_rates: [{ from_cur: 'TRY', to_cur: 'USD', rate: 1 / 46.8, created_at: '2026-10-01' }, { from_cur: 'SYP', to_cur: 'USD', rate: 1 / 131, created_at: '2026-10-01' }],
  orders: [
    o('d1', 'delivered', 100, '2026-10-02'), o('d2', 'delivered', 100, '2026-10-03'),
    o('sep-created-oct-delivered', 'delivered', 200, '2026-09-20', { delivered_at: '2026-10-04T10:00:00+03:00' }), // أنشئ سبتمبر ← أكتوبر
    o('oct-created-sep-delivered', 'delivered', 900, '2026-09-01', { delivered_at: '2026-09-28T10:00:00+03:00' }), // سُلّم سبتمبر ← لا يدخل أكتوبر
    o('s1', 'shipped', 5000, '2026-10-05'), o('p1', 'preparing', 5000, '2026-10-05'), o('w1', 'on_way', 5000, '2026-10-06'), o('n1', 'pending', 5000, '2026-10-06'),
    o('r1', 'returned', 80, '2026-10-07'),
  ],
  employee_requests: [], payroll_absence_reviews: [], commission_rules: [], attendance: [], attendance_records: [], payroll_allowances: [], payroll_entries: [],
  payroll_runs: [{ id: 'r1', period_year: 2026, period_month: 10, status: 'draft' }],
};
const db = makeDb(seed, { syncRunSummary: true });
globalThis.__fakeSb = db.client;
const server = await createServer({
  configFile: false, logLevel: 'silent', appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null },
  resolve: { alias: { '@utils': path.resolve('src/utils'), '@': path.resolve('src') } },
  plugins: [{
    name: 'fake-supabase', enforce: 'pre',
    resolveId(s) { return s === '@services/supabase' ? '\0fake-sb' : s === '@services/deliveryAccountingService' ? path.resolve('src/services/deliveryAccountingService.js') : null; },
    load(id) { return id === '\0fake-sb' ? 'export const supabase = globalThis.__fakeSb; export const supabaseAnon = globalThis.__fakeSb;' : null; },
  }],
});
try {
  const { runPayrollForMonth, fetchEmployeeSalesStatement, fetchMonthlySalesIndex } = await server.ssrLoadModule('/src/modules/payroll/services/payrollEngine.js');
  const idx = await fetchMonthlySalesIndex(2026, 10);
  const b = idx.get('ali syria');
  ok(b.byCur.USD.count === 3, 'ثلاثة طلبات مسلَّمة بأكتوبر (واحد منها أنشئ بسبتمبر)');
  near(b.byCur.USD.total, 400, 'مبيعات أكتوبر = 100+100+200 فقط');
  ok(b.returnsCount === 1, 'المرتجع المؤكد يبقى عدّاداً');
  const total = [...idx.values()].reduce((s, x) => s + Object.values(x.byCur).reduce((n, c) => n + c.total, 0), 0);
  ok(total < 1000, 'لا قيد شحن/تجهيز/وارد (5000 × 4) دخل المبيعات');

  const r = await runPayrollForMonth({ now: new Date(2026, 10, 2, 12), runId: 'r1', year: 2026, month: 10, run: RUN });
  ok(r.errors.length === 0, 'بلا أخطاء: ' + r.errors.join('|'));
  const e = db.tables.payroll_entries.find((x) => x.employee_id === 'ali');
  near(e.sales_total_usd, 400, 'كشف الراتب: مبيعات 400$'); ok(e.sales_orders_count === 3, 'كشف الراتب: 3 طلبات');
  near(e.commission_usd, (400 - 100 - 0) * 0.05 - 0, 'العمولة من المسلَّم فقط (400−100)×5%', 5); // يسمح بخصم رواجع زائدة

  const st = await fetchEmployeeSalesStatement(prof, 2026, 10);
  ok(st.count === 3, 'كشف الحركة: 3 طلبات تكوّن العمولة'); near(st.totalUsd, 400, 'كشف الحركة: 400$');
  ok(st.orders.every((x) => x.status === 'delivered'), 'كشف الحركة: مسلَّمة فقط'); ok(st.returnsCount === 1, 'كشف الحركة: المرتجعات');

  // دورة غير مسودّة ترفض إعادة الحساب
  let threw = false;
  try { await runPayrollForMonth({ now: new Date(2026, 10, 2, 12), runId: 'r1', year: 2026, month: 10, run: { ...RUN, status: 'finalized' } }); } catch { threw = true; }
  ok(threw, 'رفض إعادة حساب دورة معتمدة');
} finally { await server.close(); }
console.log(`delivery payroll sim: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
