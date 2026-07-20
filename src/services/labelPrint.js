// =============================================================
// labelPrint — طباعة بوليصات الشحن (A4 = 8 بوليصات، 2×4)
// هوية LOWE'S الرسمية: أبيض مسيطر · نص أسود · ذهبي #C9A646.
// بلا تبعيات شبكية: window.open + window.print.
// QR: مولَّد برمجياً (qrcode) → حبر أسود خالص، آمن للطباعة.
// =============================================================

import QRCode from 'qrcode';
import { BRAND, COMPANY, BRAND_COLORS } from '@data/brand';

const JOIN_URL = 'https://app.lowesprofesyonel.com/join';
const IG_URL   = 'https://www.instagram.com/lowes.skincare';

// رسائل شخصية — ثابتة حسب رقم الطلب (إعادة الطباعة = نفس الرسالة)
const MESSAGES = [
  'نحنُ نعشق ما نقدّمه لك، لأنّنا نؤمن أنك تستحقين الأجمل',
  'طلبك وصل بكل محبة، ونتمنى أن يعجبك كثيراً',
  'كل طلب قصة جميلة — ونحن سعداء أن نكون جزءاً منها',
  'اختيارك شرّفنا كثيراً، شكراً لك ولثقتك الجميلة',
  'منتجاتنا تحكي عن شغفنا بتقديم الأفضل لك',
  'طلبك يعكس ذوقك الرفيع — شكراً لثقتك بنا دائماً',
  'نتمنى أن تشعري بالفرق في كل منتج وصل إليك',
  'جودتنا صُنعت لأجلك، وننتظر عودتك بشوق',
  'كل قطعة اخترناها لك بكل اهتمام — نتمنى أن تحبيها',
  'طلبك يضيء يومنا كله — شكراً من كل الفريق',
  'نتمنى أن يعجبك طلبك، فنحن هنا لأجل ابتسامتك',
  'شكراً لأنك اخترتنا — هذا يعني لنا كل شيء',
];

