// =============================================================
// printPayslip — payslip and payment receipt printing (window.open + window.print, zero dependencies).
// The figures come from payslipModel.js (pure, tested); the HTML from payslipHtml.js (escaped, brand injected).
// The payslip is a CALCULATION statement (provisional while the month is open); the payment receipt is a
// separate document that exists only after the payment was really recorded.
// =============================================================

import * as brand from '@data/brand';
import { BRAND_ASSETS } from '@data/brand';
import { calcNetSalary, calcTotalDeductions, formatCurrency } from '../types/payroll.types.js';
import { buildPayslipModel, buildPaymentReceipt, escapeHtml, MONTHS_AR } from './payslipModel.js';
import { renderPayslipHtml, renderReceiptHtml } from './payslipHtml.js';
import { isOpenPeriod, PROVISIONAL_BANNER } from './payrollPeriod.js';

const logoSrc = () => (typeof location !== 'undefined' ? location.origin : '') + (BRAND_ASSETS.logoUrl || '');
const brandPack = { BRAND: brand.BRAND, COMPANY: brand.COMPANY };

function fmt(n, cur = 'USD') {
  return formatCurrency(n, cur);
}

// Attendance + absence decisions as of the issue date — fetched lazily so the printer stays usable offline.
async function loadStatementContext(entry, run, now) {
  const ctx = {};
  try {
    const { asOfDateFor } = await import('./payrollPeriod.js');
    const asOf = asOfDateFor(Number(run.period_year), Number(run.period_month), now);
    const [{ fetchMonthlyAttendanceSummary }, { listAbsenceReviewsForMonth, summarizeAbsenceReviews }] = await Promise.all([
      import('../services/attendanceLink.js'),
      import('../services/absenceReviewService.js'),
    ]);
    const [att, reviews] = await Promise.allSettled([
      fetchMonthlyAttendanceSummary(entry.employee_id, Number(run.period_year), Number(run.period_month), entry.employee_name, asOf),
      listAbsenceReviewsForMonth(entry.employee_id, Number(run.period_year), Number(run.period_month), asOf),
    ]);
    if (att.status === 'fulfilled' && att.value && !att.value.error) ctx.attendance = att.value;
    if (reviews.status === 'fulfilled') ctx.absence = summarizeAbsenceReviews(reviews.value);
  } catch { /* the statement still prints; the attendance block says it is unavailable */ }
  return ctx;
}

/**
 * Print a single employee payslip (provisional while the month is open, final after it closes).
 * @param {object} entry  — payroll entry row
 * @param {object} run    — payroll run (period_year, period_month, status)
 */
export async function printPayslip(entry, run) {
  // Open the window synchronously (popup blockers), then fill it once the attendance context is loaded.
  const w = window.open('', '_blank', 'width=860,height=1000');
  if (!w) { alert('يرجى السماح بالنوافذ المنبثقة لطباعة الكشف'); return; }
  w.document.write('<!DOCTYPE html><html dir="rtl"><body style="font-family:sans-serif;padding:40px">⏳ جارٍ تجهيز الكشف…</body></html>');
  const now = new Date();
  const ctx = await loadStatementContext(entry, run, now);
  const model = buildPayslipModel({ entry, run, ctx, now });
  w.document.open();
  w.document.write(renderPayslipHtml(model, brandPack, { logoSrc: logoSrc() }));
  w.document.close();
}

/** Print the payment receipt — only for a run whose payment is recorded (otherwise nothing is printed). */
export function printPaymentReceipt(entry, run, payment = {}) {
  const receipt = buildPaymentReceipt({ entry, run, payment });
  if (!receipt) { alert('لا يوجد إيصال دفع: لم يُسجَّل دفع هذه الدورة بعد.'); return; }
  const w = window.open('', '_blank', 'width=860,height=900');
  if (!w) { alert('يرجى السماح بالنوافذ المنبثقة لطباعة الإيصال'); return; }
  w.document.write(renderReceiptHtml(receipt, brandPack, { logoSrc: logoSrc() }));
  w.document.close();
}

/**
 * Print all entries in a payroll run as a combined report.
 * @param {object[]} entries
 * @param {object}   run
 */
