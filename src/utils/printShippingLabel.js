// =============================================================
// printShippingLabel — بوليصة الشحن للطباعة من التطبيق (البند ٥).
// نفس فكرة سكربت «بوليصة الموتور» بالجدول، لكن من التطبيق: نافذة طباعة
// HTML عربي RTL (window.open + window.print) بلا أي اعتماد خارجي.
//
// buildShippingLabelHTML(order) → سلسلة HTML كاملة (قابلة للاختبار/المعاينة).
// printShippingLabel(order)     → يفتح نافذة ويطبع.
// =============================================================
import { BRAND, COMPANY, BRAND_ASSETS } from '@data/brand';
import { isPrepaidMethod } from '@utils/payment';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const sealSrc = () => (typeof location !== 'undefined' ? location.origin : '') + (BRAND_ASSETS.logoUrl || '');

// COD حين لا يكون الدفع مسبقاً/بنكياً (موحّد بـ @utils/payment).
const isPrepaid = (o) => isPrepaidMethod(o?.payment_method);

const fmtAmount = (n, cur) => {
  const v = Number(n || 0);
  const c = cur || 'TRY';
  const sym = c === 'TRY' ? '₺' : c === 'USD' ? '$' : c === 'SYP' ? 'ل.س' : '';
  return `${v.toLocaleString('en-US')} ${sym}`.trim();
};

/**
 * يبني HTML بوليصة الشحن لطلب واحد.
 * @param {object} order — صفّ الطلب (order_id, customer_name, phone_1, wa_number,
 *   city, district, address, items[], amount, currency, payment_method,
 *   tracking_number, yurtici_cargo_key, shipping_company, notes)
 */
