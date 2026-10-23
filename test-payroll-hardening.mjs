/* global process */
// Payroll hardening regression: salary source, stale allowances, RPC routing + Arabic errors,
// payroll_excluded in engine, zero salary/allowances, permission policies (static), grant SQL safety.
import { readFileSync } from 'node:fs';
import { pickSalarySettings, resolveSalary, describeSalarySource } from './src/modules/payroll/utils/salaryResolution.js';
import { arabicPayrollRpcError } from './src/modules/payroll/utils/rpcErrors.js';
import { getPayrollBlockingEntryIssues, getPayrollStaleness } from './src/modules/payroll/services/payrollValidation.js';
import { buildAbsenceCandidates } from './src/modules/payroll/utils/absenceCandidates.js';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.error('FAIL', m); } };
const read = (p) => readFileSync(p, 'utf8');

// ── pickSalarySettings: inactive rows never win; latest effective_from wins
{
  const rows = [
    { employee_id: 'a', base_salary: 100, internet_allowance: 10, is_active: false, effective_from: '2026-01-01' },
    { employee_id: 'b', base_salary: 200, is_active: true, effective_from: '2026-01-01' },
    { employee_id: 'b', base_salary: 250, is_active: true, effective_from: '2026-06-01' },
    { employee_id: 'c', base_salary: 300, is_active: null, effective_from: '2026-03-01' },
  ];
  const m = pickSalarySettings(rows);
  ok(!m.has('a'), 'inactive-only settings row is ignored (old allowances must not return)');
  ok(m.get('b').base_salary === 250, 'latest effective_from wins among active rows');
  ok(m.get('c')?.base_salary === 300, 'is_active null is not treated as inactive');
  ok(pickSalarySettings(null).size === 0, 'null rows tolerated');
}

// ── resolveSalary / source labelling
{
  const emp = { base_salary_usd: 400, housing_allowance_usd: 20, transport_allowance_usd: 5 };
  const fromSettings = resolveSalary(emp, { base_salary: 500000, currency: 'SYP', internet_allowance: 10, food_allowance: 5 });
  ok(fromSettings.source === 'employee_salary_settings' && fromSettings.currency === 'SYP' && fromSettings.rawAllowances === 15, 'settings win and keep native currency');
  const fromProfile = resolveSalary(emp, null);
  ok(fromProfile.source === 'profiles' && fromProfile.rawBase === 400 && fromProfile.rawAllowances === 25, 'profiles fallback');
  const zeroSettings = resolveSalary(emp, { base_salary: 0, internet_allowance: 50 });
  ok(zeroSettings.source === 'profiles', 'settings with zero base fall back to profiles (its allowances are not mixed in)');
  const none = resolveSalary({ base_salary_usd: 0 }, null);
  ok(none.source === null && none.rawBase === 0, 'no source anywhere → source null');
  ok(describeSalarySource(none, 0).includes('لا مصدر راتب'), 'no-source warning text');
  ok(describeSalarySource(fromSettings, 15).includes('إعدادات الرواتب') && describeSalarySource(fromSettings, 15).includes('$15.00'), 'settings origin + allowance amount shown');
  ok(describeSalarySource(fromProfile, 0).includes('ملف الموظف') && describeSalarySource(fromProfile, 0).includes('بلا بدلات'), 'profile origin + zero allowances shown');
}

// ── zero salary / no source blocks approval; zero allowances alone does not
{
  const issues = getPayrollBlockingEntryIssues([
    { employee_id: 'z', base_salary_usd: 0, team: 'syria' },
    { employee_id: 'ok', base_salary_usd: 300, allowances_usd: 0, team: 'syria' },
  ]);
  ok(issues.zeroSalaryEntries.length === 1 && issues.blockingEntries === 1, 'zero salary blocks; zero allowances does not');
}

// ── stale gate: allowances / salary settings / absence changed after calc
{
  const entries = [{ source: 'auto', computed_at: '2026-10-22T10:00:00Z' }];
  ok(!getPayrollStaleness({ entries, inputsUpdatedAt: { salarySettings: '2026-10-01T00:00:00Z' } }).stale, 'older inputs → fresh');
  ok(getPayrollStaleness({ entries, inputsUpdatedAt: { allowances: '2026-10-23T00:00:00Z' } }).stale, 'newer allowances → stale');
  ok(getPayrollStaleness({ entries, inputsUpdatedAt: { salarySettings: '2026-10-23T00:00:00Z' } }).stale, 'newer salary settings → stale');
  ok(getPayrollStaleness({ entries, inputsUpdatedAt: { absenceReviews: '2026-10-23T00:00:00Z' } }).stale, 'newer absence decision → stale');
  ok(getPayrollStaleness({ entries, run: { month_setup_confirmed_at: '2026-10-23T00:00:00Z' }, inputsUpdatedAt: {} }).stale, 'newer month setup → stale');
  ok(getPayrollStaleness({ entries, inputsUpdatedAt: null }).stale, 'unknown input timestamps → stale (never approve on unverified calc)');
}

