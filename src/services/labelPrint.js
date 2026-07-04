// =============================================================
// labelPrint — طباعة بوليصات الشحن (A4 = 8 بوليصات، 2×4)
// سوريا: طلبات «في التجهيز» · تركيا: طلبات «تحضير الموتور».
// هوية LOWE'S الرسمية: أبيض مسيطر · نص أسود · ذهبي #C9A646 accent.
// بلا تبعيات: window.open + window.print (نفس نمط printPayslip).
// =============================================================

import { BRAND, COMPANY, BRAND_COLORS } from '@data/brand';
import igQrSvg from '../assets/ig-qr.svg?raw';

// ── رسائل شخصية للعميل (نبرة البراند: دافئة، راقية، من القلب) ──
// تُختار بثبات حسب رقم الطلب — إعادة الطباعة تعطي نفس الرسالة.
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

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// اختيار ثابت (deterministic) من قائمة حسب نص — نفس الطلب = نفس الرسالة.
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

// المبلغ المطلوب تحصيله عند التسليم (يراعي الدفع الجزئي/الكامل).
function codAmount(o) {
  if (o.payment_status === 'paid') return 0;
  const total = Number(o.amount || 0);
  if (o.payment_status === 'partial' && Number(o.paid_amount) > 0) {
    return Math.max(0, total - Number(o.paid_amount));
  }
  return total;
}

function addressLine(o) {
  const parts = [o.city, o.district, o.sy_neighborhood, o.address]
    .map(p => String(p || '').trim()).filter(Boolean);
  // أزل التكرار (المدينة قد تتكرر داخل العنوان المفصّل)
  return [...new Set(parts)].join(' – ');
}

function labelHTML(o, idx, total, dateStr) {
  const name    = esc(o.customer_name || '—');
  const phone   = esc(o.phone_1 || o.phone_2 || o.wa_number || '—');
  const wa      = esc(o.wa_number || o.phone_1 || '—');
  const addr    = esc(addressLine(o) || '—');
  const company = esc(o.shipping_company || (o.market === 'turkey' ? 'توصيل الموتور' : 'شركة الشحن'));
  const cod     = codAmount(o);
  const prepaid = cod <= 0;
  const msg     = pickStable(MESSAGES, o.order_id || o.id);
  const csPhone = o.market === 'turkey' ? COMPANY.whatsapp : COMPANY.customerService.syria;

  return `
  <div class="label">
    <div class="head">
      <span class="counter">${idx + 1} / ${total}</span>
      <div class="wordmark">
        <span class="wm-main">L O W E ' S</span>
        <span class="wm-sub">p r o f e s s i o n a l</span>
      </div>
      <span class="date">${dateStr}</span>
    </div>
    <div class="gold-rule"></div>

    <div class="cust">${name}</div>
    <div class="row phones" dir="ltr">
      <span>📞 ${phone}</span><span class="sep">·</span><span>💬 ${wa}</span>
    </div>
    <div class="row addr">📍 ${addr}</div>

    <div class="mid">
      <div class="order-box">📦 طلب رقم: <b>${esc(o.order_id || '')}</b></div>
      <div class="ship">🚚 شركة الشحن: <b>${company}</b></div>
    </div>

    <div class="msg">🎀 <b>${esc(firstName(o.customer_name))}</b> 🤍 ${esc(msg)} — <span class="sig">Lowe's Professional</span></div>

    <div class="pay">
      <span class="fee">${prepaid ? '✅ مدفوع مسبقاً — أجرة الشحن على المرسل' : '💳 التحصيل على العميل'}</span>
      <span class="amount">💰 ${prepaid ? fmtAmount(0, o.currency) : fmtAmount(cod, o.currency)}</span>
    </div>

    <div class="foot">
      <div class="qr">${igQrSvg}</div>
      <div class="foot-txt">
        <div class="ig">📸 Instagram: <b dir="ltr">@lowes.skincare</b> — امسحي الرمز وكوني قريبة منا 💛</div>
        <div class="cs" dir="rtl">📞 خدمة العملاء: <b dir="ltr">${esc(csPhone)}</b> · 📧 <b dir="ltr">${esc(COMPANY.email)}</b></div>
        <div class="slogan">${esc(BRAND.sloganAr)}</div>
      </div>
    </div>
  </div>`;
}

/**
 * ابنِ HTML صفحات البوليصات (A4 — 8 بوليصات بالصفحة) — مفصول للفحص/الاختبار.
 * @param {Array} orders — الطلبات المختارة
 */
