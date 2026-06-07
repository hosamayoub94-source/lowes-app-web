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
import { useAuth } from '@hooks/useAuth';
import { usePermissions } from '@hooks/usePermissions';
import { PERMISSIONS } from '@data/permissions';
import { receiveStock, adjustStock } from '@services/warehouseService';

const CATEGORIES = ['العناية بالوجه', 'العناية بالبشرة', 'واقي الشمس', 'الماسك', 'العناية بالجسم', 'منتجات خاصة', 'العناية بالشعر', 'الأدوات'];

// ── helpers ────────────────────────────────────────────────────
const fmt  = n => Number(n || 0).toLocaleString('ar-SA-u-nu-latn');
const fmtU = n => '$' + Number(n || 0).toFixed(2);

function stockColor(qty, min) {
  if (qty <= 0)       return { bg: 'bg-red-bg',   text: 'text-red-fg',   label: 'نفذ' };
  if (qty <= min)     return { bg: 'bg-amber-bg',  text: 'text-amber-fg', label: 'منخفض' };
  return               { bg: 'bg-green-bg',  text: 'text-green-fg', label: 'متوفر' };
}

// ── Empty form ─────────────────────────────────────────────────
const EMPTY = {
  name: '', sku: '', category: 'العناية بالبشرة', quantity: '',
  price_usd: '', price_try: '', min_stock: '5',
  description: '', is_active: true,
};

// ── Lowe's Professional product catalog (32 products) ─────────
const LOWES_PRODUCTS = [
  { name: 'غسول البشرة الدهنية والحساسة',    sku: 'LW-FC-204', category: 'العناية بالوجه'  },
  { name: 'غسول البشرة العادية و الجافة',     sku: 'LW-FC-203', category: 'العناية بالوجه'  },
  { name: 'تونر تنقية البشرة و تضييق المسام', sku: 'LW-FC-202', category: 'العناية بالوجه'  },
  { name: 'جيل مقشر الوجه',                   sku: 'LW-FC-201', category: 'العناية بالوجه'  },
  { name: 'سيروم فيتامين سي',                 sku: 'LW-SK-101', category: 'العناية بالبشرة' },
  { name: 'سيروم الريتينول',                  sku: 'LW-SK-105', category: 'العناية بالبشرة' },
  { name: 'سيروم مصحح البقع الداكنة',         sku: 'LW-SK-106', category: 'العناية بالبشرة' },
  { name: 'سيروم الترطيب المكثف',             sku: 'LW-SK-107', category: 'العناية بالبشرة' },
  { name: 'سيروم الكولاجين',                  sku: 'LW-SK-109', category: 'العناية بالبشرة' },
  { name: 'سيروم الهالات و انتفاخ العين',     sku: 'LW-SK-108', category: 'العناية بالبشرة' },
  { name: 'كريم تفتيح البشرة',                sku: 'LW-SK-102', category: 'العناية بالبشرة' },
  { name: 'كريم الترطيب المكثف',              sku: 'LW-SK-104', category: 'العناية بالبشرة' },
  { name: 'سيروم مضاد لحب الشباب',            sku: 'LW-SK-110', category: 'العناية بالبشرة' },
  { name: 'ريتينال شوت',                      sku: 'LW-SK-111', category: 'العناية بالبشرة' },
  { name: 'كريم الارز',                       sku: 'LW-SK-112', category: 'العناية بالبشرة' },
  { name: 'سيروم الارز',                      sku: 'LW-SK-113', category: 'العناية بالبشرة' },
  { name: 'واقي الشمس الوردي بالكالامين',     sku: 'LW-SN-501', category: 'واقي الشمس'      },
  { name: 'واقي الشمس المضاد للبقع',          sku: 'LW-SN-502', category: 'واقي الشمس'      },
  { name: 'ماسك الكولاجين المائي',             sku: 'LW-MS-601', category: 'الماسك'          },
  { name: 'جل شد الجسم و السيليوليت',         sku: 'LW-SK-103', category: 'العناية بالجسم'  },
  { name: 'تونر حليب الارز',                  sku: 'LW-TN-601', category: 'العناية بالجسم'  },
  { name: 'كريم العناية بالثدي',              sku: 'LW-SP-701', category: 'منتجات خاصة'     },
  { name: 'سيروم العناية بالثدي',             sku: 'LW-SP-702', category: 'منتجات خاصة'     },
  { name: 'كريم العناية بالقدمين',            sku: 'LW-SP-704', category: 'منتجات خاصة'     },
  { name: 'شامبو الروزماري',                  sku: 'LW-HR-301', category: 'العناية بالشعر'  },
  { name: 'ماء الروزماري للشعر و البشرة',     sku: 'LW-HR-302', category: 'العناية بالشعر'  },
  { name: 'زيت الروزماري',                    sku: 'LW-HR-303', category: 'العناية بالشعر'  },
  { name: 'سيروم اللحية',                     sku: 'LW-SP-703', category: 'العناية بالشعر'  },
  { name: 'ديرما رول 0.5mm',                  sku: 'LW-DR-103', category: 'الأدوات'         },
  { name: 'ديرما رول 1mm',                    sku: 'LW-DR-104', category: 'الأدوات'         },
  { name: 'مشط السيليكون',                    sku: 'LW-SC-105', category: 'الأدوات'         },
  { name: 'رول مساج الوجه',                   sku: 'LW-GS-106', category: 'الأدوات'         },
];

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
    if (!(form.name || '').trim()) { setErr('اسم المنتج مطلوب'); return; }
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        name:        (form.name || '').trim(),
        sku:         (form.sku || '').trim() || null,
        category:    form.category,
        // quantity is derived from warehouse stock (wh_stock) — not edited here
        price_usd:   Number(form.price_usd) || 0,
        price_try:   Number(form.price_try) || 0,
        min_stock:   Number(form.min_stock) || 0,
        description: (form.description || '').trim() || null,
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
              <label className="text-xs font-semibold text-muted">الكمية (من المخازن)</label>
              <div className="w-full rounded-xl border border-border bg-surface-alt/50 px-3 py-2.5 text-sm text-muted">
                {Number(form.quantity) || 0} — تُدار من شاشة «المخازن»
              </div>
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

