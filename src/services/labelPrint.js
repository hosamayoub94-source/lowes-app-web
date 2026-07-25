// =============================================================
// labelPrint — طباعة بوليصات الشحن (A4 = 8 بوليصات، 2×4)
// هوية LOWE'S الرسمية: أبيض مسيطر · نص أسود · ذهبي #C9A646.
// بلا تبعيات شبكية: window.open + window.print.
// QR: مولَّد برمجياً (qrcode) → حبر أسود خالص، آمن للطباعة.
// =============================================================

import QRCode from 'qrcode';
import { BRAND, COMPANY, BRAND_COLORS } from '@data/brand';
import { supabase } from './supabase';

const JOIN_URL = 'https://app.lowesprofesyonel.com/join';
const IG_URL   = COMPANY.instagramSkincareUrl;

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
//  جرد إغلاق اليوم — تقرير المنتجات التي «طلعت فعلاً» ضمن دفعة
//  البوليصات المطبوعة (لا مخزون المستودع الحالي). يُجمَّع من
//  حقل orders.items لكل طلب مطبوع، ثم يُحفَظ كسجل خروج يومي
//  (inventory_daily_log) لمراقبة الحركة عبر الزمن. best-effort:
//  لا تُفشِل الطباعة إن كان الجدول غير موجود بعد (SQL لم يُطبَّق).
// ────────────────────────────────────────────────────────────────
const MARKET_LBL = { syria: '🇸🇾 سوريا', turkey: '🇹🇷 تركيا' };

const normName = (s) => String(s || '').trim().toLowerCase();

// يجمّع أصناف/كميات الطلبات المطبوعة فعلياً لسوق واحد (ما طلع، لا ما تبقّى بالمخزن).
function getShippedProducts(orders, market) {
  const agg = {};
  for (const o of orders) {
    if (o.market !== market) continue;
    (o.items || []).forEach((it) => {
      const name = String(it.name || '').trim();
      if (!name) return;
      const k = normName(name);
      if (!agg[k]) agg[k] = { key: k, name, qty: 0 };
      agg[k].qty += Number(it.qty || 1);
    });
  }
  return Object.values(agg).sort((a, b) => b.qty - a.qty);
}

// يحفظ لقطة اليوم (upsert — طباعات متعددة بنفس اليوم تُحدّث نفس الصف، لا تكرار).
// ملاحظة: quantity هنا تمثّل عدد القطع «الخارجة» بهذه الدفعة (وليست رصيداً متبقياً).
// inventory_daily_log.product_id هو FK حقيقي لـ products.id (uuid) — لذا نطابق
// اسم الصنف بالمنتج الفعلي قبل الحفظ؛ أي صنف بلا تطابق (اسم غير موجود بالكتالوج) يُتجاهَل بصمت.
async function saveDailySnapshot(market, rows) {
  if (!rows?.length) return;
  try {
    const { data: products } = await supabase.from('products').select('id, name');
    const idByName = new Map((products || []).map((p) => [normName(p.name), p.id]));
    const logDate = new Date().toISOString().slice(0, 10);
    const payload = rows
      .map((r) => ({ log_date: logDate, market, product_id: idByName.get(r.key), quantity: r.qty }))
      .filter((r) => r.product_id);
    if (!payload.length) return;
    await supabase.from('inventory_daily_log').upsert(payload, { onConflict: 'log_date,market,product_id' });
  } catch {
    // الجدول قد لا يكون موجوداً بعد (SQL لم يُطبَّق) — لا نُفشِل الطباعة لأجله.
  }
}

