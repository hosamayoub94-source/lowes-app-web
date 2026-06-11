// =============================================================
// Payment Voucher Generator — وصل الدفع الرسمي
// يولّد HTML جاهز للطباعة بشعار الشركة وختمها
// =============================================================

import { PAYMENT_METHOD_LABELS, ENTRY_TYPE_LABELS } from '../types/accounting.types';
import { BRAND, COMPANY, BRAND_COLORS } from '@data/brand';

// ── Arabic number-to-words (SYP/USD) ──────────────────────────
const ONES = ['','واحد','اثنان','ثلاثة','أربعة','خمسة','ستة','سبعة','ثمانية','تسعة',
              'عشرة','أحد عشر','اثنا عشر','ثلاثة عشر','أربعة عشر','خمسة عشر',
              'ستة عشر','سبعة عشر','ثمانية عشر','تسعة عشر'];
const TENS = ['','عشرة','عشرون','ثلاثون','أربعون','خمسون','ستون','سبعون','ثمانون','تسعون'];

function arabicWords(n) {
  n = Math.round(n);
  if (n === 0) return 'صفر';
  if (n < 0)   return 'سالب ' + arabicWords(-n);
  if (n < 20)  return ONES[n];
  if (n < 100) {
    const t = Math.floor(n / 10), o = n % 10;
    return o ? ONES[o] + ' و' + TENS[t] : TENS[t];
  }
  if (n < 1000) {
    const h = Math.floor(n / 100), r = n % 100;
    const hWord = h === 1 ? 'مئة' : h === 2 ? 'مئتان' : ONES[h] + ' مئة';
    return r ? hWord + ' و' + arabicWords(r) : hWord;
  }
  if (n < 1_000_000) {
    const th = Math.floor(n / 1000), r = n % 1000;
    const thWord = th === 1 ? 'ألف' : th === 2 ? 'ألفان' : th < 11 ? arabicWords(th) + ' آلاف' : arabicWords(th) + ' ألف';
    return r ? thWord + ' و' + arabicWords(r) : thWord;
  }
  if (n < 1_000_000_000) {
    const m = Math.floor(n / 1_000_000), r = n % 1_000_000;
    const mWord = m === 1 ? 'مليون' : m === 2 ? 'مليونان' : arabicWords(m) + ' مليون';
    return r ? mWord + ' و' + arabicWords(r) : mWord;
  }
  return n.toLocaleString();
}

function amountInWords(amount_syp, amount_usd, amount_try) {
  const parts = [];
  if (Number(amount_syp) > 0)
    parts.push(arabicWords(Number(amount_syp)) + ' ليرة سورية');
  if (Number(amount_usd) > 0)
    parts.push(arabicWords(Number(amount_usd)) + ' دولار أمريكي');
  if (Number(amount_try) > 0)
    parts.push(arabicWords(Number(amount_try)) + ' ليرة تركية');
  return parts.join(' + ') || 'صفر';
}

// ── Voucher number generator ───────────────────────────────────
let _voucherSeq = Number(localStorage.getItem('lp_voucher_seq') || 0);
function nextVoucherNo() {
  _voucherSeq++;
  localStorage.setItem('lp_voucher_seq', _voucherSeq);
  const yr = new Date().getFullYear();
  return `VOC-${yr}-${String(_voucherSeq).padStart(3, '0')}`;
}

/**
 * Compute the next official voucher number from existing entries' reference_no
 * (format VOC-YYYY-NNN). DB-derived → stable & sequential across the team,
 * no localStorage drift. Falls back to 1 for the year.
 */
