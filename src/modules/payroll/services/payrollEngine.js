// =============================================================
// Payroll Engine — one-click monthly payroll computation
//
// Computes, for each active employee:
//   net = base + allowances + sales commission
//       − shortfall deduction − absence deduction
//       − approved advances − manual deductions
//
// Data sources (the live, authoritative ones):
//   • base / allowances       → employee_salary_settings (preferred) or
//                                profiles.base_salary_usd/*_allowance_usd
//                                (fallback — see resolveSalary()). Both are
//                                real, both are edited by the owner from
//                                different screens; NEITHER is migrated or
//                                deleted here (owner decision 2026-08-30).
//   • monthly sales/target/returns → orders, computed in the EMPLOYEE'S
//                                OWN TEAM currency (profiles.team = 'سوريا'
//                                → USD pipeline, 'تركيا' → TRY pipeline),
//                                regardless of which market/currency the
//                                individual order was placed in (owner
//                                rule 2026-08-30: team decides the formula,
//                                not the order's country).
//   • absence         → attendance_records (via attendanceLink.js) — manual,
//                        reference only (owner decision 2026-07-02).
//   • approved advances → employee_requests (repay this month), → USD
//
// Target / exchange-rate / commission-% VALUES used for a run are frozen
// on payroll_runs at "month setup" time (month_setup_confirmed_at) so a
// later change to commission_rules/exchange_rates never re-prices an
// already-computed month (owner rule 2026-08-30, spec §20).
// =============================================================

import { supabase, supabaseAnon } from '@services/supabase';
import { fetchAllRows } from '@utils/fetchAllRows';
import { fetchMonthlyAttendanceSummary } from './attendanceLink.js';

// Orders that count as REALIZED sales for commission. Accounting rule:
// commission is earned on collected/delivered sales, never on returns.
export const COMMISSIONABLE_STATUSES = ['delivered', 'settled'];

// Confirmed-return status (final state) — used for the returns-penalty
// pipeline (spec §9-13). 'returning'/'not_received' are still in-flight
// follow-up states, not a confirmed return, so they are excluded here.
export const RETURN_STATUS = 'returned';

// Entry currency — payroll storage/display is standardized to USD.
export const PAYROLL_CURRENCY = 'USD';

// Team → calc-currency + commission_rules key mapping. `profiles.team`
// is free text shared with non-sales departments (see AdminUsersScreen
// TEAM_OPTIONS) — only these two exact values are recognized as a
// payroll team; anything else (empty, 'مبيعات', 'إدارة', 'ميديا'…) is
// treated as "team not set" and blocks that employee's auto-calc
// (spec: "لا تبدأ الحسبة... بشكل ناقص أو صامت").
const TEAM_MAP = {
  'سوريا': { key: 'syria', currency: 'USD' },
  'تركيا': { key: 'turkey', currency: 'TRY' },
};

export function resolveTeam(teamRaw) {
  return TEAM_MAP[String(teamRaw || '').trim()] || null;
}

// ── Helpers ───────────────────────────────────────────────────

/** Normalize a seller/handler name for tolerant matching. */
export function normalizeName(s) {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** First & last day (exclusive upper bound) of a month, ISO date strings. */
function monthBounds(year, month) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextY = month === 12 ? year + 1 : year;
  const nextM = month === 12 ? 1 : month + 1;
  const to = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
  return { from, to };
}

/** The set of names an employee's orders may be filed under. */
function employeeNames(emp) {
  return [emp.employee_name, emp.seller_alias]
    .map(normalizeName)
    .filter(Boolean);
}

/** Ceil(orders * 3%) — allowed returns before any deduction kicks in. */
export function calcAllowedReturns(ordersCount) {
  return Math.ceil((Number(ordersCount) || 0) * 0.03);
}

// ── Exchange rates ────────────────────────────────────────────

/**
 * Build a { currency → rate-to-USD } map from the exchange_rates table.
 * Prefers a direct X→USD row; falls back to 1 / (USD→X); USD is 1.
 */
