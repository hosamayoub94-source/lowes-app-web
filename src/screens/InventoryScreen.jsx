// =============================================================
// InventoryScreen — Product & stock management
// Table: products (id, name, sku, category, quantity, price_usd,
//                  price_try, min_stock, description, is_active)
// =============================================================
import { useState, useEffect, useCallback } from 'react';
import { Hero }      from '@components/ui/Hero';
import { Card, CardTitle, CardSubtitle } from '@components/ui/Card';
import { StatCard }  from '@components/ui/StatCard';
import { Button }    from '@components/ui/Button';
import { EmptyState } from '@components/ui/EmptyState';
import { supabase }  from '@services/supabase';

const CATEGORIES = ['ترطيب', 'تبييض', 'مكياج', 'عناية بالشعر', 'عطور', 'أخرى'];

// ── helpers ────────────────────────────────────────────────────
const fmt  = n => Number(n || 0).toLocaleString('ar-SA');
const fmtU = n => '$' + Number(n || 0).toFixed(2);

function stockColor(qty, min) {
  if (qty <= 0)       return { bg: 'bg-red-bg',   text: 'text-red-fg',   label: 'نفذ' };
  if (qty <= min)     return { bg: 'bg-amber-bg',  text: 'text-amber-fg', label: 'منخفض' };
  return               { bg: 'bg-green-bg',  text: 'text-green-fg', label: 'متوفر' };
}

// ── Empty form ─────────────────────────────────────────────────
const EMPTY = {
  name: '', sku: '', category: 'ترطيب', quantity: '',
  price_usd: '', price_try: '', min_stock: '5',
  description: '', is_active: true,
};