export function buildLabelsHTML(orders) {
  const now = new Date();
  const dateStr = `${now.toLocaleDateString('en-CA')} ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  const total = orders.length;

  // 8 بوليصات لكل ورقة A4 (عمودان × 4 صفوف)
  const pages = [];
  for (let i = 0; i < orders.length; i += 8) pages.push(orders.slice(i, i + 8));

  const sheets = pages.map(page => `
    <section class="sheet">
      ${page.map(o => labelHTML(o, orders.indexOf(o), total, dateStr)).join('')}
    </section>`).join('');

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>بوليصات LOWE'S — ${total} طلب — ${dateStr}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&family=El+Messiri:wght@600;700&family=Playfair+Display:ital,wght@0,600;1,500&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { background:#f3f4f6; }
  @page { size: A4; margin: 0; }

  .sheet {
    width:210mm; height:296mm;
    display:grid; grid-template-columns:1fr 1fr; grid-template-rows:repeat(4, 1fr);
    background:#fff; margin:0 auto 8mm; page-break-after:always; direction:rtl;
  }
  @media print {
    html, body { background:#fff; }
    .sheet { margin:0; box-shadow:none; }
  }

  .label {
    font-family:'Tajawal',sans-serif; color:#000;
    border:0.4mm dashed #b9b0a0;
    padding:2.5mm 3.5mm 2mm;
    display:flex; flex-direction:column; overflow:hidden;
    font-size:9.2pt; line-height:1.38;
  }

  /* ── رأس البوليصة ── */
  .head { display:flex; align-items:flex-start; justify-content:space-between; }
  .wordmark { text-align:center; flex:1; }
  .wm-main { font-family:'Playfair Display',serif; font-weight:600; font-size:12.5pt; letter-spacing:.18em; display:block; }
  .wm-sub  { font-family:'Playfair Display',serif; font-size:6.5pt; letter-spacing:.34em; color:${BRAND_COLORS.warmGray}; display:block; margin-top:-1px; }
  .counter, .date { font-size:6.5pt; color:${BRAND_COLORS.warmGray}; direction:ltr; white-space:nowrap; }
  .gold-rule { height:0.5mm; background:linear-gradient(90deg, transparent, ${BRAND_COLORS.gold}, transparent); margin:1mm 0 1.2mm; }

  /* ── بيانات العميل ── */
  .cust { font-family:'El Messiri',sans-serif; font-weight:700; font-size:12pt; text-align:center; }
  .row { text-align:center; }
  .phones { font-size:9.5pt; font-weight:700; }
  .phones .sep { color:${BRAND_COLORS.gold}; margin:0 1.5mm; }
  .addr { font-size:8.6pt; }

  /* ── الطلب والشحن ── */
  .mid { display:flex; align-items:center; justify-content:center; gap:3mm; margin:1mm 0; flex-wrap:wrap; }
  .order-box {
    border:0.35mm solid ${BRAND_COLORS.gold}; border-radius:2mm;
    padding:0.4mm 2.6mm; font-size:9.6pt; background:#fdfaf2;
  }
  .order-box b { font-size:10.6pt; letter-spacing:.04em; }
  .ship { font-size:9pt; }

  /* ── الرسالة الشخصية ── */
  .msg {
    text-align:center; font-size:8.2pt; color:#1f2937;
    font-family:'El Messiri',sans-serif;
    padding:0 1.5mm; margin:0.4mm 0;
  }
  .msg .sig { font-family:'Playfair Display',serif; font-style:italic; font-size:7.6pt; white-space:nowrap; }

  /* ── الدفع ── */
  .pay {
    display:flex; align-items:center; justify-content:space-between;
    border-top:0.25mm solid #e5dfd2; border-bottom:0.25mm solid #e5dfd2;
    padding:0.8mm 1mm; margin-top:auto;
  }
  .fee { font-size:8.4pt; font-weight:700; }
  .amount { font-size:11pt; font-weight:800; direction:ltr; }

  /* ── التذييل: QR + تواصل ── */
  .foot { display:flex; align-items:center; gap:2.5mm; margin-top:1mm; }
  .qr { width:13.5mm; height:13.5mm; flex-shrink:0; }
  .qr svg { width:100%; height:100%; display:block; }
  .foot-txt { flex:1; min-width:0; }
  .ig { font-size:7.4pt; font-weight:700; }
  .cs { font-size:7.2pt; color:#1f2937; }
  .slogan { font-family:'El Messiri',sans-serif; font-size:7.4pt; color:${BRAND_COLORS.warmGray}; margin-top:0.3mm; }
</style>
</head>
<body>
${sheets}
<script>
  // انتظر تحميل الخطوط ثم اطبع (الصور inline SVG فلا انتظار لها)
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve())
    .then(function(){ setTimeout(function(){ window.print(); }, 350); });
</script>
</body>
</html>`;
  return html;
}

/** افتح نافذة الطباعة. */
export function openLabelsPrint(orders) {
  if (!orders?.length) return;
  const html = buildLabelsHTML(orders);
  const w = window.open('', '_blank', 'width=900,height=1100');
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

// ── الأهلية: أي الطلبات تُطبع لها بوليصة؟ ─────────────────────
// سوريا: «وارد جديد» فقط (تُطبع البوليصة فور وصول الطلب) · تركيا: «تحضير
// الموتور» فقط (يورتيتشي لها بوليصتها).
export function labelEligible(o) {
  if (!o || o.archived === true || o.deleted_at) return false;
  if (o.market === 'syria')  return o.status === 'pending';
  if (o.market === 'turkey') return o.status === 'motor_prep';
  return false;
}
