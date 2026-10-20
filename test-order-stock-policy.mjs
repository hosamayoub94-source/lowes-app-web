import assert from 'node:assert/strict';
import { getOrderStockAction, hasOutstandingReservations } from './src/services/orderStockPolicy.js';

const reserve = (product_id, from_warehouse_id, quantity) => ({
  type: 'reserve', product_id, from_warehouse_id, to_warehouse_id: null, quantity,
});
const release = (product_id, to_warehouse_id, quantity) => ({
  type: 'release', product_id, from_warehouse_id: null, to_warehouse_id, quantity,
});

// A regular Lowe's order reserves only when its state requires stock to be out.
assert.equal(getOrderStockAction({
  status: 'preparing', brand: 'lowes', externallyStocked: false, hasOutstandingReservation: false,
}), 'reserve', 'preparing Lowe’s order without a reserve should reserve');

assert.equal(getOrderStockAction({
  status: 'preparing', brand: 'lowes', externallyStocked: false, hasOutstandingReservation: true,
}), 'none', 'repeated sync must not reserve the same order twice');

assert.equal(getOrderStockAction({
  status: 'cancelled', brand: 'lowes', externallyStocked: false, hasOutstandingReservation: true,
}), 'release', 'cancelled order with an outstanding reserve must release it');

assert.equal(getOrderStockAction({
  status: 'cancelled', brand: 'lowes', externallyStocked: false, hasOutstandingReservation: false,
}), 'none', 'cancelled order with no reserve must be a no-op');

// If brand/source becomes exempt after an earlier reservation, unwind the old
// ledger rather than returning early and stranding the quantity out of stock.
assert.equal(getOrderStockAction({
  status: 'preparing', brand: 'strong', externallyStocked: false, hasOutstandingReservation: true,
}), 'release', 'changed non-Lowe’s brand must release any previous reservation');

assert.equal(getOrderStockAction({
  status: 'preparing', brand: 'lowes', externallyStocked: true, hasOutstandingReservation: true,
}), 'release', 'externally stocked order must release any previous reservation');

assert.equal(getOrderStockAction({
  status: 'preparing', brand: 'lowes', externallyStocked: true, hasOutstandingReservation: false,
}), 'none', 'externally stocked order must not create a new reservation');

assert.equal(getOrderStockAction({
  status: 'unknown-status', brand: 'lowes', externallyStocked: false, hasOutstandingReservation: true,
}), 'release', 'unknown/non-deducted state must not strand a known reservation');

// Balances must be grouped by warehouse + product. A release for one product
// or warehouse must not cancel an outstanding reservation for another.
assert.equal(hasOutstandingReservations([
  reserve('p1', 'wh1', 3),
  release('p1', 'wh1', 3),
  reserve('p1', 'wh2', 2),
]), true, 'a positive balance at any product/warehouse keeps reservation state open');

assert.equal(hasOutstandingReservations([
  reserve('p1', 'wh1', 4),
  release('p1', 'wh1', 4),
  reserve('p2', 'wh1', 3),
  release('p2', 'wh1', 3),
]), false, 'fully reconciled per-product balances have no open reservation');

assert.equal(hasOutstandingReservations([
  reserve('p1', 'wh1', 1),
  release('p1', 'wh1', 2),
  reserve('p2', 'wh1', 3),
]), true, 'an over-release in one product must not offset another product’s reserve');

console.log('PASS: order stock policy, excluded-order unwind, and per-product reservation ledger tests');