// صفحة جرد مطبوعة لسوق واحد: عمودان × N صف — مضغوطة لتناسب A4 واحدة.
function inventoryReportHTML(market, rows, dateStr, orderCount) {
  const total = rows.reduce((s, r) => s + r.qty, 0);
  const half = Math.ceil(rows.length / 2);
  const col1 = rows.slice(0, half);
  const col2 = rows.slice(half);
  const rowHTML = (r) => `<div class="rep-row"><span class="rep-name">${esc(r.name)}</span><span class="rep-qty">${r.qty}</span></div>`;
  return `
<section class="report-sheet">
  <div class="report-head">
    <div class="wordmark"><span class="wm-main">L O W E ' S</span><span class="wm-sub">p r o f e s s i o n a l</span></div>
    <div class="report-title">📋 المنتجات الخارجة اليوم — ${MARKET_LBL[market] || market}</div>
    <div class="report-meta">${dateStr} · ${orderCount} طلب مطبوع · ${rows.length} صنف · إجمالي ${total} قطعة خارجة</div>
  </div>
  <div class="gold-rule"></div>
  <div class="report-cols">
    <div class="report-col">${col1.map(rowHTML).join('')}</div>
    <div class="report-col">${col2.map(rowHTML).join('')}</div>
  </div>
  <p class="report-note">تُحسب من طلبات هذه الدفعة المطبوعة فقط (ما طلع فعلياً)، وتُحفَظ تلقائياً (جدول inventory_daily_log) لمقارنة الحركة يوماً بيوم.</p>
</section>`;
}

// ارتفاع صف بوليصات واحد داخل الشبكة (297مم ÷ 4 صفوف).
const SHEET_ROW_MM = 74.25;

// نسخة مضغوطة من التقرير تُدمَج داخل الخانات الفارغة لآخر ورقة بوليصات
// (بدل صفحة منفصلة) — توفيراً للورق عندما تكون الورقة الأخيرة غير مكتملة.
// rowSpan = عدد صفوف الشبكة (من أصل 4) التي يشغلها هذا الجزء.
function mergedReportHTML(market, rows, dateStr, orderCount, rowSpan) {
  const total = rows.reduce((s, r) => s + r.qty, 0);
  const half = Math.ceil(rows.length / 2);
  const col1 = rows.slice(0, half);
  const col2 = rows.slice(half);
  const rowHTML = (r) => `<div class="rm-row"><span class="rm-name">${esc(r.name)}</span><span class="rm-qty">${r.qty}</span></div>`;
  return `
<div class="report-merge" style="grid-row:1 / span ${rowSpan};">
  <div class="rm-head">
    <div class="rm-title">📋 المنتجات الخارجة اليوم — ${MARKET_LBL[market] || market}</div>
    <div class="rm-meta">${dateStr} · ${orderCount} طلب مطبوع · ${rows.length} صنف · إجمالي ${total} قطعة خارجة</div>
  </div>
  <div class="rm-cols">
    <div class="rm-col">${col1.map(rowHTML).join('')}</div>
    <div class="rm-col">${col2.map(rowHTML).join('')}</div>
  </div>
</div>`;
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
  const lastPage = pages[pages.length - 1] || [];
  const blankCells = pages.length ? 8 - lastPage.length : 0;
  const blankRows = Math.floor(blankCells / 2); // صفوف فارغة كاملة (صفّان لكل صف)
  const oddBlank = blankCells % 2;               // خانة مفردة متبقية إن وُجدت

  // ── المنتجات الخارجة اليوم — تُحسب أولاً لمعرفة إن كانت تسع بالفراغ المتبقي ──
  const markets = [...new Set(orders.map((o) => o.market).filter((m) => m === 'syria' || m === 'turkey'))];
  const shippedByMarket = markets.map((m) => getShippedProducts(orders, m));
  await Promise.all(markets.map((m, i) => saveDailySnapshot(m, shippedByMarket[i])));

  // دمج التقرير داخل الخانات الفارغة لآخر ورقة بوليصات بدل صفحة منفصلة —
  // فقط لو الورقة الأخيرة ناقصة (صفّ فارغ كامل على الأقل)، سوق واحد بالدفعة
  // (أضمن للـ fit)، والمحتوى يسع تقديرياً بالمساحة المتاحة. غير ذلك: صفحة منفصلة كالسابق.
  const RM_ROW_H = 4.8, RM_HEAD_H = 15;
  let mergeMarket = null;
  if (blankRows >= 1 && markets.length === 1 && shippedByMarket[0].length) {
    const usableMm = blankRows * SHEET_ROW_MM - RM_HEAD_H;
    const capacity = Math.floor(usableMm / RM_ROW_H) * 2; // عمودان
    if (shippedByMarket[0].length <= capacity) mergeMarket = markets[0];
  }

  // آخر ورقة قد تحوي أقل من 8 بوليصات — بدل تركها أعلى الورقة مع فراغ كبير
  // أسفلها، تُدفَع للأسفل (خانات فارغة أولاً، أو تقرير مدموج إن أمكن) بحيث
  // تكون آخر البوليصات هي آخر ما يظهر على الورقة، لا مبعثرة أعلاها.
  let globalIdx = 0;
  const sheets = pages.map((page, pageIdx) => {
    const isLast = pageIdx === pages.length - 1;
    const mergeBlock = (isLast && mergeMarket)
      ? mergedReportHTML(mergeMarket, shippedByMarket[0], dateStr, orders.filter((o) => o.market === mergeMarket).length, blankRows)
      : '';
    const fillerCount = isLast ? (mergeMarket ? oddBlank : blankCells) : 0;
    const fillers = Array.from({ length: fillerCount }, () => '<div class="label-empty"></div>').join('');
    const labels = page.map((o) => labelHTML(o, globalIdx++, total, dateStr, joinQrDataUrl, igQrDataUrl)).join('');
    return `
    <section class="sheet">
      ${mergeBlock}${fillers}${labels}
    </section>`;
  }).join('');

  // ما تبقّى من تقارير الأسواق التي لم تُدمَج (صفحة/صفحتان منفصلة في آخر المستند).
  const reportSheets = markets
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m !== mergeMarket)
    .map(({ m, i }) => inventoryReportHTML(m, shippedByMarket[i], dateStr, orders.filter((o) => o.market === m).length))
    .join('');

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

