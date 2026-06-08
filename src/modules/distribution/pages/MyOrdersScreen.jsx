// =============================================================
// MyOrdersScreen — «طلباتي»: طلبات المندوب/المسوّقة نفسه فقط.
//   • مفلترة دائماً بـ seller_id = المستخدم الحالي (لا يرى طلبات الشركة).
//   • إنشاء «طلب جديد» مبسّط (عميل من عملائي + سلة منتجات) يضبط seller_id.
//   • «تم التسليم» يشغّل محرّك العمولة (post_order_commission) مرة واحدة.
// خصوصية: هذه الشاشة بديل أدوار الشبكة عن شاشة طلبات الشركة (الأونلاين).
// =============================================================
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth }  from '@hooks/useAuth';
import { supabase } from '@services/supabase';
import { postOrderCommission } from '@modules/commission/services/commissionEngine';

const fmt = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

const STATUS_LABEL = {
  pending:   { label: 'قيد التجهيز', cls: 'text-amber-fg bg-amber-bg' },
  preparing: { label: 'تحت التحضير', cls: 'text-amber-fg bg-amber-bg' },
  ready:     { label: 'جاهز',        cls: 'text-teal bg-teal/10' },
  delivered: { label: 'تم التسليم',  cls: 'text-green-fg bg-green-bg' },
  cancelled: { label: 'ملغى',        cls: 'text-red-fg bg-red-bg' },
  returned:  { label: 'مرتجع',       cls: 'text-red-fg bg-red-bg' },
};
const statusOf = (s) => STATUS_LABEL[s] ?? { label: s || '—', cls: 'text-muted bg-surface-alt' };

// رقم طلب فريد للمندوب (بادئة R) — يرفع التسلسلي حتى رقم غير مستخدم.
async function ensureRepOrderId(market) {
  const prefix = market === 'syria' ? 'R-SA-' : 'R-S-';
  const now = new Date();
  let num = Number(`${now.getMonth() + 1}${now.getDate()}${now.getHours()}${now.getMinutes()}`);
  for (let i = 0; i < 200; i++) {
    const candidate = `${prefix}${num}`;
    const { data } = await supabase.from('orders').select('id').eq('order_id', candidate).maybeSingle();
    if (!data) return candidate;
    num += 1;
  }
  return `${prefix}${Date.now()}`;
}