// ── Product card ───────────────────────────────────────────────
function ProductCard({ p, onEdit, onMovements, onStock, canManage }) {
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
        <a
          href="/warehouses"
          className="flex-1 py-1.5 rounded-xl bg-teal/10 text-teal text-xs font-semibold hover:bg-teal/20 transition text-center"
        >
          🏬 إدارة المخزون
        </a>
        {canManage && (
          <button
            onClick={() => onStock(p)}
            className="px-3 py-1.5 rounded-xl bg-surface-alt text-muted text-xs font-semibold hover:text-text transition border border-border"
            title="حركة مخزون سريعة"
          >
            📦
          </button>
        )}
        <button
          onClick={() => onMovements(p)}
          className="px-3 py-1.5 rounded-xl bg-surface-alt text-muted text-xs font-semibold hover:text-text transition border border-border"
          title="كشف حركة"
        >
          📜
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
// ── Movement statement (كشف حركة) for one product ──────────────
const MOVE_LBL = { receive: '📥 استلام', allocate: '⇄ تحويل', adjust: '± جرد', reserve: '🛒 حجز طلب', release: '↩️ إرجاع' };
function MovementModal({ product, onClose }) {
  const [moves, setMoves] = useState(null);
  const [whNames, setWhNames] = useState({});
  useEffect(() => {
    (async () => {
      const [mv, wh] = await Promise.all([
        supabase.from('wh_movements').select('*').eq('product_id', product.id).order('created_at', { ascending: false }).limit(60),
        supabase.from('wh_warehouses').select('id, name'),
      ]);
      const names = {}; (wh.data || []).forEach(w => { names[w.id] = w.name; });
      setWhNames(names);
      setMoves(mv.data || []);
    })();
  }, [product.id]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm" dir="rtl"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md bg-surface rounded-2xl shadow-xl border border-border max-h-[85vh] flex flex-col">
        <div className="px-5 py-4 border-b border-border shrink-0 flex items-center justify-between">
          <div><h3 className="font-bold text-text">📜 كشف حركة</h3><p className="text-xs text-muted mt-0.5">{product.name}</p></div>
          <button onClick={onClose} className="text-muted hover:text-text text-xl">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 p-3 space-y-1">
          {moves === null ? <p className="text-sm text-muted text-center py-6 animate-pulse">…</p>
            : moves.length === 0 ? <p className="text-sm text-muted text-center py-6">لا حركة لهذا المنتج</p>
            : moves.map(m => (
              <div key={m.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs border-b border-border/40">
                <span className="text-text">{MOVE_LBL[m.type] || m.type} · <b className="tabular-nums">{m.quantity}</b></span>
                <span className="text-muted truncate text-[11px]">
                  {m.from_warehouse_id ? (whNames[m.from_warehouse_id] || '—') : ''}{m.to_warehouse_id ? ' → ' + (whNames[m.to_warehouse_id] || '—') : ''}
                  {' · '}{new Date(m.created_at).toLocaleDateString('ar-SA-u-nu-latn-ca-gregory')}
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// ── Quick stock action (receive / adjust) for one product ─────
function StockActionModal({ product, performedBy, onClose, onDone }) {
  const [whs, setWhs]   = useState([]);
  const [whId, setWhId] = useState('');
  const [mode, setMode] = useState('receive'); // receive | adjust
  const [qty, setQty]   = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState(null);

  useEffect(() => {
    (async () => {
      // Syria warehouses only (exclude Turkey)
      const { data } = await supabase.from('wh_warehouses').select('id, name, type, market').eq('is_active', true);
      const list = (data || []).filter(w => w.market !== 'turkey');
      setWhs(list);
      setWhId(list.find(w => w.type === 'central')?.id || list[0]?.id || '');
    })();
  }, []);

  const submit = async () => {
    if (!whId || qty === '') return;
    setBusy(true); setErr(null);
    try {
      if (mode === 'receive') await receiveStock({ productId: product.id, warehouseId: whId, quantity: Number(qty), performedBy, reason });
      else                    await adjustStock({ productId: product.id, warehouseId: whId, newQuantity: Number(qty), performedBy, reason: reason || 'جرد' });
      onDone(); onClose();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" dir="rtl"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-sm bg-surface rounded-2xl shadow-xl border border-border p-5 space-y-3">
        <div><h3 className="font-bold text-text">📦 حركة مخزون</h3><p className="text-xs text-muted mt-0.5">{product.name}</p></div>
        <div className="grid grid-cols-2 gap-2">
          {[['receive','📥 استلام (إضافة)'],['adjust','± جرد (تعيين)']].map(([k,l]) => (
            <button key={k} onClick={() => setMode(k)}
              className={'py-2 rounded-xl text-xs font-bold border ' + (mode===k ? 'bg-teal text-white border-teal' : 'border-border text-muted')}>{l}</button>
          ))}
        </div>
        <div>
          <label className="text-xs font-bold text-muted block mb-1">المخزن</label>
          <select value={whId} onChange={e => setWhId(e.target.value)} className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text">
            {whs.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-muted block mb-1">{mode === 'adjust' ? 'الكمية الجديدة (المطلقة)' : 'الكمية المُضافة'}</label>
          <input type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="0"
            className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text" style={{ direction: 'ltr', textAlign: 'right' }} />
        </div>
        <input value={reason} onChange={e => setReason(e.target.value)} placeholder="ملاحظة (اختياري)"
          className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text" />
        {err && <p className="text-xs text-red-fg bg-red-bg rounded-xl px-3 py-2">⚠️ {err}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-border text-sm text-muted">إلغاء</button>
          <button onClick={submit} disabled={busy || qty === '' || !whId} className="flex-1 py-2 rounded-xl bg-teal text-white text-sm font-bold disabled:opacity-40">{busy ? '…' : 'تأكيد'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Sales by category (Syria delivered orders) ─────────────────
function CategorySalesPanel() {
  const [rows, setRows] = useState(null);
  const [period, setPeriod] = useState('all'); // all | month
  useEffect(() => {
    (async () => {
      setRows(null);
      const monthStart = new Date().toISOString().slice(0, 7) + '-01';
      let oq = supabase.from('orders')
        .select('items, order_date, archived')
        .eq('market', 'syria').eq('status', 'delivered');
      if (period === 'month') oq = oq.gte('order_date', monthStart + 'T00:00:00');
      const [oRes, pRes] = await Promise.all([
        oq,
        supabase.from('products').select('name, name_en, category, price_usd'),
      ]);
      // Orders store item names in ENGLISH (from the sheet) → match on name_en
      // first, with the Arabic name as a fallback.
      const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const byName = {};
      (pRes.data || []).forEach(p => {
        if (p.name)    byName[norm(p.name)]    = p;
        if (p.name_en) byName[norm(p.name_en)] = p;
      });
      const cats = {};
      (oRes.data || []).forEach(o => {
        if (o.archived === true) return;
        (Array.isArray(o.items) ? o.items : []).forEach(it => {
          const p = byName[norm(it.name)];
          const cat = p?.category || 'غير مصنّف';
          const qty = Number(it.qty ?? it.quantity ?? 0) || 0;
          if (!qty) return;
          cats[cat] = cats[cat] || { units: 0, revenue: 0 };
          cats[cat].units += qty;
          cats[cat].revenue += qty * (Number(p?.price_usd) || 0);
        });
      });
      setRows(Object.entries(cats).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.units - a.units));
    })();
  }, [period]);

  const totUnits = (rows || []).reduce((s, r) => s + r.units, 0);
  const totRev   = (rows || []).reduce((s, r) => s + r.revenue, 0);
  const maxUnits = Math.max(1, ...(rows || []).map(r => r.units));

  return (
    <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-text">📊 مبيعات الأقسام (سوريا — مسلّمة)</p>
        <div className="flex gap-1">
          {[['all','الكل'],['month','هذا الشهر']].map(([k,l]) => (
            <button key={k} onClick={() => setPeriod(k)}
              className={'px-2.5 py-1 rounded-lg text-[11px] font-bold ' + (period===k ? 'bg-teal text-white' : 'bg-surface-alt text-muted')}>{l}</button>
          ))}
        </div>
      </div>
      {rows === null ? <p className="text-sm text-muted text-center py-4 animate-pulse">…</p>
        : rows.length === 0 ? <p className="text-sm text-muted text-center py-4">لا مبيعات في هذه الفترة</p>
        : (
        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.name}>
              <div className="flex items-center justify-between text-xs mb-0.5">
                <span className="text-text font-semibold">{r.name}</span>
                <span className="text-muted">{r.units} وحدة · <b className="text-teal">${r.revenue.toFixed(0)}</b></span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-alt overflow-hidden">
                <div className="h-full bg-teal rounded-full" style={{ width: `${(r.units / maxUnits) * 100}%` }} />
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between text-xs pt-2 border-t border-border font-bold">
            <span className="text-text">الإجمالي</span>
            <span className="text-text">{totUnits} وحدة · <span className="text-teal">${totRev.toFixed(0)}</span></span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InventoryScreen() {
  const [products, setProducts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [search,   setSearch]   = useState('');
  const [catFilter, setCat]     = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editProd, setEditProd] = useState(null);
  const [moveProd, setMoveProd] = useState(null);
  const [stockProd, setStockProd] = useState(null);
  const [showCatSales, setShowCatSales] = useState(false);
  const [dbMissing, setDbMissing] = useState(false);
  const { name: userName } = useAuth();
  const { can } = usePermissions();
  const canManageStock = can(PERMISSIONS.MANAGE_CENTRAL_STOCK) || can(PERMISSIONS.MANAGE_SALES_STOCK);
  const [seeding,   setSeeding]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Syria scope: live quantity = Σ wh_stock over all NON-Turkey warehouses
      // (central + Syria sales + Syria sub-warehouses). Turkey is excluded.
      const [prodRes, whRes, stockRes] = await Promise.all([
        supabase.from('products').select('*').order('name'),
        supabase.from('wh_warehouses').select('id, market, type').eq('is_active', true),
        supabase.from('wh_stock').select('warehouse_id, product_id, quantity'),
      ]);
      if (prodRes.error) {
        if (prodRes.error.code === '42P01') { setDbMissing(true); return; }
        throw new Error(prodRes.error.message);
      }
      const syriaWh = new Set((whRes.data || []).filter(w => w.market !== 'turkey').map(w => w.id));
      const qtyBy = {};
      (stockRes.data || []).forEach(s => {
        if (syriaWh.has(s.warehouse_id)) qtyBy[s.product_id] = (qtyBy[s.product_id] || 0) + Number(s.quantity || 0);
      });
      setProducts((prodRes.data || []).map(p => ({ ...p, quantity: qtyBy[p.id] ?? 0 })));
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

  const seedLowesProducts = async () => {
    setSeeding(true);
    try {
      const rows = LOWES_PRODUCTS.map(p => ({
        name: p.name, sku: p.sku, category: p.category,
        quantity: 0, price_usd: 0, price_try: 0, min_stock: 5, is_active: true,
      }));
      const { error } = await supabase.from('products').insert(rows);
      if (error) throw new Error(error.message);
      await load();
    } catch (e) {
      alert('خطأ في التهيئة: ' + e.message);
    } finally {
      setSeeding(false);
    }
  };

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
{`-- 1) إنشاء الجدول
CREATE TABLE IF NOT EXISTS products (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  sku text UNIQUE,
  category text DEFAULT 'العناية بالبشرة',
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
CREATE POLICY "products_all" ON products
  FOR ALL USING (true) WITH CHECK (true);

-- 2) تهيئة 32 منتج Lowe's Professional
INSERT INTO products (name, sku, category, quantity, min_stock, is_active) VALUES
('غسول البشرة الدهنية والحساسة','LW-FC-204','العناية بالوجه',0,5,true),
('غسول البشرة العادية و الجافة','LW-FC-203','العناية بالوجه',0,5,true),
('تونر تنقية البشرة و تضييق المسام','LW-FC-202','العناية بالوجه',0,5,true),
('جيل مقشر الوجه','LW-FC-201','العناية بالوجه',0,5,true),
('سيروم فيتامين سي','LW-SK-101','العناية بالبشرة',0,5,true),
('سيروم الريتينول','LW-SK-105','العناية بالبشرة',0,5,true),
('سيروم مصحح البقع الداكنة','LW-SK-106','العناية بالبشرة',0,5,true),
('سيروم الترطيب المكثف','LW-SK-107','العناية بالبشرة',0,5,true),
('سيروم الكولاجين','LW-SK-109','العناية بالبشرة',0,5,true),
('سيروم الهالات و انتفاخ العين','LW-SK-108','العناية بالبشرة',0,5,true),
('كريم تفتيح البشرة','LW-SK-102','العناية بالبشرة',0,5,true),
('كريم الترطيب المكثف','LW-SK-104','العناية بالبشرة',0,5,true),
('سيروم مضاد لحب الشباب','LW-SK-110','العناية بالبشرة',0,5,true),
('ريتينال شوت','LW-SK-111','العناية بالبشرة',0,5,true),
('كريم الارز','LW-SK-112','العناية بالبشرة',0,5,true),
('سيروم الارز','LW-SK-113','العناية بالبشرة',0,5,true),
('واقي الشمس الوردي بالكالامين','LW-SN-501','واقي الشمس',0,5,true),
('واقي الشمس المضاد للبقع','LW-SN-502','واقي الشمس',0,5,true),
('ماسك الكولاجين المائي','LW-MS-601','الماسك',0,5,true),
('جل شد الجسم و السيليوليت','LW-SK-103','العناية بالجسم',0,5,true),
('تونر حليب الارز','LW-TN-601','العناية بالجسم',0,5,true),
('كريم العناية بالثدي','LW-SP-701','منتجات خاصة',0,5,true),
('سيروم العناية بالثدي','LW-SP-702','منتجات خاصة',0,5,true),
('كريم العناية بالقدمين','LW-SP-704','منتجات خاصة',0,5,true),
('شامبو الروزماري','LW-HR-301','العناية بالشعر',0,5,true),
('ماء الروزماري للشعر و البشرة','LW-HR-302','العناية بالشعر',0,5,true),
('زيت الروزماري','LW-HR-303','العناية بالشعر',0,5,true),
('سيروم اللحية','LW-SP-703','العناية بالشعر',0,5,true),
('ديرما رول 0.5mm','LW-DR-103','الأدوات',0,5,true),
('ديرما رول 1mm','LW-DR-104','الأدوات',0,5,true),
('مشط السيليكون','LW-SC-105','الأدوات',0,5,true),
('رول مساج الوجه','LW-GS-106','الأدوات',0,5,true)
ON CONFLICT (sku) DO NOTHING;`}
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
        title="إدارة المخزون — سوريا"
        subtitle="الكميات المعروضة من مخزون سوريا الفعلي (المركزي + مبيعات سوريا + الفروع). تركيا منفصلة."
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

      {/* Sales by category */}
      <button onClick={() => setShowCatSales(v => !v)}
        className="flex items-center gap-2 text-sm font-bold text-text hover:text-teal transition">
        📊 مبيعات الأقسام {showCatSales ? '▲' : '▼'}
      </button>
      {showCatSales && <CategorySalesPanel />}

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
            <div className="py-4 space-y-4 text-center">
              <EmptyState description="لا توجد منتجات — أضف أول منتج أو هيّئ كتالوج Lowe's" />
              {products.length === 0 && (
                <Button variant="teal" onClick={seedLowesProducts} disabled={seeding}>
                  {seeding ? '⏳ جاري التهيئة…' : '🌱 تهيئة 32 منتج Lowe\'s Professional'}
                </Button>
              )}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map(p => (
                <ProductCard key={p.id} p={p} onEdit={openEdit} onMovements={setMoveProd} onStock={setStockProd} canManage={canManageStock} />
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
      {moveProd && <MovementModal product={moveProd} onClose={() => setMoveProd(null)} />}
      {stockProd && <StockActionModal product={stockProd} performedBy={userName} onClose={() => setStockProd(null)} onDone={load} />}
    </div>
  );
}
