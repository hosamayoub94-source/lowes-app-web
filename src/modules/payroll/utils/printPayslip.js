// =============================================================
// printPayslip — Opens a styled print window for one employee
// Zero dependencies: uses window.open + window.print()
// Produces a professional Arabic RTL payslip saveable as PDF
// =============================================================

import { BRAND, COMPANY, BRAND_COLORS, BRAND_ASSETS, AUTHORIZED_BY } from '@data/brand';
import { formatCurrency, calcNetSalary, calcTotalDeductions } from '../types/payroll.types.js';

const MONTHS_AR = [
  'يناير','فبراير','مارس','أبريل','مايو','يونيو',
  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر',
];
const sealSrc = () => (typeof location !== 'undefined' ? location.origin : '') + (BRAND_ASSETS.logoUrl || '');

function fmt(n, cur = 'USD') {
  return formatCurrency(n, cur);
}

/**
 * Print a single employee payslip.
 * @param {object} entry  — payroll entry row
 * @param {object} run    — payroll run (period_year, period_month, status)
 */
export function printPayslip(entry, run) {
  const cur = entry.currency || run?.currency || 'USD';
  const net = calcNetSalary(entry);
  const month = MONTHS_AR[(run?.period_month ?? 1) - 1];
  const year  = run?.period_year ?? new Date().getFullYear();
  const today = new Date().toLocaleDateString('ar-SA-u-nu-latn-ca-gregory');
  const isPaid = run?.status === 'paid';

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width">
<title>كشف راتب — ${entry.employee_name} — ${month} ${year}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family:'Tajawal',sans-serif;
    background:#fff;
    color:#111827;
    direction:rtl;
    padding:40px;
    max-width:720px;
    margin:0 auto;
    font-size:14px;
  }

  /* Header */
  .header {
    display:flex;
    justify-content:space-between;
    align-items:flex-start;
    border-bottom:3px solid #111827;
    padding-bottom:20px;
    margin-bottom:24px;
  }
  .company-name {
    font-size:26px;
    font-weight:800;
    color:#111827;
    letter-spacing:-0.5px;
  }
  .company-sub {
    font-size:12px;
    color:#6b7280;
    margin-top:3px;
  }
  .slip-title {
    text-align:left;
  }
  .slip-title h2 {
    font-size:18px;
    font-weight:700;
    color:#C9A646;
  }
  .slip-title p {
    font-size:12px;
    color:#6b7280;
    margin-top:2px;
  }

  /* Employee info */
  .emp-block {
    background:#f8f7f4;
    border-radius:12px;
    padding:16px 20px;
    margin-bottom:20px;
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:10px 24px;
  }
  .emp-field label {
    font-size:10px;
    font-weight:700;
    color:#9ca3af;
    text-transform:uppercase;
    letter-spacing:0.5px;
    display:block;
    margin-bottom:2px;
  }
  .emp-field span {
    font-size:14px;
    font-weight:600;
    color:#111827;
  }

  /* Table */
  table {
    width:100%;
    border-collapse:collapse;
    margin-bottom:20px;
  }
  thead th {
    background:#111827;
    color:#fff;
    font-size:11px;
    font-weight:700;
    padding:10px 14px;
    text-align:right;
  }
  thead th:last-child { text-align:left; }
  tbody tr:nth-child(even) { background:#f9fafb; }
  tbody td {
    padding:10px 14px;
    font-size:13px;
    border-bottom:1px solid #e5e7eb;
  }
  tbody td:last-child {
    text-align:left;
    font-weight:600;
    font-variant-numeric:tabular-nums;
  }
  .positive { color:#059669; }
  .negative { color:#dc2626; }
  .muted    { color:#9ca3af; }

  /* Net total */
  .net-row {
    background:#111827;
    color:#fff;
    border-radius:10px;
    padding:14px 20px;
    display:flex;
    justify-content:space-between;
    align-items:center;
    margin-bottom:24px;
    border:1.5px solid #C9A646;
  }
  .net-row .label { font-size:15px; font-weight:700; }
  .net-row .amount { font-size:22px; font-weight:800; font-variant-numeric:tabular-nums; color:#E5C97A; }

  /* Attendance */
  .att-grid {
    display:grid;
    grid-template-columns:repeat(3,1fr);
    gap:10px;
    margin-bottom:24px;
  }
  .att-card {
    border:1px solid #e5e7eb;
    border-radius:10px;
    padding:12px;
    text-align:center;
  }
  .att-card .num { font-size:20px; font-weight:800; }
  .att-card .lbl { font-size:11px; color:#6b7280; margin-top:2px; }

  /* Status badge */
  .status-badge {
    display:inline-block;
    padding:3px 10px;
    border-radius:6px;
    font-size:11px;
    font-weight:700;
    ${isPaid
      ? 'background:#d1fae5;color:#065f46;'
      : 'background:#fef3c7;color:#92400e;'
    }
  }

  /* Footer */
  .footer {
    border-top:1px solid #e5e7eb;
    padding-top:20px;
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:20px;
    margin-top:10px;
  }
  .sig-line {
    border-top:1px solid #111827;
    margin-top:40px;
    padding-top:6px;
    font-size:11px;
    color:#6b7280;
    text-align:center;
  }
  .print-date {
    font-size:11px;
    color:#9ca3af;
    text-align:center;
    margin-top:16px;
  }

  @media print {
    body { padding:20px; }
    @page { size:A4; margin:1.5cm; }
  }
</style>
</head>
<body>

<!-- Header -->
<div class="header" style="border-bottom-color:#C9A646;">
  <div style="display:flex; align-items:center; gap:12px;">
    <img src="${sealSrc()}" alt="LOWE'S" style="height:74px; width:auto;" onerror="this.style.display='none'">
    <div>
      <div class="company-name">LOWE'S <span style="color:#C9A646">${BRAND.heart}</span></div>
      <div class="company-sub" style="font-style:italic; color:#C9A646;">profesyonel</div>
      <div class="company-sub">${BRAND.sloganAr}</div>
    </div>
  </div>
  <div class="slip-title">
    <h2>كشف الراتب</h2>
    <p>${month} ${year}</p>
    <p style="margin-top:6px"><span class="status-badge">${isPaid ? '✓ مدفوع' : '⏳ معلق'}</span></p>
  </div>
</div>

<!-- Employee info -->
<div class="emp-block">
  <div class="emp-field"><label>اسم الموظف</label><span>${entry.employee_name ?? '—'}</span></div>
  <div class="emp-field"><label>المسمى الوظيفي</label><span>${entry.role_label ?? entry.role ?? '—'}</span></div>
  <div class="emp-field"><label>الفترة</label><span>${month} ${year}</span></div>
  <div class="emp-field"><label>تاريخ الإصدار</label><span>${today}</span></div>
</div>

<!-- Salary breakdown table -->
<table>
  <thead>
    <tr>
      <th>البند</th>
      <th>النوع</th>
      <th>المبلغ</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>الراتب الأساسي</td>
      <td><span class="positive">إضافة</span></td>
      <td><span class="positive">${fmt(entry.base_salary_usd, cur)}</span></td>
    </tr>
    ${Number(entry.allowances_usd ?? 0) > 0 ? `
    <tr>
      <td>البدلات (سكن + مواصلات)</td>
      <td><span class="positive">إضافة</span></td>
      <td><span class="positive">+${fmt(entry.allowances_usd, cur)}</span></td>
    </tr>` : ''}
    ${Number(entry.commission_usd ?? 0) > 0 ? `
    <tr>
      <td>عمولة المبيعات (${Number(entry.commission_pct ?? 0)}% على ${fmt(entry.sales_total_usd, cur)})</td>
      <td><span class="positive">إضافة</span></td>
      <td><span class="positive">+${fmt(entry.commission_usd, cur)}</span></td>
    </tr>` : ''}
    ${Number(entry.bonus_usd ?? 0) > 0 ? `
    <tr>
      <td>مكافأة</td>
      <td><span class="positive">إضافة</span></td>
      <td><span class="positive">+${fmt(entry.bonus_usd, cur)}</span></td>
    </tr>` : ''}
    ${Number(entry.absence_deduction_usd ?? 0) > 0 ? `
    <tr>
      <td>خصم الغياب (${entry.absent_days ?? 0} يوم)</td>
      <td><span class="negative">خصم</span></td>
      <td><span class="negative">-${fmt(entry.absence_deduction_usd, cur)}</span></td>
    </tr>` : ''}
    ${Number(entry.deductions_usd ?? 0) > 0 ? `
    <tr>
      <td>خصومات أخرى</td>
      <td><span class="negative">خصم</span></td>
      <td><span class="negative">-${fmt(entry.deductions_usd, cur)}</span></td>
    </tr>` : ''}
    ${Number(entry.advance_deduction_usd ?? 0) > 0 ? `
    <tr>
      <td>خصم السلفة</td>
      <td><span class="negative">خصم</span></td>
      <td><span class="negative">-${fmt(entry.advance_deduction_usd, cur)}</span></td>
    </tr>` : ''}
    ${entry.notes ? `
    <tr>
      <td colspan="3" style="font-size:12px;color:#6b7280">📝 ${entry.notes}</td>
    </tr>` : ''}
  </tbody>
</table>

<!-- Net salary -->
<div class="net-row">
  <span class="label">💰 الراتب الصافي</span>
  <span class="amount">${fmt(net, cur)}</span>
</div>

<!-- Attendance summary -->
<div class="att-grid">
  <div class="att-card">
    <div class="num">${entry.working_days ?? '—'}</div>
    <div class="lbl">أيام الدوام</div>
  </div>
  <div class="att-card">
    <div class="num" style="color:#059669">${(entry.working_days ?? 0) - (entry.absent_days ?? 0)}</div>
    <div class="lbl">أيام الحضور</div>
  </div>
  <div class="att-card">
    <div class="num" style="color:${(entry.absent_days ?? 0) > 0 ? '#dc2626' : '#9ca3af'}">${entry.absent_days ?? 0}</div>
    <div class="lbl">أيام الغياب</div>
  </div>
</div>

<!-- Signatures -->
<div class="footer">
  <div>
    <p style="font-size:12px;color:#6b7280;margin-bottom:6px">توقيع المفوّض</p>
    <div class="sig-line">${AUTHORIZED_BY}</div>
  </div>
  <div>
    <p style="font-size:12px;color:#6b7280;margin-bottom:6px">استلام الموظف</p>
    <div class="sig-line">${entry.employee_name ?? ''}</div>
  </div>
</div>

<div class="print-date" style="border-top:1.5px solid #C9A646; padding-top:8px; margin-top:18px; line-height:1.6;">
  <div style="font-weight:700;color:#111827">${COMPANY.legalName}</div>
  <div>📧 ${COMPANY.email} · 🌐 ${COMPANY.website} · 📱 ${COMPANY.whatsapp}</div>
  <div style="margin-top:2px">صدر بتاريخ ${today} — وثيقة سرية للاستخدام الداخلي</div>
</div>

<script>
  // Auto-print on load
  window.addEventListener('load', () => {
    setTimeout(() => { window.print(); }, 400);
  });
</script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=800,height=900');
  if (!w) { alert('يرجى السماح بالنوافذ المنبثقة لطباعة الكشف'); return; }
  w.document.write(html);
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
      <td>${e.employee_name ?? '—'}</td>
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
<h1 style="color:#111827">LOWE'S <span style="color:#C9A646">${BRAND.heart}</span> — تقرير الرواتب</h1>
<div class="sub">${month} ${year} · ${entries.length} موظف · صدر ${today}</div>
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
<div class="footer">${COMPANY.legalName} — وثيقة سرية للاستخدام الداخلي فقط</div>
<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),400))</script>
</body></html>`;

  const w = window.open('', '_blank', 'width=1000,height=800');
  if (!w) { alert('يرجى السماح بالنوافذ المنبثقة'); return; }
  w.document.write(html);
  w.document.close();
}
