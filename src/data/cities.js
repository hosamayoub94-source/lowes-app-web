// =============================================================
// City suggestions per market — used as a datalist in the order
// form. The input remains free-text (the employee can type/edit
// any name); these are just quick-pick suggestions.
// =============================================================

export const SYRIA_CITIES = [
  'دمشق', 'ريف دمشق', 'حلب', 'حمص', 'حماة', 'اللاذقية', 'طرطوس',
  'إدلب', 'درعا', 'السويداء', 'القنيطرة', 'دير الزور', 'الرقة', 'الحسكة',
];

export const TURKEY_CITIES = [
  'إسطنبول', 'أنقرة', 'إزمير', 'بورصة', 'أنطاليا', 'غازي عنتاب', 'قونيا',
  'أضنة', 'مرسين', 'قيصري', 'هاتاي', 'شانلي أورفا', 'كوجالي (إزميت)',
  'ديار بكر', 'سامسون', 'دنيزلي', 'إسكي شهير', 'مالطية', 'كهرمان مرعش',
];

// Return the suggestion list for a given market.
export function citiesForMarket(market) {
  if (market === 'syria')  return SYRIA_CITIES;
  if (market === 'turkey') return TURKEY_CITIES;
  return [];
}