export function buildRateToUsd(rates) {
  // `rates` وصل مرتَّباً الأحدث أولاً (fetchExchangeRateMap). لو وجد للعملة
  // نفسها سطر مباشر (X→USD) وسطر معاكس (USD→X)، لازم يُختار الأحدث منهم —
  // لا "المباشر" دائماً بشكل أعمى. بدون هالفحص: سطر مباشر قديم (مثال ₺/$
  // من مايو) كان يتغلّب على سعر معاكس أحدث (يوليو) بفارق ~30%، فيحسب
  // الراتب بسعر صرف باهت حتى لو التحويل نفسه صحيح.
  const direct = {}, inverse = {}, directIdx = {}, inverseIdx = {};
  (rates || []).forEach((r, i) => {
    if (r.to_cur === 'USD' && !(r.from_cur in direct)) { direct[r.from_cur] = Number(r.rate); directIdx[r.from_cur] = i; }
    if (r.from_cur === 'USD' && !(r.to_cur in inverse)) { inverse[r.to_cur] = Number(r.rate); inverseIdx[r.to_cur] = i; }
  });
  const map = { USD: 1 };
  for (const cur of new Set([...Object.keys(direct), ...Object.keys(inverse)])) {
    if (cur === 'USD') continue;
    const hasDirect = direct[cur] > 0, hasInverse = inverse[cur] > 0;
    if (hasDirect && hasInverse) map[cur] = directIdx[cur] <= inverseIdx[cur] ? direct[cur] : 1 / inverse[cur];
    else if (hasDirect) map[cur] = direct[cur];
    else if (hasInverse) map[cur] = 1 / inverse[cur];
  }
  return map;
}

export async function fetchExchangeRateMap() {
  const { data, error } = await supabase
    .from('exchange_rates')
    .select('from_cur, to_cur, rate')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  // dedupe: first (newest) per pair wins
  const seen = new Set(), latest = [];
  for (const r of (data || [])) {
    const k = `${r.from_cur}->${r.to_cur}`;
    if (!seen.has(k)) { seen.add(k); latest.push(r); }
  }
  return buildRateToUsd(latest);
}

/** Convert an amount in `currency` to USD using the rate map (missing → 0, flagged). */
function toUsd(amount, currency, rateMap) {
  const rate = rateMap[currency];
  if (!(rate > 0)) return { usd: 0, missing: currency !== 'USD' };
  return { usd: Number(amount) * rate, missing: false };
}

/**
 * Convert an amount from any currency to a target currency (both ends may
 * be USD/TRY/SYP), via the USD rate map. Used to run the whole
 * target/sales/average/commission pipeline in the EMPLOYEE'S TEAM
 * currency (spec §5: "حسبة تركيا كاملة تتم أولاً بالليرة التركية").
 */
function convert(amount, fromCur, toCur, rateMap) {
  if (fromCur === toCur) return { value: Number(amount) || 0, missing: false };
  const { usd, missing } = toUsd(amount, fromCur, rateMap);
  if (toCur === 'USD') return { value: usd, missing };
  const rate = rateMap[toCur];
  if (!(rate > 0)) return { value: 0, missing: true };
  return { value: usd / rate, missing };
}

// ── Sales + returns aggregation ────────────────────────────────

/**
 * One query for the whole month's collected orders, grouped by
 * (normalized handler name → currency → totals+count). One `orders`
 * hit per run for sales, one for confirmed returns.
 */