// ── نافذة إنشاء طلب جديد ────────────────────────────────────────
function NewOrderModal({ sellerId, sellerName, clients, products, onClose, onCreated }) {
  const [market, setMarket]   = useState('syria');
  const [clientId, setClientId] = useState('');
  const [saleType, setSaleType] = useState('retail');
  const [lines, setLines]     = useState([{ name: '', qty: 1, price: '' }]);
  const [saving, setSaving]   = useState(false);

  const currency = market === 'syria' ? 'USD' : 'TRY';
  const total = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.price) || 0), 0),
    [lines],
  );
  const client = clients.find(c => c.id === clientId) || null;

  const setLine    = (i, k, v) => setLines(p => p.map((l, idx) => idx === i ? { ...l, [k]: v } : l));
  const addLine    = () => setLines(p => [...p, { name: '', qty: 1, price: '' }]);
  const removeLine = (i) => setLines(p => p.filter((_, idx) => idx !== i));

  const save = async () => {
    const items = lines
      .filter(l => l.name.trim())
      .map(l => ({ name: l.name.trim(), qty: Number(l.qty) || 1, price: Number(l.price) || 0,
                   sub: (Number(l.qty) || 1) * (Number(l.price) || 0) }));
    if (!items.length) { window.alert('أضف منتجاً واحداً على الأقل'); return; }
    if (!client)       { window.alert('اختر عميلاً من عملائك'); return; }
    setSaving(true);
    try {
      const order_id = await ensureRepOrderId(market);
      const payload = {
        order_id,
        customer_name: client.name,
        phone_1:       client.phone || null,
        address:       client.city || null,
        market,
        currency,
        amount:        total,
        paid_amount:   0,
        payment_status: 'unpaid',
        status:        'pending',
        sale_type:     saleType,
        items,
        order_date:    new Date().toISOString(),
        handler_name:  sellerName,
        seller_id:     sellerId,
        client_id:     client.id,
      };
      const { error } = await supabase.from('orders').insert(payload);
      if (error) throw error;
      onCreated();
      onClose();
    } catch (err) {
      window.alert('❌ تعذّر إنشاء الطلب:\n' + (err?.message || String(err)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto" dir="rtl">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-lg my-4 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-lg">➕ طلب جديد</h2>
          <button onClick={onClose} className="text-muted text-xl leading-none">✕</button>
        </div>

        {/* السوق + نوع البيع */}
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-bold text-muted">السوق
            <select value={market} onChange={e => setMarket(e.target.value)}
              className="mt-1 w-full bg-surface-alt border border-border rounded-lg px-2 py-2 text-sm">
              <option value="syria">سوريا 🇸🇾</option>
              <option value="turkey">تركيا 🇹🇷</option>
            </select>
          </label>
          <label className="text-xs font-bold text-muted">نوع البيع
            <select value={saleType} onChange={e => setSaleType(e.target.value)}
              className="mt-1 w-full bg-surface-alt border border-border rounded-lg px-2 py-2 text-sm">
              <option value="retail">مفرّق</option>
              <option value="wholesale">جملة</option>
            </select>
          </label>
        </div>

        {/* العميل */}
        <label className="block text-xs font-bold text-muted">العميل (من عملائي)
          <select value={clientId} onChange={e => setClientId(e.target.value)}
            className="mt-1 w-full bg-surface-alt border border-border rounded-lg px-2 py-2 text-sm">
            <option value="">— اختر عميلاً —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.city ? ` — ${c.city}` : ''}</option>)}
          </select>
        </label>
        {clients.length === 0 && (
          <p className="text-[11px] text-amber-fg">لا يوجد عملاء بعد — أضِف عملاءك من شاشة «الزيارات».</p>
        )}

        {/* بنود الطلب */}
        <div className="space-y-2">
          <p className="text-xs font-bold text-muted">المنتجات</p>
          {lines.map((l, i) => (
            <div key={i} className="flex gap-1.5 items-center">
              <input list="rep-products" value={l.name} onChange={e => setLine(i, 'name', e.target.value)}
                placeholder="المنتج" className="flex-1 bg-surface-alt border border-border rounded-lg px-2 py-1.5 text-sm" />
              <input type="number" min="1" value={l.qty} onChange={e => setLine(i, 'qty', e.target.value)}
                className="w-14 bg-surface-alt border border-border rounded-lg px-2 py-1.5 text-sm text-center" />
              <input type="number" min="0" value={l.price} onChange={e => setLine(i, 'price', e.target.value)}
                placeholder="السعر" className="w-20 bg-surface-alt border border-border rounded-lg px-2 py-1.5 text-sm text-center" />
              <button onClick={() => removeLine(i)} className="text-red-fg text-sm px-1" disabled={lines.length === 1}>✕</button>
            </div>
          ))}
          <datalist id="rep-products">
            {products.map(p => <option key={p.id} value={p.name} />)}
          </datalist>
          <button onClick={addLine} className="text-xs font-black text-teal">+ بند آخر</button>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="font-black">الإجمالي: {fmt(total)} {currency}</span>
          <button onClick={save} disabled={saving}
            className="bg-teal text-white font-black rounded-xl px-5 py-2 text-sm disabled:opacity-50">
            {saving ? 'جارٍ الحفظ…' : 'حفظ الطلب'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MyOrdersScreen() {
  const { session } = useAuth();
  const sellerId   = session?.id || null;
  const sellerName = session?.name || '';

  const [orders, setOrders]   = useState([]);
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [busyId, setBusyId]   = useState(null);

  const load = useCallback(async () => {
    if (!sellerId) return;
    setLoading(true);
    const { data } = await supabase.from('orders')
      .select('*').eq('seller_id', sellerId).is('deleted_at', null)
      .order('order_date', { ascending: false });
    setOrders(data ?? []);
    setLoading(false);
  }, [sellerId]);

  useEffect(() => { load(); }, [load]);

  // عملائي + المنتجات (لنافذة الطلب الجديد)
  useEffect(() => {
    if (!sellerId) return;
    supabase.from('crm_clients').select('id,name,city,phone').eq('rep_id', sellerId).order('name')
      .then(({ data }) => setClients(data ?? [])).catch(() => {});
    supabase.from('products').select('id,name').eq('is_active', true).order('name')
      .then(({ data }) => setProducts(data ?? [])).catch(() => {});
  }, [sellerId]);

  const markDelivered = async (o) => {
    if (!window.confirm(`تأكيد تسليم الطلب ${o.order_id}؟ ستُحتسب العمولة.`)) return;
    setBusyId(o.id);
    try {
      const { error } = await supabase.from('orders')
        .update({ status: 'delivered' }).eq('id', o.id);
      if (error) throw error;
      await postOrderCommission(o.id); // fire — idempotent عبر commission_locked
      await load();
    } catch (err) {
      window.alert('❌ ' + (err?.message || String(err)));
    } finally {
      setBusyId(null);
    }
  };

  const totals = useMemo(() => {
    const delivered = orders.filter(o => o.status === 'delivered');
    const open = orders.filter(o => ['pending', 'preparing', 'ready'].includes(o.status));
    return {
      count: orders.length,
      deliveredSum: delivered.reduce((s, o) => s + Number(o.amount || 0), 0),
      openCount: open.length,
    };
  }, [orders]);

  return (
    <div className="space-y-4 pb-24" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="font-black text-lg">📦 طلباتي</h1>
        <button onClick={() => setShowNew(true)}
          className="bg-teal text-white font-black rounded-xl px-4 py-2 text-sm">➕ طلب جديد</button>
      </div>

      {/* ملخّص */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-surface border border-border p-2 text-center">
          <p className="text-sm font-black">{totals.count}</p>
          <p className="text-muted text-[10px] mt-0.5">إجمالي طلباتي</p>
        </div>
        <div className="rounded-xl bg-surface border border-border p-2 text-center">
          <p className="text-sm font-black text-amber-fg">{totals.openCount}</p>
          <p className="text-muted text-[10px] mt-0.5">قيد التنفيذ</p>
        </div>
        <div className="rounded-xl bg-surface border border-border p-2 text-center">
          <p className="text-sm font-black text-green-fg">{fmt(totals.deliveredSum)}</p>
          <p className="text-muted text-[10px] mt-0.5">مبيعات مُسلّمة</p>
        </div>
      </div>

      <section className="rounded-2xl bg-surface border border-border p-4">
        {loading ? (
          <p className="text-muted text-sm">جارٍ التحميل…</p>
        ) : orders.length === 0 ? (
          <p className="text-muted text-sm">لا طلبات بعد — ابدأ بـ«طلب جديد».</p>
        ) : (
          <ul className="divide-y divide-border">
            {orders.map(o => {
              const st = statusOf(o.status);
              return (
                <li key={o.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate">{o.customer_name || '—'}</p>
                    <p className="text-muted text-[11px]">{o.order_id} · {fmt(o.amount)} {o.currency || ''}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                    {['pending', 'preparing', 'ready'].includes(o.status) && (
                      <button onClick={() => markDelivered(o)} disabled={busyId === o.id}
                        className="text-[11px] font-black bg-green-bg text-green-fg rounded-lg px-2 py-1 disabled:opacity-50">
                        {busyId === o.id ? '…' : 'تم التسليم'}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {showNew && (
        <NewOrderModal
          sellerId={sellerId} sellerName={sellerName}
          clients={clients} products={products}
          onClose={() => setShowNew(false)} onCreated={load}
        />
      )}
    </div>
  );
}
