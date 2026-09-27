// =============================================================
// markets — تعريف الأسواق (قنوات البيع) بمكان واحد.
// تركيا / سوريا / الإمارات (أُضيفت 27 أيلول 2026).
// =============================================================

export const MARKETS = ['turkey', 'syria', 'uae'];

export const MARKET_LABEL = { turkey: 'تركيا', syria: 'سوريا', uae: 'الإمارات' };
export const MARKET_FLAG  = { turkey: '🇹🇷', syria: '🇸🇾', uae: '🇦🇪' };

// العملة الافتراضية لطلبات كل سوق.
export const MARKET_CURRENCY = { turkey: 'TRY', syria: 'SYP', uae: 'AED' };

// رمز الاتصال الدولي (بلا +).
export const MARKET_PHONE_CC = { turkey: '90', syria: '963', uae: '971' };

// الدرهم مربوط بالدولار رسمياً (3.6725) — يُستخدم إذا ما في سعر صرف مُدخَل.
export const AED_PER_USD = 3.6725;

export const marketLabel = (m) => MARKET_LABEL[m] || m || '';
export const marketFlag  = (m) => MARKET_FLAG[m] || '';
export const phoneCcForMarket = (m) => MARKET_PHONE_CC[m] || '963';
