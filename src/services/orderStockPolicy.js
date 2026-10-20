// Pure policy helpers for the legacy client-side order-stock reconciler.
// These helpers do not perform database I/O; tests use synthetic movement rows.
const DEDUCTED_STATUSES = new Set([
  'preparing', 'ready', 'motor_prep', 'at_center', 'shipped',
  'on_way', 'special_delivery', 'motor', 'prepaid', 'delivered', 'settled',
]);

export function getOrderStockAction({
  status,
  brand = 'lowes',
  externallyStocked = false,
  hasOutstandingReservation = false,
}) {
  // A stock-exempt order must not create new reservations. If it already has
  // historical reservations, it still needs a release to unwind that ledger.
  const excluded = (brand || 'lowes') !== 'lowes' || externallyStocked;
  const shouldBeReserved = !excluded && DEDUCTED_STATUSES.has(status);

  if (shouldBeReserved) return hasOutstandingReservation ? 'none' : 'reserve';
  return hasOutstandingReservation ? 'release' : 'none';
}

// Reserve/release balances must be grouped by warehouse + product. Summing an
// entire order's units first can hide an open reservation when another product
// or warehouse has an over-release or mismatched historical ledger entry.
export function hasOutstandingReservations(movements = []) {
  const balances = new Map();

  for (const movement of movements) {
    if (movement.type !== 'reserve' && movement.type !== 'release') continue;

    const warehouseId = movement.type === 'reserve'
      ? movement.from_warehouse_id
      : movement.to_warehouse_id;
    const productId = movement.product_id;
    if (!warehouseId || !productId) continue;

    const key = `${warehouseId}|${productId}`;
    const current = balances.get(key) ?? 0;
    const quantity = Number(movement.quantity || 0);
    balances.set(key, current + (movement.type === 'reserve' ? quantity : -quantity));
  }

  return [...balances.values()].some(quantity => quantity > 0);
}
