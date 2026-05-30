/**
 * Inventory Module — Types, constants, helpers, and mock data.
 */

// ── Enums ──────────────────────────────────────────────────────────────────

export const PRODUCT_TYPE = Object.freeze({
  PHYSICAL: 'physical',
  DIGITAL:  'digital',
  SERVICE:  'service',
  BUNDLE:   'bundle',
});

export const PRODUCT_UNIT = Object.freeze({
  PIECE:  'piece',
  KG:     'kg',
  LITER:  'liter',
  METER:  'meter',
  BOX:    'box',
  PALLET: 'pallet',
});

export const ORDER_STATUS = Object.freeze({
  QUOTATION:  'quotation',
  PENDING:    'pending',
  CONFIRMED:  'confirmed',
  PAID:       'paid',
  PACKED:     'packed',
  SHIPPED:    'shipped',
  DELIVERED:  'delivered',
  RETURNED:   'returned',
  CANCELLED:  'cancelled',
});

export const PAYMENT_STATUS = Object.freeze({
  UNPAID:   'unpaid',
  PARTIAL:  'partial',
  PAID:     'paid',
  REFUNDED: 'refunded',
});

export const SHIPMENT_STATUS = Object.freeze({
  PENDING:           'pending',
  PICKED:            'picked',
  PACKED:            'packed',
  DISPATCHED:        'dispatched',
  IN_TRANSIT:        'in_transit',
  OUT_FOR_DELIVERY:  'out_for_delivery',
  DELIVERED:         'delivered',
  FAILED:            'failed',
  RETURNED:          'returned',
});

export const MOVEMENT_TYPE = Object.freeze({
  IN:         'in',
  OUT:        'out',
  TRANSFER:   'transfer',
  ADJUSTMENT: 'adjustment',
  RETURN:     'return',
  DAMAGE:     'damage',
  COUNT:      'count',
});

export const PURCHASE_STATUS = Object.freeze({
  DRAFT:      'draft',
  SENT:       'sent',
  CONFIRMED:  'confirmed',
  PARTIAL:    'partial',
  RECEIVED:   'received',
  CANCELLED:  'cancelled',
});

export const WAREHOUSE_TYPE = Object.freeze({
  MAIN:     'main',
  BRANCH:   'branch',
  TRANSIT:  'transit',
  VIRTUAL:  'virtual',
  RETURNS:  'returns',
});

export const ADJUSTMENT_REASON = Object.freeze({
  COUNT:      'count',
  DAMAGE:     'damage',
  THEFT:      'theft',
  EXPIRY:     'expiry',
  RETURN:     'return',
  CORRECTION: 'correction',
  SAMPLE:     'sample',
});

export const INVENTORY_ROLE = Object.freeze({
  WAREHOUSE_STAFF:    'warehouse_staff',
  INVENTORY_MANAGER:  'inventory_manager',
  SALES:              'sales',
  ADMIN:              'admin',
});

// ── Labels ─────────────────────────────────────────────────────────────────

export const ORDER_STATUS_LABELS = Object.freeze({
  quotation: 'عرض سعر',
  pending:   'معلق',
  confirmed: 'مؤكد',
  paid:      'مدفوع',
  packed:    'معبأ',
  shipped:   'مشحون',
  delivered: 'تم التسليم',
  returned:  'مُرجَع',
  cancelled: 'ملغى',
});

export const ORDER_STATUS_COLORS = Object.freeze({
  quotation: '#64748b',
  pending:   '#f59e0b',
  confirmed: '#3b82f6',
  paid:      '#8b5cf6',
  packed:    '#0891b2',
  shipped:   '#0ea5e9',
  delivered: '#22c55e',
  returned:  '#f97316',
  cancelled: '#ef4444',
});

export const SHIPMENT_STATUS_LABELS = Object.freeze({
  pending:          'في الانتظار',
  picked:           'تم الاستلام',
  packed:           'معبأ',
  dispatched:       'تم الإرسال',
  in_transit:       'في الطريق',
  out_for_delivery: 'خارج للتوصيل',
  delivered:        'تم التسليم',
  failed:           'فشل التسليم',
  returned:         'مُرجَع',
});