// ── payroll_excluded: engine + absence panel logic
{
  const eng = read('./src/modules/payroll/services/payrollEngine.js');
  ok(/filter\(e => !e\.payroll_excluded\)/.test(eng), 'engine filters payroll_excluded employees');
  ok(/\.neq\('source', 'manual'\)/.test(eng) && /payroll_excluded/.test(eng.slice(eng.indexOf('Re-run hygiene'))), 'engine removes stale auto entries of excluded employees, never manual ones');
  ok(/pickSalarySettings\(settings\)/.test(eng), 'engine picks active settings only');
  const cands = buildAbsenceCandidates({
    month: '2026-10', today: '2026-10-31',
    profiles: [{ id: 'x', employee_name: 'X', payroll_excluded: true, role_type: 'employee' }, { id: 'y', employee_name: 'Y', role_type: 'employee' }],
    attendance: [], approvedLeaves: [], holidays: [],
  });
  ok(!cands.some((r) => r.employee_name === 'X') && cands.some((r) => r.employee_name === 'Y'), 'excluded employee gets no absence candidates');
}

// ── RPC routing: new periods use the three RPCs, never a direct status update
{
  const store = read('./src/modules/payroll/store/usePayrollStore.js');
  ok(/_transitionViaRpc\(id, 'payroll_approve_run'\)/.test(store), 'approve → payroll_approve_run');
  ok(/_transitionViaRpc\(id, 'payroll_mark_paid'\)/.test(store), 'mark paid → payroll_mark_paid');
  ok(/_transitionViaRpc\(id, 'payroll_reopen_run'/.test(store), 'reopen → payroll_reopen_run');
  ok(/isNewPayrollPeriod\(get\(\)\.runs\.find\(r => r\.id === id\)\)\) \{\s*return get\(\)\._transitionViaRpc\(id, 'payroll_approve_run'\)/.test(store), 'approve checks new period before RPC');
  ok(/isNewPayrollPeriod\(run\)\) \{\s*throw new Error\('إعادة الفتح/.test(store), 'reopen refuses non-new periods');
  const svc = read('./src/modules/payroll/services/payrollService.js');
  ok(/throw new Error\(arabicPayrollRpcError\(error\)\)/.test(svc), 'RPC errors pass through the Arabic mapper');
  const dash = read('./src/modules/payroll/pages/PayrollDashboard.jsx');
  ok(/disabled=\{isSubmitting \|\| !canApprove\}/.test(dash), 'approve button disabled when gates fail');
  ok(/canFinalizeRun &&/.test(dash), 'approve/pay/reopen buttons only for can_finalize holders');
}

// ── Arabic RPC errors
{
  ok(arabicPayrollRpcError({ message: 'الاعتماد لحسام وأماني فقط' }) === 'الاعتماد لحسام وأماني فقط', 'our own Arabic message passes through');
  ok(/صلاحية/.test(arabicPayrollRpcError({ code: '42501', message: 'permission denied for function payroll_approve_run' })), 'permission denied → Arabic permission message');
  ok(/غير متوفرة/.test(arabicPayrollRpcError({ code: 'PGRST202', message: 'Could not find the function public.payroll_mark_paid' })), 'missing function → Arabic');
  ok(/الجلسة/.test(arabicPayrollRpcError({ message: 'JWT expired' })), 'expired JWT → Arabic');
  ok(/الاتصال/.test(arabicPayrollRpcError({ message: 'Failed to fetch' })), 'network → Arabic');
  ok(/[؀-ۿ]/.test(arabicPayrollRpcError({ message: 'weird english' })), 'unknown error still gets an Arabic wrapper');
}

// ── Permissions (static, on the applied-to-prod policy file): payroll_has_access() governs payroll data;
//    Accountant/HR get access ONLY through payroll_access rows (grant SQL), never by role name.
{
  const sql = read('./docs/payroll/proposed/20261023_payroll_role_tightening.sql');
  ok(/payroll_has_access\(\)/.test(sql) && !/role_type\s+in\s*\(/i.test(sql.split('-- OPTIONAL')[0]), 'policies use payroll_has_access(), no role-name lists');
  ok(/employee_id = auth\.uid\(\)/.test(sql), 'employee still sees own salary row / own legacy lines');
  const grant = read('./docs/payroll/proposed/20261023_grant_payroll_access_accountant_hr.sql');
  ok(/\(v_accountant,\s*false/.test(grant) && /\(v_hr,\s*false/.test(grant) && !/\(v_\w+,\s*true/.test(grant),'grant SQL gives can_finalize=false (no approve/pay)');
  ok(/raise exception 'Fill ACCOUNTANT/.test(grant), 'grant SQL aborts while placeholders are unfilled');
  ok(/begin;[\s\S]*commit;/.test(grant), 'grant SQL is transactional');
  ok(/PROPOSED — NOT APPLIED/.test(grant), 'grant SQL is labelled not applied');
}

console.log(`payroll hardening: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