/* خانة فارغة (آخر ورقة غير مكتملة) — بلا حدود ولا محتوى */
.label-empty { height:100%; }

/* تقرير المنتجات الخارجة مدموج داخل خانات فارغة بآخر ورقة بوليصات */
.report-merge {
  grid-column:1 / -1;
  height:100%;
  border:.3mm solid ${BRAND_COLORS.gold};
  border-radius:1.5mm;
  background:#fff;
  padding:2mm 5mm;
  display:flex;
  flex-direction:column;
  overflow:hidden;
  font-family:'Tajawal',sans-serif;
  color:#0f1f3d;
  direction:rtl;
}
.rm-head { text-align:center; flex-shrink:0; }
.rm-title { font-family:'El Messiri',sans-serif; font-weight:700; font-size:10.5pt; }
.rm-meta { font-size:7.5pt; color:#6b7280; margin-top:.6mm; }
.rm-cols { display:flex; gap:6mm; margin-top:2mm; flex:1; min-height:0; overflow:hidden; }
.rm-col { flex:1; }
.rm-row {
  display:flex; align-items:center; justify-content:space-between;
  padding:.9mm 0; border-bottom:.2mm solid #eee; font-size:7.6pt;
}
.rm-name { flex:1; }
.rm-qty { font-weight:800; direction:ltr; }

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

/* ── صفحة جرد إغلاق اليوم ── */
.report-sheet {
  width:210mm; min-height:297mm;
  background:#fff;
  margin:0 auto 8mm;
  padding:12mm 14mm;
  page-break-after:always;
  font-family:'Tajawal',sans-serif;
  color:#0f1f3d;
  direction:rtl;
}
.report-head { text-align:center; }
.report-title { font-family:'El Messiri',sans-serif; font-weight:700; font-size:14pt; margin-top:3mm; }
.report-meta { font-size:9pt; color:#6b7280; margin-top:1mm; }
.report-cols { display:flex; gap:8mm; margin-top:6mm; }
.report-col { flex:1; }
.rep-row {
  display:flex; align-items:center; justify-content:space-between;
  padding:1.6mm 0; border-bottom:.2mm solid #eee; font-size:9pt;
}
.rep-name { flex:1; }
.rep-qty { font-weight:800; tabular-nums:1; direction:ltr; }
.report-note { text-align:center; font-size:7.5pt; color:#9ca3af; margin-top:8mm; }
@media print { .report-sheet { margin:0; } }
</style>
</head>
<body>
${sheets}
${reportSheets}
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