export const SHIPMENT_STATUS_ICONS = Object.freeze({
  pending:          '⏳',
  picked:           '📦',
  packed:           '🎁',
  dispatched:       '🚀',
  in_transit:       '🚚',
  out_for_delivery: '🛵',
  delivered:        '✅',
  failed:           '❌',
  returned:         '↩️',
});

export const MOVEMENT_TYPE_LABELS = Object.freeze({
  in:         'وارد',
  out:        'صادر',
  transfer:   'تحويل',
  adjustment: 'تعديل',
  return:     'مُرتجَع',
  damage:     'تالف',
  count:      'جرد',
});

export const MOVEMENT_TYPE_ICONS = Object.freeze({
  in:         '📥',
  out:        '📤',
  transfer:   '🔄',
  adjustment: '⚖️',
  return:     '↩️',
  damage:     '⚠️',
  count:      '📊',
});

export const PURCHASE_STATUS_LABELS = Object.freeze({
  draft:     'مسودة',
  sent:      'مُرسَل',
  confirmed: 'مؤكد',
  partial:   'مستلم جزئياً',
  received:  'مستلم',
  cancelled: 'ملغى',
});

export const WAREHOUSE_TYPE_LABELS = Object.freeze({
  main:    'رئيسي',
  branch:  'فرع',
  transit: 'ترانزيت',
  virtual: 'افتراضي',
  returns: 'مُرتجعات',
});

export const PAYMENT_STATUS_LABELS = Object.freeze({
  unpaid:   'غير مدفوع',
  partial:  'مدفوع جزئياً',
  paid:     'مدفوع',
  refunded: 'مُستَرد',
});

export const PRODUCT_UNIT_LABELS = Object.freeze({
  piece:  'قطعة',
  kg:     'كيلو',
  liter:  'لتر',
  meter:  'متر',
  box:    'صندوق',
  pallet: 'بليت',
});

// ── Stock status ────────────────────────────────────────────────────────────

export const STOCK_STATUS = Object.freeze({
  IN_STOCK:   'in_stock',
  LOW_STOCK:  'low_stock',
  OUT_STOCK:  'out_stock',
  OVER_STOCK: 'over_stock',
});

export const STOCK_STATUS_LABELS = Object.freeze({
  in_stock:   'متوفر',
  low_stock:  'مخزون منخفض',
  out_stock:  'نفذ المخزون',
  over_stock: 'مخزون زائد',
});

export const STOCK_STATUS_COLORS = Object.freeze({
  in_stock:   '#22c55e',
  low_stock:  '#f59e0b',
  out_stock:  '#ef4444',
  over_stock: '#3b82f6',
});

// ── Business constants ──────────────────────────────────────────────────────

export const INVENTORY_CACHE_TTL_MS      = 3 * 60 * 1000;  // 3 min
export const INVENTORY_REALTIME_INTERVAL = 2 * 60 * 1000;  // 2 min
export const LOW_STOCK_CHECK_INTERVAL    = 10 * 60 * 1000; // 10 min
export const ORDER_NUMBER_PREFIX         = 'ORD';
export const PO_NUMBER_PREFIX            = 'PO';
export const TRACKING_PREFIX             = 'TRK';

// ── Order flow ──────────────────────────────────────────────────────────────

/** Legal next states for each order status */
export const ORDER_TRANSITIONS = Object.freeze({
  quotation: ['pending', 'cancelled'],
  pending:   ['confirmed', 'cancelled'],
  confirmed: ['paid', 'cancelled'],
  paid:      ['packed'],
  packed:    ['shipped'],
  shipped:   ['delivered', 'returned'],
  delivered: ['returned'],
  returned:  [],
  cancelled: [],
});

/** Steps shown in the order timeline (excluding cancelled/returned) */
export const ORDER_TIMELINE_STEPS = [
  'quotation', 'confirmed', 'paid', 'packed', 'shipped', 'delivered',
];

/** Same for shipments */
export const SHIPMENT_TIMELINE_STEPS = [
  'pending', 'picked', 'packed', 'dispatched', 'in_transit', 'out_for_delivery', 'delivered',
];

// ── Helper functions ────────────────────────────────────────────────────────

/**
 * Derive stock status from quantity_on_hand, min_stock_level.
 */
export function getStockStatus(qoh, minStock = 0) {
  if (qoh <= 0) return STOCK_STATUS.OUT_STOCK;
  if (qoh <= minStock) return STOCK_STATUS.LOW_STOCK;
  return STOCK_STATUS.IN_STOCK;
}