export async function fetchMonthlySalesIndex(year, month) {
  const { from, to } = monthBounds(year, month);
  const index = new Map();

  // على دفعات — شهر بحجم >1000 طلب محصّل يُبتر صامتاً فتنقص العمولات/الرواتب.
  const [salesData, returnsData] = await Promise.all([
    fetchAllRows(() => supabase
      .from('orders')
      .select('handler_name, amount, currency, status, market, payment_method')
      .gte('order_date', from)
      .lt('order_date', to)
      .in('status', COMMISSIONABLE_STATUSES)),
    fetchAllRows(() => supabase
      .from('orders')
      .select('handler_name')
      .gte('order_date', from)
      .lt('order_date', to)
      .eq('status', RETURN_STATUS)),
  ]);

  const isPrepaid = (pm) => {
    const p = String(pm || '');
    return p.includes('مسبق') || p.includes('bank') || p.includes('بنك');
  };

  const getBucket = (key) => {
    let b = index.get(key);
    if (!b) { b = { byCur: {}, prepaidTry: 0, returnsCount: 0 }; index.set(key, b); }
    return b;
  };

  for (const o of (salesData || [])) {
    const key = normalizeName(o.handler_name);
    if (!key) continue;
    const cur = o.currency || 'USD';
    const bucket = getBucket(key);
    const slot = bucket.byCur[cur] || { total: 0, count: 0 };
    slot.total += Number(o.amount) || 0;
    slot.count += 1;
    bucket.byCur[cur] = slot;
    // لشرائح مسبق الدفع التركية (نفس منطق محفظة البائع بشاشة الطلبات)
    if (cur === 'TRY' && isPrepaid(o.payment_method)) bucket.prepaidTry += Number(o.amount) || 0;
  }

  for (const o of (returnsData || [])) {
    const key = normalizeName(o.handler_name);
    if (!key) continue;
    getBucket(key).returnsCount += 1;
  }

  return index;
}

/**
 * Employee's collected sales for a month, converted to the given target
 * currency across ALL currencies/markets — sales pipeline runs entirely
 * in the employee's OWN TEAM currency (spec §3-5), not the order's.
 */
function salesInCurrency(index, emp, targetCur, rateMap) {
  let value = 0, count = 0, missingRate = false;
  let tryTotal = 0, prepaidTry = 0, returnsCount = 0;
  for (const name of employeeNames(emp)) {
    const bucket = index.get(name);
    if (!bucket) continue;
    for (const [cur, slot] of Object.entries(bucket.byCur || {})) {
      const { value: v, missing } = convert(slot.total, cur, targetCur, rateMap);
      value += v; count += slot.count;
      if (missing) missingRate = true;
      if (cur === 'TRY') tryTotal += slot.total;
    }
    prepaidTry += bucket.prepaidTry || 0;
    returnsCount += bucket.returnsCount || 0;
  }
  return {
    value: Math.round(value * 100) / 100, count, missingRate,
    tryTotal, prepaidTry, returnsCount,
  };
}

/**
 * Legacy USD-total (all currencies → USD) for display purposes (kept for
 * backward-compat call sites / the "sales statement" modal).
 */
export function salesUsdFromIndex(index, emp, rateMap) {
  const s = salesInCurrency(index, emp, 'USD', rateMap);
  return { usd: s.value, count: s.count, missingRate: s.missingRate };
}

// ── Commission rules (defaults only — a run's OWN snapshot on
//    payroll_runs always wins once month setup is confirmed) ──

export const DEFAULT_RULES = {
  turkey: { monthly_target_try: 65000, above_target_pct: 5, prepaid_target_try: 0, prepaid_tier1_pct: 0, prepaid_tier2_pct: 0 },
  syria:  { monthly_target_usd: 1000,  above_target_pct: 0 },
};

export async function fetchCommissionRules() {
  const { data, error } = await supabase.from('commission_rules').select('*');
  if (error) throw new Error(error.message);
  const map = { ...DEFAULT_RULES };
  for (const r of (data || [])) {
    if (r.id === 'turkey' || r.id === 'syria') map[r.id] = { ...map[r.id], ...r };
  }
  return map;
}

/**
 * Detailed per-employee sales statement (for the "كشف حركة المبيعات" modal).
 * Returns the actual collected orders (all currencies) with USD value, so
 * the owner can verify what fed the commission.
 */
