// =============================================================
// City / district / shipping data for the order form (datalists).
// Inputs stay free-text (editable); these are quick-pick suggestions.
// Turkey uses Turkish names to match the sheet + carriers.
// =============================================================

export const SYRIA_CITIES = [
  'دمشق', 'ريف دمشق', 'حلب', 'حمص', 'حماة', 'اللاذقية', 'طرطوس',
  'إدلب', 'درعا', 'السويداء', 'القنيطرة', 'دير الزور', 'الرقة', 'الحسكة',
  'القامشلي', 'جبلة', 'بانياس', 'منبج', 'رستن', 'أريحا',
];

import { TR_PROVINCES, TR_PROVINCES_DISTRICTS } from './turkeyAddress';

// All 81 Turkish provinces (İl).
export const TURKEY_CITIES = TR_PROVINCES;

// Istanbul European-side districts → motorcycle-delivery zone.
export const ISTANBUL_MOTOR_DISTRICTS = [
  'AVCILAR', 'BAĞCILAR', 'BAHÇELİEVLER', 'BAKIRKÖY', 'BAŞAKŞEHİR', 'BAYRAMPAŞA',
  'BEŞİKTAŞ', 'BEYLİKDÜZÜ', 'BEYOĞLU', 'ESENLER', 'ESENYURT', 'EYÜPSULTAN',
  'FATİH', 'GAZİOSMANPAŞA', 'GÜNGÖREN', 'KAĞITHANE', 'KÜÇÜKÇEKMECE',
  'SULTANGAZİ', 'ŞİŞLİ', 'ZEYTİNBURNU',
];

// Shipping carriers per market.
export const SYRIA_SHIPPING  = ['شركة الكرم', 'قدموس', 'مسارات', 'إيزلا', 'توصيل جرمانا', 'توصيل ميتور', 'بابل', 'أخرى'];
export const TURKEY_SHIPPING = [
  'Yurtiçi Kargo', 'Aras Kargo', 'Sürat Kargo', 'PTT Kargo', 'MNG Kargo',
  'توصيل خاص 🚗', 'توصيل الموتور 🏍️',
  'Trendyol Express', 'HepsiJET', 'Sendeo', 'Kolay Gelsin', 'UPS Kargo',
  'Horoz Lojistik', 'FedEx', 'DHL', 'أخرى',
];

export const SYRIA_PAYMENT  = ['Cash on Delivery 📦', 'دفع عند الاستلام', 'Sham Cash', 'تحويل', 'أخرى'];
export const TURKEY_PAYMENT = ['دفع عند الباب 💵', 'دفع مسبق 💳', 'تحويل بنكي', 'Papara', 'أخرى'];

const norm = (s) => String(s || '').trim().toLowerCase();
const isIstanbul = (city) => /istanbul|إسطنبول|اسطنبول|استانبول/i.test(String(city || ''));

export function citiesForMarket(market) {
  if (market === 'syria')  return SYRIA_CITIES;
  if (market === 'turkey') return TURKEY_CITIES;
  return [];
}
export function shippingForMarket(market) {
  return market === 'turkey' ? TURKEY_SHIPPING : SYRIA_SHIPPING;
}
export function paymentForMarket(market) {
  return market === 'turkey' ? TURKEY_PAYMENT : SYRIA_PAYMENT;
}

// District (İlçe / البلدية) suggestions for the chosen province.
export function districtsForCity(market, city) {
  if (market !== 'turkey') return [];
  const key = Object.keys(TR_PROVINCES_DISTRICTS).find((k) => norm(k) === norm(city));
  return key ? TR_PROVINCES_DISTRICTS[key] : [];
}

export function isMotorZone(city, district) {
  if (!isIstanbul(city)) return false;
  const d = norm(district);
  return ISTANBUL_MOTOR_DISTRICTS.some((x) => norm(x) === d);
}

export function buildTurkishAddress({ mahalle, sokak, bno, daire } = {}) {
  const parts = [];
  if (mahalle) parts.push(`${mahalle} Mah.`);
  if (sokak)   parts.push(`${sokak} Sok.`);
  if (bno)     parts.push(`No:${bno}`);
  if (daire)   parts.push(`D:${daire}`);
  return parts.join(' ');
}

// Inverse of buildTurkishAddress: pull the structured parts back out of a saved
// address string ("X Mah. Y Sok. No:Z D:W") so opening an existing order for edit
// repopulates the Mahalle/Sokak/No/Daire fields (instead of showing them empty).
// A free-form/pasted address that doesn't match returns empty parts — the full
// `address` text is then preserved untouched (the build effect is a no-op).
export function parseTurkishAddress(address) {
  const s = String(address || '').trim();
  const out = { mahalle: '', sokak: '', bno: '', daire: '' };
  if (!s) return out;
  const m = s.match(/^(.*?)\s*Mah\./i);            if (m) out.mahalle = m[1].trim();
  const k = s.match(/Mah\.\s*(.*?)\s*Sok\./i);     if (k) out.sokak = k[1].trim();
  else if (!m) { const k2 = s.match(/^(.*?)\s*Sok\./i); if (k2) out.sokak = k2[1].trim(); }
  const b = s.match(/No:\s*([^\sD]\S*)/i);         if (b) out.bno = b[1].trim();
  const d = s.match(/(?:^|\s)D:\s*(\S+)/i);        if (d) out.daire = d[1].trim();
  return out;
}