/**
 * Available quantity = on_hand - reserved.
 */
export function getAvailableQty(stockLevel) {
  return Math.max(0, (stockLevel.quantity_on_hand ?? 0) - (stockLevel.quantity_reserved ?? 0));
}

/**
 * Format currency — SAR by default.
 */
export function formatPrice(amount, currency = 'SAR') {
  return `${currency} ${Number(amount ?? 0).toLocaleString('ar-SA-u-nu-latn', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Generate order number from timestamp.
 */
export function generateOrderNumber(prefix = ORDER_NUMBER_PREFIX) {
  const ts = Date.now().toString(36).toUpperCase();
  return `${prefix}-${ts}`;
}

/**
 * Calculate order totals from line items.
 * items: [{ quantity, unit_price, discount }]
 */
export function calcOrderTotals(items = [], taxRate = 0.15, shippingCost = 0) {
  const subtotal = items.reduce(
    (s, i) => s + (Number(i.unit_price) * Number(i.quantity)) - Number(i.discount || 0),
    0
  );
  const tax = subtotal * taxRate;
  const total = subtotal + tax + shippingCost;
  return { subtotal, tax, shipping_cost: shippingCost, total };
}

/**
 * Inventory turnover = COGS / average inventory value.
 * Returns ratio; > 6 = healthy.
 */
export function calcInventoryTurnover(cogs, avgInventoryValue) {
  if (!avgInventoryValue || avgInventoryValue === 0) return 0;
  return Number((cogs / avgInventoryValue).toFixed(2));
}

// ── Mock data ───────────────────────────────────────────────────────────────

export const MOCK_CATEGORIES = [
  { id: 'cat-1', name: 'منتجات العناية بالبشرة', slug: 'skincare', position: 0, is_active: true },
  { id: 'cat-2', name: 'أدوات التنظيف', slug: 'cleaning', position: 1, is_active: true },
  { id: 'cat-3', name: 'عبوات التعبئة', slug: 'packaging', position: 2, is_active: true },
];

export const MOCK_WAREHOUSES = [
  {
    id: 'wh-1', name: 'المستودع الرئيسي', code: 'MAIN', type: 'main',
    city: 'الرياض', country: 'SA', is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'wh-2', name: 'مستودع جدة', code: 'JED', type: 'branch',
    city: 'جدة', country: 'SA', is_active: true,
    created_at: new Date().toISOString(),
  },
];

export const MOCK_PRODUCTS = [
  {
    id: 'prod-1', sku: 'SKN-001', barcode: '6281234567890',
    name: 'كريم ترطيب يومي', name_ar: 'كريم ترطيب يومي',
    category_id: 'cat-1', product_type: 'physical', unit: 'piece',
    cost_price: 45, selling_price: 89, currency: 'SAR',
    min_stock_level: 20, reorder_point: 30, reorder_qty: 100,
    is_active: true, is_tracked: true, tags: ['بشرة', 'ترطيب'],
    images: [], metadata: {},
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'prod-2', sku: 'SKN-002', barcode: '6281234567891',
    name: 'سيروم فيتامين سي', name_ar: 'سيروم فيتامين سي',
    category_id: 'cat-1', product_type: 'physical', unit: 'piece',
    cost_price: 120, selling_price: 220, currency: 'SAR',
    min_stock_level: 15, reorder_point: 20, reorder_qty: 60,
    is_active: true, is_tracked: true, tags: ['سيروم', 'فيتامين'],
    images: [], metadata: {},
    created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'prod-3', sku: 'CLN-001', barcode: '6281234567892',
    name: 'محلول تنظيف ملطف', name_ar: 'محلول تنظيف ملطف',
    category_id: 'cat-2', product_type: 'physical', unit: 'liter',
    cost_price: 18, selling_price: 35, currency: 'SAR',
    min_stock_level: 50, reorder_point: 70, reorder_qty: 200,
    is_active: true, is_tracked: true, tags: ['تنظيف'],
    images: [], metadata: {},
    created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'prod-4', sku: 'PKG-001', barcode: '6281234567893',
    name: 'علبة هدايا فاخرة', name_ar: 'علبة هدايا فاخرة',
    category_id: 'cat-3', product_type: 'physical', unit: 'piece',
    cost_price: 8, selling_price: 25, currency: 'SAR',
    min_stock_level: 100, reorder_point: 150, reorder_qty: 500,
    is_active: true, is_tracked: true, tags: ['تغليف', 'هدايا'],
    images: [], metadata: {},
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const MOCK_STOCK_LEVELS = [
  { id: 'sl-1', product_id: 'prod-1', warehouse_id: 'wh-1', quantity_on_hand: 85, quantity_reserved: 10, quantity_on_order: 0 },
  { id: 'sl-2', product_id: 'prod-2', warehouse_id: 'wh-1', quantity_on_hand: 12, quantity_reserved: 2, quantity_on_order: 60 },  // low stock
  { id: 'sl-3', product_id: 'prod-3', warehouse_id: 'wh-1', quantity_on_hand: 0, quantity_reserved: 0, quantity_on_order: 200 },  // out of stock
  { id: 'sl-4', product_id: 'prod-4', warehouse_id: 'wh-1', quantity_on_hand: 320, quantity_reserved: 50, quantity_on_order: 0 },
  { id: 'sl-5', product_id: 'prod-1', warehouse_id: 'wh-2', quantity_on_hand: 40, quantity_reserved: 5, quantity_on_order: 0 },
];

export const MOCK_SALES_ORDERS = [
  {
    id: 'so-1', order_number: 'ORD-K5PQ2X', status: 'delivered', payment_status: 'paid',
    contact_name: 'شركة النور للتجارة', total: 8900, currency: 'SAR',
    order_date: new Date(Date.now() - 7 * 86400000).toISOString(),
    delivered_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    items: [{ product_id: 'prod-1', quantity: 100, unit_price: 89, total_price: 8900 }],
    created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'so-2', order_number: 'ORD-M8XZ4A', status: 'shipped', payment_status: 'paid',
    contact_name: 'مؤسسة الأفق', total: 4400, currency: 'SAR',
    order_date: new Date(Date.now() - 3 * 86400000).toISOString(),
    delivered_at: null,
    items: [{ product_id: 'prod-2', quantity: 20, unit_price: 220, total_price: 4400 }],
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'so-3', order_number: 'ORD-N2QR7B', status: 'paid', payment_status: 'paid',
    contact_name: 'مستشفى الرحمة', total: 1750, currency: 'SAR',
    order_date: new Date(Date.now() - 1 * 86400000).toISOString(),
    delivered_at: null,
    items: [{ product_id: 'prod-3', quantity: 50, unit_price: 35, total_price: 1750 }],
    created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'so-4', order_number: 'ORD-P3LM9C', status: 'quotation', payment_status: 'unpaid',
    contact_name: 'شركة التميز', total: 5000, currency: 'SAR',
    order_date: new Date().toISOString(),
    delivered_at: null,
    items: [{ product_id: 'prod-1', quantity: 50, unit_price: 89, total_price: 4450 }],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const MOCK_SHIPMENTS = [
  {
    id: 'shp-1', tracking_number: 'TRK-A1B2C3', sales_order_id: 'so-2',
    carrier: 'Aramex', method: 'express', status: 'in_transit',
    recipient_name: 'مؤسسة الأفق', city: 'جدة', country: 'SA',
    shipped_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    estimated_at: new Date(Date.now() + 1 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const MOCK_STOCK_MOVEMENTS = [
  {
    id: 'mv-1', product_id: 'prod-1', warehouse_id: 'wh-1',
    movement_type: 'in', quantity: 100, unit_cost: 45,
    reference_type: 'purchase_order', notes: 'استلام بضاعة',
    performed_by: 'user-1',
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
  {
    id: 'mv-2', product_id: 'prod-1', warehouse_id: 'wh-1',
    movement_type: 'out', quantity: 15, unit_cost: 45,
    reference_type: 'sales_order', reference_id: 'so-1', notes: 'بيع',
    performed_by: 'user-1',
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
  {
    id: 'mv-3', product_id: 'prod-2', warehouse_id: 'wh-1',
    movement_type: 'adjustment', quantity: -3, unit_cost: 120,
    reference_type: 'adjustment', notes: 'تلف في التخزين',
    performed_by: 'user-1',
    created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
];
