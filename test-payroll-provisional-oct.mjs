/* global process */
// Open-month rules (owner, 24 Oct 2026), proven against the REAL engine on an in-memory fake Supabase.
// October 2026 only. "Today" is injected (24 Oct = month still open; 2 Nov = closed) so the result never
// depends on the machine clock.
//  • base salary is always the full monthly salary
//  • target-shortfall deduction = 0 and commission is not paid while the month is open
//  • only approved, already-past, unjustified absence deducts
//  • allowances: per employee, each item with amount/currency/rate/usd; none = nothing
//  • the provisional run cannot be approved or paid; the statement says so; a receipt exists only after payment
//  • historical months are never touched
import { createServer } from 'vite';
import path from 'node:path';
import { makeDb } from './test-support/fakeSupabase.mjs';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.error('FAIL', m); } };
const near = (a, b, m, eps = 0.011) => ok(Math.abs(Number(a) - b) <= eps, `${m} (got ${a}, want ${b})`);

const OPEN_NOW = new Date(2026, 9, 24, 12);   // 24 Oct 2026 — October still open
const CLOSED_NOW = new Date(2026, 10, 2, 12); // 2 Nov 2026 — October closed
const RUN = {
  id: 'oct-run', status: 'draft', period_year: 2026, period_month: 10,
  month_setup_confirmed_at: '2026-10-24T08:00:00Z',
  target_syria_usd: 1000, above_target_pct_syria: 5, target_turkey_try: 70000, above_target_pct_turkey: 5,
  rate_usd_try: 50, rate_usd_syp: 140,
};
const mk = (id, name, extra = {}) => ({
  id, employee_name: name, role_type: 'employee', is_active: true, team: 'ميديا', seller_alias: null,
  base_salary_usd: 0, housing_allowance_usd: 0, transport_allowance_usd: 0, commission_pct: 0,
  payroll_commission_exempt: true, payroll_excluded: false, payroll_excluded_reason: null,
  join_date: '2025-01-01', resigned_at: null, ...extra,
});
const setting = (employee_id, extra = {}) => ({
  employee_id, base_salary: 200, currency: 'USD', internet_allowance: 0, food_allowance: 0,
  sales_commission_pct: 0, is_active: true, effective_from: '2026-06-01', ...extra,
});
const order = (handler, amount, n) => ({ handler_name: handler, amount, currency: 'USD', status: 'delivered', market: 'syria', order_date: `2026-10-${String(5 + (n % 15)).padStart(2, '0')}`, payment_method: 'cod' });
// 16 attendance days up to the 19th (Mon–Sat only) for the Claudine-like employee
const PRESENT_DAYS = [1, 2, 3, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 19];

