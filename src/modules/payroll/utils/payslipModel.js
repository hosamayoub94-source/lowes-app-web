// Pure payslip / payment-receipt view-models (no DOM, no Supabase) so every figure printed on a
// statement is regression-tested in Node. The printer (printPayslip.js) only renders these models.
//
// A PAYSLIP states a calculation. A PAYMENT RECEIPT proves a payment happened. They are different
// documents: no receipt exists until the payment is really recorded, and a receipt never prints a field
// the system did not record (it says so instead of inventing it).

import { calcNetSalary, calcTotalDeductions } from '../types/payroll.types.js';
import { ALLOWANCE_LABELS } from './allowances.js';
import {
  PROVISIONAL_BANNER, isOpenPeriod, isProvisionalEntry, asOfDateFor, localDateStr, provisionalCommissionLocal,
} from './payrollPeriod.js';

export const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const SOURCE_LABELS = { employee_salary_settings: 'إعدادات رواتب الموظف', profiles: 'ملف الموظف' };
const TEAM_LABELS = { syria: 'سوريا', turkey: 'تركيا' };
const CUR_SYMBOL = { SYP: 'ل.س', USD: '$', TRY: '₺' };
export const NOT_RECORDED = 'غير مسجّل في النظام';

const num = (v) => Number(v) || 0;
const round2 = (n) => Math.round(num(n) * 100) / 100;
export const money = (n, cur = 'USD') => `${CUR_SYMBOL[cur] ?? cur}${round2(n).toFixed(2)}`;

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Itemised allowance lines: name, original amount, currency, exchange rate used, accounting value in USD. */
export function buildAllowanceLines(entry) {
  const detail = Array.isArray(entry?.allowances_detail) ? entry.allowances_detail : null;
  if (detail) {
    return detail.map((i) => {
      const label = ALLOWANCE_LABELS[i.kind]?.text || `بدل (${i.kind})`;
      return {
        name: label, original: num(i.amount), currency: i.currency || 'USD',
        rate: i.rate_to_usd == null ? null : num(i.rate_to_usd), usd: round2(i.usd), missingRate: !!i.missing_rate,
      };
    });
  }
  // Older entries kept only the total. Show it honestly as one line — never an invented breakdown.
  return num(entry?.allowances_usd) > 0
    ? [{ name: 'بدلات (التفصيل غير محفوظ بهذا القيد)', original: round2(entry.allowances_usd), currency: 'USD', rate: 1, usd: round2(entry.allowances_usd), missingRate: false }]
    : [];
}

function periodIds(entry, run) {
  const y = num(run?.period_year);
  const m = num(run?.period_month);
  const stamp = String(entry?.computed_at || '').replace(/\D/g, '').slice(2, 12) || '0000000000';
  return { y, m, ym: `${y}${String(m).padStart(2, '0')}`, stamp };
}

/** Unique, reproducible statement number: period · run · employee · calculation version. */
export function payslipNumber(entry, run) {
  const { ym, stamp } = periodIds(entry, run);
  return `PS-${ym}-${String(run?.id || 'run').slice(0, 6)}-${String(entry?.employee_id || 'emp').slice(0, 6)}-${stamp}`;
}

