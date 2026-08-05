// =============================================================
// shippingTracking — رابط تتبّع علني (شركة الشحن نفسها) حسب اسم الشركة
// ورقم التتبع. مستخرَج من OrdersScreen.jsx (5 أغسطس 2026) ليُعاد استخدامه
// أيضاً بشاشة واتساب الإدارية (رسالة "رابط التتبع" الديناميكية).
// =============================================================
const TRACKING_URLS = {
  'Yurtiçi Kargo': (n) => `https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code=${n}`,
  'Aras Kargo':    (n) => `https://kargotakip.aras.com.tr/?id=${n}`,
  'PTT Kargo':     (_n) => `https://turkiye.ptt.gov.tr/anasayfa#`,
  'Sürat Kargo':   (n) => `https://www.suratkargo.com.tr/KargoTakip/?takipNo=${n}`,
  'MNG Kargo':     (n) => `https://www.mngkargo.com.tr/tr/musteri-hizmetleri/kargo-sorgula?trackingNumber=${n}`,
};

export function trackingLink(company, number) {
  if (!number) return null;
  // بابل اكسبرس (سوريا): صفحة تتبّع عامة — نطابق أي صيغة للاسم
  if (/بابل|babel/i.test(company || '')) return `https://www.babel-express.com/track?awb=${encodeURIComponent(number)}`;
  // شركة الكرم (سوريا): صفحة تتبّع عامة بلا تسجيل دخول
  if (/كرم/i.test(company || '')) return `https://newpost.mrkaram.com/track/${encodeURIComponent(number)}`;
  const fn = company ? TRACKING_URLS[company] : null;
  if (fn) return fn(number);
  // Universal fallback for any company with a tracking number
  if (number) return `https://kargomnerede.com.tr/tracking?t=${encodeURIComponent(number)}`;
  return null;
}
