/**
 * Inventory Service
 * Products, stock levels, stock movements, adjustments, and warehouse transfers.
 */

import {
  MOCK_PRODUCTS,
  MOCK_CATEGORIES,
  MOCK_WAREHOUSES,
  MOCK_STOCK_LEVELS,
  MOCK_STOCK_MOVEMENTS,
  MOVEMENT_TYPE,
  generateOrderNumber,
  getStockStatus,
  getAvailableQty,
  PO_NUMBER_PREFIX,
} from '../types/inventory.types.js';

export const USE_MOCK =
  String(import.meta.env.VITE_USE_MOCK_INVENTORY ?? '').toLowerCase() === 'true';

// ── In-memory mock store ───────────────────────────────────────────────────
let _mock = null;
function _getMock() {
  if (_mock) return _mock;
  _mock = {
    categories:   JSON.parse(JSON.stringify(MOCK_CATEGORIES)),
    products:     JSON.parse(JSON.stringify(MOCK_PRODUCTS)),
    variants:     [],
    warehouses:   JSON.parse(JSON.stringify(MOCK_WAREHOUSES)),
    stockLevels:  JSON.parse(JSON.stringify(MOCK_STOCK_LEVELS)),
    movements:    JSON.parse(JSON.stringify(MOCK_STOCK_MOVEMENTS)),
    adjustments:  [],
  };
  return _mock;
}

function _uid() { return crypto.randomUUID(); }

// ── Categories ─────────────────────────────────────────────────────────────

export async function fetchCategories() {
  if (USE_MOCK) return _getMock().categories.filter(c => c.is_active);
  const { supabase } = await import('@/services/supabase.js');
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('is_active', true)
    .order('position');
  if (error) throw error;
  return data;
}

export async function createCategory(data) {
  const now = new Date().toISOString();
  if (USE_MOCK) {
    const cat = { id: _uid(), is_active: true, position: 0, metadata: {}, created_at: now, updated_at: now, ...data };
    _getMock().categories.push(cat);
    return cat;
  }
  const { supabase } = await import('@/services/supabase.js');
  const { data: row, error } = await supabase.from('categories').insert(data).select().single();
  if (error) throw error;
  return row;
}

// ── Products ───────────────────────────────────────────────────────────────

