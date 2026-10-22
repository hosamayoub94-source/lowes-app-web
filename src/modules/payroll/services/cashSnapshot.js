// Central-book cash balances + latest exchange rates for payroll payout checks.
// Errors are returned, not swallowed, so the UI can refuse to say "covered".
import { supabase } from '@services/supabase';
import { fetchEntries } from '@modules/accounting/services/accountingService.js';
import { WALLETS, walletDelta } from '@modules/accounting/types/accounting.types.js';
import { buildRateToUsd } from './payrollEngine.js';

export async function loadPayrollCashSnapshot() {
  const balances = { USD: 0, TRY: 0, SYP: 0 };
  let ledgerError = null;
  let rateError = null;
  let rates = { USD: 1 };

  const [ledgerResult, rateResult] = await Promise.allSettled([
    fetchEntries(),
    supabase.from('exchange_rates').select('from_cur,to_cur,rate').order('created_at', { ascending: false }),
  ]);

  if (ledgerResult.status === 'rejected') {
    ledgerError = ledgerResult.reason?.message || String(ledgerResult.reason);
  } else {
    const central = (ledgerResult.value || []).filter((e) => (e.book ?? 'central') === 'central');
    for (const wallet of WALLETS.filter((w) => w.type === 'cash')) {
      balances[wallet.currency] += central.reduce((sum, e) => sum + walletDelta(e, wallet), 0);
    }
  }

  if (rateResult.status === 'rejected') rateError = rateResult.reason?.message || String(rateResult.reason);
  else if (rateResult.value?.error) rateError = rateResult.value.error.message;
  else rates = buildRateToUsd(rateResult.value?.data || []);

  return { balances, rates, ledgerError, rateError };
}
