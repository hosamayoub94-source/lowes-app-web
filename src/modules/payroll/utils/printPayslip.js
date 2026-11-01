// =============================================================
// printPayslip — payslip and payment receipt printing (window.open + window.print, zero dependencies).
// The figures come from payslipModel.js (pure, tested); the HTML from payslipHtml.js (escaped, brand injected).
// The payslip is a CALCULATION statement (provisional while the month is open); the payment receipt is a
// separate document that exists only after the payment was really recorded.
// =============================================================

import * as brand from '@data/brand';
import { BRAND_ASSETS } from '@data/brand';
import { buildPayslipModel, buildPaymentReceipt } from './payslipModel.js';
import { renderPayslipHtml, renderReceiptHtml } from './payslipHtml.js';
import { buildRunReportHtml } from './runReportHtml.js';

const logoSrc = () => (typeof location !== 'undefined' ? location.origin : '') + (BRAND_ASSETS.logoUrl || '');
const brandPack = { BRAND: brand.BRAND, COMPANY: brand.COMPANY };

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
export function printRunReport(entries, run, { onlyGroup = null } = {}) {
  if (!entries?.length) return;
  const html = buildRunReportHtml({ entries, run, onlyGroup, brandPack });

  const w = window.open('', '_blank', 'width=1000,height=800');
  if (!w) { alert('يرجى السماح بالنوافذ المنبثقة'); return; }
  w.document.write(html);
  w.document.close();
}