export function buildPayslipModel({ entry, run, ctx = {}, now = new Date() }) {
  const { y, m } = periodIds(entry, run);
  const openMonth = isOpenPeriod(y, m, now);
  const provisional = openMonth || isProvisionalEntry(entry, y, m);
  const cur = entry.currency || 'USD';
  const issuedOn = localDateStr(now);
  const asOf = asOfDateFor(y, m, now);

  const allowanceLines = buildAllowanceLines(entry);
  const allowancesTotal = round2(entry.allowances_usd);
  const base = round2(entry.base_salary_usd);
  const commissionFinal = round2(entry.commission_usd);
  const bonus = round2(entry.bonus_usd);
  const grossBeforeDeductions = round2(base + allowancesTotal + commissionFinal + bonus);

  const shortfallApplied = round2(entry.shortfall_deduction_usd);
  const absenceApplied = round2(entry.absence_deduction_usd);
  const advance = round2(entry.advance_deduction_usd);
  const manual = round2(entry.deductions_usd);
  const totalDeductions = round2(calcTotalDeductions(entry));
  const net = round2(calcNetSalary(entry));

  // Sales / returns / target: provisional while the month is open (never a final failure).
  const isSeller = !!entry.team && !entry.commission_exempt;
  const targetCur = entry.target_currency || cur;
  let targetStatus = null;
  if (isSeller) {
    if (provisional) targetStatus = 'غير نهائي — يُحسم عند إغلاق الشهر';
    else targetStatus = num(entry.shortfall_local) > 0 ? 'غير محقق' : 'محقق';
  }
  const provCommLocal = isSeller && provisional ? provisionalCommissionLocal(entry) : 0;

  // Absence: registered / excused / unjustified / approved for deduction (as of the issue date only).
  const att = ctx.attendance || null;
  const abs = ctx.absence || { registered: 0, approved: 0, excused: 0, pending: 0 };
  const registeredAbsent = att ? num(att.absentDays) : abs.registered;
  const absence = {
    registered: registeredAbsent,
    excused: abs.excused,
    unjustified: Math.max(0, registeredAbsent - abs.excused),
    pending: abs.pending,
    approvedForDeduction: num(entry.absent_days),
    deduction: absenceApplied,
  };

  const attendance = att
    ? { available: true, workingDays: num(att.elapsedWorkingDays ?? att.workingDays), present: num(att.presentDays), absent: num(att.absentDays), leave: num(att.leaveDays), asOf }
    : { available: false, asOf };

  const notes = String(entry.notes || '').split(' · ').map((s) => s.trim()).filter(Boolean);

  return {
    kind: provisional ? 'provisional' : 'final',
    kindLabel: provisional ? 'مؤقت' : 'نهائي',
    banner: provisional ? PROVISIONAL_BANNER : null,
    number: payslipNumber(entry, run),
    createdAt: issuedOn,
    period: { year: y, month: m, label: `${MONTHS_AR[m - 1] ?? m} ${y}`, openMonth, asOf },
    employee: {
      name: entry.employee_name || '—',
      title: ctx.title || entry.role_label || entry.role_type || '—',
      team: TEAM_LABELS[entry.team] || ctx.teamLabel || (entry.commission_exempt ? 'غير بيعي' : '—'),
      salarySource: SOURCE_LABELS[entry.salary_source] || 'غير محدد',
    },
    currency: cur,
    base,
    allowanceLines,
    allowancesTotal,
    commission: commissionFinal,
    bonus,
    grossBeforeDeductions,
    sales: isSeller ? {
      sales: round2(entry.sales_local), target: round2(entry.target_local), currency: targetCur,
      orders: num(entry.sales_orders_count), returns: num(entry.returns_count), returnsAllowed: num(entry.returns_allowed),
      shortfall: round2(entry.shortfall_local), status: targetStatus,
      provisionalCommission: provisional ? { amountLocal: provCommLocal, currency: targetCur, pct: num(entry.commission_pct), countedInNet: false } : null,
    } : null,
    absence,
    attendance,
    deductions: {
      shortfall: shortfallApplied, absence: absenceApplied, advance, manual,
      manualReason: manual > 0 ? (entry.override_note || NOT_RECORDED) : null,
      advanceReason: advance > 0 ? 'قسط سلفة معتمدة تستحق هذا الشهر' : null,
      total: totalDeductions,
    },
    net,
    balanced: Math.abs(grossBeforeDeductions - totalDeductions - net) < 0.005,
    notes,
    audit: { computedAt: entry.computed_at || null, calcSource: entry.source || null },
  };
}

/**
 * A payment receipt exists ONLY once the payment was really recorded (run paid). Fields the system does not
 * store are reported as NOT_RECORDED — never invented. `payment` may carry operationNo / method / cashSource /
 * executedBy / approvedBy / rate when a payment ledger provides them.
 */
export function buildPaymentReceipt({ entry, run, payment = {}, now = new Date() }) {
  const paid = run?.status === 'paid' && !!(run?.paid_at || payment.paidAt);
  if (!paid) return null;
  const cur = payment.currency || 'USD';
  const rate = payment.rate ?? (cur === 'USD' ? 1 : null);
  const { ym } = periodIds(entry, run);
  const paidAt = payment.paidAt || run.paid_at;
  return {
    number: `RC-${ym}-${String(run.id || 'run').slice(0, 6)}-${String(entry.employee_id || 'emp').slice(0, 6)}`,
    employee: entry.employee_name || '—',
    period: `${MONTHS_AR[num(run.period_month) - 1] ?? run.period_month} ${run.period_year}`,
    operationNo: payment.operationNo || NOT_RECORDED,
    amount: round2(payment.amount ?? calcNetSalary(entry)),
    currency: cur,
    rate: rate == null ? NOT_RECORDED : rate,
    method: payment.method || NOT_RECORDED,
    cashSource: payment.cashSource || NOT_RECORDED,
    paidAt,
    executedBy: payment.executedBy || NOT_RECORDED,
    approvedBy: payment.approvedBy || NOT_RECORDED,
    status: 'مدفوع',
    issuedAt: localDateStr(now),
  };
}
