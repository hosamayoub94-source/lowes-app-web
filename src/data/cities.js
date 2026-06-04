// =============================================================
// City suggestions per market — used as a datalist in the order
// form. The input stays free-text (employee can type/edit any
// name); these are quick-pick suggestions sourced from real data.
// =============================================================

// Syria — from the live LOWES Sales sheet + governorates.
export const SYRIA_CITIES = [
  'دمشق', 'ريف دمشق', 'حلب', 'حمص', 'حماة', 'اللاذقية', 'طرطوس',
  'إدلب', 'درعا', 'السويداء', 'القنيطرة', 'دير الزور', 'الرقة', 'الحسكة',
  'القامشلي', 'جبلة', 'بانياس', 'منبج', 'رستن', 'أريحا',
];

export const TURKEY_CITIES = [
  'إسطنبول', 'أنقرة', 'إزمير', 'بورصة', 'أنطاليا', 'غازي عنتاب', 'قونيا',
  'أضنة', 'مرسين', 'قيصري', 'هاتاي', 'شانلي أورفا', 'كوجالي (إزميت)',
  'ديار بكر', 'سامسون', 'دنيزلي', 'إسكي شهير', 'مالطية', 'كهرمان مرعش',
];

// Shipping companies per market (from the live sheet for Syria).
export const SYRIA_SHIPPING = ['شركة الكرم', 'قدموس', 'مسارات', 'إيزلا', 'توصيل جرمانا', 'توصيل ميتور', 'أخرى'];
export const TURKEY_SHIPPING = ['yurtiçi', 'Aras', 'ptt', 'توصيل الموتور', 'أخرى'];

// Payment methods per market (from the live sheet for Syria).
export const SYRIA_PAYMENT = ['Cash on Delivery 📦', 'دفع عند الاستلام', 'Sham Cash', 'تحويل', 'أخرى'];
export const TURKEY_PAYMENT = ['دفع عند الباب', 'تحويل بنكي', 'Papara', 'أخرى'];

// Istanbul European-side districts → motorcycle delivery zone (توصيل موتور).
export const ISTANBUL_MOTOR_DISTRICTS = [
  'AVCILAR', 'BAĞCILAR', 'BAHÇELİEVLER', 'BAKIRKÖY', 'BAŞAKŞEHİR', 'BAYRAMPAŞA',
  'BEŞİKTAŞ', 'BEYLİKDÜZÜ', 'BEYOĞLU', 'ESENLER', 'ESENYURT', 'EYÜPSULTAN',
  'FATİH', 'GAZİOSMANPAŞA', 'GÜNGÖREN', 'KAĞITHANE', 'KÜÇÜKÇEKMECE',
  'SULTANGAZİ', 'ŞİŞLİ', 'ZEYTİNBURNU',
];
// Full Istanbul district suggestions (European motor zone + common Asian side).
export const ISTANBUL_DISTRICTS = [
  ...ISTANBUL_MOTOR_DISTRICTS,
  'KADIKÖY', 'ÜSKÜDAR', 'MALTEPE', 'ATAŞEHİR', 'PENDİK', 'KARTAL', 'ÜMRANİYE', 'SANCAKTEPE', 'TUZLA',
];

const isIstanbul = (city) => /istanbul|إسطنبول|اسطنبول|استانبول/i.test(String(city || ''));

export function citiesForMarket(market) {
  if (market === 'syria')  return SYRIA_CITIES;
  if (market === 'turkey') return TURKEY_CITIES;
  return [];
}

// District (بلدية) suggestions for a city (Istanbul has a known list).
export function districtsForCity(market, city) {
  if (market === 'turkey' && isIstanbul(city)) return ISTANBUL_DISTRICTS;
  return [];
}

// Is this address in the Istanbul motorcycle-delivery zone?
export function isMotorZone(city, district) {
  if (!isIstanbul(city)) return false;
  const d = String(district || '').trim().toLowerCase();
  return ISTANBUL_MOTOR_DISTRICTS.some((x) => x.toLowerCase() === d);
}

// Build a Turkish address line from parts.
export function buildTurkishAddress({ mahalle, sokak, bno, daire } = {}) {
  const parts = [];
  if (mahalle) parts.push(`${mahalle} Mah.`);
  if (sokak)   parts.push(`${sokak} Sok.`);
  if (bno)     parts.push(`No:${bno}`);
  if (daire)   parts.push(`D:${daire}`);
  return parts.join(' ');
}
export function shippingForMarket(market) {
  return market === 'turkey' ? TURKEY_SHIPPING : SYRIA_SHIPPING;
}
export function paymentForMarket(market) {
  return market === 'turkey' ? TURKEY_PAYMENT : SYRIA_PAYMENT;
}
