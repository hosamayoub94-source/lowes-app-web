/**
 * Order Service
 * Sales orders, purchase orders, and shipments.
 */

import {
  MOCK_SALES_ORDERS,
  MOCK_SHIPMENTS,
  ORDER_STATUS,
  ORDER_TRANSITIONS,
  PAYMENT_STATUS,
  SHIPMENT_STATUS,
  PURCHASE_STATUS,
  generateOrderNumber,
  ORDER_NUMBER_PREFIX,
  PO_NUMBER_PREFIX,
  TRACKING_PREFIX,
  calcOrderTotals,
} from '../types/inventory.types.js';
import { USE_MOCK } from './inventoryService.js';

// ── In-memory mock ─────────────────────────────────────────────────────────
let _mock = null;
function _getMock() {
  if (_mock) return _mock;
  _mock = {
    salesOrders: JSON.parse(JSON.stringify(MOCK_SALES_ORDERS)),
    salesOrderItems: [],
    purchaseOrders: [],
    purchaseOrderItems: [],
    shipments: JSON.parse(JSON.stringify(MOCK_SHIPMENTS)),
  };
  return _mock;
}

function _uid() { return crypto.randomUUID(); }

// ── Sales Orders ───────────────────────────────────────────────────────────

export async function fetchSalesOrders(filters = {}) {
  if (USE_MOCK) {
    let list = _getMock().salesOrders;
    if (filters.status)    list = list.filter(o => o.status === filters.status);
    if (filters.paymentStatus) list = list.filter(o => o.payment_status === filters.paymentStatus);
    if (filters.customerId)    list = list.filter(o => o.customer_id === filters.customerId);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(o =>
        o.order_number?.toLowerCase().includes(q) ||
        o.contact_name?.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
  const { supabase } = await import('@/services/supabase.js');
  let q = supabase
    .from('sales_orders')
    .select('*, customers(company_name), sales_order_items(*, products(name, sku))')
    .order('created_at', { ascending: false });
  if (filters.status) q = q.eq('status', filters.status);
  if (filters.paymentStatus) q = q.eq('payment_status', filters.paymentStatus);
  if (filters.customerId) q = q.eq('customer_id', filters.customerId);
  if (filters.search) q = q.or(`order_number.ilike.%${filters.search}%,contact_name.ilike.%${filters.search}%`);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function fetchSalesOrderById(id) {
  if (USE_MOCK) {
    const o = _getMock().salesOrders.find(o => o.id === id) ?? null;
    if (o) {
      o.items = _getMock().salesOrderItems.filter(i => i.sales_order_id === id);
    }
    return o;
  }
  const { supabase } = await import('@/services/supabase.js');
  const { data, error } = await supabase
    .from('sales_orders')
    .select('*, sales_order_items(*, products(name, sku, selling_price), product_variants(name, sku)), shipments(*)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function createSalesOrder({ items = [], customerId, warehouseId, notes, createdBy, ...rest }) {
  if (!createdBy) throw new Error('createdBy is required');

  const totals = calcOrderTotals(items, 0.15, rest.shipping_cost ?? 0);
  const now = new Date().toISOString();
  const orderNumber = generateOrderNumber(ORDER_NUMBER_PREFIX);

  if (USE_MOCK) {
    const order = {
      id: _uid(),
      order_number: orderNumber,
      customer_id: customerId ?? null,
      warehouse_id: warehouseId ?? null,
      status: ORDER_STATUS.QUOTATION,
      payment_status: PAYMENT_STATUS.UNPAID,
      ...totals,
      currency: 'SAR',
      notes: notes ?? '',
      tags: [],
      metadata: {},
      order_date: now,
      delivered_at: null,
      created_at: now,
      updated_at: now,
      ...rest,
    };
    _getMock().salesOrders.push(order);

    // Store items
    items.forEach(item => {
      _getMock().salesOrderItems.push({
        id: _uid(), sales_order_id: order.id,
        product_id: item.product_id, variant_id: item.variant_id ?? null,
        quantity: item.quantity, unit_price: item.unit_price,
        discount: item.discount ?? 0,
        total_price: item.quantity * item.unit_price - (item.discount ?? 0),
        reserved: false, created_at: now,
      });
    });

    return order;
  }

  const { supabase } = await import('@/services/supabase.js');
  const { data: order, error } = await supabase.from('sales_orders').insert({
    order_number: orderNumber, customer_id: customerId, warehouse_id: warehouseId,
    status: ORDER_STATUS.QUOTATION, payment_status: PAYMENT_STATUS.UNPAID,
    ...totals, currency: 'SAR', notes, created_by: createdBy, metadata: {}, ...rest,
  }).select().single();
  if (error) throw error;

  if (items.length > 0) {
    await supabase.from('sales_order_items').insert(
      items.map(i => ({
        sales_order_id: order.id, product_id: i.product_id, variant_id: i.variant_id ?? null,
        quantity: i.quantity, unit_price: i.unit_price, discount: i.discount ?? 0,
        total_price: i.quantity * i.unit_price - (i.discount ?? 0),
      }))
    );
  }

  return order;
}

export async function updateOrderStatus(id, newStatus, meta = {}) {
  const now = new Date().toISOString();
  if (USE_MOCK) {
    const m = _getMock();
    const idx = m.salesOrders.findIndex(o => o.id === id);
    if (idx === -1) throw new Error('Order not found');

    const order = m.salesOrders[idx];
    const allowed = ORDER_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new Error(`لا يمكن الانتقال من ${order.status} إلى ${newStatus}`);
    }

    const update = { status: newStatus, updated_at: now };
    if (newStatus === ORDER_STATUS.DELIVERED) update.delivered_at = now;
    if (newStatus === ORDER_STATUS.PAID) update.payment_status = PAYMENT_STATUS.PAID;
    if (newStatus === ORDER_STATUS.PACKED) update.packed_at = now;
    if (newStatus === ORDER_STATUS.SHIPPED) update.shipped_at = now;
    if (newStatus === ORDER_STATUS.CANCELLED) update.cancelled_at = now;

    m.salesOrders[idx] = { ...order, ...update, ...meta };
    return m.salesOrders[idx];
  }

  const { supabase } = await import('@/services/supabase.js');
  const timestamps = {};
  if (newStatus === ORDER_STATUS.DELIVERED) timestamps.delivered_at = now;
  if (newStatus === ORDER_STATUS.PAID) timestamps.payment_status = PAYMENT_STATUS.PAID;

  const { data, error } = await supabase
    .from('sales_orders')
    .update({ status: newStatus, ...timestamps, ...meta, updated_at: now })
    .eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function updatePaymentStatus(id, paymentStatus) {
  const now = new Date().toISOString();
  if (USE_MOCK) {
    const m = _getMock();
    const idx = m.salesOrders.findIndex(o => o.id === id);
    if (idx === -1) throw new Error('Order not found');
    m.salesOrders[idx] = { ...m.salesOrders[idx], payment_status: paymentStatus, updated_at: now };
    return m.salesOrders[idx];
  }
  const { supabase } = await import('@/services/supabase.js');
  const { data, error } = await supabase
    .from('sales_orders').update({ payment_status: paymentStatus, updated_at: now })
    .eq('id', id).select().single();
  if (error) throw error;
  return data;
}

// ── Purchase Orders ────────────────────────────────────────────────────────

export async function fetchPurchaseOrders(filters = {}) {
  if (USE_MOCK) {
    let list = _getMock().purchaseOrders;
    if (filters.status) list = list.filter(p => p.status === filters.status);
    return [...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
  const { supabase } = await import('@/services/supabase.js');
  let q = supabase.from('purchase_orders')
    .select('*, purchase_order_items(*, products(name, sku)), warehouses(name, code)')
    .order('created_at', { ascending: false });
  if (filters.status) q = q.eq('status', filters.status);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function createPurchaseOrder({ items = [], warehouseId, supplierName, expectedDate, notes, createdBy }) {
  if (!createdBy) throw new Error('createdBy is required');
  const now = new Date().toISOString();
  const poNumber = generateOrderNumber(PO_NUMBER_PREFIX);
  const total = items.reduce((s, i) => s + i.quantity_ordered * i.unit_cost, 0);

  if (USE_MOCK) {
    const po = {
      id: _uid(), po_number: poNumber,
      supplier_name: supplierName, warehouse_id: warehouseId,
      status: PURCHASE_STATUS.DRAFT, total, currency: 'SAR',
      notes, expected_date: expectedDate ?? null, metadata: {},
      created_by: createdBy, created_at: now, updated_at: now,
    };
    _getMock().purchaseOrders.push(po);
    items.forEach(i => {
      _getMock().purchaseOrderItems.push({
        id: _uid(), purchase_order_id: po.id,
        product_id: i.product_id, variant_id: i.variant_id ?? null,
        quantity_ordered: i.quantity_ordered, quantity_received: 0,
        unit_cost: i.unit_cost, created_at: now,
      });
    });
    return po;
  }

  const { supabase } = await import('@/services/supabase.js');
  const { data: po, error } = await supabase.from('purchase_orders').insert({
    po_number: poNumber, supplier_name: supplierName, warehouse_id: warehouseId,
    status: PURCHASE_STATUS.DRAFT, total, currency: 'SAR', notes,
    expected_date: expectedDate, created_by: createdBy, metadata: {},
  }).select().single();
  if (error) throw error;

  if (items.length > 0) {
    await supabase.from('purchase_order_items').insert(
      items.map(i => ({ purchase_order_id: po.id, ...i }))
    );
  }
  return po;
}

export async function updatePurchaseOrderStatus(id, status) {
  const now = new Date().toISOString();
  if (USE_MOCK) {
    const m = _getMock();
    const idx = m.purchaseOrders.findIndex(p => p.id === id);
    if (idx === -1) throw new Error('Purchase order not found');
    m.purchaseOrders[idx] = { ...m.purchaseOrders[idx], status, updated_at: now };
    return m.purchaseOrders[idx];
  }
  const { supabase } = await import('@/services/supabase.js');
  const { data, error } = await supabase
    .from('purchase_orders').update({ status, updated_at: now }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

// ── Shipments ──────────────────────────────────────────────────────────────

export async function fetchShipments(filters = {}) {
  if (USE_MOCK) {
    let list = _getMock().shipments;
    if (filters.status)       list = list.filter(s => s.status === filters.status);
    if (filters.salesOrderId) list = list.filter(s => s.sales_order_id === filters.salesOrderId);
    return [...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
  const { supabase } = await import('@/services/supabase.js');
  let q = supabase.from('shipments')
    .select('*, sales_orders(order_number, contact_name), warehouses(name, code)')
    .order('created_at', { ascending: false });
  if (filters.status)       q = q.eq('status', filters.status);
  if (filters.salesOrderId) q = q.eq('sales_order_id', filters.salesOrderId);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function createShipment({ salesOrderId, warehouseId, carrier, recipientName,
  deliveryAddress, deliveryCity = 'الرياض', estimatedDelivery, notes, createdBy }) {
  if (!createdBy) throw new Error('createdBy is required');
  const now = new Date().toISOString();
  const trackingNumber = `${TRACKING_PREFIX}-${Date.now().toString(36).toUpperCase()}`;

  if (USE_MOCK) {
    const shp = {
      id: _uid(), tracking_number: trackingNumber,
      sales_order_id: salesOrderId ?? null, warehouse_id: warehouseId ?? null,
      carrier: carrier ?? null, status: SHIPMENT_STATUS.PENDING,
      recipient_name: recipientName, address: deliveryAddress, city: deliveryCity,
      country: 'SA', estimated_at: estimatedDelivery ?? null,
      notes: notes ?? '', metadata: {}, cost: 0, currency: 'SAR',
      shipped_at: null, delivered_at: null,
      created_at: now, updated_at: now,
    };
    _getMock().shipments.push(shp);
    return shp;
  }

  const { supabase } = await import('@/services/supabase.js');
  const { data, error } = await supabase.from('shipments').insert({
    tracking_number: trackingNumber, sales_order_id: salesOrderId,
    warehouse_id: warehouseId, carrier, status: SHIPMENT_STATUS.PENDING,
    recipient_name: recipientName, address: deliveryAddress, city: deliveryCity,
    estimated_at: estimatedDelivery, notes, created_by: createdBy, metadata: {},
  }).select().single();
  if (error) throw error;
  return data;
}

export async function updateShipmentStatus(id, status, meta = {}) {
  const now = new Date().toISOString();
  if (USE_MOCK) {
    const m = _getMock();
    const idx = m.shipments.findIndex(s => s.id === id);
    if (idx === -1) throw new Error('Shipment not found');
    const update = { status, updated_at: now };
    if (status === SHIPMENT_STATUS.DISPATCHED) update.shipped_at = now;
    if (status === SHIPMENT_STATUS.DELIVERED)  update.delivered_at = now;
    m.shipments[idx] = { ...m.shipments[idx], ...update, ...meta };
    return m.shipments[idx];
  }
  const { supabase } = await import('@/services/supabase.js');
  const timestamps = {};
  if (status === SHIPMENT_STATUS.DISPATCHED) timestamps.shipped_at = now;
  if (status === SHIPMENT_STATUS.DELIVERED)  timestamps.delivered_at = now;
  const { data, error } = await supabase
    .from('shipments').update({ status, ...timestamps, ...meta, updated_at: now })
    .eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function fetchShipmentByTracking(trackingNumber) {
  if (USE_MOCK) return _getMock().shipments.find(s => s.tracking_number === trackingNumber) ?? null;
  const { supabase } = await import('@/services/supabase.js');
  const { data, error } = await supabase
    .from('shipments').select('*').eq('tracking_number', trackingNumber).single();
  if (error) throw error;
  return data;
}