const CUR_LABEL = { SYP: 'ل.س', USD: '$', TRY: '₺', EUR: '€' };

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function pickStable(list, key) {
  let h = 0;
  const s = String(key || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return list[h % list.length];
}

const firstName = (full) => String(full || '').trim().split(/\s+/)[0] || 'عميلنا العزيز';

function fmtAmount(amount, currency) {
  const n = Number(amount || 0);
  const cur = CUR_LABEL[String(currency || 'SYP').toUpperCase()] || currency || '';
  return `${n.toLocaleString('en-US')} ${cur}`;
}

function codAmount(o) {
  if (o.payment_status === 'paid') return 0;
  const total = Number(o.amount || 0);
  if (o.payment_status === 'partial' && Number(o.paid_amount) > 0)
    return Math.max(0, total - Number(o.paid_amount));
  return total;
}

// أجور التوصيل — تُضاف للتحصيل فقط إذا كانت على العميل
function deliveryCost(o) {
  if (o.shipping_payer !== 'customer') return 0;
  return Math.max(0, Number(o.delivery_cost || 0));
}

function addressLine(o) {
  const parts = [o.city, o.district, o.sy_neighborhood, o.address]
    .map((p) => String(p || '').trim()).filter(Boolean);
  return [...new Set(parts)].join(' – ');
}

// ────────────────────────────────────────────────────────────────
//  labelHTML — HTML لبوليصة واحدة
// ────────────────────────────────────────────────────────────────
function labelHTML(o, idx, total, dateStr, joinQrDataUrl, igQrDataUrl) {
  const name    = esc(o.customer_name || '—');
  const rawPhone = o.phone_1 || o.phone_2 || o.wa_number || '';
  const rawWa    = o.wa_number || o.phone_1 || '';
  const phone    = esc(rawPhone || '—');
  const addr     = esc(addressLine(o) || '—');
  const company  = esc(o.shipping_company || (o.market === 'turkey' ? 'توصيل الموتور' : 'شركة الشحن'));
  const orderId  = esc(o.order_id || '—');
  const cod      = codAmount(o);
  const delCost  = deliveryCost(o);
  const prepaid  = cod <= 0;
  const hasDel   = delCost > 0;
  const msg      = pickStable(MESSAGES, o.order_id || o.id);
  const csPhone  = o.market === 'turkey' ? COMPANY.whatsapp : COMPANY.customerService.syria;

  // واتساب فقط إذا مختلف عن الهاتف
  const waLine = (rawWa && rawWa !== rawPhone)
    ? `<span class="sep">·</span><span>💬 ${esc(rawWa)}</span>`
    : '';

  // من يدفع الشحن — نحدده من shipping_payer بالطلب
  const shipPayer     = o.shipping_payer || 'company'; // default: company
  const rawDelCost    = Number(o.delivery_cost || 0);
  const companyPaysShip = shipPayer === 'company';

  // ── قسم الدفع ──
  const paySection = hasDel ? `
    <div class="pay pay-d">
      <div class="pay-sub">
        <span>📦 بضاعة: <b>${fmtAmount(cod, o.currency)}</b></span>
        <span class="pay-plus">+</span>
        <span>🚚 توصيل: <b>${fmtAmount(delCost, o.currency)}</b>
          <span class="bearer bearer-cust">على العميل</span></span>
      </div>
      <div class="pay-main">
        <span class="fee">💳 التحصيل على العميل</span>
        <span class="amount">${fmtAmount(cod + delCost, o.currency)}</span>
      </div>
    </div>` : `
    <div class="pay pay-d">
      <div class="pay-sub">
        ${companyPaysShip
          ? `<span>🚚 أجور الشحن: <span class="bearer bearer-send">على الشركة ✓${rawDelCost > 0 ? ` (${fmtAmount(rawDelCost, o.currency)})` : ''}</span></span>`
          : `<span>🚚 أجور التوصيل: <span class="bearer ${prepaid ? 'bearer-send' : 'bearer-cust'}">${prepaid ? 'على المرسل ✓' : 'على المستلم'}</span></span>`
        }
      </div>
      <div class="pay-main">
        <span class="fee">${prepaid ? '✅ مدفوع مسبقاً' : '💳 التحصيل على العميل'}</span>
        <span class="${prepaid ? 'paid-mark' : 'amount'}">${prepaid ? 'مدفوع ✓' : fmtAmount(cod, o.currency)}</span>
      </div>
    </div>`;

  return `
<div class="label">

  <!-- رأس البوليصة -->
  <div class="head">
    <span class="counter">${idx + 1}/${total}</span>
    <div class="wordmark">
      <span class="wm-main">L O W E ' S</span>
      <span class="wm-sub">p r o f e s s i o n a l</span>
    </div>
    <span class="date">${dateStr}</span>
  </div>
  <div class="gold-rule"></div>

  <!-- محتوى متغيّر — يمتص المساحة المتاحة -->
  <div class="label-body">
    <div class="cust">${name}</div>
    <div class="phones" dir="ltr"><span>📞 ${phone}</span>${waLine}</div>
    <div class="addr">📍 ${addr}</div>
    <div class="mid">
      <div class="order-box">طلب <b>${orderId}</b></div>
      <span class="ship-sep">·</span>
      <span class="ship">🚚 ${company}</span>
    </div>
    <div class="msg">🎀 <b>${esc(firstName(o.customer_name))}</b>، ${esc(msg)} — <span class="sig">Lowe's Professional</span></div>
  </div>

  <!-- الدفع — ثابت دائماً -->
  ${paySection}

  <!-- التذييل — QR انستا يمين · نص وسط · QR شبكة النجوم يسار -->
  <div class="foot">
    <div class="qr-item"><img src="${igQrDataUrl}" alt="انستغرام" /><div class="qr-lbl">📸 تابعي</div></div>
    <div class="foot-txt">
      <div class="star-cta">⭐ انضمي لشبكة النجوم واكسبي عمولة حتى 50%</div>
      <div class="ig">📸 ${esc(COMPANY.instagramSkincare)} · 📞 ${esc(csPhone)}</div>
      <div class="cs">📧 ${esc(COMPANY.email)}</div>
      <div class="slogan">${esc(BRAND.sloganAr)}</div>
    </div>
    <div class="qr-item"><img src="${joinQrDataUrl}" alt="شبكة النجوم" /><div class="qr-lbl">⭐ انضمي</div></div>
  </div>

</div>`;
}

// ────────────────────────────────────────────────────────────────
//  buildLabelsHTML — مستند HTML كامل (صفحات A4 / 8 بوليصات/ورقة)
// ────────────────────────────────────────────────────────────────
export async function buildLabelsHTML(orders) {
  const qrOpts = { width: 200, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } };
  // توليد QR انستا + شبكة النجوم — PNG عبر canvas (مربعات مملوءة للطباعة)
  const [igQrDataUrl, joinQrDataUrl] = await Promise.all([
    QRCode.toDataURL(IG_URL,   qrOpts),
    QRCode.toDataURL(JOIN_URL, qrOpts),
  ]);

  const now = new Date();
  const dateStr = `${now.toLocaleDateString('en-CA')} ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  const total = orders.length;

  const pages = [];
  for (let i = 0; i < orders.length; i += 8) pages.push(orders.slice(i, i + 8));

  let globalIdx = 0;
  const sheets = pages.map((page) => `
    <section class="sheet">
      ${page.map((o) => labelHTML(o, globalIdx++, total, dateStr, joinQrDataUrl, igQrDataUrl)).join('')}
    </section>`).join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>بوليصات LOWE'S — ${total} طلب — ${dateStr}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&family=El+Messiri:wght@600;700&family=Playfair+Display:ital,wght@0,600;1,500&display=swap');

* { margin:0; padding:0; box-sizing:border-box; }
html,body { background:#e8e8e8; }
@page { size:A4; margin:0; }

/* ── صفحة A4 — 2 عمود × 4 صفوف ── */
.sheet {
  width:210mm; height:297mm;
  display:grid;
  grid-template-columns:1fr 1fr;
  grid-template-rows:repeat(4,1fr);
  background:#fff;
  margin:0 auto 8mm;
  page-break-after:always;
  direction:rtl;
}
@media print {
  html,body { background:#fff; }
  .sheet { margin:0; box-shadow:none; }
}

/* ═══════════════════════════════════════
   البوليصة — height:100% لملء الـ grid
   ═══════════════════════════════════════ */
.label {
  height:100%;
  font-family:'Tajawal',sans-serif;
  color:#0f1f3d;
  border:.3mm solid #D4C89A;
  padding:2.5mm 3.5mm 2mm;
  display:flex;
  flex-direction:column;
  overflow:hidden;
  font-size:8.5pt;
  line-height:1.32;
  background:#fff;
  position:relative;
}
/* شريط ذهبي علوي رفيع (هوية البراند) */
.label::before {
  content:'';
  position:absolute;
  top:0; right:0; left:0;
  height:.9mm;
  background:linear-gradient(90deg,transparent 0%,${BRAND_COLORS.gold} 15%,${BRAND_COLORS.gold} 85%,transparent 100%);
}

/* ── رأس البوليصة (ثابت) ── */
.head {
  flex-shrink:0;
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  padding-top:.8mm;
  background:#FDFAF2;
  margin:-2.5mm -3.5mm 0;
  padding:1.5mm 3.5mm 1mm;
}
.wordmark { text-align:center; flex:1; }
.wm-main {
  font-family:'Playfair Display',serif;
  font-weight:600;
  font-size:12.5pt;
  letter-spacing:.22em;
  display:block;
  color:#0f1f3d;
}
.wm-sub {
  font-family:'Playfair Display',serif;
  font-size:5.8pt;
  letter-spacing:.36em;
  color:#b8a060;
  display:block;
  margin-top:-.2mm;
}
.counter,.date {
  font-size:6pt;
  color:#adb5bd;
  direction:ltr;
  white-space:nowrap;
  padding-top:.4mm;
}

/* ── الخط الذهبي ── */
.gold-rule {
  flex-shrink:0;
  height:.7mm;
  background:linear-gradient(90deg,transparent 0%,${BRAND_COLORS.gold} 15%,${BRAND_COLORS.gold} 85%,transparent 100%);
  margin:.8mm 0;
}

/* ── جسم البوليصة — flex:1 يمتص المساحة ── */
.label-body {
  flex:1 1 0;
  min-height:0;
  overflow:hidden;
  display:flex;
  flex-direction:column;
  gap:.55mm;
}

.cust {
  font-family:'El Messiri',sans-serif;
  font-weight:700;
  font-size:13pt;
  text-align:center;
  color:#0f1f3d;
  line-height:1.1;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.phones {
  text-align:center;
  font-size:9.2pt;
  font-weight:700;
  letter-spacing:.02em;
  color:#111827;
}
.phones .sep { color:${BRAND_COLORS.gold}; margin:0 1.5mm; }
.addr {
  text-align:center;
  font-size:7.8pt;
  color:#374151;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.mid {
  display:flex;
  align-items:center;
  justify-content:center;
  gap:2.5mm;
  flex-wrap:wrap;
}
.order-box {
  border:.35mm solid ${BRAND_COLORS.gold};
  border-radius:1.5mm;
  padding:.3mm 2.8mm;
  font-size:8.5pt;
  background:#fdfaf2;
  white-space:nowrap;
}
.order-box b { font-size:9.5pt; letter-spacing:.04em; color:#0f1f3d; }
.ship-sep { color:${BRAND_COLORS.gold}; }
.ship { font-size:8pt; color:#374151; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:50mm; }

.msg {
  text-align:center;
  font-size:7.6pt;
  color:#4b5563;
  font-family:'El Messiri',sans-serif;
  line-height:1.25;
  overflow:hidden;
  display:-webkit-box;
  -webkit-line-clamp:2;
  -webkit-box-orient:vertical;
}
.msg .sig {
  font-family:'Playfair Display',serif;
  font-style:italic;
  font-size:7pt;
  color:#9ca3af;
}

/* ── قسم الدفع (ثابت — لا يختفي) ── */
.pay {
  flex-shrink:0;
  display:flex;
  align-items:center;
  justify-content:space-between;
  border:.35mm solid ${BRAND_COLORS.gold};
  border-radius:2mm;
  padding:1mm 2.5mm;
  margin-top:.6mm;
  background:#fdfaf2;
  gap:2mm;
}
/* تفصيل البضاعة + التوصيل */
.pay.pay-d {
  flex-direction:column;
  gap:.3mm;
  padding:.8mm 2.5mm;
}
.pay-sub {
  display:flex;
  align-items:center;
  justify-content:center;
  gap:2.5mm;
  font-size:7.5pt;
  color:#6b7280;
  padding-bottom:.4mm;
  border-bottom:.2mm solid #e8dab5;
}
.pay-sub b { color:#0f1f3d; }
.pay-plus { color:${BRAND_COLORS.gold}; font-weight:900; }
.pay-main {
  display:flex;
  align-items:center;
  justify-content:space-between;
}

.fee { font-size:8pt; font-weight:700; color:#0f1f3d; }
.amount {
  font-size:13pt;
  font-weight:900;
  direction:ltr;
  color:#0f1f3d;
  letter-spacing:.01em;
}
.paid-mark {
  font-size:9pt;
  font-weight:700;
  color:#059669;
  direction:ltr;
}
.bearer { font-size:6.5pt; font-weight:700; border-radius:1mm; padding:.1mm 1.2mm; margin-right:1mm; }
.bearer-cust { background:#fef3c7; color:#92400e; }
.bearer-send { background:#d1fae5; color:#065f46; }

/* ── تذييل: QR شبكة النجوم + تواصل ── */
.foot {
  flex-shrink:0;
  display:flex;
  align-items:center;
  gap:2mm;
  margin-top:.8mm;
  padding-top:.8mm;
  border-top:.35mm solid ${BRAND_COLORS.gold};
  background:#FDFAF2;
  margin-left:-3.5mm; margin-right:-3.5mm; margin-bottom:-2mm;
  padding:1mm 3.5mm 1.5mm;
}
.qr-item { flex-shrink:0; display:flex; flex-direction:column; align-items:center; gap:.5mm; }
.qr-item img { width:13mm; height:13mm; display:block; image-rendering:crisp-edges; border:.25mm solid #e8dab5; border-radius:1mm; padding:.3mm; background:#fff; }
.qr-lbl { font-size:4.8pt; color:#6b7280; text-align:center; white-space:nowrap; }
.foot-txt { flex:1; min-width:0; }
.star-cta {
  font-size:7pt;
  font-weight:800;
  color:${BRAND_COLORS.gold};
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  margin-bottom:.3mm;
}
.ig { font-size:6.5pt; font-weight:700; color:#0f1f3d; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.cs { font-size:6pt; color:#4b5563; margin-top:.2mm; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.slogan { font-family:'El Messiri',sans-serif; font-size:6pt; color:#b8a060; margin-top:.2mm; font-style:italic; }
</style>
</head>
<body>
${sheets}
<script>
  // انتظر تحميل الخطوط ثم اطبع
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve())
    .then(function(){ setTimeout(function(){ window.print(); }, 900); });
</script>
</body>
</html>`;
}

/** افتح نافذة الطباعة (async). */
export async function openLabelsPrint(orders) {
  if (!orders?.length) return;
  const html = await buildLabelsHTML(orders);
  const w = window.open('', '_blank', 'width=940,height=1120');
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

// أي الطلبات تُطبع لها بوليصة؟
// سوريا: «وارد جديد» · تركيا: «تحضير الموتور»
export function labelEligible(o) {
  if (!o || o.archived === true || o.deleted_at) return false;
  if (o.market === 'syria')  return o.status === 'pending';
  if (o.market === 'turkey') return o.status === 'motor_prep';
  return false;
}
