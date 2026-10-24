// Pure allowance resolution (no Supabase) — owner rules of 24 Oct 2026:
//  • Allowances are PER EMPLOYEE. An employee may have a food allowance, an internet
//    allowance, both, or none. Nothing is added by default — no row, no allowance.
//  • Sources, in this order, never double counted:
//      employee_salary_settings.internet_allowance   → internet   (settings currency)
//      payroll_allowances (kind = food)               → food       (own currency)  ← wins over
//      employee_salary_settings.food_allowance        → food       (only if no payroll_allowances food row)
//      payroll_allowances (any other kind)            → that kind
//      profiles.housing/transport (only when the salary itself comes from the profile)
//  • Every item keeps its amount, currency and the rate-to-USD that was used, so a payslip
//    can always be re-explained (stored on the entry as allowances_detail).

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const ALLOWANCE_LABELS = {
  internet: { icon: '🌐', text: 'بدل إنترنت' },
  food: { icon: '🍽️', text: 'بدل طعام' },
  housing: { icon: '🏠', text: 'بدل سكن' },
  transport: { icon: '🚌', text: 'بدل مواصلات' },
};
const CUR_SYMBOL = { SYP: 'ل.س', USD: '$', TRY: '₺' };

function rateToUsd(currency, rateMap) {
  if (currency === 'USD') return 1;
  const rate = Number(rateMap?.[currency]);
  return rate > 0 ? rate : 0;
}

export function buildAllowanceBreakdown({ settings = null, salarySource = null, emp = null, extraRows = [], rateMap = { USD: 1 } } = {}) {
  const items = [];
  const push = (kind, source, amount, currency) => {
    const amt = Number(amount) || 0;
    if (!(amt > 0)) return;
    const cur = currency || 'USD';
    const rate = rateToUsd(cur, rateMap);
    items.push({
      kind, source, amount: amt, currency: cur,
      rate_to_usd: rate > 0 ? rate : null,
      usd: rate > 0 ? round2(amt * rate) : 0,
      missing_rate: !(rate > 0),
    });
  };

  const active = (extraRows || []).filter((a) => a && a.is_active !== false);
  const hasFoodRow = active.some((a) => a.kind === 'food' && Number(a.amount) > 0);

  if (salarySource === 'employee_salary_settings' && settings) {
    push('internet', 'employee_salary_settings', settings.internet_allowance, settings.currency);
    if (!hasFoodRow) push('food', 'employee_salary_settings', settings.food_allowance, settings.currency);
  } else if (salarySource === 'profiles' && emp) {
    push('housing', 'profiles', emp.housing_allowance_usd, 'USD');
    push('transport', 'profiles', emp.transport_allowance_usd, 'USD');
  }
  for (const a of active) push(a.kind || 'other', 'payroll_allowances', a.amount, a.currency);

  return {
    items,
    totalUsd: round2(items.reduce((sum, i) => sum + i.usd, 0)),
    missingRate: items.some((i) => i.missing_rate),
  };
}

export function describeAllowanceItem(item) {
  const label = ALLOWANCE_LABELS[item.kind] || { icon: '➕', text: 'بدل' };
  const amount = Number(item.amount).toLocaleString('en-US');
  const cur = CUR_SYMBOL[item.currency] || item.currency;
  return item.missing_rate
    ? `${label.icon} ${label.text} ${amount} ${cur} ⚠️ بلا سعر صرف`
    : `${label.icon} ${label.text} ${amount} ${cur} ≈ $${item.usd.toFixed(2)}`;
}
