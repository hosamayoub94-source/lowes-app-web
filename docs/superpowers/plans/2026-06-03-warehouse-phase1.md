# Warehouse System — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the warehouse foundation — central + sales warehouses, stock allocation between them, a "what stock do we have & where" visibility dashboard, and central-stock access control.

**Architecture:** Three lean tables (`wh_warehouses`, `wh_stock`, `wh_movements`) compatible with the real simple `products` table and PIN auth (open RLS + GRANT, string `performed_by`). A `warehouseService.js` data layer wraps all reads/mutations. A `WarehouseScreen.jsx` renders the per-product × per-warehouse matrix with receive/allocate/adjust actions gated by new permissions.

**Tech Stack:** React 18 + Vite, Supabase JS client, Tailwind, Zustand (auth store), existing `usePermissions` hook.

**Testing note:** This project has NO unit-test framework. Per `CLAUDE.md`, verification = `npm run build` (must succeed) + live browser check on Supabase/prod. Each task ends with a build check and a commit.

---

## File Structure

- Create: `supabase/warehouse_phase1.sql` — schema + RLS/GRANT + seed 3 warehouses
- Modify: `src/data/permissions.js` — add `MANAGE_CENTRAL_STOCK`, `MANAGE_SALES_STOCK`, `VIEW_INVENTORY`
- Create: `src/services/warehouseService.js` — all warehouse data operations
- Create: `src/screens/WarehouseScreen.jsx` — visibility dashboard + action modals
- Modify: `src/routes/paths.js` — add `WAREHOUSES` route constant
- Modify: `src/routes/AppRoutes.jsx` — lazy import + protected route
- Modify: `src/data/navigation.js` — nav item «المخازن»

---

## Task 1: Database schema + seed

**Files:**
- Create: `supabase/warehouse_phase1.sql`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/warehouse_phase1.sql`:

```sql
-- ================================================================
-- Warehouse System — Phase 1 (lean, PIN-auth compatible)
-- Apply via Supabase SQL Editor or Management API.
-- ================================================================

-- 1. Warehouses
CREATE TABLE IF NOT EXISTS wh_warehouses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  type        text NOT NULL DEFAULT 'sales',   -- central | sales | distributor | returns
  owner_name  text,
  market      text,                            -- syria | turkey | null
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. Stock per (warehouse, product)
CREATE TABLE IF NOT EXISTS wh_stock (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES wh_warehouses(id) ON DELETE CASCADE,
  product_id   uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity     int  NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, product_id)
);