function seedFor() {
  return {
    profiles: [
      mk('claudine', 'Claudine Like', { base_salary_usd: 250, join_date: '2026-08-22' }), // full base, food row, attendance
      mk('food', 'Food Only'),
      mk('net', 'Internet Only'),
      mk('both', 'Both Allowances'),
      mk('none', 'No Allowances'),
      mk('haneen', 'Haneen Like', { team: 'سوريا', payroll_commission_exempt: false }),  // 486.14 of 1000 target
      mk('above', 'Above Target', { team: 'سوريا', payroll_commission_exempt: false }),  // 1200 of 1000 target
      mk('absent', 'Absence Cases', { base_salary_usd: 270 }),                           // 270 / 27 working days = 10/day
      mk('petra', 'Petra Manual', { base_salary_usd: 140 }),
      mk('hosam', 'hosam ayoub', { role_type: 'admin', team: null, base_salary_usd: 200, payroll_excluded: true, payroll_excluded_reason: 'owner/no salary' }),
      mk('reem', 'Reem alkshki', { role_type: 'admin', team: null, base_salary_usd: 1000, payroll_excluded: true, payroll_excluded_reason: 'UAE sponsor — no salary from the Syria cycle' }),
      mk('arwa', 'Arwa Mohammed', { team: 'تركيا', payroll_excluded: true, payroll_excluded_reason: 'paid by Reem (UAE) — outside the Syria cycle' }),
    ],
    employee_salary_settings: [
      setting('net', { internet_allowance: 10 }),
      setting('both', { internet_allowance: 10 }),
      setting('none', {}),
      setting('food', {}),
      setting('haneen', { internet_allowance: 10 }),
      setting('above', {}),
    ],
    payroll_allowances: [
      { employee_id: 'claudine', kind: 'food', amount: 7500, currency: 'SYP', is_active: true },
      { employee_id: 'food', kind: 'food', amount: 7500, currency: 'SYP', is_active: true },
      { employee_id: 'both', kind: 'food', amount: 7500, currency: 'SYP', is_active: true },
    ],
    exchange_rates: [{ from_cur: 'SYP', to_cur: 'USD', rate: 1 / 140, created_at: '2026-10-01' }, { from_cur: 'TRY', to_cur: 'USD', rate: 1 / 50, created_at: '2026-10-01' }],
    orders: [order('Haneen Like', 486.14, 0), ...Array.from({ length: 10 }, (_, i) => order('Above Target', 120, i))],
    employee_requests: [],
    payroll_absence_reviews: [
      { employee_id: 'absent', absence_date: '2026-10-05', status: 'approved' },  // past + approved  → deducts
      { employee_id: 'absent', absence_date: '2026-10-28', status: 'approved' },  // FUTURE + approved → never while open
      { employee_id: 'absent', absence_date: '2026-10-06', status: 'rejected' },  // excused           → never
      { employee_id: 'absent', absence_date: '2026-10-07', status: 'pending' },   // awaiting decision → never
    ],
    commission_rules: [],
    attendance: PRESENT_DAYS.map((d) => ({ employee_name: 'Claudine Like', date: `2026/10/${String(d).padStart(2, '0')}`, status: '✅ حاضر' })),
    attendance_records: [],
    payroll_runs: [
      { id: 'oct-run', period_year: 2026, period_month: 10, status: 'draft', employee_count: 0, total_net_usd: 0 },
      { id: 'sep-run', period_year: 2026, period_month: 9, status: 'paid', employee_count: 1, total_net_usd: 777.77 },
    ],
    payroll_entries: [
      { id: 'petra-manual', run_id: 'oct-run', employee_id: 'petra', employee_name: 'Petra Manual', source: 'manual', base_salary_usd: 25, allowances_usd: 0, net_salary_usd: 25, notes: '✍️ مبلغ ثابت 25$ بقرار حسام' },
      { id: 'sep-entry', run_id: 'sep-run', employee_id: 'haneen', employee_name: 'Haneen Like', source: 'auto', base_salary_usd: 200, allowances_usd: 10, shortfall_deduction_usd: 40, net_salary_usd: 777.77 },
    ],
  };
}

