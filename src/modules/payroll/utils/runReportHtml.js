// تقرير الرواتب المطبوع — مقسَّم حسب المجموعة (سوريا/تركيا/سوشال ميديا/الإمارات/الإدارة/أخرى) مع مجموع كل قسم والإجمالي الكامل.
// دالة صرفة (بلا window/brand) كي تُختبر. للعرض فقط: لا تغيّر أي رقم.
import { calcNetSalary, calcTotalDeductions, formatCurrency } from '../types/payroll.types.js';
import { escapeHtml, MONTHS_AR } from './payslipModel.js';
import { isOpenPeriod, PROVISIONAL_BANNER } from './payrollPeriod.js';
import { PAYROLL_GROUPS, groupOfEntry } from './payrollGroups.js';

const curOf = (e, run) => e.currency || run?.currency || 'USD';
const sumByCurrency = (list, run) => list.reduce((acc, e) => {
  const c = curOf(e, run);
  acc[c] = Math.round(((acc[c] || 0) + calcNetSalary(e)) * 100) / 100;
  return acc;
}, {});
const fmtTotals = (t) => Object.entries(t).map(([c, v]) => formatCurrency(v, c)).join(' · ') || formatCurrency(0);

function rowHtml(e, run) {
  const c = curOf(e, run);
  const additions = Number(e.allowances_usd ?? 0) + Number(e.commission_usd ?? 0) + Number(e.bonus_usd ?? 0);
  return `<tr>
      <td>${escapeHtml(e.employee_name ?? '—')}</td>
      <td class="center">${e.working_days ?? '—'}</td>
      <td class="center" style="color:${(e.absent_days ?? 0) > 0 ? '#dc2626' : '#9ca3af'}">${e.absent_days ?? 0}</td>
      <td class="right">${formatCurrency(e.base_salary_usd, c)}</td>
      <td class="right" style="color:#059669">${formatCurrency(additions, c)}</td>
      <td class="right" style="color:#dc2626">${formatCurrency(calcTotalDeductions(e), c)}</td>
      <td class="right" style="font-weight:700;color:#111827">${formatCurrency(calcNetSalary(e), c)}</td>
    </tr>`;
}

/**
 * onlyGroup: مفتاح مجموعة لطباعة قسم واحد فقط (يُكتب بالعنوان أنه جزء من التقرير).
 * brandPack: { BRAND: { heart }, COMPANY: { legalName } }
 */
export function buildRunReportHtml({ entries, run, now = new Date(), onlyGroup = null, brandPack }) {
  const month = MONTHS_AR[(run?.period_month ?? 1) - 1];
  const year = run?.period_year ?? now.getFullYear();
  const today = now.toLocaleDateString('ar-SA-u-nu-latn-ca-gregory');
  const provisional = isOpenPeriod(Number(year), Number(run?.period_month ?? 1), now);

  const byName = (a, b) => String(a.employee_name || '').localeCompare(String(b.employee_name || ''));
  const sections = PAYROLL_GROUPS.filter((g) => g.key !== 'all')
    .map((g) => ({ g, list: entries.filter((e) => groupOfEntry(e) === g.key).sort(byName) }))
    .filter((s) => s.list.length > 0 && (!onlyGroup || onlyGroup === 'all' || onlyGroup === s.g.key));
  const shown = sections.flatMap((s) => s.list);
  const partial = !!onlyGroup && onlyGroup !== 'all';
  const partLabel = partial ? PAYROLL_GROUPS.find((g) => g.key === onlyGroup)?.label : null;

  const body = sections.map(({ g, list }) => `
    <tr class="group-row"><td colspan="7">${g.icon} ${escapeHtml(g.label)} · ${list.length} موظف</td></tr>
    ${list.map((e) => rowHtml(e, run)).join('')}
    <tr class="sub-row"><td colspan="6">مجموع «${escapeHtml(g.label)}»</td><td class="right">${fmtTotals(sumByCurrency(list, run))}</td></tr>`).join('');

  return `<!DOCTYPE html>
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
  .group-row td{background:#f3e8c8;color:#111827;font-weight:800;font-size:13px;border-top:2px solid #C9A646;break-after:avoid}
  .sub-row td{background:#f9fafb;font-weight:700;border-bottom:2px solid #d1d5db}
  tr{break-inside:avoid}
  .total-row td{background:#111827;color:#E5C97A;font-weight:700;padding:11px 12px}
  .footer{margin-top:20px;font-size:11px;color:#9ca3af;text-align:center}
  @media print{body{padding:16px}@page{size:A4 landscape;margin:1cm}}
</style></head><body>
<h1 style="color:#111827">LOWE'S <span style="color:#C9A646">${brandPack.BRAND.heart}</span> — تقرير الرواتب ${provisional ? '(مؤقت)' : ''}${partial ? ` — قسم «${escapeHtml(partLabel)}»` : ''}</h1>
<div class="sub">${month} ${year} · ${shown.length} موظف${partial ? ` من ${entries.length}` : ''} · صدر ${today}</div>
${provisional ? `<div class="banner">${PROVISIONAL_BANNER}</div>` : ''}
${partial ? `<div class="banner">تقرير جزئي: قسم «${escapeHtml(partLabel)}» فقط — الإجمالي الكامل للدورة ${fmtTotals(sumByCurrency(entries, run))}</div>` : ''}
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
  <tbody>${body}</tbody>
  <tfoot><tr class="total-row">
    <td colspan="6">${partial ? `إجمالي «${escapeHtml(partLabel)}»` : 'الإجمالي الكلي'} (لكل عملة)</td>
    <td class="right">${fmtTotals(sumByCurrency(shown, run))}</td>
  </tr></tfoot>
</table>
<div class="footer">${brandPack.COMPANY.legalName} — وثيقة سرية للاستخدام الداخلي فقط</div>
<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),400))</script>
</body></html>`;
}