export async function fetchEmployeeSalesStatement(emp, year, month) {
  const { from, to } = monthBounds(year, month);
  const names = employeeNames(emp);
  if (names.length === 0) return { orders: [], totalUsd: 0, count: 0 };

  const [ordersData, rateMap] = await Promise.all([
    fetchAllRows(() => supabaseAnon.from('orders')
      .select('order_id, order_date, customer_name, amount, currency, status, handler_name, market')
      .gte('order_date', from).lt('order_date', to)
      .in('status', COMMISSIONABLE_STATUSES)
      .order('order_date', { ascending: true })),
    fetchExchangeRateMap(),
  ]);

  const orders = (ordersData || [])
    .filter(o => names.includes(normalizeName(o.handler_name)))
    .map(o => ({ ...o, usd_value: toUsd(o.amount, o.currency || 'USD', rateMap).usd }));
  const totalUsd = Math.round(orders.reduce((s, o) => s + o.usd_value, 0) * 100) / 100;
  return { orders, totalUsd, count: orders.length };
}

// ── Advances ──────────────────────────────────────────────────

/**
 * Sum approved advances scheduled to be repaid this month, converted to USD.
 * repay_month/repay_year prevents re-deducting across runs.
 */
export async function fetchAdvanceRepaymentUsd(employeeId, year, month, rateMap) {
  const { data, error } = await supabase
    .from('employee_requests')
    .select('advance_amount, advance_currency, repay_month, repay_year, status, request_type')
    .eq('employee_id', employeeId)
    .eq('request_type', 'advance')
    .eq('status', 'approved')
    .eq('repay_year', year)
    .eq('repay_month', month);

  if (error) return { usd: 0, missingRate: false };
  let usd = 0, missingRate = false;
  for (const r of (data || [])) {
    const { usd: v, missing } = toUsd(r.advance_amount, r.advance_currency || 'USD', rateMap);
    usd += v;
    if (missing) missingRate = true;
  }
  return { usd: Math.round(usd * 100) / 100, missingRate };
}

// ── Salary resolution (dual source — no forced merge) ──────────

/**
 * Base salary + allowances + commission%, preferring `employee_salary_settings`
 * (supports a native non-USD currency) and falling back to the flat
 * `profiles.*_usd` columns (AdminUsersScreen) when no settings row exists.
 * NEITHER table is written to nor migrated here — both remain exactly as
 * the owner edits them from their respective screens (owner decision
 * 2026-08-30: "كلاهما مُستخدم فعلياً — بدون دمج قسري").
 */
function resolveSalary(emp, settings) {
  if (settings && (Number(settings.base_salary) || 0) > 0) {
    return {
      source: 'employee_salary_settings',
      currency: settings.currency || 'USD',
      rawBase: Number(settings.base_salary) || 0,
      rawAllowances: (Number(settings.internet_allowance) || 0) + (Number(settings.food_allowance) || 0),
      commissionPctFallback: Number(settings.sales_commission_pct) || 0,
    };
  }
  const rawBase = Number(emp.base_salary_usd) || 0;
  if (rawBase > 0) {
    return {
      source: 'profiles',
      currency: 'USD',
      rawBase,
      rawAllowances: (Number(emp.housing_allowance_usd) || 0) + (Number(emp.transport_allowance_usd) || 0),
      commissionPctFallback: Number(emp.commission_pct) || 0,
    };
  }
  return { source: null, currency: 'USD', rawBase: 0, rawAllowances: 0, commissionPctFallback: 0 };
}

// ── Per-employee computation ──────────────────────────────────

/**
 * Compute a full payroll entry for one employee.
 * @param {object} opts.emp        active profile row (id, employee_name, seller_alias, team, role_type, + salary flat cols)
 * @param {object} opts.settings   employee_salary_settings row (or null)
 * @param {Map}    opts.salesIndex prebuilt month sales+returns index
 * @param {object} opts.rateMap    currency→USD map (live, for advances/salary conversion only)
 * @param {object} opts.run        payroll_runs row — its frozen target/pct/rate snapshot is
 *                                 authoritative once month_setup_confirmed_at is set.
 */