export async function fetchProducts(filters = {}) {
  if (USE_MOCK) {
    let list = _getMock().products;
    if (filters.categoryId) list = list.filter(p => p.category_id === filters.categoryId);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
    }
    if (filters.isActive !== undefined) list = list.filter(p => p.is_active === filters.isActive);
    return list;
  }
  const { supabase } = await import('@/services/supabase.js');
  let q = supabase.from('products').select('*, categories(name, slug)');
  if (filters.categoryId) q = q.eq('category_id', filters.categoryId);
  if (filters.isActive !== undefined) q = q.eq('is_active', filters.isActive);
  if (filters.search) q = q.ilike('name', `%${filters.search}%`);
  q = q.order('created_at', { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function fetchProductById(id) {
  if (USE_MOCK) return _getMock().products.find(p => p.id === id) ?? null;
  const { supabase } = await import('@/services/supabase.js');
  const { data, error } = await supabase
    .from('products')
    .select('*, categories(name), product_variants(*)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function fetchProductBySKU(sku) {
  if (USE_MOCK) return _getMock().products.find(p => p.sku === sku) ?? null;
  const { supabase } = await import('@/services/supabase.js');
  const { data, error } = await supabase.from('products').select('*').eq('sku', sku).single();
  if (error) throw error;
  return data;
}

export async function fetchProductByBarcode(barcode) {
  if (USE_MOCK) return _getMock().products.find(p => p.barcode === barcode) ?? null;
  const { supabase } = await import('@/services/supabase.js');
  const { data, error } = await supabase.from('products').select('*').eq('barcode', barcode).single();
  if (error) throw error;
  return data;
}

export async function createProduct(data) {
  const now = new Date().toISOString();
  if (USE_MOCK) {
    const product = {
      id: _uid(), images: [], tags: [], metadata: {},
      is_active: true, is_tracked: true,
      min_stock_level: 10, reorder_point: 20, reorder_qty: 50,
      cost_price: 0, selling_price: 0, currency: 'SAR',
      unit: 'piece', product_type: 'physical',
      created_at: now, updated_at: now,
      ...data,
    };
    _getMock().products.push(product);
    return product;
  }
  const { supabase } = await import('@/services/supabase.js');
  const { data: row, error } = await supabase.from('products').insert(data).select().single();
  if (error) throw error;
  return row;
}

export async function updateProduct(id, data) {
  const now = new Date().toISOString();
  if (USE_MOCK) {
    const idx = _getMock().products.findIndex(p => p.id === id);
    if (idx === -1) throw new Error('Product not found');
    _getMock().products[idx] = { ..._getMock().products[idx], ...data, updated_at: now };
    return _getMock().products[idx];
  }
  const { supabase } = await import('@/services/supabase.js');
  const { data: row, error } = await supabase
    .from('products').update({ ...data, updated_at: now }).eq('id', id).select().single();
  if (error) throw error;
  return row;
}

export async function deleteProduct(id) {
  if (USE_MOCK) {
    _getMock().products = _getMock().products.filter(p => p.id !== id);
    return;
  }
  const { supabase } = await import('@/services/supabase.js');
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
}

// ── Variants ───────────────────────────────────────────────────────────────

export async function fetchVariants(productId) {
  if (USE_MOCK) return _getMock().variants.filter(v => v.product_id === productId);
  const { supabase } = await import('@/services/supabase.js');
  const { data, error } = await supabase
    .from('product_variants').select('*').eq('product_id', productId).order('sort_order');
  if (error) throw error;
  return data;
}

export async function createVariant(data) {
  const now = new Date().toISOString();
  if (USE_MOCK) {
    const v = { id: _uid(), is_active: true, attributes: {}, sort_order: 0, created_at: now, updated_at: now, ...data };
    _getMock().variants.push(v);
    return v;
  }
  const { supabase } = await import('@/services/supabase.js');
  const { data: row, error } = await supabase.from('product_variants').insert(data).select().single();
  if (error) throw error;
  return row;
}

// ── Warehouses ─────────────────────────────────────────────────────────────

export async function fetchWarehouses() {
  if (USE_MOCK) return _getMock().warehouses.filter(w => w.is_active);
  const { supabase } = await import('@/services/supabase.js');
  const { data, error } = await supabase.from('warehouses').select('*').eq('is_active', true).order('name');
  if (error) throw error;
  return data;
}

export async function createWarehouse(data) {
  const now = new Date().toISOString();
  if (USE_MOCK) {
    const wh = { id: _uid(), is_active: true, metadata: {}, created_at: now, updated_at: now, ...data };
    _getMock().warehouses.push(wh);
    return wh;
  }
  const { supabase } = await import('@/services/supabase.js');
  const { data: row, error } = await supabase.from('warehouses').insert(data).select().single();
  if (error) throw error;
  return row;
}

// ── Stock Levels ───────────────────────────────────────────────────────────

export async function fetchStockLevels(filters = {}) {
  if (USE_MOCK) {
    let list = _getMock().stockLevels;
    if (filters.warehouseId) list = list.filter(s => s.warehouse_id === filters.warehouseId);
    if (filters.productId)   list = list.filter(s => s.product_id === filters.productId);
    return list;
  }
  const { supabase } = await import('@/services/supabase.js');
  let q = supabase.from('stock_levels').select('*, products(name, sku, min_stock_level), warehouses(name, code)');
  if (filters.warehouseId) q = q.eq('warehouse_id', filters.warehouseId);
  if (filters.productId)   q = q.eq('product_id', filters.productId);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function fetchLowStockItems() {
  if (USE_MOCK) {
    const m = _getMock();
    return m.stockLevels
      .map(sl => {
        const product = m.products.find(p => p.id === sl.product_id);
        if (!product) return null;
        const available = getAvailableQty(sl);
        const status = getStockStatus(available, product.min_stock_level);
        return status !== 'in_stock' ? { ...sl, product, status } : null;
      })
      .filter(Boolean);
  }
  const { supabase } = await import('@/services/supabase.js');
  const { data, error } = await supabase
    .from('stock_levels')
    .select('*, products!inner(name, sku, min_stock_level, low_stock_threshold)')
    .lt('quantity_on_hand', supabase.rpc('get_min_stock_level'));
  if (error) throw error;
  return data;
}

/**
 * Ensure a stock_level row exists for (product, warehouse).
 * Returns existing or newly inserted row.
 */
async function _ensureStockLevel(productId, warehouseId, variantId = null) {
  const m = _getMock();
  let sl = m.stockLevels.find(
    s => s.product_id === productId && s.warehouse_id === warehouseId &&
         (variantId ? s.variant_id === variantId : !s.variant_id)
  );
  if (!sl) {
    sl = { id: _uid(), product_id: productId, warehouse_id: warehouseId,
           variant_id: variantId, quantity_on_hand: 0, quantity_reserved: 0,
           quantity_on_order: 0, updated_at: new Date().toISOString() };
    m.stockLevels.push(sl);
  }
  return sl;
}

// ── Stock Operations ───────────────────────────────────────────────────────

/**
 * Adjust stock level for a product in a warehouse.
 * quantityDelta: positive = add, negative = subtract.
 * Records a stock_movement entry.
 */
export async function adjustStock({
  productId, warehouseId, variantId = null,
  quantityDelta, movementType = MOVEMENT_TYPE.ADJUSTMENT,
  referenceType = null, referenceId = null,
  notes = '', batchNumber = null, performedBy,
}) {
  if (!performedBy) throw new Error('performedBy is required for stock adjustments');

  if (USE_MOCK) {
    const m = _getMock();
    const sl = await _ensureStockLevel(productId, warehouseId, variantId);
    const before = sl.quantity_on_hand;
    sl.quantity_on_hand = Math.max(0, before + quantityDelta);
    sl.updated_at = new Date().toISOString();

    const movement = {
      id: _uid(), product_id: productId, warehouse_id: warehouseId,
      variant_id: variantId, movement_type: movementType,
      quantity: quantityDelta, unit_cost: 0,
      reference_type: referenceType, reference_id: referenceId,
      notes, batch_number: batchNumber,
      performed_by: performedBy,
      created_at: new Date().toISOString(),
    };
    m.movements.push(movement);
    return { stockLevel: sl, movement };
  }

  const { supabase } = await import('@/services/supabase.js');
  // Upsert stock level
  const { data: current } = await supabase
    .from('stock_levels')
    .select('id, quantity_on_hand')
    .eq('product_id', productId)
    .eq('warehouse_id', warehouseId)
    .maybeSingle();

  const before = current?.quantity_on_hand ?? 0;
  const after  = Math.max(0, before + quantityDelta);

  if (current) {
    await supabase.from('stock_levels')
      .update({ quantity_on_hand: after })
      .eq('id', current.id);
  } else {
    await supabase.from('stock_levels')
      .insert({ product_id: productId, warehouse_id: warehouseId, variant_id: variantId, quantity_on_hand: after });
  }

  const { data: movement, error } = await supabase.from('stock_movements').insert({
    product_id: productId, warehouse_id: warehouseId, variant_id: variantId,
    movement_type: movementType, quantity: quantityDelta,
    quantity_before: before, quantity_after: after,
    reference_type: referenceType, reference_id: referenceId,
    notes, batch_number: batchNumber, performed_by: performedBy,
  }).select().single();
  if (error) throw error;
  return { movement };
}

/**
 * Transfer stock between two warehouses.
 * Atomically decrements source and increments destination.
 */
export async function transferStock({
  productId, variantId = null,
  fromWarehouseId, toWarehouseId,
  quantity, performedBy, notes = '',
}) {
  if (quantity <= 0) throw new Error('Transfer quantity must be positive');

  // Deduct from source
  await adjustStock({
    productId, warehouseId: fromWarehouseId, variantId,
    quantityDelta: -quantity,
    movementType: MOVEMENT_TYPE.TRANSFER,
    referenceType: 'transfer',
    notes: `تحويل إلى مستودع ${toWarehouseId} — ${notes}`,
    performedBy,
  });

  // Add to destination
  await adjustStock({
    productId, warehouseId: toWarehouseId, variantId,
    quantityDelta: quantity,
    movementType: MOVEMENT_TYPE.TRANSFER,
    referenceType: 'transfer',
    notes: `تحويل من مستودع ${fromWarehouseId} — ${notes}`,
    performedBy,
  });

  return { success: true };
}

/**
 * Soft-reserve inventory for an order.
 * Increments quantity_reserved; does NOT decrement quantity_on_hand.
 */
export async function reserveInventory({ productId, warehouseId, variantId = null, quantity }) {
  if (USE_MOCK) {
    const sl = await _ensureStockLevel(productId, warehouseId, variantId);
    const available = sl.quantity_on_hand - sl.quantity_reserved;
    if (available < quantity) throw new Error(`مخزون غير كافٍ: متاح ${available}`);
    sl.quantity_reserved += quantity;
    sl.updated_at = new Date().toISOString();
    return sl;
  }
  const { supabase } = await import('@/services/supabase.js');
  const { error } = await supabase.rpc('reserve_inventory', {
    p_product_id: productId, p_warehouse_id: warehouseId,
    p_variant_id: variantId, p_quantity: quantity,
  });
  if (error) throw error;
}

/**
 * Release a soft-reserve (e.g. order cancelled).
 */
export async function releaseInventory({ productId, warehouseId, variantId = null, quantity }) {
  if (USE_MOCK) {
    const m = _getMock();
    const sl = m.stockLevels.find(
      s => s.product_id === productId && s.warehouse_id === warehouseId
    );
    if (sl) {
      sl.quantity_reserved = Math.max(0, sl.quantity_reserved - quantity);
      sl.updated_at = new Date().toISOString();
    }
    return sl;
  }
  const { supabase } = await import('@/services/supabase.js');
  const { error } = await supabase.rpc('release_inventory', {
    p_product_id: productId, p_warehouse_id: warehouseId,
    p_variant_id: variantId, p_quantity: quantity,
  });
  if (error) throw error;
}

// ── Stock Movements history ────────────────────────────────────────────────

export async function fetchMovements(filters = {}) {
  if (USE_MOCK) {
    let list = _getMock().movements;
    if (filters.productId)   list = list.filter(m => m.product_id === filters.productId);
    if (filters.warehouseId) list = list.filter(m => m.warehouse_id === filters.warehouseId);
    if (filters.movementType) list = list.filter(m => m.movement_type === filters.movementType);
    return list.slice(0, filters.limit ?? 100);
  }
  const { supabase } = await import('@/services/supabase.js');
  let q = supabase.from('stock_movements')
    .select('*, products(name, sku), warehouses(name, code)')
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 100);
  if (filters.productId)   q = q.eq('product_id', filters.productId);
  if (filters.warehouseId) q = q.eq('warehouse_id', filters.warehouseId);
  if (filters.movementType) q = q.eq('movement_type', filters.movementType);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

// ── Inventory Adjustments ──────────────────────────────────────────────────

export async function createAdjustment({ productId, warehouseId, variantId = null,
  reason, quantityBefore, quantityActual, notes, performedBy }) {
  const now = new Date().toISOString();
  if (USE_MOCK) {
    const adj = {
      id: _uid(), product_id: productId, warehouse_id: warehouseId,
      variant_id: variantId, reason, quantity_before: quantityBefore,
      quantity_after: quantityActual, quantity_delta: quantityActual - quantityBefore,
      notes, performed_by: performedBy, created_at: now,
    };
    _getMock().adjustments.push(adj);

    // Apply the delta immediately in mock
    const delta = quantityActual - quantityBefore;
    if (delta !== 0) {
      await adjustStock({
        productId, warehouseId, variantId,
        quantityDelta: delta,
        movementType: MOVEMENT_TYPE.ADJUSTMENT,
        referenceType: 'adjustment',
        notes: reason,
        performedBy,
      });
    }
    return adj;
  }
  const { supabase } = await import('@/services/supabase.js');
  const { data, error } = await supabase.from('inventory_adjustments').insert({
    product_id: productId, warehouse_id: warehouseId, variant_id: variantId,
    reason, quantity_before: quantityBefore, quantity_after: quantityActual,
    quantity_delta: quantityActual - quantityBefore, notes, performed_by: performedBy,
  }).select().single();
  if (error) throw error;
  return data;
}

// ── Search ─────────────────────────────────────────────────────────────────

export async function searchInventory(query) {
  if (!query?.trim()) return { products: [], categories: [] };
  const q = query.toLowerCase();
  if (USE_MOCK) {
    const m = _getMock();
    const products = m.products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.barcode && p.barcode.includes(q))
    );
    const categories = m.categories.filter(c => c.name.toLowerCase().includes(q));
    return { products, categories };
  }
  const { supabase } = await import('@/services/supabase.js');
  const [prodRes, catRes] = await Promise.all([
    supabase.from('products').select('id, name, sku, barcode, selling_price, currency')
      .or(`name.ilike.%${query}%,sku.ilike.%${query}%,barcode.eq.${query}`)
      .limit(20),
    supabase.from('categories').select('id, name, slug').ilike('name', `%${query}%`).limit(10),
  ]);
  return { products: prodRes.data ?? [], categories: catRes.data ?? [] };
}
