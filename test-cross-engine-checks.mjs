/* global process */
// crossEngineChecks: profitability vs delivery-accounting/payroll recognition on the SAME rows, and FX source comparison.
// Fixtures mirror the October 2026 production shapes seen read-only on 1 Nov 2026. No network.
import { recognitionGap, compareFxSources } from './src/utils/crossEngineChecks.js';
import { periodBounds } from './src/utils/deliveryAccounting.js';
import { computeMonthly } from './src/utils/profitabilityCalc.js';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.error('FAIL', m); } };

const oct = periodBounds({ month: '2026-10' });
const sep = periodBounds({ month: '2026-09' });
const nov = periodBounds({ month: '2026-11' });
const row = (id, extra) => ({ id, order_code: id, market: 'turkey', amount: 1000, currency: 'TRY', items: [{ name: 'x', qty: 1 }], ...extra });
const rows = [
  row('carrier-oct', { status: 'delivered', delivery_basis: 'carrier', delivered_at: '2026-10-10T10:00:00Z', order_date: '2026-10-05T10:00:00Z' }),
  // ordered in Sep, carrier delivered in Oct → both engines: October (not September)
  row('sep-ordered-oct-delivered', { status: 'delivered', delivery_basis: 'carrier', delivered_at: '2026-10-02T10:00:00Z', order_date: '2026-09-28T10:00:00Z' }),
  row('fc-oct', { status: 'delivered', delivery_basis: 'finance_confirmed', delivered_at: '2026-10-31T20:59:00Z', order_date: '2026-09-29T00:51:00Z' }),
  row('unknown-oct', { market: 'syria', currency: 'SYP', amount: 1150, status: 'delivered', delivery_basis: 'unknown', delivered_at: null, order_date: '2026-10-12T10:00:00Z' }),
  row('settled-with-delivery', { status: 'settled', delivery_basis: 'carrier', delivered_at: '2026-10-15T10:00:00Z', order_date: '2026-10-01T10:00:00Z' }),
  row('settled-no-delivery', { status: 'settled', delivery_basis: 'unknown', delivered_at: null, order_date: '2026-10-01T10:00:00Z' }),
  row('returned-after-delivery', { status: 'returned', delivered_before_return: true, delivery_basis: 'carrier', delivered_at: '2026-10-08T10:00:00Z', return_at: '2026-10-20T10:00:00Z', order_date: '2026-10-03T10:00:00Z' }),
  row('returned-undelivered', { status: 'returned', delivered_before_return: false, delivery_basis: 'unknown', delivered_at: null, return_at: '2026-10-20T10:00:00Z', order_date: '2026-10-03T10:00:00Z' }),
  row('shipping', { status: 'shipped', delivery_basis: 'unknown', delivered_at: null, order_date: '2026-10-25T10:00:00Z' }),
  row('carrier-oct', { status: 'delivered', delivery_basis: 'carrier', delivered_at: '2026-10-10T10:00:00Z', order_date: '2026-10-05T10:00:00Z' }), // duplicate row
];

// ── recognition gap
{
  const g = recognitionGap(rows, oct);
  ok(g.both === 3, `3 orders in both engines (carrier, Sep-ordered/Oct-delivered, finance-confirmed) — got ${g.both}`);
  ok(g.deliveryOnly.map((x) => x.id).sort().join() === 'settled-with-delivery,unknown-oct', 'delivery/payroll-only: unknown→order date + settled sale');
  ok(g.deliveryOnly.find((x) => x.id === 'unknown-oct').reason === 'legacy_order_date', 'unknown basis reason = legacy_order_date');
  ok(g.deliveryOnly.find((x) => x.id === 'settled-with-delivery').reason === 'settled_sale', 'settled reason');
  ok(g.profitOnly.length === 1 && g.profitOnly[0].reason === 'returned_after_delivery', 'profitability-only: delivered-then-returned');
  ok(!g.deliveryOnly.concat(g.profitOnly).some((x) => ['shipping', 'returned-undelivered', 'settled-no-delivery'].includes(x.id)), 'never-delivered orders are in neither engine');
  ok(g.byReason.legacy_order_date === 1 && g.byReason.settled_sale === 1 && g.byReason.returned_after_delivery === 1, 'byReason counts');

  // no order lands in two months (each engine)
  const sepG = recognitionGap(rows, sep), novG = recognitionGap(rows, nov);
  ok(sepG.both === 0 && sepG.deliveryOnly.length === 0, 'Sep-ordered/Oct-delivered order is NOT in September');
  ok(novG.both === 0 && novG.deliveryOnly.length === 0 && novG.profitOnly.length === 0, 'nothing leaks into November');

  // excluding legacy closes that part of the gap; switching finance confirmations off moves fc order out of payroll
  ok(recognitionGap(rows, { ...oct, includeLegacy: false }).byReason.legacy_order_date === undefined, 'includeLegacy:false removes legacy gap');
  const off = recognitionGap(rows, { ...oct, financeConfirmed: false });
  ok(off.profitOnly.some((x) => x.id === 'fc-oct' && x.reason === 'finance_confirmed_off'), 'financeConfirmed:false → fc order only in profitability');
}