export async function computeEmployeeEntry({ emp, settings, runId, year, month, salesIndex, rateMap, run }) {
  const salary = resolveSalary(emp, settings);
  const { usd: base,       missing: baseMissing }      = toUsd(salary.rawBase, salary.currency, rateMap);
  const { usd: allowances, missing: allowancesMissing } = toUsd(salary.rawAllowances, salary.currency, rateMap);
  const salaryMissing = salary.source === null || (salary.rawBase > 0 && baseMissing) || (salary.rawAllowances > 0 && allowancesMissing);

  // ── Commission-exempt staff (owner rule 2026-08-30): social/media/
  //    admin/management — NOT sellers. Base + allowances only, no
  //    team requirement, no target/commission/returns pipeline, no
  //    "missing team" block. Flag lives on the profile and is copied
  //    onto the entry so a payslip keeps its reason even if the
  //    profile's flag changes later.
  if (emp.payroll_commission_exempt) {
    const notes = [
      salary.source === null ? '⚠️ الراتب الأساسي غير محدد لهذا الموظف — لا يُعتمَد بلا تدخّل يدوي' : null,
      '💼 معفى من عمولة/تارجت الرواتب — أساسي + بدلات فقط (ليس بائعاً)',
    ];
    let workingDays = 26, attRef = null;
    try {
      const att = await fetchMonthlyAttendanceSummary(emp.id, year, month, emp.employee_name);
      workingDays = att.workingDays || workingDays;
      if ((att.presentDays || 0) > 0) {
        const leaveNote = att.leaveDays ? ` (+${att.leaveDays} إجازة)` : '';
        attRef = `حضور مسجّل ${att.presentDays}/${att.workingDays} يوم${leaveNote}` + (att.absentDays ? ` · غياب ${att.absentDays}` : '');
      }
    } catch { /* مرجع فقط */ }
    notes.push(attRef ? `ℹ️ ${attRef} (الغياب يدوي)` : 'ℹ️ الغياب يدوي — عدّله من ✏️');

    const { usd: advance, missingRate: advMissing } = await fetchAdvanceRepaymentUsd(emp.id, year, month, rateMap);
    if (advMissing) notes.push('⚠️ سعر صرف ناقص');
    const net = base + allowances - advance;

    return {
      run_id: runId, employee_id: emp.id, employee_name: emp.employee_name, role_type: emp.role_type,
      currency: PAYROLL_CURRENCY, salary_source: salary.source, commission_exempt: true,
      base_salary_usd: base, allowances_usd: allowances, bonus_usd: 0,
      commission_usd: 0, commission_pct: 0, sales_total_usd: 0, sales_orders_count: 0,
      deductions_usd: 0, absence_deduction_usd: 0, advance_deduction_usd: advance,
      shortfall_deduction_usd: 0, working_days: workingDays, absent_days: 0,
      net_salary_usd: Math.round(net * 100) / 100, source: 'auto', computed_at: new Date().toISOString(),
      notes: notes.filter(Boolean).join(' · ') || null,
      team: null, target_currency: null, target_local: 0, sales_local: 0, sales_avg_local: 0,
      returns_count: 0, returns_allowed: 0, returns_excess: 0, return_deduction_local: 0,
      increase_local: 0, adjusted_increase_local: 0, shortfall_local: 0,
    };
  }

  // ── Team resolution (spec §3: calc method follows the EMPLOYEE'S team,
  //    never the order's market/currency) ──
  const team = resolveTeam(emp.team);
  const notes = [];
  if (salary.source === null) notes.push('⚠️ الراتب الأساسي غير محدد لهذا الموظف — لا يُعتمَد بلا تدخّل يدوي');
  if (!team) notes.push(`⚠️ فريق الموظف غير محدد أو غير معروف (سوريا/تركيا) — لا يمكن حساب التارجت/العمولة تلقائياً`);

  let commissionUsd = 0, shortfallDeductionUsd = 0;
  let teamFields = {
    team: team?.key ?? null, target_currency: team?.currency ?? null,
    target_local: 0, sales_local: 0, sales_avg_local: 0,
    returns_count: 0, returns_allowed: 0, returns_excess: 0, return_deduction_local: 0,
    increase_local: 0, adjusted_increase_local: 0, shortfall_local: 0,
  };
  let salesUsdDisplay = 0, salesCountDisplay = 0, salesMissing = false, commPct = 0;

  if (team) {
    const s = salesInCurrency(salesIndex, emp, team.currency, rateMap);
    salesMissing = s.missingRate;
    // Display total in USD regardless of team (KPI cards / statement modal expect USD)
    salesUsdDisplay = team.currency === 'USD' ? s.value : convert(s.value, team.currency, 'USD', rateMap).value;
    salesCountDisplay = s.count;

    // Target + % — from the run's FROZEN snapshot if confirmed, else the
    // live commission_rules defaults (so an un-set-up run still previews).
    const target = team.key === 'syria'
      ? Number(run?.target_syria_usd ?? DEFAULT_RULES.syria.monthly_target_usd) || 0
      : Number(run?.target_turkey_try ?? DEFAULT_RULES.turkey.monthly_target_try) || 0;
    commPct = team.key === 'syria'
      ? Number(run?.above_target_pct_syria ?? DEFAULT_RULES.syria.above_target_pct) || 0
      : Number(run?.above_target_pct_turkey ?? DEFAULT_RULES.turkey.above_target_pct) || 0;

    const salesLocal = s.value;
    const ordersCount = s.count;
    const returnsCount = s.returnsCount;
    const achieved = salesLocal >= target;

    if (achieved) {
      const increaseLocal = salesLocal - target;
      const avgLocal = ordersCount > 0 ? salesLocal / ordersCount : 0;
      const returnsAllowed = calcAllowedReturns(ordersCount);
      const returnsExcess = Math.max(0, returnsCount - returnsAllowed);
      const returnDeductionLocal = avgLocal * returnsExcess;
      const adjustedIncreaseLocal = Math.max(0, increaseLocal - returnDeductionLocal);
      const commissionLocal = adjustedIncreaseLocal * commPct / 100;
      const { value: commUsd, missing: cMiss } = convert(commissionLocal, team.currency, 'USD', rateMap);
      commissionUsd = Math.round(commUsd * 100) / 100;
      if (cMiss) salesMissing = true;

      teamFields = {
        team: team.key, target_currency: team.currency, target_local: target,
        sales_local: Math.round(salesLocal * 100) / 100, sales_avg_local: Math.round(avgLocal * 100) / 100,
        returns_count: returnsCount, returns_allowed: returnsAllowed, returns_excess: returnsExcess,
        return_deduction_local: Math.round(returnDeductionLocal * 100) / 100,
        increase_local: Math.round(increaseLocal * 100) / 100,
        adjusted_increase_local: Math.round(adjustedIncreaseLocal * 100) / 100,
        shortfall_local: 0,
      };
      const sym = team.currency === 'USD' ? '$' : '₺';
      notes.push(`✅ محقق التارجت — فوق التارجت ${sym}${Math.round(increaseLocal).toLocaleString('en-US')}` +
        (returnsExcess > 0
          ? ` − رواجع زائدة (${returnsExcess}×${sym}${avgLocal.toFixed(0)}=${sym}${returnDeductionLocal.toFixed(0)}) = ${sym}${adjustedIncreaseLocal.toFixed(0)} × ${commPct}% = ${sym}${commissionLocal.toFixed(2)}`
          : ` × ${commPct}% = ${sym}${commissionLocal.toFixed(2)}`));
    } else {
      const shortfallLocal = target - salesLocal;
      const shortfallDeductionLocal = shortfallLocal * 0.10;
      const { value: dUsd, missing: dMiss } = convert(shortfallDeductionLocal, team.currency, 'USD', rateMap);
      shortfallDeductionUsd = Math.round(dUsd * 100) / 100;
      if (dMiss) salesMissing = true;

      // Returns are still surfaced for reference even when target isn't
      // reached (spec §9-13 apply only "عند تحقيق التارغت" — no returns
      // deduction stacked on top of the shortfall penalty).
      const returnsAllowed = calcAllowedReturns(ordersCount);
      teamFields = {
        team: team.key, target_currency: team.currency, target_local: target,
        sales_local: Math.round(salesLocal * 100) / 100, sales_avg_local: 0,
        returns_count: returnsCount, returns_allowed: returnsAllowed,
        returns_excess: Math.max(0, returnsCount - returnsAllowed),
        return_deduction_local: 0, increase_local: 0, adjusted_increase_local: 0,
        shortfall_local: Math.round(shortfallLocal * 100) / 100,
      };
      const sym = team.currency === 'USD' ? '$' : '₺';
      notes.push(`❌ غير محقق للتارجت — نقص ${sym}${Math.round(shortfallLocal).toLocaleString('en-US')} × 10% = حسم ${sym}${shortfallDeductionLocal.toFixed(2)}`);
    }
  } else if (settings) {
    // No team resolvable → cannot run the target/returns pipeline at all.
    // Fall back to the OLD flat commission_pct × total USD sales so the
    // entry isn't silently zeroed, but flag it loudly (already pushed above).
    const s = salesUsdFromIndex(salesIndex, emp, rateMap);
    salesUsdDisplay = s.usd; salesCountDisplay = s.count; salesMissing = s.missingRate;
    commPct = salary.commissionPctFallback;
    commissionUsd = Math.round((s.usd * commPct) / 100 * 100) / 100;
  }

  // الحضور — مرجع فقط، بلا خصم تلقائي (قرار المالك 2026-07-02).
  let workingDays = 26, attRef = null;
  try {
    const att = await fetchMonthlyAttendanceSummary(emp.id, year, month, emp.employee_name);
    workingDays = att.workingDays || workingDays;
    if ((att.presentDays || 0) > 0) {
      const leaveNote = att.leaveDays ? ` (+${att.leaveDays} إجازة)` : '';
      attRef = `حضور مسجّل ${att.presentDays}/${att.workingDays} يوم${leaveNote}` +
               (att.absentDays ? ` · غياب ${att.absentDays}` : '');
    }
  } catch { /* مرجع فقط — لا يوقف الحساب */ }
  const absentDays = 0, absenceDeduction = 0;

  // Approved advances due this month (→ USD)
  const { usd: advance, missingRate: advMissing } =
    await fetchAdvanceRepaymentUsd(emp.id, year, month, rateMap);

  const net = base + allowances + commissionUsd - shortfallDeductionUsd - absenceDeduction - advance;

  notes.push(attRef ? `ℹ️ ${attRef} (الغياب يدوي)` : 'ℹ️ الغياب يدوي — عدّله من ✏️');
  if (salesMissing || advMissing || salaryMissing) notes.push('⚠️ سعر صرف ناقص');

  return {
    run_id: runId,
    employee_id: emp.id,
    employee_name: emp.employee_name,
    role_type: emp.role_type,
    currency: PAYROLL_CURRENCY,
    salary_source: salary.source,
    commission_exempt: false,
    base_salary_usd: base,
    allowances_usd: allowances,
    bonus_usd: 0,
    commission_usd: commissionUsd,
    commission_pct: commPct,
    sales_total_usd: salesUsdDisplay,
    sales_orders_count: salesCountDisplay,
    deductions_usd: 0,
    absence_deduction_usd: absenceDeduction,
    advance_deduction_usd: advance,
    shortfall_deduction_usd: shortfallDeductionUsd,
    working_days: workingDays,
    absent_days: absentDays,
    net_salary_usd: Math.round(net * 100) / 100,
    source: 'auto',
    computed_at: new Date().toISOString(),
    notes: notes.filter(Boolean).join(' · ') || null,
    ...teamFields,
  };
}