-- 3. Movement audit trail
CREATE TABLE IF NOT EXISTS wh_movements (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id         uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  from_warehouse_id  uuid REFERENCES wh_warehouses(id) ON DELETE SET NULL,
  to_warehouse_id    uuid REFERENCES wh_warehouses(id) ON DELETE SET NULL,
  quantity           int  NOT NULL,
  type               text NOT NULL,            -- receive | allocate | reserve | release | adjust | return
  reason             text,
  performed_by       text,
  order_id           uuid,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wh_stock_wh   ON wh_stock (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_wh_stock_prod ON wh_stock (product_id);
CREATE INDEX IF NOT EXISTS idx_wh_mov_prod   ON wh_movements (product_id, created_at DESC);

-- RLS: open (PIN-auth model — same as other app tables), gated in app layer
ALTER TABLE wh_warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE wh_stock      ENABLE ROW LEVEL SECURITY;
ALTER TABLE wh_movements  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wh_warehouses_all ON wh_warehouses;
DROP POLICY IF EXISTS wh_stock_all      ON wh_stock;
DROP POLICY IF EXISTS wh_movements_all  ON wh_movements;
CREATE POLICY wh_warehouses_all ON wh_warehouses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY wh_stock_all      ON wh_stock      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY wh_movements_all  ON wh_movements  FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON wh_warehouses, wh_stock, wh_movements TO anon, authenticated;

-- Seed the three Phase-1 warehouses (idempotent by name)
INSERT INTO wh_warehouses (name, type, owner_name, market)
SELECT 'المخزن المركزي', 'central', NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM wh_warehouses WHERE name = 'المخزن المركزي');

INSERT INTO wh_warehouses (name, type, owner_name, market)
SELECT 'مبيعات سوريا', 'sales', 'Yousef Alkshki', 'syria'
WHERE NOT EXISTS (SELECT 1 FROM wh_warehouses WHERE name = 'مبيعات سوريا');

INSERT INTO wh_warehouses (name, type, owner_name, market)
SELECT 'مبيعات تركيا', 'sales', 'Fatima Ayoub', 'turkey'
WHERE NOT EXISTS (SELECT 1 FROM wh_warehouses WHERE name = 'مبيعات تركيا');
```

- [ ] **Step 2: Apply via Supabase Management API (Chrome on Supabase Dashboard)**

In the Supabase Dashboard tab (logged in), run the SQL via the Management API. In Chrome `javascript_tool`:

```js
(async () => {
  const token = JSON.parse(localStorage.getItem('supabase.dashboard.auth.token')).access_token;
  const sql = `<paste full contents of supabase/warehouse_phase1.sql>`;
  const res = await fetch('https://api.supabase.com/v1/projects/fghdumrgimoeqsafdhhh/database/query', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  return JSON.stringify(await res.json());
})()
```

Expected: `[]` (success, no error).

- [ ] **Step 3: Verify tables + seed**

Run via the same Management API call:

```sql
SELECT name, type, market FROM wh_warehouses ORDER BY type;
```

Expected: 3 rows — `المخزن المركزي/central`, `مبيعات سوريا/sales/syria`, `مبيعات تركيا/sales/turkey`.

- [ ] **Step 4: Commit**

```bash
git add supabase/warehouse_phase1.sql
git commit -m "feat(warehouse): phase 1 schema — wh_warehouses/wh_stock/wh_movements + seed"
```

---

## Task 2: Permissions

**Files:**
- Modify: `src/data/permissions.js`

- [ ] **Step 1: Add the three permission keys**

In `src/data/permissions.js`, inside the `PERMISSIONS` object (after `MANAGE_SETTINGS`), add:

```js
  MANAGE_CENTRAL_STOCK: 'manage_central_stock', // receive/allocate from central warehouse
  MANAGE_SALES_STOCK:   'manage_sales_stock',   // adjust sales/distributor warehouse stock
  VIEW_INVENTORY:       'view_inventory',       // see the warehouse dashboard
```

- [ ] **Step 2: Add the labels**

In the `PERMISSION_LABELS` object (after the `MANAGE_SETTINGS` label), add:

```js
  [PERMISSIONS.MANAGE_CENTRAL_STOCK]: 'إدارة المخزن المركزي (استلام/تخصيص)',
  [PERMISSIONS.MANAGE_SALES_STOCK]:   'إدارة مخازن المبيعات',
  [PERMISSIONS.VIEW_INVENTORY]:       'عرض لوحة المخازن',
```

- [ ] **Step 3: Grant to manager + sales_manager defaults**

In `ROLE_PERMISSIONS`, add `VIEW_INVENTORY` and `MANAGE_SALES_STOCK` to `[ROLES.MANAGER]` array and `VIEW_INVENTORY` to `[ROLES.SALES_MANAGER]`. Admin already gets ALL via `ALL`. Add these lines into the respective arrays:

Manager array — add:
```js
    PERMISSIONS.MANAGE_CENTRAL_STOCK,
    PERMISSIONS.MANAGE_SALES_STOCK,
    PERMISSIONS.VIEW_INVENTORY,
```
Sales manager array — add:
```js
    PERMISSIONS.VIEW_INVENTORY,
```

> Note: Wasim and Fadi are NOT managers by role — they get `MANAGE_CENTRAL_STOCK` via `profiles.extra_permissions` in Task 6. Yousef/Fatima (fulfillment) get `MANAGE_SALES_STOCK` + `VIEW_INVENTORY` via extra_permissions too (they may be `employee` role).

- [ ] **Step 4: Build check**

Run: `npm run build`
Expected: build succeeds (no syntax errors).

- [ ] **Step 5: Commit**

```bash
git add src/data/permissions.js
git commit -m "feat(warehouse): add MANAGE_CENTRAL_STOCK / MANAGE_SALES_STOCK / VIEW_INVENTORY permissions"
```

---

## Task 3: Warehouse service layer

**Files:**
- Create: `src/services/warehouseService.js`

- [ ] **Step 1: Write the service**

Create `src/services/warehouseService.js`:

```js
// =============================================================
// warehouseService — Phase 1 data layer for the warehouse system.
// Tables: wh_warehouses, wh_stock, wh_movements (PIN-auth, open RLS).
// All stock mutations also write a wh_movements audit row.
// =============================================================
import { supabase } from './supabase';

// List active warehouses (central first, then sales, then others).
export async function listWarehouses() {
  const { data, error } = await supabase
    .from('wh_warehouses')
    .select('*')
    .eq('is_active', true)
    .order('type')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

// Build the visibility matrix: one row per active product with a
// { [warehouseId]: quantity } map + total. Returns { warehouses, rows }.
export async function getStockMatrix() {
  const [whRes, prodRes, stockRes] = await Promise.all([
    supabase.from('wh_warehouses').select('*').eq('is_active', true).order('type').order('name'),
    supabase.from('products').select('id, name, sku, min_stock').eq('is_active', true).order('name'),
    supabase.from('wh_stock').select('warehouse_id, product_id, quantity'),
  ]);
  if (whRes.error)    throw whRes.error;
  if (prodRes.error)  throw prodRes.error;
  if (stockRes.error) throw stockRes.error;

  const warehouses = whRes.data ?? [];
  const products   = prodRes.data ?? [];
  const stock      = stockRes.data ?? [];

  // index stock by product → warehouse → qty
  const byProduct = {};
  for (const s of stock) {
    (byProduct[s.product_id] ??= {})[s.warehouse_id] = s.quantity;
  }

  const rows = products.map(p => {
    const perWh = byProduct[p.id] ?? {};
    const total = Object.values(perWh).reduce((a, q) => a + Number(q || 0), 0);
    return { ...p, perWh, total };
  });

  return { warehouses, rows };
}

// Internal: read current qty for (warehouse, product); 0 if no row.
async function _currentQty(warehouseId, productId) {
  const { data } = await supabase
    .from('wh_stock')
    .select('quantity')
    .eq('warehouse_id', warehouseId)
    .eq('product_id', productId)
    .maybeSingle();
  return Number(data?.quantity ?? 0);
}

// Internal: set qty for (warehouse, product) via upsert.
async function _setQty(warehouseId, productId, qty) {
  const { error } = await supabase
    .from('wh_stock')
    .upsert(
      { warehouse_id: warehouseId, product_id: productId, quantity: qty, updated_at: new Date().toISOString() },
      { onConflict: 'warehouse_id,product_id' },
    );
  if (error) throw error;
}

async function _logMovement(row) {
  const { error } = await supabase.from('wh_movements').insert(row);
  if (error) throw error;
}

// Receive new stock into a warehouse (typically central).
export async function receiveStock({ productId, warehouseId, quantity, performedBy, reason }) {
  const qty = Number(quantity);
  if (!qty || qty <= 0) throw new Error('أدخل كمية صحيحة');
  const current = await _currentQty(warehouseId, productId);
  await _setQty(warehouseId, productId, current + qty);
  await _logMovement({
    product_id: productId, from_warehouse_id: null, to_warehouse_id: warehouseId,
    quantity: qty, type: 'receive', reason: reason || null, performed_by: performedBy || null,
  });
}

// Allocate (transfer) stock from one warehouse to another.
export async function allocateStock({ productId, fromWarehouseId, toWarehouseId, quantity, performedBy }) {
  const qty = Number(quantity);
  if (!qty || qty <= 0) throw new Error('أدخل كمية صحيحة');
  if (fromWarehouseId === toWarehouseId) throw new Error('المخزن المصدر والوجهة متطابقان');
  const fromQty = await _currentQty(fromWarehouseId, productId);
  if (fromQty < qty) throw new Error(`الكمية المتاحة بالمصدر ${fromQty} فقط`);
  const toQty = await _currentQty(toWarehouseId, productId);
  await _setQty(fromWarehouseId, productId, fromQty - qty);
  await _setQty(toWarehouseId,   productId, toQty + qty);
  await _logMovement({
    product_id: productId, from_warehouse_id: fromWarehouseId, to_warehouse_id: toWarehouseId,
    quantity: qty, type: 'allocate', reason: null, performed_by: performedBy || null,
  });
}

// Manually set the exact quantity (stocktake / correction).
export async function adjustStock({ productId, warehouseId, newQuantity, performedBy, reason }) {
  const qty = Number(newQuantity);
  if (qty < 0 || Number.isNaN(qty)) throw new Error('أدخل كمية صحيحة');
  await _setQty(warehouseId, productId, qty);
  await _logMovement({
    product_id: productId, from_warehouse_id: warehouseId, to_warehouse_id: warehouseId,
    quantity: qty, type: 'adjust', reason: reason || 'جرد/تصحيح', performed_by: performedBy || null,
  });
}

// Recent movements (for the activity log).
export async function listMovements({ limit = 50 } = {}) {
  const { data, error } = await supabase
    .from('wh_movements')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/services/warehouseService.js
git commit -m "feat(warehouse): add warehouseService data layer (matrix + receive/allocate/adjust)"
```

---

## Task 4: Warehouse screen (visibility dashboard + actions)

**Files:**
- Create: `src/screens/WarehouseScreen.jsx`

- [ ] **Step 1: Write the screen**

Create `src/screens/WarehouseScreen.jsx`:

```jsx
// =============================================================
// WarehouseScreen — "شو عنا بضاعة" stock visibility + actions.
// Matrix: product × warehouse quantities + total. Receive into
// central, allocate central→sub, adjust. Gated by permissions.
// =============================================================
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@hooks/useAuth';
import { usePermissions } from '@hooks/usePermissions';
import { PERMISSIONS } from '@data/permissions';
import {
  listWarehouses, getStockMatrix, receiveStock, allocateStock, adjustStock,
} from '@services/warehouseService';

const TYPE_LABEL = { central: '🏛️ مركزي', sales: '📦 مبيعات', distributor: '🚙 مناديب', returns: '↩️ مرتجعات' };
const INP = 'w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30';

function ActionModal({ title, warehouses, products, mode, onClose, onSubmit }) {
  // mode: 'receive' | 'allocate' | 'adjust'
  const central = warehouses.find(w => w.type === 'central');
  const [productId, setProductId]   = useState(products[0]?.id ?? '');
  const [fromWh, setFromWh]         = useState(central?.id ?? warehouses[0]?.id ?? '');
  const [toWh, setToWh]             = useState(warehouses.find(w => w.type !== 'central')?.id ?? '');
  const [warehouseId, setWarehouseId] = useState(central?.id ?? warehouses[0]?.id ?? '');
  const [qty, setQty]   = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async () => {
    setSaving(true); setErr(null);
    try {
      if (mode === 'receive')  await onSubmit({ productId, warehouseId, quantity: qty, reason });
      if (mode === 'allocate') await onSubmit({ productId, fromWarehouseId: fromWh, toWarehouseId: toWh, quantity: qty });
      if (mode === 'adjust')   await onSubmit({ productId, warehouseId, newQuantity: qty, reason });
      onClose();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl" onClick={onClose}>
      <div className="bg-surface rounded-2xl w-full max-w-md shadow-2xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-base text-text">{title}</h3>

        <div>
          <label className="text-xs font-bold text-muted block mb-1.5">المنتج</label>
          <select value={productId} onChange={e => setProductId(e.target.value)} className={INP}>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {mode === 'allocate' ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">من مخزن</label>
              <select value={fromWh} onChange={e => setFromWh(e.target.value)} className={INP}>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">إلى مخزن</label>
              <select value={toWh} onChange={e => setToWh(e.target.value)} className={INP}>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          </div>
        ) : (
          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">المخزن</label>
            <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} className={INP}>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="text-xs font-bold text-muted block mb-1.5">
            {mode === 'adjust' ? 'الكمية الجديدة (المطلقة)' : 'الكمية'}
          </label>
          <input type="number" min="0" value={qty} onChange={e => setQty(e.target.value)}
            className={INP} placeholder="0" style={{ direction: 'ltr', textAlign: 'right' }} />
        </div>

        {mode !== 'allocate' && (
          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">ملاحظة (اختياري)</label>
            <input value={reason} onChange={e => setReason(e.target.value)} className={INP} placeholder="السبب..." />
          </div>
        )}

        {err && <p className="text-xs text-red-fg bg-red-bg rounded-xl px-3 py-2">⚠️ {err}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted hover:text-text transition">إلغاء</button>
          <button onClick={submit} disabled={saving || !productId || !qty}
            className="flex-1 py-2.5 rounded-xl bg-teal text-white text-sm font-bold disabled:opacity-40 hover:bg-teal/90 transition">
            {saving ? '…' : 'تأكيد'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WarehouseScreen() {
  const { name: userName } = useAuth();
  const { can } = usePermissions();
  const canCentral = can(PERMISSIONS.MANAGE_CENTRAL_STOCK);
  const canSales   = can(PERMISSIONS.MANAGE_SALES_STOCK);

  const [warehouses, setWarehouses] = useState([]);
  const [rows, setRows]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null); // 'receive' | 'allocate' | 'adjust' | null

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { warehouses, rows } = await getStockMatrix();
      setWarehouses(warehouses);
      setRows(rows);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const products = useMemo(() => rows.map(r => ({ id: r.id, name: r.name })), [rows]);

  const filtered = useMemo(() => rows.filter(r =>
    !search || r.name?.toLowerCase().includes(search.toLowerCase()) || (r.sku || '').toLowerCase().includes(search.toLowerCase())
  ), [rows, search]);

  const handleReceive  = async (p) => { await receiveStock({ ...p, performedBy: userName }); await load(); };
  const handleAllocate = async (p) => { await allocateStock({ ...p, performedBy: userName }); await load(); };
  const handleAdjust   = async (p) => { await adjustStock({ ...p, performedBy: userName }); await load(); };

  const grandTotals = useMemo(() => {
    const totals = {};
    let all = 0;
    for (const r of rows) {
      for (const w of warehouses) { totals[w.id] = (totals[w.id] || 0) + Number(r.perWh[w.id] || 0); }
      all += r.total;
    }
    return { totals, all };
  }, [rows, warehouses]);

  return (
    <div className="space-y-4 pb-24" dir="rtl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-text">📦 المخازن</h1>
          <p className="text-xs text-muted mt-0.5">شو عنا بضاعة — وأين · {grandTotals.all} قطعة إجمالاً</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {canCentral && (
            <>
              <button onClick={() => setModal('receive')} className="px-3 py-2 rounded-xl bg-green-bg text-green-fg text-xs font-bold hover:opacity-80 transition">+ استلام</button>
              <button onClick={() => setModal('allocate')} className="px-3 py-2 rounded-xl bg-teal text-white text-xs font-bold hover:bg-teal/90 transition">⇄ تخصيص</button>
            </>
          )}
          {(canCentral || canSales) && (
            <button onClick={() => setModal('adjust')} className="px-3 py-2 rounded-xl bg-surface-alt text-muted text-xs font-bold hover:text-text transition border border-border">± جرد</button>
          )}
        </div>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="🔍 بحث بالمنتج أو SKU..."
        className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-teal/30" />

      {loading ? (
        <div className="h-64 bg-surface-alt animate-pulse rounded-2xl" />
      ) : error ? (
        <div className="bg-red-bg border border-red/20 text-red-fg rounded-xl px-4 py-3 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={load} className="underline text-xs">إعادة</button>
        </div>
      ) : (
        <div className="overflow-x-auto border border-border rounded-2xl">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt">
              <tr>
                <th className="text-right px-3 py-2.5 font-bold text-muted sticky right-0 bg-surface-alt">المنتج</th>
                {warehouses.map(w => (
                  <th key={w.id} className="px-3 py-2.5 font-bold text-muted text-center whitespace-nowrap">
                    {TYPE_LABEL[w.type]?.split(' ')[0]} {w.name}
                  </th>
                ))}
                <th className="px-3 py-2.5 font-extrabold text-text text-center">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const low = r.min_stock != null && r.total <= r.min_stock;
                return (
                  <tr key={r.id} className="border-t border-border/40">
                    <td className="text-right px-3 py-2 text-text truncate max-w-[10rem] sticky right-0 bg-surface">{r.name}</td>
                    {warehouses.map(w => (
                      <td key={w.id} className="px-3 py-2 text-center tabular-nums text-muted">{r.perWh[w.id] || 0}</td>
                    ))}
                    <td className={`px-3 py-2 text-center tabular-nums font-extrabold ${low ? 'text-red-fg' : 'text-text'}`}>{r.total}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-surface-alt">
              <tr>
                <td className="text-right px-3 py-2.5 font-bold text-text sticky right-0 bg-surface-alt">الإجمالي</td>
                {warehouses.map(w => (
                  <td key={w.id} className="px-3 py-2.5 text-center tabular-nums font-bold text-text">{grandTotals.totals[w.id] || 0}</td>
                ))}
                <td className="px-3 py-2.5 text-center tabular-nums font-extrabold text-teal">{grandTotals.all}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {modal === 'receive'  && <ActionModal title="📥 استلام بضاعة" mode="receive"  warehouses={warehouses} products={products} onClose={() => setModal(null)} onSubmit={handleReceive} />}
      {modal === 'allocate' && <ActionModal title="⇄ تخصيص بين المخازن" mode="allocate" warehouses={warehouses} products={products} onClose={() => setModal(null)} onSubmit={handleAllocate} />}
      {modal === 'adjust'   && <ActionModal title="± جرد / تصحيح" mode="adjust"   warehouses={warehouses} products={products} onClose={() => setModal(null)} onSubmit={handleAdjust} />}
    </div>
  );
}
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/screens/WarehouseScreen.jsx
git commit -m "feat(warehouse): WarehouseScreen — stock matrix + receive/allocate/adjust modals"
```

---

## Task 5: Route + navigation

**Files:**
- Modify: `src/routes/paths.js`
- Modify: `src/routes/AppRoutes.jsx`
- Modify: `src/data/navigation.js`

- [ ] **Step 1: Add route constant**

In `src/routes/paths.js`, after the `ORDERS: '/orders',` line (inside the ROUTES object), add:

```js
  WAREHOUSES: '/warehouses',
```

- [ ] **Step 2: Lazy-import the screen**

In `src/routes/AppRoutes.jsx`, near the other screen lazy imports (after the `InventoryScreen` import line ~51), add:

```js
const WarehouseScreen          = lazy(() => import(/* webpackChunkName: "warehouses"      */ '@screens/WarehouseScreen'));
```

- [ ] **Step 3: Add the protected route**

In `src/routes/AppRoutes.jsx`, after the `MANAGER_BOARD` route block (around line 154), add a route gated to management roles (matches how managers/sales see inventory):

```jsx
          <Route
            path={ROUTES.WAREHOUSES}
            element={
              <ProtectedRoute roles={[ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_MANAGER, ROLES.EMPLOYEE]}>
                <WarehouseScreen />
              </ProtectedRoute>
            }
          />
```

> `EMPLOYEE` is included so fulfillment staff (Yousef/Fatima, often `employee` role) can reach it; the screen itself hides actions they lack permission for, and shows the read-only matrix.

- [ ] **Step 4: Add nav item**

In `src/data/navigation.js`, after the `inventory` nav object (ends ~line 219), add:

```js
  {
    id: 'warehouses',
    label: 'المخازن',
    icon: '🏬',
    path: '/warehouses',
    roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_MANAGER, ROLES.EMPLOYEE],
  },
```

- [ ] **Step 5: Build check**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/routes/paths.js src/routes/AppRoutes.jsx src/data/navigation.js
git commit -m "feat(warehouse): /warehouses route + nav entry"
```

---

## Task 6: Grant central-stock permission to Wasim & Fadi (+ sales stock to fulfillment)

**Files:** (DB only — via Supabase Management API in Chrome)

- [ ] **Step 1: Grant extra_permissions**

Run via the Management API call (same pattern as Task 1 Step 2):

```sql
-- Wasim + Fadi: central stock control
UPDATE profiles
SET extra_permissions = (
  COALESCE(extra_permissions, '[]'::jsonb)
  || '["manage_central_stock","view_inventory"]'::jsonb
)
WHERE employee_name IN ('wasim alkshki', 'Fadi jarrouge');

-- Yousef + Fatima (fulfillment): sales stock + view
UPDATE profiles
SET extra_permissions = (
  COALESCE(extra_permissions, '[]'::jsonb)
  || '["manage_sales_stock","view_inventory"]'::jsonb
)
WHERE employee_name IN ('Yousef Alkshki', 'Fatima Ayoub');
```

Expected: `[]` (success). If a name doesn't match exactly, adjust to the real `employee_name` (verify with `SELECT employee_name FROM profiles WHERE employee_name ILIKE '%wasim%' OR employee_name ILIKE '%fadi%' OR employee_name ILIKE '%yousef%' OR employee_name ILIKE '%fatima%';`).

- [ ] **Step 2: Verify**

```sql
SELECT employee_name, extra_permissions FROM profiles
WHERE employee_name IN ('wasim alkshki','Fadi jarrouge','Yousef Alkshki','Fatima Ayoub');
```

Expected: each row's `extra_permissions` contains the granted keys.

- [ ] **Step 3: No commit** (DB-only change; document in HANDOFF in Task 7).

---

## Task 7: Live verification + docs

- [ ] **Step 1: Deploy is automatic** — `git push origin main` triggers Vercel. Push all Phase-1 commits:

```bash
git push origin main
```

- [ ] **Step 2: Live smoke test (Chrome on prod)**

Navigate to the live app, log in as an admin (or owner already logged in), open `/warehouses`. Verify:
- The matrix renders with the 3 warehouse columns + الإجمالي.
- «+ استلام» into المخزن المركزي for one product (e.g. 100) → row updates, central column shows 100, total 100.
- «⇄ تخصيص» 30 from المركزي → مبيعات سوريا → central 70, sales-syria 30, total 100.
- Check browser console: no errors (`read_console_messages` with `onlyErrors`).

- [ ] **Step 3: Update HANDOFF + memory**

In `HANDOFF.md`, add a section documenting: the 3 `wh_*` tables, the warehouse tiers, the new permissions, who got `MANAGE_CENTRAL_STOCK` (Wasim/Fadi) and `MANAGE_SALES_STOCK` (Yousef/Fatima), the `/warehouses` route, and that Phase 2 (auto-reserve on order) + Phase 3 (distributors) are pending. Update the memory file `orders_sheet_sync.md` (or a new `warehouse_system.md`) accordingly.

- [ ] **Step 4: Commit docs**

```bash
git add HANDOFF.md
git commit -m "docs: warehouse phase 1 — tables, tiers, permissions, route"
git push origin main
```

---

## Self-Review Notes (spec coverage)

- Spec §3 data model → Task 1 ✅ (uses `wh_` prefix as the corrected spec specifies).
- Spec §4 tiers + seed (central + 2 sales) → Task 1 seed ✅.
- Spec §6 visibility dashboard → Task 4 ✅ (matrix + totals + low-stock highlight).
- Spec §7 permissions (3 keys, Wasim/Fadi central) → Task 2 + Task 6 ✅.
- Spec §5 flows: receive/allocate/adjust → Tasks 3-4 ✅. (reserve/release = Phase 2, return = Phase 3 — correctly out of scope.)
- Spec §9 Phase 1 line item "روستر النشطين" → NOT included here; roster provisioning needs auth-user creation (separate owner-driven flow per HANDOFF) and is not required for warehouse mechanics. Flagged as a separate setup task, not Phase 1 warehouse scope.
- `orders.brand` + `profiles.warehouse_id` columns → deferred to Phase 2/3 (not needed for Phase 1 matrix). Not created here intentionally.