// ── the check uses the engine's own rule: profitability counts exactly `both + profitOnly` deliveries
{
  const r = computeMonthly({ month: '2026-10', brand: 'all', orders: rows.filter((o, i, a) => a.findIndex((x) => x.id === o.id) === i),
    nameMapRows: [{ alias_name: 'x', canonical_name: 'x', brand: 'lowes', is_active: true }], fxRates: [{ month: '2026-10-01', scope: 'all', currency: 'TRY', units_per_usd: 50, entered_at: '2026-10-18' }, { month: '2026-10-01', scope: 'all', currency: 'SYP', units_per_usd: 140, entered_at: '2026-10-18' }] });
  const g = recognitionGap(rows, oct);
  const counted = Object.values(r.marketSummary).reduce((s, m) => s + m.orders, 0);
  ok(counted === g.both + g.profitOnly.length, `profitability deliveries (${counted}) = both + profitOnly (${g.both + g.profitOnly.length})`);
  ok(r.company.unknownDelivery.orders === 1, 'profitability lists the unknown-date order as unassigned (not a sale)');
}

// ── FX comparison (Oct 2026 production values)
{
  const profitabilityFx = [
    { month: '2026-10-01', scope: 'all', currency: 'TRY', units_per_usd: 49.5, entered_at: '2026-10-18T13:38:22Z' },
    { month: '2026-10-01', scope: 'all', currency: 'SYP', units_per_usd: 140, entered_at: '2026-10-18T13:37:01Z' },
    { month: '2026-10-01', scope: 'all', currency: 'SYP', units_per_usd: 140, entered_at: '2026-10-17T20:46:02Z' },
    { month: '2026-10-01', scope: 'all', currency: 'AED', units_per_usd: 3.68, entered_at: '2026-10-18T13:38:45Z' },
  ];
  const monthlyFx = [
    { purpose: 'delivery_accounting', currency: 'TRY', period_month: '2026-10-01', units_per_usd: 50, status: 'confirmed', rate_quality: 'exact' },
    { purpose: 'delivery_accounting', currency: 'SYP', period_month: '2026-10-01', units_per_usd: 140, status: 'confirmed', rate_quality: 'exact' },
    { purpose: 'delivery_accounting', currency: 'AED', period_month: '2026-10-01', units_per_usd: 3.6725, status: 'confirmed', rate_quality: 'exact' },
    { purpose: 'payroll', currency: 'TRY', period_month: '2026-10-01', units_per_usd: 50, status: 'confirmed', rate_quality: 'exact' },
    { purpose: 'payroll', currency: 'SYP', period_month: '2026-10-01', units_per_usd: 140, status: 'confirmed', rate_quality: 'exact' },
    { purpose: 'payroll', currency: 'SYP', period_month: null, units_per_usd: 131, status: 'confirmed' }, // undated legacy row: ignored
    { purpose: 'delivery_accounting', currency: 'TRY', period_month: '2026-07-01', units_per_usd: 46.8, status: 'confirmed', rate_quality: 'approximate' },
  ];
  const run = { rate_usd_try: 50, rate_usd_syp: 143.2 };
  const c = compareFxSources({ month: '2026-10', profitabilityFx, monthlyFx, run });
  ok(c.mismatches.join() === 'TRY,SYP,AED', `Oct mismatches TRY (49.5 vs 50), SYP (run 143.2 vs 140), AED (3.68 vs 3.6725) — got ${c.mismatches.join()}`);
  const syp = c.currencies.find((x) => x.currency === 'SYP');
  ok(syp.sources.find((s) => s.source === 'payroll_run').rate === 143.2 && syp.sources.find((s) => s.source === 'monthly:payroll').rate === 140, 'SYP: run frozen 143.2 vs monthly payroll 140');
  const sepC = compareFxSources({ month: '2026-09', profitabilityFx, monthlyFx });
  const sepTry = sepC.currencies.find((x) => x.currency === 'TRY');
  ok(sepTry.sources.find((s) => s.source === 'profitability').quality === 'missing', 'Sep: profitability has no rate → missing (never borrowed from October)');
  ok(sepTry.sources.find((s) => s.source === 'monthly:delivery_accounting').quality === 'carried', 'Sep: monthly rate carried from an earlier month is labelled carried');
  ok(compareFxSources({ month: '2026-10', profitabilityFx: [], monthlyFx: [] }).currencies.every((x) => x.sources.every((s) => s.quality === 'missing')), 'no data → all missing, no invented rate');
}

console.log(`cross-engine checks: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