// ── Full run ──────────────────────────────────────────────────

/**
 * Compute & upsert entries for every active employee in one shot.
 * Idempotent via UNIQUE(run_id, employee_id).
 *
 * Requires the run's month-setup to be confirmed first (target/rate
 * snapshot on payroll_runs) — spec: "قبل بدء الحسبة... يطلب النظام تأكيد
 * بيانات الشهر". Callers should gate the UI button on
 * `run.month_setup_confirmed_at` before invoking this.
 *
 * @returns {Promise<{count:number, totalNet:number, entries:object[], errors:string[]}>}
 */
export async function runPayrollForMonth({ runId, year, month, onProgress, skipEmployeeIds, run }) {
  const errors = [];
  if (!run?.month_setup_confirmed_at) {
    errors.push('⚠️ لم يُؤكَّد "إعداد الشهر" (التارجت/أسعار الصرف) بعد — القيم الافتراضية استُخدمت مؤقتاً. أكِّد الإعداد قبل الاعتماد.');
  }

  // 1. Active employees (id, name, alias, role, team, flat salary cols)
  const { data: emps, error: empErr } = await supabase
    .from('profiles')
    .select('id, employee_name, role_type, is_active, seller_alias, team, base_salary_usd, housing_allowance_usd, transport_allowance_usd, commission_pct, payroll_commission_exempt')
    .eq('is_active', true)
    .order('employee_name');
  if (empErr) throw new Error('تعذّر جلب الموظفين: ' + empErr.message);

  // 2. Salary settings for those employees → keyed by employee_id
  const settingsById = new Map();
  {
    const { data: settings, error: sErr } = await supabase
      .from('employee_salary_settings')
      .select('employee_id, base_salary, currency, internet_allowance, food_allowance, sales_commission_pct, is_active');
    if (sErr) errors.push('تعذّر جلب إعدادات الرواتب: ' + sErr.message);
    for (const s of (settings || [])) {
      // keep the active/most-relevant row per employee
      if (!settingsById.has(s.employee_id) || s.is_active) settingsById.set(s.employee_id, s);
    }
  }

  // 3. Exchange rates (live, for salary/advance currency conversion only —
  //    the sales/target pipeline uses the run's OWN frozen rate snapshot
  //    when present) + one sales+returns query for the month.
  let rateMap = { USD: 1 };
  let salesIndex = new Map();
  try {
    rateMap = await fetchExchangeRateMap();
    // Run-level frozen rates win once confirmed, so re-running an old
    // month never re-prices it off today's live rate.
    if (run?.rate_usd_try > 0) rateMap.TRY = 1 / Number(run.rate_usd_try);
    if (run?.rate_usd_syp > 0) rateMap.SYP = 1 / Number(run.rate_usd_syp);
  } catch (e) { errors.push('تعذّر جلب أسعار الصرف: ' + (e?.message || e)); }
  try { salesIndex = await fetchMonthlySalesIndex(year, month); }
  catch (e) { errors.push('تعذّر جلب المبيعات: ' + (e?.message || e) + ' — العمولات = 0'); }

  const { upsertPayrollEntry } = await import('./payrollService.js');
  const skip = skipEmployeeIds || new Set();

  const entries = [];
  let done = 0;
  const total = (emps || []).length;

  for (const emp of (emps || [])) {
    if (skip.has(emp.id)) { done++; onProgress?.(done, total); continue; }
    try {
      const entry = await computeEmployeeEntry({
        emp, settings: settingsById.get(emp.id) || null,
        runId, year, month, salesIndex, rateMap, run,
      });
      const saved = await upsertPayrollEntry(entry);
      entries.push(saved);
    } catch (e) {
      errors.push(`${emp.employee_name}: ${e?.message || e}`);
    }
    done++;
    onProgress?.(done, total);
  }

  const totalNet = entries.reduce((s, e) => s + (Number(e.net_salary_usd) || 0), 0);
  return { count: entries.length, totalNet, entries, errors };
}
