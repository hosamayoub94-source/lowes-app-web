// =============================================================
// Monthly sales targets per seller, keyed by currency.
//   Syria team  → $1000 (USD)
//   Turkey team → 65,000 TL (TRY) — adjust as inflation changes
// SYP sales have no separate target (Syria target is tracked in USD).
// =============================================================

export const TARGETS_BY_CURRENCY = {
  USD: 1000,
  TRY: 65000,
};

export function targetForCurrency(currency) {
  return TARGETS_BY_CURRENCY[currency] ?? null;
}
