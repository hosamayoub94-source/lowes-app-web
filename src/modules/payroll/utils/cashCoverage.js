// Pure cash-coverage check for the payroll batch / "mark paid" flow.
// Never reports "covered" when the ledger or an exchange rate could not be
// loaded: a failed fetch is NOT a zero balance and a missing rate is NOT zero.
//
// rates: rate-to-USD map from buildRateToUsd (USD units per 1 unit of currency).
// paidUsd: amount to pay this batch in USD (half-salary already applied — it
// only changes what is paid now, never the net salary due).
// payCurrency: currency the cash will be paid out in (display + coverage).

export const COVERAGE = Object.freeze({
  OK: 'ok',
  INSUFFICIENT: 'insufficient',
  LEDGER_ERROR: 'ledger_error',
  RATE_MISSING: 'rate_missing',
});

export function computeCashCoverage({
  ledgerError = null,
  rateError = null,
  balances = {},
  rates = { USD: 1 },
  paidUsd = 0,
  payCurrency = 'USD',
}) {
  if (ledgerError) {
    return { status: COVERAGE.LEDGER_ERROR, message: 'تعذّر جلب دفتر المحاسبة — لا يمكن الحكم على كفاية الكاش.', cashUsd: null, paidInCurrency: null, missingRates: [] };
  }
  // A failed rate fetch leaves only USD known; every non-USD balance or payout
  // currency then falls into missingRates below.
  const knownRates = rateError ? { USD: 1 } : rates;
  const rateOf = (cur) => (cur === 'USD' ? 1 : Number(knownRates?.[cur]) || 0);
  const missingRates = [];
  for (const [cur, amount] of Object.entries(balances)) {
    if (Number(amount) !== 0 && !(rateOf(cur) > 0) && !missingRates.includes(cur)) missingRates.push(cur);
  }
  if (!(rateOf(payCurrency) > 0) && !missingRates.includes(payCurrency)) missingRates.push(payCurrency);
  if (missingRates.length) {
    return { status: COVERAGE.RATE_MISSING, message: `سعر صرف مفقود لـ ${missingRates.join('، ')} — لا يمكن تحويل الكاش أو المبلغ.`, cashUsd: null, paidInCurrency: null, missingRates };
  }

  const cashUsd = Object.entries(balances).reduce((sum, [cur, amount]) => sum + Number(amount || 0) * rateOf(cur), 0);
  const paidInCurrency = Number(paidUsd || 0) / rateOf(payCurrency);
  // Coverage is judged in the payout currency itself: SYP cash cannot be paid
  // out of a TRY drawer just because their USD equivalents add up.
  const available = Number(balances[payCurrency] || 0);
  const covered = available + 1e-9 >= paidInCurrency;
  return {
    status: covered ? COVERAGE.OK : COVERAGE.INSUFFICIENT,
    message: covered ? 'الكاش بعملة الدفع يغطي الدفعة المحددة.' : `الكاش بعملة الدفع (${payCurrency}) لا يغطي الدفعة: المتوفر ${available.toFixed(2)} مقابل ${paidInCurrency.toFixed(2)}.`,
    cashUsd,
    paidInCurrency,
    available,
    missingRates,
  };
}