export function buildShippingLabelHTML(order = {}) {
  const o = order || {};
  const gonderi   = String(o.yurtici_cargo_key || o.order_id || '').trim();
  const tracking  = String(o.tracking_number || '').trim();
  const shipCo    = String(o.shipping_company || 'Yurtiçi Kargo').trim();
  const phones    = [o.phone_1, o.wa_number].map(p => String(p || '').trim()).filter(Boolean);
  const uniquePhones = [...new Set(phones)];
  const address   = [o.address, o.district, o.city].map(s => String(s || '').trim()).filter(Boolean).join('، ');
  const items     = Array.isArray(o.items) ? o.items : [];
  const prepaid   = isPrepaid(o);
  const cod       = prepaid ? 0 : Number(o.amount || 0);
  const today     = new Date().toLocaleString('ar-SA-u-nu-latn-ca-gregory', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const itemRows = items.length
    ? items.map(it => `<tr><td class="qty">${esc(it.qty || 1)}</td><td>${esc(it.name || '')}</td></tr>`).join('')
    : `<tr><td colspan="2" class="muted">— بلا أصناف مسجّلة —</td></tr>`;

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width">
<title>بوليصة شحن — ${esc(gonderi || o.order_id || '')}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Tajawal',sans-serif;color:#111;background:#fff;direction:rtl;padding:18px;max-width:560px;margin:0 auto;font-size:13px}
  .label{border:2px solid #111;border-radius:14px;overflow:hidden}
  .hd{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 16px;border-bottom:2px solid #C9A646;background:#fff}
  .hd .co{display:flex;align-items:center;gap:10px}
  .hd .co img{height:48px;width:auto}
  .hd .name{font-size:18px;font-weight:800}
  .hd .name span{color:#C9A646}
  .hd .doc{text-align:left}
  .hd .doc h2{font-size:15px;font-weight:800;color:#111}
  .hd .doc p{font-size:10px;color:#6b7280}
  .ref{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 16px;background:#f8f7f4;border-bottom:1px solid #e5e7eb}
  .ref .blk{min-width:0}
  .ref label{display:block;font-size:9px;font-weight:700;color:#9ca3af;letter-spacing:.5px}
  .ref .code{font-family:'Courier New',monospace;font-weight:800;font-size:20px;letter-spacing:1px;color:#111;word-break:break-all}
  .ship{display:inline-block;font-size:11px;font-weight:700;color:#1d4ed8;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:3px 8px}
  .to{padding:12px 16px;border-bottom:1px dashed #cbd5e1}
  .to .lbl{font-size:10px;font-weight:700;color:#9ca3af;margin-bottom:3px}
  .to .nm{font-size:20px;font-weight:800;line-height:1.2}
  .to .ph{font-size:15px;font-weight:700;font-family:'Courier New',monospace;margin-top:4px}
  .to .ad{font-size:14px;font-weight:600;margin-top:5px;line-height:1.5}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:0}
  .cell{padding:10px 16px;border-bottom:1px solid #eee}
  .cell:nth-child(odd){border-left:1px solid #eee}
  .cell label{display:block;font-size:9px;font-weight:700;color:#9ca3af;letter-spacing:.5px}
  .cell .v{font-size:14px;font-weight:700;margin-top:2px}
  .cod{background:#111;color:#E5C97A}
  .cod .v{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums}
  .paid{background:#d1fae5}
  .paid .v{color:#065f46}
  table{width:100%;border-collapse:collapse}
  thead th{background:#111;color:#fff;font-size:11px;font-weight:700;padding:7px 14px;text-align:right}
  tbody td{padding:7px 14px;border-bottom:1px solid #eee;font-size:14px;font-weight:600}
  tbody td.qty{width:48px;text-align:center;font-size:18px;font-weight:800;color:#C9A646}
  tbody td.muted{color:#9ca3af;font-weight:400;text-align:center}
  .ft{padding:9px 16px;font-size:10px;color:#6b7280;text-align:center;line-height:1.5}
  @media print{body{padding:0}.label{border-radius:0;border:none}@page{size:A5;margin:8mm}}
</style></head><body>
<div class="label">
  <div class="hd">
    <div class="co">
      <img src="${esc(sealSrc())}" alt="LOWE'S" onerror="this.style.display='none'">
      <div><div class="name">LOWE'S <span>${BRAND.heart}</span></div><div style="font-size:10px;color:#C9A646;font-style:italic">profesyonel</div></div>
    </div>
    <div class="doc"><h2>بوليصة شحن</h2><p>Kargo Fişi · ${esc(today)}</p></div>
  </div>

  <div class="ref">
    <div class="blk"><label>رقم الإرسالية (GÖ / كود الطلب)</label><div class="code">${esc(gonderi || '—')}</div></div>
    <div class="ship">🚚 ${esc(shipCo)}</div>
  </div>

  <div class="to">
    <div class="lbl">المرسَل إليه</div>
    <div class="nm">${esc(o.customer_name || '—')}</div>
    ${uniquePhones.length ? `<div class="ph">📞 ${uniquePhones.map(esc).join(' · ')}</div>` : ''}
    <div class="ad">📍 ${esc(address || '—')}</div>
  </div>

  <div class="grid">
    ${cod > 0
      ? `<div class="cell cod"><label>التحصيل عند الباب (COD)</label><div class="v">${esc(fmtAmount(cod, o.currency))}</div></div>`
      : `<div class="cell paid"><label>الدفع</label><div class="v">✓ مدفوع مسبقاً</div></div>`}
    <div class="cell"><label>رقم التتبع</label><div class="v" style="font-family:'Courier New',monospace">${esc(tracking || '—')}</div></div>
  </div>

  <table>
    <thead><tr><th class="qty" style="text-align:center;width:48px">العدد</th><th>الصنف</th></tr></thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div class="ft">
    <div><b>${esc(COMPANY.legalNameAr || BRAND.nameAr)}</b></div>
    <div>${esc(COMPANY.address)} — ${esc(COMPANY.city)}</div>
    <div>📱 ${esc(COMPANY.whatsapp)} · 🌐 ${esc(COMPANY.website)}</div>
  </div>
</div>
<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),400))</script>
</body></html>`;
}

/** يفتح نافذة طباعة بوليصة الشحن لطلب واحد. */
export function printShippingLabel(order) {
  const w = window.open('', '_blank', 'width=620,height=860');
  if (!w) { if (typeof window !== 'undefined') window.alert('يرجى السماح بالنوافذ المنبثقة لطباعة البوليصة'); return; }
  w.document.write(buildShippingLabelHTML(order));
  w.document.close();
}

export default printShippingLabel;
