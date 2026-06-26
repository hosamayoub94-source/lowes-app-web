// ════════════════════════════════════════════════════════════════════
// yurticiReport.js — محلّل تقرير يورتيتشي (results.xlsx)
// ────────────────────────────────────────────────────────────────────
// تقرير «Self Servis» الذي يُنزَّل من يورتيتشي بعد مسح البوالص يحوي لكل شحنة:
//   Sevk İrsaliye No = رقم الطلب عندنا · Gönderi Takip No = رقم التتبّع العام (1160…)
//   Gönderi Durumu = الحالة · İade Durumu = حالة الإرجاع.
// هذا التقرير هو المصدر **المضمون** لرقم التتبّع (API الاستعلام SOAP لا يرجّعه —
// مُختبَر حيّاً: يرجّع IND فقط). نطابق بالاسم لا بالموضع (مرن لإعادة ترتيب الأعمدة).
// نقيّ، بلا أعراض جانبية. مُغطّى بـtest-yurtici-report.mjs.
// ════════════════════════════════════════════════════════════════════

// طيّ تركي + تصغير: İ/I/ı→i · ş→s · ğ→g · ç→c · ö→o · ü→u (قبل التصغير لالتقاط الكبير).
const fold = (s) => String(s ?? '')
  .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
  .replace(/Ş/g, 's').replace(/ş/g, 's').replace(/Ğ/g, 'g').replace(/ğ/g, 'g')
  .replace(/Ç/g, 'c').replace(/ç/g, 'c').replace(/Ö/g, 'o').replace(/ö/g, 'o')
  .replace(/Ü/g, 'u').replace(/ü/g, 'u')
  .toLowerCase().replace(/̇/g, '').replace(/\s+/g, ' ').trim();

// رتبة الحالة — للتقدّم فقط (لا تنزيل) وإزالة التكرار بأرفع حالة.
export const REPORT_RANK = {
  pending: 0, preparing: 1, ready: 1, motor_prep: 1, at_center: 2,
  shipped: 3, on_way: 4, not_received: 5, returning: 5, delivered: 6, returned: 6, cancelled: 6, settled: 7,
};

// هل النصّ يدلّ على إرجاع فعليّ؟ (يتجنّب «İadesi Yapılmadı» / «İade Reddedildi» = ليست إرجاعاً).
const isReturn = (s) => {
  const t = fold(s);
  return t.includes('iade') && !/yapilmadi|reddedildi|iptal|yok|hayir/.test(t);
};

// نص حالة يورتيتشي (Gönderi Durumu + İade Durumu) → مفتاح حالة التطبيق.
function mapReportStatus(durumu, iade) {
  if (isReturn(iade) || isReturn(durumu)) return 'returning';
  const t = fold(durumu);
  if (t.includes('teslim edilemedi') || t.includes('bulunamad') || t.includes('adreste yok')) return 'not_received';
  if (t.includes('iptal')) return 'cancelled';
  if (t.includes('teslim edildi')) return 'delivered';
  if (t.includes('dagit') || t.includes('yolda')) return 'on_way';                 // dağıtımda / yolda
  if (t.includes('indirildi') || t.includes('sube') || t.includes('aktarma') || t.includes('merkez') || t.includes('transfer')) return 'at_center';
  if (t.includes('yuklendi') || t.includes('cikis') || t.includes('kabul') || t.includes('tasi') || t.includes('yola')) return 'shipped';
  return null;
}

const cleanId  = (s) => String(s ?? '').trim().replace(/-+$/, '').toUpperCase();
const cleanTrk = (s) => String(s ?? '').replace(/\D/g, '');
const rankOf = (status) => (status ? (REPORT_RANK[status] ?? 0) : -1);

/**
 * parseYurticiReport(rows) → { updates: [{ orderId, tracking, status? }], warnings: [string] }
 * rows = مصفوفة صفوف (الترويسة في rows[0]) — نفس مخرج XLSX.utils.sheet_to_json(ws,{header:1}).
 * عند تكرار الطلب نبقي أرفع حالة (most-advanced) — لا الأوّل/الأخير عشوائياً.
 */
export function parseYurticiReport(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return { updates: [], warnings: [] };

  const header = (Array.isArray(rows[0]) ? rows[0] : []).map(fold);
  const findCol = (phrases) => {
    for (const p of phrases) {
      const idx = header.findIndex((h) => h.includes(p));
      if (idx >= 0) return idx;
    }
    return -1;
  };
  const ci = findCol(['sevk irsaliye no', 'sevk irsaliye', 'irsaliye no']); // رقم الطلب
  const ct = findCol(['gonderi takip no', 'takip no']);                     // رقم 1160
  const cs = findCol(['gonderi durumu']);                                   // الحالة
  const cr = findCol(['iade durumu']);                                      // الإرجاع

  const warnings = [];
  if (ci < 0 || ct < 0) {
    warnings.push('الملف لا يبدو تقرير يورتيتشي (لم أجد عمود «Sevk İrsaliye No» و«Gönderi Takip No»).');
    return { updates: [], warnings };
  }

  const byId = new Map();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const orderId = cleanId(row[ci]);
    const tracking = cleanTrk(row[ct]);
    if (!orderId && !tracking) continue;                                    // صف فارغ
    if (!orderId || !tracking) { warnings.push(`صفّ ناقص (طلب=${orderId || '—'} · تتبّع=${tracking || '—'}) — تُجوهِل.`); continue; }
    const status = mapReportStatus(cs >= 0 ? row[cs] : '', cr >= 0 ? row[cr] : '');
    const prev = byId.get(orderId);
    if (!prev || rankOf(status) > rankOf(prev.status)) {
      byId.set(orderId, status ? { orderId, tracking, status } : { orderId, tracking });
    }
  }
  return { updates: [...byId.values()], warnings };
}
