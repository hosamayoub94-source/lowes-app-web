// =============================================================
// Number / currency / initial formatters used across the UI.
// =============================================================

/** Two initials from a name — used for avatars when no image. */
export function initials(name = '') {
  return String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');
}

/** Stable color for an avatar from a string (HSL hash). */
export function colorFromString(str = '') {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 55%, 45%)`;
}

/** Currency symbol per currency code — matches legacy getCurrencySymbol(). */
export function currencySymbol(code = 'USD') {
  const map = { USD: '$', SYP: 'ل.س', TRY: '₺', EUR: '€', GBP: '£', SAR: 'ر.س' };
  return map[code] || code;
}

/** Format a number with locale-aware thousand separators. */
export function fmtNumber(n, locale = 'en-US') {
  if (n == null || n === '') return '';
  const num = typeof n === 'number' ? n : Number(n);
  if (Number.isNaN(num)) return '';
  return num.toLocaleString(locale);
}

export function fmtMoney(amount, code = 'USD') {
  return `${fmtNumber(amount)} ${currencySymbol(code)}`;
}
