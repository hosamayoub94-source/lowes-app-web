// D-157 — order→stock planning rules (UI helper) and the edge bridge (Deno file run
// under Node's type stripping with a fake client). No network, no database.
import assert from 'node:assert/strict';
import { planOrderStock, matchOrderLines } from './src/utils/orderStockPlan.js';
import { syncOrderInventory } from './supabase/functions/_shared/syncOrderInventory.ts';

let passed = 0;
const t = async (name, fn) => {
  try { await fn(); passed++; console.log('  ok  ', name); }
  catch (e) { console.error('  FAIL', name, '\n      ', e.message); process.exitCode = 1; }
};

const products = [
  { id: 'p1', name: 'سيروم فيتامين C', name_en: "LOWE'S VITAMIN C SERUM" },
  { id: 'p2', name: 'تونر', name_en: 'PORE TIHGTENNING & PURIFINE TONER' },
];

await t('returning/returned open a return case, never a stock release', () => {
  assert.deepEqual(planOrderStock('returning'), { kind: 'return', stage: 'in_transit' });
  assert.deepEqual(planOrderStock('returned'), { kind: 'return', stage: 'received' });
});

await t('preparing…settled are out of stock; pending/waiting/cancelled are not', () => {
  for (const s of ['preparing', 'shipped', 'delivered', 'settled']) assert.equal(planOrderStock(s).shouldBeOut, true);
  for (const s of ['pending', 'waiting', 'cancelled', 'not_received']) assert.equal(planOrderStock(s).shouldBeOut, false);
});

await t('unlinked items are reported, not skipped silently', () => {
  const r = matchOrderLines([{ name: 'LOWES Vitamin C Serum', qty: 2 }, { name: 'منتج مجهول', qty: 1 }], products);
  assert.equal(r.lines.length, 1); assert.equal(r.lines[0].productId, 'p1');
  assert.deepEqual(r.missing, ['منتج مجهول']);
});

await t('product_id wins over the name; aliases still resolve', () => {
  const r = matchOrderLines([{ product_id: 'p2', name: 'whatever', qty: 3 }, { name: 'Body toner', qty: 1 }], products,
    { 'Body toner': 'PORE TIHGTENNING & PURIFINE TONER' });
  assert.deepEqual(r.lines.map(l => [l.productId, l.qty]), [['p2', 3], ['p2', 1]]);
  assert.deepEqual(r.missing, []);
});

await t('zero-quantity items are ignored, not treated as missing', () => {
  const r = matchOrderLines([{ name: 'منتج مجهول', qty: 0 }], products);
  assert.deepEqual(r, { lines: [], missing: [] });
});

// ── edge bridge ────────────────────────────────────────────────
function fakeSupabase(rpcCalls) {
  const table = (rows) => ({
    select() { return this; }, eq() { return this; },
    maybeSingle: async () => ({ data: rows[0] ?? null }),
    then: (res) => res({ data: rows, error: null }),
  });
  return {
    from: (name) => name === 'products' ? table(products)
      : name === 'wh_warehouses' ? table([{ id: 'wh1', market: 'syria' }]) : table([]),
    rpc: async (fn, args) => { rpcCalls.push({ fn, args }); return { data: { ok: true }, error: null }; },
  };
}
const order = (over) => ({ id: 'o1', brand: 'lowes', market: 'syria', source: null, status: 'shipped',
  items: [{ name: 'LOWES Vitamin C Serum', qty: 2 }], ...over });

await t('edge: returning registers a return case and never calls the stock sync', async () => {
  const calls = [];
  await syncOrderInventory(fakeSupabase(calls), order({ status: 'returning' }), 'بابل-تلقائي');
  assert.deepEqual(calls.map(c => c.fn), ['wh_register_order_return']);
  assert.equal(calls[0].args.p_stage, 'in_transit');
});

await t('edge: returned registers as received', async () => {
  const calls = [];
  await syncOrderInventory(fakeSupabase(calls), order({ status: 'returned' }), 'x');
  assert.equal(calls[0].args.p_stage, 'received');
});

await t('edge: an unlinked item fails loudly and touches nothing', async () => {
  const calls = [];
  await assert.rejects(
    syncOrderInventory(fakeSupabase(calls), order({ items: [{ name: 'منتج مجهول', qty: 1 }] }), 'x'),
    /أصناف غير مربوطة/);
  assert.equal(calls.length, 0);
});

await t('edge: shipped asks the atomic sync to keep the goods out', async () => {
  const calls = [];
  await syncOrderInventory(fakeSupabase(calls), order(), 'x');
  assert.equal(calls[0].fn, 'wh_sync_order_stock');
  assert.equal(calls[0].args.p_should_be_out, true);
});

await t('edge: star_network / uae_sheet_import orders are skipped', async () => {
  const calls = [];
  const r = await syncOrderInventory(fakeSupabase(calls), order({ source: 'star_network' }), 'x');
  assert.equal(r.skipped, 'external_source'); assert.equal(calls.length, 0);
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
