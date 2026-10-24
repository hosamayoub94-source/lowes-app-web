// HTML renderers for the payslip and the payment receipt. Pure: the brand/company objects are injected so this
// runs in Node tests; every value is escaped (notes and names come from user-editable data).

import { escapeHtml as esc, money } from './payslipModel.js';

const STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Tajawal',sans-serif;background:#fff;color:#111827;direction:rtl;padding:32px;max-width:760px;margin:0 auto;font-size:13px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #C9A646;padding-bottom:16px;margin-bottom:14px}
  .company-name{font-size:24px;font-weight:800}
  .company-sub{font-size:11px;color:#6b7280;margin-top:2px}
  .slip-title{text-align:left}
  .slip-title h2{font-size:18px;font-weight:800;color:#C9A646}
  .slip-title p{font-size:11px;color:#6b7280;margin-top:2px}
  .badge{display:inline-block;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:800}
  .badge.prov{background:#fef3c7;color:#92400e;border:1px solid #f59e0b}
  .badge.final{background:#d1fae5;color:#065f46}
  .banner{border:2px dashed #d97706;background:#fffbeb;color:#92400e;font-weight:800;text-align:center;padding:10px;border-radius:10px;margin-bottom:14px;font-size:14px}
  .grid2{background:#f8f7f4;border-radius:10px;padding:12px 16px;margin-bottom:14px;display:grid;grid-template-columns:1fr 1fr;gap:8px 20px}
  .f label{font-size:10px;font-weight:700;color:#9ca3af;display:block;margin-bottom:1px}
  .f span{font-size:13px;font-weight:700}
  h3{font-size:12px;font-weight:800;margin:14px 0 6px;color:#111827;border-right:4px solid #C9A646;padding-right:8px}
  table{width:100%;border-collapse:collapse;margin-bottom:8px}
  th{background:#111827;color:#fff;font-size:10.5px;font-weight:700;padding:7px 10px;text-align:right}
  td{padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px}
  td.n,th.n{text-align:left;font-variant-numeric:tabular-nums;white-space:nowrap}
  .pos{color:#059669}.neg{color:#dc2626}.muted{color:#9ca3af}
  .tot td{font-weight:800;background:#f3f4f6}
  .net{background:#111827;color:#fff;border:1.5px solid #C9A646;border-radius:10px;padding:12px 18px;display:flex;justify-content:space-between;align-items:center;margin:12px 0}
  .net .amount{font-size:22px;font-weight:800;color:#E5C97A}
  .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px}
  .card{border:1px solid #e5e7eb;border-radius:8px;padding:8px;text-align:center}
  .card .num{font-size:18px;font-weight:800}.card .lbl{font-size:10px;color:#6b7280;margin-top:2px}
  .note{font-size:11px;color:#6b7280;line-height:1.7}
  .sig{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:8px}
  .sig .line{border-top:1px solid #111827;margin-top:42px;padding-top:5px;font-size:11px;color:#6b7280;text-align:center}
  .foot{border-top:1.5px solid #C9A646;padding-top:8px;margin-top:16px;text-align:center;font-size:10.5px;color:#6b7280;line-height:1.6}
  @media print{body{padding:14px}@page{size:A4;margin:1.2cm}}
`;

function head(title, brand, logoSrc, rightHtml) {
  return `<div class="header">
  <div style="display:flex;align-items:center;gap:12px">
    <img src="${esc(logoSrc)}" alt="LOWE'S" style="height:64px;width:auto" onerror="this.style.display='none'">
    <div>
      <div class="company-name">LOWE'S <span style="color:#C9A646">${esc(brand.BRAND.heart)}</span></div>
      <div class="company-sub" style="font-style:italic;color:#C9A646">profesyonel</div>
      <div class="company-sub">${esc(brand.COMPANY.legalNameAr || brand.COMPANY.legalName)}</div>
    </div>
  </div>
  <div class="slip-title"><h2>${esc(title)}</h2>${rightHtml}</div>
</div>`;
}

function footer(brand, today, extra = '') {
  return `<div class="foot"><div style="font-weight:700;color:#111827">${esc(brand.COMPANY.legalName)}</div>
  <div>📧 ${esc(brand.COMPANY.email)} · 🌐 ${esc(brand.COMPANY.website)} · 📱 ${esc(brand.COMPANY.whatsapp)}</div>
  <div>صدر بتاريخ ${esc(today)} — وثيقة سرية للاستخدام الداخلي ${extra}</div></div>`;
}

export function renderPayslipHtml(m, brand, { logoSrc = '', autoPrint = true } = {}) {
  const cur = m.currency;
  const prov = m.kind === 'provisional';
  const row = (name, typeCls, typeText, amount, sign = '') =>
    `<tr><td>${name}</td><td><span class="${typeCls}">${typeText}</span></td><td class="n ${typeCls}">${sign}${esc(amount)}</td></tr>`;

  const allowanceRows = m.allowanceLines.length
    ? m.allowanceLines.map((l) => `<tr>
        <td>${esc(l.name)}</td>
        <td class="n">${esc(l.original.toLocaleString('en-US'))} ${esc(l.currency)}</td>
        <td class="n">${l.currency === 'USD' ? '—' : (l.rate == null ? '⚠️ ناقص' : esc(l.rate))}</td>
        <td class="n pos">+${esc(money(l.usd, 'USD'))}</td></tr>`).join('')
    : `<tr><td colspan="4" class="muted">لا توجد بدلات لهذا الموظف: 0</td></tr>`;

  const s = m.sales;
  const salesBlock = s ? `
  <h3>المبيعات والمرتجعات والتارجت ${prov ? '<span class="badge prov">مؤقتة</span>' : ''}</h3>
  <table><tbody>
    <tr><td>المبيعات</td><td class="n">${esc(s.sales.toLocaleString('en-US'))} ${esc(s.currency)}</td>
        <td>الطلبات</td><td class="n">${esc(s.orders)}</td></tr>
    <tr><td>التارجت</td><td class="n">${esc(s.target.toLocaleString('en-US'))} ${esc(s.currency)}</td>
        <td>المرتجعات (المسموح)</td><td class="n">${esc(s.returns)} (${esc(s.returnsAllowed)})</td></tr>
    <tr><td>حالة التارجت</td><td colspan="3"><b>${esc(s.status)}</b></td></tr>
    ${s.provisionalCommission ? `<tr><td>العمولة المؤقتة</td><td colspan="3"><b>${esc(s.provisionalCommission.amountLocal.toFixed(2))} ${esc(s.provisionalCommission.currency)}</b>
        (${esc(s.provisionalCommission.pct)}% من الزيادة المعدّلة) — <span class="neg">غير نهائية ولا تدخل الصافي قبل إغلاق الشهر</span></td></tr>` : ''}
  </tbody></table>` : '';

  const a = m.absence, at = m.attendance;
  const deds = m.deductions;
  const dedRows = [
    deds.shortfall > 0 ? row(`حسم عدم تحقيق التارجت (نقص ${s ? esc(s.shortfall.toLocaleString('en-US')) : ''} × 10%)`, 'neg', 'خصم', money(deds.shortfall, cur), '-') : '',
    deds.absence > 0 ? row(`خصم الغياب المعتمد (${esc(a.approvedForDeduction)} يوم)`, 'neg', 'خصم', money(deds.absence, cur), '-') : '',
    deds.advance > 0 ? row(`خصم سلفة — ${esc(deds.advanceReason)}`, 'neg', 'خصم', money(deds.advance, cur), '-') : '',
    deds.manual > 0 ? row(`خصم يدوي — السبب: ${esc(deds.manualReason)}`, 'neg', 'خصم', money(deds.manual, cur), '-') : '',
  ].join('') || `<tr><td colspan="3" class="muted">لا خصومات: 0</td></tr>`;

  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width">
<title>كشف راتب ${prov ? 'مؤقت' : 'نهائي'} — ${esc(m.employee.name)} — ${esc(m.period.label)}</title><style>${STYLE}</style></head><body>
${head('كشف الراتب', brand, logoSrc, `<p>${esc(m.period.label)}</p><p style="margin-top:5px"><span class="badge ${prov ? 'prov' : 'final'}">${prov ? '🟡 كشف مؤقت' : '🟢 كشف نهائي'}</span></p><p>رقم الكشف: <b>${esc(m.number)}</b></p><p>تاريخ الإنشاء: ${esc(m.createdAt)}</p>`)}
${m.banner ? `<div class="banner">${esc(m.banner)}</div>` : ''}

<div class="grid2">
  <div class="f"><label>اسم الموظف</label><span>${esc(m.employee.name)}</span></div>
  <div class="f"><label>المسمى الوظيفي</label><span>${esc(m.employee.title)}</span></div>
  <div class="f"><label>الفريق</label><span>${esc(m.employee.team)}</span></div>
  <div class="f"><label>مصدر الراتب</label><span>${esc(m.employee.salarySource)}</span></div>
  <div class="f"><label>الفترة</label><span>${esc(m.period.label)}</span></div>
  <div class="f"><label>تاريخ الإصدار / حالة الكشف</label><span>${esc(m.createdAt)} — ${esc(m.kindLabel)}</span></div>
</div>

<h3>الراتب الأساسي</h3>
<table><thead><tr><th>البند</th><th>النوع</th><th class="n">المبلغ</th></tr></thead><tbody>
  ${row('الراتب الأساسي الشهري', 'pos', 'إضافة', money(m.base, cur), '')}
</tbody></table>

<h3>البدلات التفصيلية</h3>
<table><thead><tr><th>البدل</th><th class="n">القيمة الأصلية</th><th class="n">سعر الصرف</th><th class="n">القيمة بالدولار</th></tr></thead><tbody>
  ${allowanceRows}
  <tr class="tot"><td colspan="3">إجمالي البدلات</td><td class="n">${esc(money(m.allowancesTotal, cur))}</td></tr>
</tbody></table>
${salesBlock}
${m.commission > 0 || m.bonus > 0 ? `<table><tbody>
  ${m.commission > 0 ? row('عمولة المبيعات (نهائية)', 'pos', 'إضافة', money(m.commission, cur), '+') : ''}
  ${m.bonus > 0 ? row('مكافأة', 'pos', 'إضافة', money(m.bonus, cur), '+') : ''}
</tbody></table>` : ''}

<h3>الغياب (حتى ${esc(at.asOf)} فقط)</h3>
<table><tbody><tr>
  <td>الأيام المسجّلة: <b>${esc(a.registered)}</b></td><td>المبرّرة: <b>${esc(a.excused)}</b></td>
  <td>غير المبرّرة: <b>${esc(a.unjustified)}</b></td><td>المعتمدة للخصم: <b>${esc(a.approvedForDeduction)}</b></td></tr>
  <tr><td colspan="4" class="muted">بانتظار قرار الإدارة (بلا خصم): ${esc(a.pending)} — لا يُخصم إلا الغياب غير المبرّر المعتمد من الإدارة.</td></tr></tbody></table>

<h3>الخصومات</h3>
<table><thead><tr><th>البند</th><th>النوع</th><th class="n">المبلغ</th></tr></thead><tbody>${dedRows}</tbody></table>

<table><tbody>
  <tr class="tot"><td>الإجمالي قبل الخصم</td><td class="n">${esc(money(m.grossBeforeDeductions, cur))}</td></tr>
  <tr class="tot"><td>إجمالي الخصومات</td><td class="n neg">-${esc(money(m.deductions.total, cur))}</td></tr>
</tbody></table>
<div class="net"><span>💰 صافي الراتب${prov ? ' (مؤقت)' : ''}</span><span class="amount">${esc(money(m.net, cur))}</span></div>

<h3>الدوام حتى تاريخ الإصدار (${esc(at.asOf)})</h3>
${at.available ? `<div class="cards">
  <div class="card"><div class="num">${esc(at.workingDays)}</div><div class="lbl">أيام الدوام</div></div>
  <div class="card"><div class="num pos">${esc(at.present)}</div><div class="lbl">الحضور</div></div>
  <div class="card"><div class="num">${esc(at.leave)}</div><div class="lbl">إجازة/عطلة</div></div>
  <div class="card"><div class="num ${at.absent > 0 ? 'neg' : 'muted'}">${esc(at.absent)}</div><div class="lbl">الغياب</div></div></div>`
  : `<p class="note">بيانات الحضور غير متاحة وقت الإصدار.</p>`}

<h3>ملاحظات التدقيق والمصدر</h3>
<p class="note">${m.notes.length ? m.notes.map((n) => '• ' + esc(n)).join('<br>') : 'لا ملاحظات.'}<br>
مصدر الحسبة: ${esc(m.audit.calcSource || '—')} · وقت الحسبة: ${esc(m.audit.computedAt || '—')}${m.balanced ? '' : '<br><b class="neg">⚠️ الإجماليات لا تتوازن — راجع القيد.</b>'}</p>

<div class="sig"><div><div class="line">توقيع الإدارة</div></div><div><div class="line">توقيع الموظف — ${esc(m.employee.name)}</div></div></div>
${footer(brand, m.createdAt)}
${autoPrint ? `<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),400))</script>` : ''}
</body></html>`;
}

export function renderReceiptHtml(r, brand, { logoSrc = '', autoPrint = true } = {}) {
  const f = (label, value) => `<tr><td>${esc(label)}</td><td><b>${esc(value)}</b></td></tr>`;
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>إيصال دفع راتب — ${esc(r.employee)}</title><style>${STYLE}</style></head><body>
${head('إيصال دفع راتب', brand, logoSrc, `<p>${esc(r.period)}</p><p style="margin-top:5px"><span class="badge final">✓ ${esc(r.status)}</span></p><p>رقم الإيصال: <b>${esc(r.number)}</b></p>`)}
<table><tbody>
  ${f('الموظف', r.employee)}
  ${f('رقم العملية', r.operationNo)}
  ${f('المبلغ', money(r.amount, r.currency))}
  ${f('العملة', r.currency)}
  ${f('سعر الصرف', r.rate)}
  ${f('طريقة الدفع', r.method)}
  ${f('مصدر الكاش', r.cashSource)}
  ${f('تاريخ الدفع', r.paidAt)}
  ${f('منفّذ الدفع', r.executedBy)}
  ${f('الموافق', r.approvedBy)}
  ${f('حالة الدفع', r.status)}
</tbody></table>
<p class="note">هذا الإيصال يُثبت تسجيل الدفع فقط؛ التفاصيل الحسابية في كشف الراتب. أي حقل يظهر «${esc('غير مسجّل في النظام')}» لم يُدخَل وقت الدفع ولم يُخمَّن.</p>
<div class="sig"><div><div class="line">توقيع المنفّذ</div></div><div><div class="line">استلام الموظف — ${esc(r.employee)}</div></div></div>
${footer(brand, r.issuedAt)}
${autoPrint ? `<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),400))</script>` : ''}
</body></html>`;
}