// ── Product form modal ─────────────────────────────────────────
function ProductModal({ open, initial, onClose, onSaved }) {
  const [form, setForm]     = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState(null);

  useEffect(() => {
    if (open) setForm(initial ? { ...EMPTY, ...initial } : EMPTY);
    setErr(null);
  }, [open, initial]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setErr('اسم المنتج مطلوب'); return; }
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        name:        form.name.trim(),
        sku:         form.sku.trim() || null,
        category:    form.category,
        quantity:    Number(form.quantity) || 0,
        price_usd:   Number(form.price_usd) || 0,
        price_try:   Number(form.price_try) || 0,
        min_stock:   Number(form.min_stock) || 0,
        description: form.description.trim() || null,
        is_active:   form.is_active,
      };
      if (initial?.id) {
        const { error } = await supabase.from('products').update(payload).eq('id', initial.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from('products').insert(payload);
        if (error) throw new Error(error.message);
      }
      onSaved();
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg bg-surface rounded-2xl shadow-xl border border-border overflow-hidden max-h-[90vh] flex flex-col" dir="rtl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="text-base font-bold text-text">{initial?.id ? 'تعديل منتج' : 'منتج جديد'}</h2>
          <button onClick={onClose} className="text-muted hover:text-text text-xl leading-none">✕</button>
        </div>
        <form onSubmit={handleSave} className="overflow-y-auto flex-1 p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <label className="text-xs font-semibold text-muted">اسم المنتج *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="كريم ترطيب لوز..."
                className="w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/40" required />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">رمز SKU</label>
              <input value={form.sku} onChange={e => set('sku', e.target.value)}
                placeholder="LP-001"
                className="w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/40" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">الفئة</label>
              <select value={form.category} onChange={e => set('category', e.target.value)}
                className="w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/40">
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">الكمية الحالية</label>
              <input type="number" min="0" value={form.quantity} onChange={e => set('quantity', e.target.value)}
                placeholder="0"
                className="w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/40" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">الحد الأدنى للتنبيه</label>
              <input type="number" min="0" value={form.min_stock} onChange={e => set('min_stock', e.target.value)}
                placeholder="5"
                className="w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/40" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">السعر (USD)</label>
              <input type="number" step="0.01" min="0" value={form.price_usd} onChange={e => set('price_usd', e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/40" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">السعر (TRY)</label>
              <input type="number" step="0.01" min="0" value={form.price_try} onChange={e => set('price_try', e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/40" />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-xs font-semibold text-muted">وصف (اختياري)</label>
              <textarea value={form.description} onChange={e => set('description', e.target.value)}
                rows={2} placeholder="وصف المنتج…"
                className="w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/40 resize-none" />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input type="checkbox" id="is_active" checked={form.is_active} onChange={e => set('is_active', e.target.checked)}
                className="accent-teal w-4 h-4" />
              <label htmlFor="is_active" className="text-sm text-text">منتج نشط</label>
            </div>
          </div>
          {err && <p className="text-xs text-red-fg bg-red-bg rounded-xl px-3 py-2">⚠️ {err}</p>}
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>إلغاء</Button>
            <Button type="submit" variant="teal" className="flex-1" disabled={saving}>
              {saving ? '⏳ جاري الحفظ…' : initial?.id ? '💾 حفظ التعديلات' : '➕ إضافة المنتج'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Stock adjust modal ─────────────────────────────────────────
function AdjustModal({ product, onClose, onSaved }) {
  const [delta, setDelta] = useState('');
  const [note,  setNote]  = useState('');
  const [type,  setType]  = useState('add'); // 'add' | 'subtract'
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const handleSave = async (e) => {
    e.preventDefault();
    const amount = Number(delta);
    if (!amount || amount <= 0) { setErr('أدخل كمية صحيحة'); return; }
    const newQty = type === 'add'
      ? product.quantity + amount
      : Math.max(0, product.quantity - amount);
    setSaving(true);
    try {
      const { error } = await supabase
        .from('products')
        .update({ quantity: newQty })
        .eq('id', product.id);
      if (error) throw new Error(error.message);
      onSaved();
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!product) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-sm bg-surface rounded-2xl shadow-xl border border-border p-5" dir="rtl">
        <h2 className="text-base font-bold text-text mb-1">تعديل المخزون</h2>
        <p className="text-xs text-muted mb-4">{product.name} — الكمية الحالية: <b className="text-text">{product.quantity}</b></p>
        <form onSubmit={handleSave} className="space-y-3">
          <div className="flex gap-2">
            {[['add','إضافة ➕'],['subtract','خصم ➖']].map(([v, lbl]) => (
              <button
                key={v} type="button"
                onClick={() => setType(v)}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold transition ${type === v ? 'bg-teal text-white' : 'bg-surface-alt text-muted hover:text-text border border-border'}`}
              >
                {lbl}
              </button>
            ))}
          </div>
          <input
            type="number" min="1" value={delta} onChange={e => setDelta(e.target.value)}
            placeholder="الكمية"
            className="w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/40"
            autoFocus
          />
          {err && <p className="text-xs text-red-fg bg-red-bg rounded-xl px-3 py-2">⚠️ {err}</p>}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>إلغاء</Button>
            <Button type="submit" variant="teal" className="flex-1" disabled={saving}>
              {saving ? '⏳…' : 'حفظ'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Product card ───────────────────────────────────────────────
function ProductCard({ p, onEdit, onAdjust }) {
  const st = stockColor(p.quantity, p.min_stock);
  return (
    <div className={`bg-surface border rounded-2xl p-4 transition-colors ${p.quantity <= p.min_stock ? 'border-amber/50' : 'border-border'}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="font-bold text-text text-sm truncate">{p.name}</p>
          <p className="text-xs text-muted mt-0.5">{p.category}{p.sku ? ` · ${p.sku}` : ''}</p>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${st.bg} ${st.text}`}>
          {st.label}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center mb-3">
        <div className="bg-surface-alt rounded-xl p-2">
          <p className="text-lg font-extrabold text-text">{fmt(p.quantity)}</p>
          <p className="text-[10px] text-muted">وحدة</p>
        </div>
        <div className="bg-surface-alt rounded-xl p-2">
          <p className="text-sm font-bold text-green-fg">{fmtU(p.price_usd)}</p>
          <p className="text-[10px] text-muted">USD</p>
        </div>
        <div className="bg-surface-alt rounded-xl p-2">
          <p className="text-sm font-bold text-amber-fg">{fmt(p.price_try)}</p>
          <p className="text-[10px] text-muted">TRY</p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onAdjust(p)}
          className="flex-1 py-1.5 rounded-xl bg-teal/10 text-teal text-xs font-semibold hover:bg-teal/20 transition"
        >
          ± تعديل الكمية
        </button>
        <button
          onClick={() => onEdit(p)}
          className="px-3 py-1.5 rounded-xl bg-surface-alt text-muted text-xs font-semibold hover:text-text transition border border-border"
        >
          ✏️
        </button>
      </div>
    </div>
  );
}

// ── Main screen ────────────────────────────────────────────────
export default function InventoryScreen() {
  const [products, setProducts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [search,   setSearch]   = useState('');
  const [catFilter, setCat]     = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editProd, setEditProd] = useState(null);
  const [adjustProd, setAdjust] = useState(null);
  const [dbMissing, setDbMissing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name');
      if (error) {
        if (error.code === '42P01') { setDbMissing(true); return; }
        throw new Error(error.message);
      }
      setProducts(data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = products.filter(p => {
    if (!p.is_active && catFilter !== 'inactive') return false;
    if (catFilter === 'inactive') return !p.is_active;
    if (catFilter === 'low')      return p.quantity <= p.min_stock;
    if (catFilter !== 'all')      return p.category === catFilter;
    return true;
  }).filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.sku || '').toLowerCase().includes(search.toLowerCase())
  );

  const totalProducts  = products.filter(p => p.is_active).length;
  const lowStockCount  = products.filter(p => p.is_active && p.quantity <= p.min_stock && p.quantity > 0).length;
  const outOfStock     = products.filter(p => p.is_active && p.quantity <= 0).length;
  const totalValue     = products.filter(p => p.is_active).reduce((s, p) => s + (p.quantity * (p.price_usd || 0)), 0);

  const openNew  = () => { setEditProd(null); setShowForm(true); };
  const openEdit = (p) => { setEditProd(p);   setShowForm(true); };

  if (dbMissing) {
    return (
      <div className="space-y-5">
        <Hero eyebrow="المخزون" title="إدارة المخزون" subtitle="تتبّع منتجات Lowe's Professional." />
        <Card>
          <div className="py-8 text-center space-y-3">
            <p className="text-2xl">🗄️</p>
            <p className="text-sm font-semibold text-text">جدول المنتجات غير موجود في قاعدة البيانات</p>
            <p className="text-xs text-muted">نفّذ SQL التالي في Supabase SQL Editor:</p>
            <pre className="text-left text-xs bg-surface-alt border border-border rounded-xl p-4 overflow-x-auto mt-2 text-muted">
{`CREATE TABLE IF NOT EXISTS products (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  sku text,
  category text DEFAULT 'أخرى',
  quantity int DEFAULT 0,
  price_usd numeric(10,2) DEFAULT 0,
  price_try numeric(10,2) DEFAULT 0,
  min_stock int DEFAULT 5,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_all" ON products FOR ALL USING (true) WITH CHECK (true);`}
            </pre>
            <Button variant="teal" onClick={load}>إعادة المحاولة</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Hero
        eyebrow="المخزون"
        title="إدارة المخزون"
        subtitle="تتبّع منتجات Lowe's Professional وإدارة الكميات."
        actions={
          <Button variant="teal" size="lg" onClick={openNew}>+ منتج جديد</Button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="إجمالي المنتجات"  value={loading ? '—' : totalProducts}           tone="blue"  />
        <StatCard label="مخزون منخفض"      value={loading ? '—' : lowStockCount}            tone="amber" />
        <StatCard label="نفذ من المخزون"   value={loading ? '—' : outOfStock}               tone="red"   />
        <StatCard label="قيمة المخزون"     value={loading ? '—' : '$' + Math.round(totalValue).toLocaleString()} tone="green" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="بحث بالاسم أو SKU…"
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text w-48 focus:outline-none focus:ring-2 focus:ring-teal/40"
          dir="rtl"
        />
        <div className="flex gap-1 flex-wrap">
          {[['all','الكل'],['low','مخزون منخفض ⚠️'],['inactive','غير نشط'],...CATEGORIES.map(c => [c, c])].map(([k, lbl]) => (
            <button
              key={k}
              onClick={() => setCat(k)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${catFilter === k ? 'bg-teal text-white' : 'bg-surface border border-border text-muted hover:text-text'}`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Products grid */}
      <Card>
        <CardTitle>قائمة المنتجات</CardTitle>
        <CardSubtitle>{filtered.length} منتج</CardSubtitle>
        <div className="mt-4">
          {loading ? (
            <p className="text-sm text-muted animate-pulse py-4">جاري التحميل…</p>
          ) : error ? (
            <p className="text-sm text-red-fg py-2">⚠️ {error}</p>
          ) : filtered.length === 0 ? (
            <EmptyState description="لا توجد منتجات — أضف أول منتج" />
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map(p => (
                <ProductCard key={p.id} p={p} onEdit={openEdit} onAdjust={setAdjust} />
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Modals */}
      <ProductModal
        open={showForm}
        initial={editProd}
        onClose={() => { setShowForm(false); setEditProd(null); }}
        onSaved={load}
      />
      <AdjustModal
        product={adjustProd}
        onClose={() => setAdjust(null)}
        onSaved={load}
      />
    </div>
  );
}
