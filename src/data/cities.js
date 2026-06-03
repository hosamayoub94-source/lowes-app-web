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