export function computeNextVoucherNo(entries = []) {
  const yr = new Date().getFullYear();
  const re = new RegExp(`^VOC-${yr}-(\\d+)$`);
  let max = 0;
  for (const e of entries) {
    const m = re.exec(e.reference_no || '');
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `VOC-${yr}-${String(max + 1).padStart(3, '0')}`;
}

// ── Main function ──────────────────────────────────────────────
export function printPaymentVoucher(entry, options = {}) {
  const {
    payeeName   = '',
    authorizedBy = 'hosam ayoub',
    companyName = BRAND.nameEn,
    companyNameAr = BRAND.nameAr,
    tagline     = BRAND.sloganAr,
    // Prefer the entry's stored reference_no so reprints keep the SAME official
    // number; fall back to a local sequence only for legacy entries without one.
    voucherNo   = entry.reference_no || nextVoucherNo(),
  } = options;

  // ألوان الهوية الرسمية: أبيض مسيطر · أسود نص · ذهبي accent فقط
  const GOLD = BRAND_COLORS.gold, GOLD_L = BRAND_COLORS.goldLight, CREAM = BRAND_COLORS.cream, INK = BRAND_COLORS.black;

  const dateStr = entry.entry_date
    ? new Date(entry.entry_date).toLocaleDateString('ar-SY', { year: 'numeric', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('ar-SY', { year: 'numeric', month: 'long', day: 'numeric' });

  const amtSYP = Number(entry.amount_syp) || 0;
  const amtUSD = Number(entry.amount_usd) || 0;
  const amtTRY = Number(entry.amount_try) || 0;

  const amtLine = [
    amtSYP ? `${amtSYP.toLocaleString()} ل.س` : '',
    amtUSD ? `$${amtUSD.toLocaleString()}` : '',
    amtTRY ? `${amtTRY.toLocaleString()} ₺` : '',
  ].filter(Boolean).join(' + ') || '—';

  const wordsLine = amountInWords(amtSYP, amtUSD, amtTRY);
  const payMethod = PAYMENT_METHOD_LABELS[entry.payment_method] || entry.payment_method || 'نقداً';
  const entryTypeLabel = ENTRY_TYPE_LABELS[entry.entry_type] || entry.entry_type;
  const isExpense = ['expense', 'salary', 'advance'].includes(entry.entry_type);

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>وصل دفع — ${voucherNo}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;600;700;800&family=Playfair+Display:ital,wght@0,600;0,800;1,500&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Tajawal', sans-serif;
    font-size: 12px;
    color: ${INK};
    background: #fff;
    padding: 0;
  }

  /* A5 landscape */
  @page { size: A5 landscape; margin: 8mm; }
  @media print {
    body { padding: 0; }
    .no-print { display: none !important; }
    .voucher { page-break-inside: avoid; }
  }

  /* أبيض مسيطر · إطار ذهبي رفيع (hairline) */
  .voucher {
    width: 200mm;
    min-height: 130mm;
    background: #fff;
    border: 1.5px solid ${GOLD};
    border-radius: 4px;
    overflow: hidden;
    margin: 10px auto;
    display: flex;
    flex-direction: column;
  }

  /* Header — أبيض، اسم البراند Playfair أسود + قلب ذهبي، فاصل ذهبي */
  .header {
    background: #fff;
    color: ${INK};
    padding: 14px 18px 10px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid ${GOLD};
  }
  .brand-name {
    font-family: 'Playfair Display', serif;
    font-size: 22px;
    font-weight: 800;
    letter-spacing: 0.5px;
    color: ${INK};
  }
  .brand-name .heart { color: ${GOLD}; }
  .brand-tr { font-family: 'Playfair Display', serif; font-style: italic; font-size: 11px; color: ${GOLD}; margin-top: 1px; }
  .brand-tag { font-size: 10px; color: #6B5D4F; margin-top: 3px; }
  .voucher-meta { text-align: left; }
  .voucher-no { font-size: 15px; font-weight: 800; color: ${INK}; }
  .voucher-no small { display:block; font-size:8px; color:#6B5D4F; font-weight:600; letter-spacing:1px; }
  .voucher-date { font-size: 10px; color: #6B5D4F; margin-top: 4px; }

  .voucher-title {
    text-align: center;
    background: ${CREAM};
    padding: 7px;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.5px;
    border-bottom: 1px solid ${GOLD_L};
    color: ${INK};
  }

  /* Body */
  .body {
    padding: 14px 18px;
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 9px 18px;
  }
  .field { display: flex; flex-direction: column; gap: 2px; }
  .field-label {
    font-size: 9px;
    text-transform: uppercase;
    color: #6B5D4F;
    font-weight: 700;
    letter-spacing: 0.5px;
  }
  .field-value {
    font-size: 13px;
    font-weight: 700;
    color: ${INK};
    border-bottom: 1px solid ${GOLD_L};
    padding-bottom: 3px;
    min-height: 22px;
  }
  .amount-value { font-size: 19px; color: ${INK}; }
  .amount-value .cur { color: ${GOLD}; font-size: 14px; }
  .words-row {
    grid-column: 1 / -1;
    background: ${CREAM};
    border-radius: 4px;
    padding: 7px 10px;
    border: 1px solid ${GOLD_L};
  }
  .words-label { font-size: 9px; color: #6B5D4F; font-weight: 700; margin-bottom: 3px; }
  .words-text { font-size: 12px; font-weight: 700; color: ${INK}; }

  /* Footer */
  .footer {
    border-top: 1px solid ${GOLD_L};
    padding: 10px 18px 8px;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 8px;
    align-items: end;
  }
  .sig-block { text-align: center; }
  .sig-line { border-bottom: 1px solid ${INK}; width: 90px; margin: 0 auto 4px; height: 22px; }
  .sig-label { font-size: 10px; color: #6B5D4F; font-weight: 600; }
  .sig-name { font-size: 11px; font-weight: 700; color: ${INK}; }

  .stamp-area { text-align: center; }
  .stamp-circle {
    width: 58px;
    height: 58px;
    border: 2px solid ${GOLD};
    border-radius: 50%;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    font-size: 8px;
    font-weight: 700;
    color: ${GOLD};
    line-height: 1.25;
  }
  .stamp-circle .lp { font-family: 'Playfair Display', serif; font-size: 11px; font-weight: 800; color: ${INK}; }

  /* Company legal footer */
  .company-footer {
    border-top: 1.5px solid ${GOLD};
    background: ${CREAM};
    padding: 6px 18px 8px;
    text-align: center;
    font-size: 8.5px;
    color: #6B5D4F;
    line-height: 1.5;
  }
  .company-footer .legal { font-weight: 700; color: ${INK}; font-size: 9px; }

  /* Print button */
  .print-btn {
    display: inline-block;
    margin: 10px 6px;
    padding: 8px 24px;
    background: ${GOLD};
    color: #fff;
    border: none;
    border-radius: 8px;
    font-family: 'Tajawal', sans-serif;
    font-size: 14px;
    cursor: pointer;
    font-weight: 700;
  }
  .print-btn:hover { background: ${INK}; }
  .print-btn.sec { background: #6B5D4F; }
</style>
</head>
<body>

<div class="no-print" style="text-align:center; padding: 12px 0;">
  <button class="print-btn" onclick="window.print()">🖨️ طباعة وصل الدفع</button>
  <button class="print-btn sec" onclick="window.close()">✕ إغلاق</button>
</div>

<div class="voucher">
  <!-- Header -->
  <div class="header">
    <div>
      <div class="brand-name">LOWE'S <span class="heart">${BRAND.heart}</span></div>
      <div class="brand-tr">profesyonel</div>
      <div class="brand-tag">${tagline}</div>
    </div>
    <div class="voucher-meta">
      <div class="voucher-no"><small>VOUCHER No.</small>${voucherNo}</div>
      <div class="voucher-date">${dateStr}</div>
    </div>
  </div>

  <!-- Title -->
  <div class="voucher-title">
    ${isExpense ? '🧾 وصل دفع' : '📥 وصل استلام'} — ${entryTypeLabel}
  </div>

  <!-- Body -->
  <div class="body">
    <div class="field">
      <div class="field-label">المستفيد / الجهة</div>
      <div class="field-value">${payeeName || entry.description?.split(' ').slice(0,3).join(' ') || '—'}</div>
    </div>
    <div class="field">
      <div class="field-label">المبلغ</div>
      <div class="field-value amount-value">${amtLine}</div>
    </div>
    <div class="field">
      <div class="field-label">الوصف / الغرض</div>
      <div class="field-value">${entry.description || '—'}</div>
    </div>
    <div class="field">
      <div class="field-label">التصنيف | طريقة الدفع</div>
      <div class="field-value">${entry.category || '—'} | ${payMethod}</div>
    </div>
    <div class="words-row">
      <div class="words-label">المبلغ بالتفصيل (تفقيط)</div>
      <div class="words-text">${wordsLine} فقط لا غير ✓</div>
    </div>
    ${entry.notes ? `
    <div class="field" style="grid-column: 1 / -1;">
      <div class="field-label">ملاحظات</div>
      <div class="field-value" style="font-size:11px;">${entry.notes}</div>
    </div>` : ''}
  </div>

  <!-- Footer signatures -->
  <div class="footer">
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-name">${authorizedBy}</div>
      <div class="sig-label">المفوّض بالصرف</div>
    </div>
    <div class="stamp-area">
      <div class="stamp-circle">
        <span class="lp">LOWE'S</span>
        <span>ختم رسمي</span>
        <span>${BRAND.heart}</span>
      </div>
    </div>
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-name"></div>
      <div class="sig-label">المستلم / توقيع</div>
    </div>
  </div>

  <!-- Company legal footer -->
  <div class="company-footer">
    <div class="legal">${COMPANY.legalName}</div>
    <div>${COMPANY.address} — ${COMPANY.city}, ${COMPANY.country} · سجل تجاري: ${COMPANY.tradeRegistryNo}</div>
    <div>📧 ${COMPANY.email} · 🌐 ${COMPANY.website} · 📱 ${COMPANY.whatsapp}</div>
  </div>
</div>

</body>
</html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('يرجى السماح بالنوافذ المنبثقة'); return; }
  w.document.write(html);
  w.document.close();
}
