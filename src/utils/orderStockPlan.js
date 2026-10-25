// Pure order→stock rules shared by warehouseService (and covered by
// test-warehouse-returns.mjs). No I/O here.

// Statuses where the order's goods are out of the warehouse.
export const DEDUCTED_STATUSES = new Set([
  'preparing', 'ready', 'motor_prep', 'at_center', 'shipped',
  'on_way', 'special_delivery', 'motor', 'prepaid', 'delivered', 'settled',
]);

// Return statuses never touch saleable stock: they only open/advance a return case.
export const RETURN_STAGES = { returning: 'in_transit', returned: 'received' };

export function normName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/i̇/g, 'i').replace(/[ıİ]/g, 'i')
    .replace(/[şŞ]/g, 's').replace(/[ğĞ]/g, 'g').replace(/[çÇ]/g, 'c')
    .replace(/[öÖ]/g, 'o').replace(/[üÜ]/g, 'u')
    .replace(/[^a-z0-9؀-ۿ]/g, '')
    .replace(/^lowes/, '');
}

// What must happen for an order in `status`:
//   { kind: 'return', stage }      → wh_register_order_return
//   { kind: 'stock', shouldBeOut } → wh_sync_order_stock
export function planOrderStock(status) {
  const stage = RETURN_STAGES[status];
  if (stage) return { kind: 'return', stage };
  return { kind: 'stock', shouldBeOut: DEDUCTED_STATUSES.has(status) };
}

// Map order items to catalog ids. product_id wins over name matching.
// Nothing is dropped silently: unmatched items come back in `missing`.
export function matchOrderLines(items, products, aliases = {}) {
  const byNorm = {};
  const byId = new Set();
  for (const p of (products ?? [])) {
    byId.add(p.id);
    if (p.name)    byNorm[normName(p.name)]    = p.id;
    if (p.name_en) byNorm[normName(p.name_en)] = p.id;
  }
  const aliasToId = {};
  for (const [alias, canon] of Object.entries(aliases)) {
    const pid = byNorm[normName(canon)];
    if (pid) aliasToId[normName(alias)] = pid;
  }
  const lines = [];
  const missing = [];
  for (const it of (Array.isArray(items) ? items : [])) {
    const qty = Number(it?.qty ?? it?.quantity ?? 1);
    if (!(qty > 0)) continue;
    const direct = it?.product_id || it?.productId;
    const key = normName(it?.name);
    const pid = (direct && byId.has(direct) ? direct : null) || byNorm[key] || aliasToId[key];
    if (pid) lines.push({ productId: pid, qty, key });
    else missing.push(String(it?.name || 'غير معروف'));
  }
  return { lines, missing };
}
