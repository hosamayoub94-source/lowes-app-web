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

// Turkish province names (match the live Turkey sheet).
export const TURKEY_CITIES = [
  'İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya', 'Adana', 'Gaziantep',
  'Konya', 'Mersin', 'Kayseri', 'Hatay', 'Kocaeli', 'Şanlıurfa', 'Manisa',
  'Samsun', 'Denizli', 'Eskişehir', 'Diyarbakır', 'Malatya', 'Kahramanmaraş',
  'Uşak', 'Aydın', 'Balıkesir', 'Trabzon', 'Sakarya',
];

// Istanbul European-side districts → motorcycle-delivery zone.
export const ISTANBUL_MOTOR_DISTRICTS = [
  'AVCILAR', 'BAĞCILAR', 'BAHÇELİEVLER', 'BAKIRKÖY', 'BAŞAKŞEHİR', 'BAYRAMPAŞA',
  'BEŞİKTAŞ', 'BEYLİKDÜZÜ', 'BEYOĞLU', 'ESENLER', 'ESENYURT', 'EYÜPSULTAN',
  'FATİH', 'GAZİOSMANPAŞA', 'GÜNGÖREN', 'KAĞITHANE', 'KÜÇÜKÇEKMECE',
  'SULTANGAZİ', 'ŞİŞLİ', 'ZEYTİNBURNU',
];

// Districts (ilçe / البلدية) per province — main ones for quick pick.
export const TURKEY_DISTRICTS = {
  'İstanbul': [...ISTANBUL_MOTOR_DISTRICTS, 'KADIKÖY', 'ÜSKÜDAR', 'MALTEPE', 'ATAŞEHİR', 'PENDİK', 'KARTAL', 'ÜMRANİYE', 'SANCAKTEPE', 'TUZLA', 'SULTANBEYLİ', 'ÇEKMEKÖY'],
  'Ankara': ['Çankaya', 'Keçiören', 'Yenimahalle', 'Mamak', 'Etimesgut', 'Sincan', 'Altındağ', 'Pursaklar', 'Gölbaşı', 'Polatlı'],
  'İzmir': ['Konak', 'Karşıyaka', 'Bornova', 'Buca', 'Bayraklı', 'Çiğli', 'Gaziemir', 'Karabağlar', 'Balçova', 'Narlıdere', 'Menemen', 'Torbalı'],
  'Bursa': ['Osmangazi', 'Nilüfer', 'Yıldırım', 'Gemlik', 'İnegöl', 'Mudanya', 'Gürsu', 'Kestel'],
  'Antalya': ['Muratpaşa', 'Kepez', 'Konyaaltı', 'Alanya', 'Manavgat', 'Serik', 'Aksu', 'Döşemealtı', 'Kemer'],
  'Adana': ['Seyhan', 'Çukurova', 'Yüreğir', 'Sarıçam', 'Ceyhan'],
  'Gaziantep': ['Şahinbey', 'Şehitkamil', 'Nizip', 'İslahiye', 'Nurdağı'],
  'Konya': ['Selçuklu', 'Meram', 'Karatay', 'Ereğli', 'Akşehir'],
  'Mersin': ['Akdeniz', 'Yenişehir', 'Toroslar', 'Mezitli', 'Tarsus', 'Erdemli'],
  'Kayseri': ['Melikgazi', 'Kocasinan', 'Talas', 'Develi', 'Yahyalı'],
  'Hatay': ['Antakya', 'İskenderun', 'Dörtyol', 'Defne', 'Samandağ', 'Kırıkhan'],
  'Kocaeli': ['İzmit', 'Gebze', 'Darıca', 'Körfez', 'Gölcük', 'Derince'],
  'Şanlıurfa': ['Eyyübiye', 'Haliliye', 'Karaköprü', 'Siverek', 'Viranşehir'],
};

// Shipping carriers per market.
export const SYRIA_SHIPPING  = ['شركة الكرم', 'قدموس', 'مسارات', 'إيزلا', 'توصيل جرمانا', 'توصيل ميتور', 'أخرى'];
export const TURKEY_SHIPPING = ['Yurtiçi Kargo', 'Aras Kargo', 'PTT Kargo', 'MNG Kargo', 'Sürat Kargo', 'Trendyol Express', 'توصيل الموتور 🏍️', 'أخرى'];

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

// District (بلدية) suggestions for the chosen city.
export function districtsForCity(market, city) {
  if (market !== 'turkey') return [];
  if (isIstanbul(city)) return TURKEY_DISTRICTS['İstanbul'];
  // match province by normalized name (İ vs i etc.)
  const key = Object.keys(TURKEY_DISTRICTS).find((k) => norm(k) === norm(city));
  return key ? TURKEY_DISTRICTS[key] : [];
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
