// =============================================================
// customerSearch — pure helpers for Lozy's get_customer_history tool.
// No Deno / Supabase imports on purpose: tested directly by test-lozy.mjs.
//
// Why this exists: the search term is typed by a user (or copied from a
// chat) and ends up inside a PostgREST `.or()` expression. Characters like
// `,` `(` `)` `.` change the meaning of that expression, and `%` `_` `*`
// are LIKE wildcards. Everything is stripped here, then the filter is
// built per kind of query (order id / phone / name).
// =============================================================

export type SearchKind = 'order' | 'phone' | 'name';

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const EASTERN_INDIC = '۰۱۲۳۴۵۶۷۸۹';

export function toLatinDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (ch) => {
    const a = ARABIC_INDIC.indexOf(ch);
    return String(a >= 0 ? a : EASTERN_INDIC.indexOf(ch));
  });
}

// Keeps: Arabic letters, latin letters, digits, + - / and spaces.
// Order ids in production look like "ARC-1691" and some contain " / ".
export function sanitizeSearchTerm(raw: unknown): string {
  const s = toLatinDigits(String(raw ?? ''))
    .replace(/[ً-ٰٟ]/g, '') // tashkeel
    .replace(/[^0-9A-Za-z؀-ۿ+\-/\s]/g, ' ')
    .replace(/[،؛؟٪-٭]/g, ' ') // Arabic punctuation inside the Arabic block
    .replace(/\s+/g, ' ')
    .trim();
  return s.slice(0, 60);
}

export function classifySearch(term: string): SearchKind {
  const digits = term.replace(/\D/g, '');
  const hasLetters = /[A-Za-z؀-ۿ]/.test(term);
  if (!hasLetters && digits.length >= 7) return 'phone';
  if (/[A-Za-z]{2,}\s*-?\s*\d+/.test(term) || (!hasLetters && digits.length > 0)) return 'order';
  return 'name';
}

// Phones are stored with varying prefixes (+90 / 0090 / 0 / none), so match
// on the trailing 9 digits, which is the stable part.
export function phoneTail(term: string): string {
  return toLatinDigits(term).replace(/\D/g, '').slice(-9);
}

// Returns the PostgREST .or() expression, or null when nothing usable is left.
export function buildOrFilter(rawTerm: unknown): { filter: string; kind: SearchKind; term: string } | null {
  const term = sanitizeSearchTerm(rawTerm);
  if (!term) return null;
  const kind = classifySearch(term);
  if (kind === 'phone') {
    const t = phoneTail(term);
    if (t.length < 7) return null;
    return { kind, term, filter: `wa_number.ilike.%${t}%,phone_1.ilike.%${t}%` };
  }
  if (kind === 'order') {
    return { kind, term, filter: `order_id.ilike.%${term}%` };
  }
  if (term.length < 2) return null;
  return { kind, term, filter: `customer_name.ilike.%${term}%` };
}

export const NOT_FOUND_HINT =
  'لم أجد طلباً مطابقاً. جرّبي: (1) رقم الطلب كما يظهر بالتطبيق مثل ARC-1234، ' +
  '(2) آخر 9 أرقام من رقم الهاتف، (3) الاسم الأول والأخير كما سُجّل. ' +
  'يمكنك أيضاً البحث من شاشة الطلبات أو العملاء داخل التطبيق.';

// Should the customer-lookup tool be offered for this message? The tool
// gate is keyword based (see TOOL_KEYWORDS); this adds the case where the
// user pastes a phone number or order id next to a customer/order word.
export function looksLikeCustomerLookup(text: string): boolean {
  const t = toLatinDigits(String(text ?? ''));
  const ctx = /(عميل|زبون|طلب|هاتف|رقم|واتساب|متابع)/.test(t);
  const phone = /\d[\d\s-]{6,}\d/.test(t);
  const orderId = /[A-Za-z]{2,5}\s*-\s*\d{2,}/.test(t);
  return ctx && (phone || orderId);
}