export function printRunReport(entries, run) {
  if (!entries?.length) return;
  const month = MONTHS_AR[(run?.period_month ?? 1) - 1];
  const year  = run?.period_year ?? new Date().getFullYear();
  const today = new Date().toLocaleDateString('ar-SA-u-nu-latn-ca-gregory');
  const provisional = isOpenPeriod(Number(year), Number(run?.period_month ?? 1));
  // Net totals grouped by currency (employees may be paid in TRY/SYP/USD)
  const totalsByCur = entries.reduce((acc, e) => {
    const c = e.currency || run?.currency || 'USD';
    acc[c] = (acc[c] || 0) + calcNetSalary(e);
    return acc;
  }, {});
  const totalStr = Object.entries(totalsByCur).map(([c, v]) => fmt(v, c)).join(' · ');

  const rows = entries.map(e => {
    const c = e.currency || run?.currency || 'USD';
    const net = calcNetSalary(e);
    const additions = Number(e.allowances_usd ?? 0) + Number(e.commission_usd ?? 0) + Number(e.bonus_usd ?? 0);
    const deductions = calcTotalDeductions(e);
    return `<tr>
      <td>${escapeHtml(e.employee_name ?? '—')}</td>
      <td class="center">${e.working_days ?? '—'}</td>
      <td class="center" style="color:${(e.absent_days ?? 0) > 0 ? '#dc2626' : '#9ca3af'}">${e.absent_days ?? 0}</td>
      <td class="right">${fmt(e.base_salary_usd, c)}</td>
      <td class="right" style="color:#059669">${fmt(additions, c)}</td>
      <td class="right" style="color:#dc2626">${fmt(deductions, c)}</td>
      <td class="right" style="font-weight:700;color:#111827">${fmt(net, c)}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head>
<meta charset="UTF-8">
<title>تقرير الرواتب — ${month} ${year}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;800&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Tajawal,sans-serif;padding:32px;color:#111;direction:rtl;font-size:13px}
  h1{font-size:22px;font-weight:800;color:#111827}
  .sub{font-size:12px;color:#6b7280;margin-top:2px;margin-bottom:24px}
  .banner{border:2px dashed #d97706;background:#fffbeb;color:#92400e;font-weight:800;text-align:center;padding:10px;border-radius:10px;margin-bottom:16px}
  table{width:100%;border-collapse:collapse}
  th{background:#111827;color:#fff;padding:9px 12px;text-align:right;font-size:11px;font-weight:700}
  th.center,td.center{text-align:center}
  th.right,td.right{text-align:left}
  td{padding:9px 12px;border-bottom:1px solid #e5e7eb;font-size:12px}
  tr:nth-child(even) td{background:#f9fafb}
  .total-row td{background:#111827;color:#E5C97A;font-weight:700;padding:11px 12px}
  .footer{margin-top:20px;font-size:11px;color:#9ca3af;text-align:center}
  @media print{body{padding:16px}@page{size:A4 landscape;margin:1cm}}
</style></head><body>
<h1 style="color:#111827">LOWE'S <span style="color:#C9A646">${brand.BRAND.heart}</span> — تقرير الرواتب ${provisional ? '(مؤقت)' : ''}</h1>
<div class="sub">${month} ${year} · ${entries.length} موظف · صدر ${today}</div>
${provisional ? `<div class="banner">${PROVISIONAL_BANNER}</div>` : ''}
<table>
  <thead><tr>
    <th>الموظف</th>
    <th class="center">أيام الدوام</th>
    <th class="center">غياب</th>
    <th class="right">الأساسي</th>
    <th class="right">إضافات</th>
    <th class="right">خصومات</th>
    <th class="right">الصافي</th>
  </tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr class="total-row">
    <td colspan="6">الإجمالي الكلي (لكل عملة)</td>
    <td class="right">${totalStr}</td>
  </tr></tfoot>
</table>
<div class="footer">${brand.COMPANY.legalName} — وثيقة سرية للاستخدام الداخلي فقط</div>
<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),400))</script>
</body></html>`;

  const w = window.open('', '_blank', 'width=1000,height=800');
  if (!w) { alert('يرجى السماح بالنوافذ المنبثقة'); return; }
  w.document.write(html);
  w.document.close();
}