globalThis.__current = null; globalThis.__rpc = [];
globalThis.__fakeSb = { from: (...a) => globalThis.__current.from(...a), rpc: (...a) => { if (a[0] === 'profitability_orders') return globalThis.__current.rpc(...a); globalThis.__rpc.push(a); return Promise.resolve({ data: null, error: null }); } };
const use = (d) => { globalThis.__current = d.client; globalThis.__rpc = []; return d; };

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
  const P = (f) => server.ssrLoadModule(`/src/modules/payroll/${f}`);
  const { runPayrollForMonth } = await P('services/payrollEngine.js');
  const period = await P('utils/payrollPeriod.js');
  const model = await P('utils/payslipModel.js');
  const html = await P('utils/payslipHtml.js');
  const { summarizeAbsenceReviews } = await P('services/absenceReviewService.js');
  const store = (await P('store/usePayrollStore.js')).default;
  const rejects = async (fn) => { try { await fn(); return null; } catch (e) { return String(e.message || e); } };
  const SKIP = new Set(['petra']);

  // ═══ A) the open month (24 Oct) ═══════════════════════════════════════════════════════════
  const db = use(makeDb(seedFor(), { syncRunSummary: true }));
  const sepBefore = JSON.stringify([db.tables.payroll_runs.find((r) => r.id === 'sep-run'), db.tables.payroll_entries.find((x) => x.id === 'sep-entry')]);
  const res = await runPayrollForMonth({ now: OPEN_NOW, runId: 'oct-run', year: 2026, month: 10, run: RUN, skipEmployeeIds: SKIP });
  const e = (id) => db.tables.payroll_entries.find((x) => x.employee_id === id && x.run_id === 'oct-run' && x.source !== 'manual');

  ok(res.kind === 'provisional' && res.asOf === '2026-10-24', 'the run reports itself PROVISIONAL, as of 2026-10-24');
  ok(res.errors.length === 0, 'no errors: ' + res.errors.join(' | '));

  // 1) full base salary — never cut because the month is unfinished
  near(e('claudine').base_salary_usd, 250, 'employee with a full monthly salary shows it all (Claudine-like: 250)');
  near(e('food').base_salary_usd, 200, 'food-only employee: full 200');
  near(e('absent').base_salary_usd, 270, 'absence employee: full 270 (days left in the month are not deducted)');
  ok(!/جزئي/.test(e('claudine').notes), 'no partial-month note for an active employee');

  // 2) allowances: per employee, itemised
  near(e('claudine').allowances_usd, 7500 / 140, 'food only (SYP 7500 at the run rate 140)');
  const cf = e('claudine').allowances_detail[0];
  ok(e('claudine').allowances_detail.length === 1 && cf.kind === 'food' && cf.amount === 7500 && cf.currency === 'SYP' && cf.rate_to_usd === 1 / 140 && Math.abs(cf.usd - 7500 / 140) < 0.011, 'food item keeps name, original amount, currency, rate and USD value');
  near(e('net').allowances_usd, 10, 'internet only = 10');
  ok(e('net').allowances_detail.length === 1 && e('net').allowances_detail[0].kind === 'internet', 'internet item only');
  near(e('both').allowances_usd, 10 + 7500 / 140, 'both allowances');
  ok(e('both').allowances_detail.length === 2, 'two separate lines');
  ok(e('none').allowances_usd === 0 && e('none').allowances_detail.length === 0, 'no allowances: zero and NO phantom line');
  near(e('none').net_salary_usd, 200, 'no-allowance employee nets exactly the base');

  // 3) target below goal while the month is open — no deduction, data still shown
  const h = e('haneen');
  ok(h.shortfall_deduction_usd === 0, 'seller below target: shortfall deduction = 0 while the month is open');
  near(h.net_salary_usd, 210, 'Haneen-like net = 200 base + 10 internet (was 158.61 with the premature deduction)');
  near(h.sales_local, 486.14, 'sales are still shown'); near(h.target_local, 1000, 'target is still shown'); near(h.shortfall_local, 513.86, 'the current gap is shown (display only)');
  ok(/التارجت غير نهائي/.test(h.notes) && /مؤقتة/.test(h.notes), 'note says the target is not final and the calculation is provisional');
  ok(!/حسم \$/.test(h.notes), 'no deduction wording in the note');

  // 4) above target: commission is provisional, outside the net
  const a = e('above');
  ok(a.commission_usd === 0 && a.shortfall_deduction_usd === 0, 'seller above target: commission not paid yet while open');
  near(a.adjusted_increase_local, 200, 'the surplus (200) is kept for display');
  ok(/عمولة مؤقتة غير نهائية ≈ \$10\.00/.test(a.notes), 'the provisional commission (≈ $10.00) is stated and marked non-final');
  near(a.net_salary_usd, 200, 'net excludes the provisional commission');
  near(model.buildPayslipModel({ entry: a, run: RUN, now: OPEN_NOW }).sales.provisionalCommission.amountLocal, 10, 'statement model computes the provisional commission = 10 (not counted in net)');

  // 5) absence: only approved + already past + unjustified
  const ab = e('absent');
  ok(ab.absent_days === 1, 'one absence counted (approved and past); future / excused / pending are not');
  near(ab.absence_deduction_usd, 10, 'deduction = 270 / 27 working days × 1 = 10');
  near(ab.net_salary_usd, 260, 'net = 270 − 10');
  ok(e('none').absence_deduction_usd === 0 && e('food').absence_deduction_usd === 0, 'no approved decisions ⇒ absence deduction = 0');

  // 6) attendance counts only days that already happened
  ok(/حضور مسجّل 16\/27 يوم/.test(e('claudine').notes) && /غياب 5 \(/.test(e('claudine').notes), 'attendance: 16 present, 5 absent so far (not 11 — the future days are not absences): ' + (e('claudine').notes || '').slice(-60));

  // 7) Petra manual, excluded people absent, header = entries, nets add up
  const lines = db.tables.payroll_entries.filter((x) => x.run_id === 'oct-run');
  const petra = lines.find((x) => x.id === 'petra-manual');
  ok(petra && petra.source === 'manual' && petra.net_salary_usd === 25, 'Petra stays a manual entry (25), not recalculated');
  ok(!lines.some((x) => ['hosam', 'reem', 'arwa'].includes(x.employee_id)), 'Hosam, Reem and Arwa are outside the cycle');
  ok(res.excluded.length === 3 && res.excluded.every((x) => x.reason), 'exclusions carry their written reasons');
  const header = db.tables.payroll_runs.find((r) => r.id === 'oct-run');
  ok(header.employee_count === lines.length, `payroll_runs.employee_count (${header.employee_count}) = payroll_entries (${lines.length})`);
  near(header.total_net_usd, lines.reduce((s, x) => s + x.net_salary_usd, 0), 'payroll_runs.total_net_usd = sum of payroll_entries');
  ok(res.summary?.ok === true, 'engine read-back confirms header = entries');
  const auto = lines.filter((x) => x.source !== 'manual');
  ok(auto.every((x) => x.shortfall_deduction_usd === 0 && x.commission_usd === 0), 'EVERY open-month entry: shortfall deduction 0 and commission 0');
  ok(auto.every((x) => Math.abs(x.net_salary_usd - (x.base_salary_usd + x.allowances_usd + x.commission_usd - x.absence_deduction_usd - x.advance_deduction_usd - x.shortfall_deduction_usd)) < 0.011), 'every net = components');
  ok(auto.every((x) => /🟡 حسبة مؤقتة/.test(x.notes)), 'every entry is labelled as a provisional calculation');
  ok(JSON.stringify([db.tables.payroll_runs.find((r) => r.id === 'sep-run'), db.tables.payroll_entries.find((x) => x.id === 'sep-entry')]) === sepBefore, 'the September run and entry are byte-identical (history untouched)');

  // ═══ B) the SAME data after the month closes (2 Nov) ═══════════════════════════════════════
  const db2 = use(makeDb(seedFor(), { syncRunSummary: true }));
  const res2 = await runPayrollForMonth({ now: CLOSED_NOW, runId: 'oct-run', year: 2026, month: 10, run: RUN, skipEmployeeIds: SKIP });
  const f = (id) => db2.tables.payroll_entries.find((x) => x.employee_id === id && x.run_id === 'oct-run' && x.source !== 'manual');
  ok(res2.kind === 'final', 'after month end the run is FINAL');
  near(f('haneen').shortfall_deduction_usd, 51.39, 'final: the shortfall deduction applies (10% × 513.86)');
  near(f('haneen').net_salary_usd, 158.61, 'final: Haneen-like net = 158.61');
  near(f('above').commission_usd, 10, 'final: commission is paid (200 × 5%)');
  ok(f('absent').absent_days === 2, 'final: the 28 Oct approved absence now counts (the day has happened)');
  near(f('absent').absence_deduction_usd, 20, 'final: absence deduction = 2 × 10');
  near(f('claudine').base_salary_usd, 250, 'the base salary is the same open or closed');
  ok(auto.length === db2.tables.payroll_entries.filter((x) => x.run_id === 'oct-run' && x.source !== 'manual').length, 'same employees in both calculations');
  ok(!/🟡 حسبة مؤقتة/.test(f('haneen').notes) && /🟢 حسبة نهائية/.test(f('haneen').notes), 'final entries are labelled final');

  // ═══ C) period rules, boundaries and the approval/payment gates ═══════════════════════════════
  ok(period.isOpenPeriod(2026, 10, new Date(2026, 9, 31, 23, 59)), '31 Oct 23:59 — still open');
  ok(!period.isOpenPeriod(2026, 10, new Date(2026, 10, 1, 0, 0)), '1 Nov 00:00 — closed');
  ok(period.asOfDateFor(2026, 10, OPEN_NOW) === '2026-10-24' && period.asOfDateFor(2026, 10, CLOSED_NOW) === '2026-10-31', 'as-of date: today while open, month end after');
  const openReason = period.provisionalBlockReason({ run: RUN, entries: lines, now: OPEN_NOW });
  ok(openReason && openReason.includes(period.PROVISIONAL_BANNER), 'open month: approval/payment blocked with the provisional banner');
  const staleReason = period.provisionalBlockReason({ run: RUN, entries: auto, now: CLOSED_NOW });
  ok(staleReason && /احتُسب قبل إغلاق الشهر/.test(staleReason), 'closed month but entries were calculated while open: still blocked until re-run');
  const finalLines = db2.tables.payroll_entries.filter((x) => x.run_id === 'oct-run');
  ok(period.provisionalBlockReason({ run: RUN, entries: finalLines, now: CLOSED_NOW }) === null, 'closed month with final entries (+ manual Petra): nothing blocks');

  // store: an open-month run can be neither approved nor paid (a far-future month = always open, clock independent)
  const dbS = use(makeDb(seedFor()));
  const OPEN_RUN = { id: 'run-open', period_year: 2099, period_month: 12, status: 'draft' };
  store.setState({ runs: [OPEN_RUN, { ...OPEN_RUN, id: 'run-open-fin', status: 'finalized' }], selectedRunId: null, entries: [] });
  const before = JSON.stringify(dbS.tables);
  const ap = await rejects(() => store.getState().approveRun('run-open'));
  const pay = await rejects(() => store.getState().markRunPaid('run-open-fin'));
  ok(ap && /كشف مؤقت — الشهر لم يُغلق بعد/.test(ap), 'store.approveRun refuses an open month: ' + (ap || '').slice(0, 50));
  ok(pay && /كشف مؤقت/.test(pay), 'store.markRunPaid refuses an open month');
  ok(globalThis.__rpc.length === 0 && JSON.stringify(dbS.tables) === before, 'no RPC called and nothing written by the refused approve/pay');

  // ═══ D) the statement (payslip) ════════════════════════════════════════════════════════════
  const ctx = { attendance: { workingDays: 27, elapsedWorkingDays: 21, presentDays: 16, absentDays: 5, leaveDays: 0 }, absence: summarizeAbsenceReviews([{ status: 'approved' }, { status: 'rejected' }, { status: 'pending' }]) };
  const mClaudine = model.buildPayslipModel({ entry: e('claudine'), run: RUN, ctx, now: OPEN_NOW });
  ok(mClaudine.kind === 'provisional' && mClaudine.banner === 'كشف مؤقت — الشهر لم يُغلق بعد — غير صالح للاعتماد النهائي أو الدفع النهائي', 'statement carries the exact provisional banner');
  ok(mClaudine.base === 250 && mClaudine.allowanceLines.length === 1 && mClaudine.allowanceLines[0].name === 'بدل طعام' && mClaudine.allowanceLines[0].currency === 'SYP' && mClaudine.allowanceLines[0].rate === 1 / 140, 'statement lists the food allowance with name / original / currency / rate');
  near(mClaudine.net, mClaudine.grossBeforeDeductions - mClaudine.deductions.total, 'statement: gross − deductions = net'); ok(mClaudine.balanced, 'statement balances');
  const mNone = model.buildPayslipModel({ entry: e('none'), run: RUN, ctx: {}, now: OPEN_NOW });
  ok(mNone.allowanceLines.length === 0 && mNone.allowancesTotal === 0, 'statement: no allowances ⇒ no line, total 0');
  const mHaneen = model.buildPayslipModel({ entry: e('haneen'), run: RUN, ctx: {}, now: OPEN_NOW });
  ok(/غير نهائي/.test(mHaneen.sales.status) && mHaneen.deductions.shortfall === 0, 'statement: target status is NOT final and no deduction is shown');
  const mAbs = model.buildPayslipModel({ entry: e('absent'), run: RUN, ctx, now: OPEN_NOW });
  ok(mAbs.absence.registered === 5 && mAbs.absence.excused === 1 && mAbs.absence.unjustified === 4 && mAbs.absence.approvedForDeduction === 1 && mAbs.absence.pending === 1, 'statement absence: registered 5 · excused 1 · unjustified 4 · approved for deduction 1 · pending 1');
  ok(mClaudine.attendance.workingDays === 21 && mClaudine.attendance.present === 16 && mClaudine.attendance.absent === 5 && mClaudine.attendance.asOf === '2026-10-24', 'statement attendance counts only up to the issue date');
  const nums = new Set(['claudine', 'food', 'net', 'both'].map((id) => model.payslipNumber(e(id), RUN)));
  ok(nums.size === 4 && [...nums].every((n) => n.startsWith('PS-202610-')), 'each statement has its own unique number');
  ok(model.payslipNumber(f('claudine'), RUN) !== model.payslipNumber(e('claudine'), RUN), 'a re-calculation gets a new statement number');

  const brand = { BRAND: { heart: '💛' }, COMPANY: { legalName: 'LOWES TEST', legalNameAr: 'لويز اختبار', email: 'a@b.c', website: 'x.y', whatsapp: '+1' } };
  const evil = { ...e('claudine'), employee_name: 'A <script>alert(1)</script>', notes: 'x <img src=x onerror=alert(2)>' };
  const page = html.renderPayslipHtml(model.buildPayslipModel({ entry: evil, run: RUN, ctx, now: OPEN_NOW }), brand, { autoPrint: false });
  ok(page.includes('كشف مؤقت — الشهر لم يُغلق بعد — غير صالح للاعتماد النهائي أو الدفع النهائي') && page.includes('بدل طعام') && page.includes(model.payslipNumber(evil, RUN)), 'printed page: banner + allowance line + unique number');
  ok(!page.includes('<script>alert(1)') && !page.includes('<img src=x') && page.includes('&lt;script&gt;'), 'printed page escapes names and notes (no HTML injection)');
  ok(['اسم الموظف', 'المسمى الوظيفي', 'الفريق', 'مصدر الراتب', 'تاريخ الإصدار', 'الراتب الأساسي', 'البدلات التفصيلية', 'الإجمالي قبل الخصم', 'إجمالي الخصومات', 'توقيع الإدارة', 'توقيع الموظف', 'ملاحظات التدقيق'].every((s) => page.includes(s)), 'printed page has every required section');
  const noneHtml = html.renderPayslipHtml(mNone, brand, { autoPrint: false });
  ok(noneHtml.includes('لا توجد بدلات لهذا الموظف: 0'), 'no-allowance employee: the page says 0, with no invented row');
  const finalPage = html.renderPayslipHtml(model.buildPayslipModel({ entry: f('haneen'), run: RUN, ctx: {}, now: CLOSED_NOW }), brand, { autoPrint: false });
  ok(!finalPage.includes('كشف مؤقت — الشهر لم يُغلق') && finalPage.includes('كشف نهائي') && finalPage.includes('حسم عدم تحقيق التارجت'), 'final statement: no provisional banner, shows the shortfall deduction');

  // ═══ E) the payment receipt is a separate document that exists only after payment ═══════════
  ok(model.buildPaymentReceipt({ entry: e('claudine'), run: RUN }) === null, 'no receipt for a draft run');
  ok(model.buildPaymentReceipt({ entry: e('claudine'), run: { ...RUN, status: 'finalized' } }) === null, 'no receipt for an approved-but-unpaid run');
  ok(model.buildPaymentReceipt({ entry: e('claudine'), run: { ...RUN, status: 'paid' } }) === null, 'status paid without a payment date is not a recorded payment');
  const paidRun = { ...RUN, status: 'paid', paid_at: '2026-11-03T09:00:00Z' };
  const rc = model.buildPaymentReceipt({ entry: f('claudine'), run: paidRun, payment: { method: 'تحويل', cashSource: 'خزنة سوريا', executedBy: 'Amany', approvedBy: 'Hosam', operationNo: 'OP-77' }, now: CLOSED_NOW });
  ok(rc && rc.operationNo === 'OP-77' && rc.method === 'تحويل' && rc.cashSource === 'خزنة سوريا' && rc.executedBy === 'Amany' && rc.approvedBy === 'Hosam' && rc.status === 'مدفوع', 'receipt carries operation no., method, cash source, executor, approver, status');
  near(rc.amount, f('claudine').net_salary_usd, 'receipt amount = the net'); ok(rc.currency === 'USD' && rc.rate === 1 && rc.paidAt === paidRun.paid_at, 'receipt currency / rate / payment date');
  const rcBare = model.buildPaymentReceipt({ entry: f('claudine'), run: paidRun, now: CLOSED_NOW });
  ok(rcBare.operationNo === model.NOT_RECORDED && rcBare.method === model.NOT_RECORDED && rcBare.cashSource === model.NOT_RECORDED && rcBare.executedBy === model.NOT_RECORDED, 'what the system did not record is stated as not recorded, never invented');
  const rcPage = html.renderReceiptHtml(rcBare, brand, { autoPrint: false });
  ok(rcPage.includes('إيصال دفع راتب') && rcPage.includes('رقم العملية') && rcPage.includes('مصدر الكاش') && rcPage.includes('منفّذ الدفع') && rcPage.includes('الموافق'), 'receipt page has every required field');
  ok(!rcPage.includes('الراتب الأساسي') && !rcPage.includes('البدلات التفصيلية'), 'the receipt does not repeat the payslip calculation');
} finally {
  await server.close();
}

console.log(`payroll provisional (Oct 2026): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
