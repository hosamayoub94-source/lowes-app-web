// =============================================================
// OrdersScreen — نظام إدارة الطلبات
// تركيا 🇹🇷 + سوريا 🇸🇾
// منظومة البائع: طلباتي + دفع جزئي + فاتورة + عمولة
// =============================================================
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@services/supabase';
import { useAuth }  from '@hooks/useAuth';
import { ROLES }    from '@data/teams';
import { sendNotification } from '@modules/notifications/services/notificationService';
import { NOTIFICATION_TYPE } from '@modules/notifications/types/notification.types';
import { reserveForOrder, releaseForOrder } from '@services/warehouseService';
import { citiesForMarket } from '@data/cities';

// ── Google Sheet dual-write (Syria) ──────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY     = import.meta.env.VITE_SUPABASE_ANON_KEY;
async function syncOrderToSheet(orderId) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/sync-order-to-sheet`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    });
  } catch { /* best-effort; sheet_synced stays false for retry */ }
}

// Notify the seller (order.handler_name) that their order moved to a new stage.
// Best-effort: looks up the seller's profile id by name, never blocks the UI.
async function notifySellerStatusChange(order, newStatus, actorName) {
  try {
    if (!order?.handler_name) return;
    if (order.handler_name === actorName) return; // don't notify yourself
    const { data: prof } = await supabase
      .from('profiles')
      .select('id')
      .eq('employee_name', order.handler_name)
      .maybeSingle();
    if (!prof?.id) return;
    const meta = STATUSES[newStatus];
    await sendNotification({
      userId:     prof.id,
      type:       NOTIFICATION_TYPE.SYSTEM_ALERT,
      title:      `${meta?.icon ?? '📦'} طلبك ${order.order_id}: ${meta?.label ?? newStatus}`,
      message:    `${order.customer_name || 'العميل'} — انتقل الطلب إلى مرحلة «${meta?.label ?? newStatus}».`,
      entityType: 'order',
      entityId:   order.id,
      severity:   newStatus === 'delivered' ? 'info' : 'info',
      metadata:   { order_id: order.order_id, status: newStatus },
    });
  } catch { /* notifications are best-effort */ }
}

// ── Constants ────────────────────────────────────────────────
const STATUSES = {
  pending:   { label: 'وارد جديد',   icon: '📥', bg: 'bg-surface-alt', text: 'text-muted',      border: 'border-border'      },
  preparing: { label: 'قيد التجهيز', icon: '📦', bg: 'bg-amber-bg',    text: 'text-amber-fg',   border: 'border-amber/30'    },
  ready:     { label: 'جاهز للشحن',  icon: '🚀', bg: 'bg-violet-100',  text: 'text-violet-700', border: 'border-violet-200'  },
  shipped:   { label: 'في الشحن',    icon: '🚚', bg: 'bg-blue-100',    text: 'text-blue-700',   border: 'border-blue-200'    },
  delivered: { label: 'تم التوصيل', icon: '✅', bg: 'bg-green-bg',    text: 'text-green-fg',   border: 'border-green/30'    },
  cancelled: { label: 'ملغي',        icon: '❌', bg: 'bg-red-bg',      text: 'text-red-fg',     border: 'border-red/30'      },
};

const STAGES_ORDER = ['pending', 'preparing', 'ready', 'shipped', 'delivered'];

const TEAM_MARKET = {
  'تركيا': 'turkey', 'تيم تركيا': 'turkey',
  'سوريا': 'syria',  'تيم سوريا': 'syria',
};
function teamToMarket(team) {
  if (!team) return null;
  for (const [k, v] of Object.entries(TEAM_MARKET)) {
    if (team.includes(k.replace('تيم ', ''))) return v;
  }
  return null;
}

const SYRIA_COMPANIES  = ['شركة الكرم', 'سامتاك', 'ضد الدفع', 'واصل', 'أخرى'];
const TURKEY_COMPANIES = ['yurtiçi', 'Aras', 'ptt', 'توصيل الموتور', 'أخرى'];
const CURRENCIES       = ['TRY', 'SYP', 'USD'];
const PICKUP_TYPES     = ['عنوان منزل', 'استلام من المركز'];

const TRACKING_URLS = {
  'yurtiçi': (n) => `https://yurticikargo.com/tr/online-islemler/gonderi-sorgula?code=${n}`,
  'Aras':    (n) => `https://kargotakip.aras.com.tr/?id=${n}`,
  'ptt':     (n) => `https://turkiye.ptt.gov.tr/anasayfa#`,
};

function waLink(phone, market) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (market === 'turkey') return `https://wa.me/90${digits.replace(/^0/, '')}`;
  return `https://wa.me/963${digits.replace(/^0/, '')}`;
}
function trackingLink(company, number) {
  if (!number || !company) return null;
  const fn = TRACKING_URLS[company];
  return fn ? fn(number) : null;
}
function nextOrderId(market, orders) {
  const prefix = market === 'syria' ? 'SA-' : 'S';
  const existing = orders
    .filter(o => o.market === market && o.order_id)
    .map(o => { const m = o.order_id.match(/\d+$/); return m ? parseInt(m[0], 10) : 0; });
  const max = existing.length ? Math.max(...existing) : 0;
  const now = new Date();
  return `${now.getMonth() + 1}${prefix}${max + 1}`;
}

const EMPTY_FORM = {
  market: 'turkey', brand: 'lowes', order_id: '', order_date: new Date().toISOString().slice(0, 16),
  handler_name: '', status: 'pending', notes: '',
  customer_name: '', phone_1: '', phone_2: '', wa_number: '',
  city: '', district: '', address: '',
  amount: '', currency: 'TRY',
  payment_method: 'دفع عند الباب', payment_status: 'unpaid', paid_amount: '',
  shipping_company: 'yurtiçi', pickup_type: 'عنوان منزل', tracking_number: '',
};

const INP = 'w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30 placeholder:text-muted/50';
const LBL = 'text-xs font-bold text-muted block mb-1.5';

// ── Status Badge ──────────────────────────────────────────────
function StatusBadge({ status, size = 'sm' }) {
  const s = STATUSES[status] ?? STATUSES.pending;
  return (
    <span className={`inline-flex items-center gap-1 font-bold border rounded-full
      ${size === 'sm' ? 'text-[11px] px-2 py-0.5' : 'text-xs px-2.5 py-1'}
      ${s.bg} ${s.text} ${s.border}`}>
      {s.icon} {s.label}
    </span>
  );
}

// ── Progress Strip ─────────────────────────────────────────────
function ProgressStrip({ status }) {
  if (status === 'cancelled') return null;
  const current = STAGES_ORDER.indexOf(status);
  return (
    <div className="flex items-center gap-0.5">
      {STAGES_ORDER.map((_, i) => (
        <div key={i} className="flex-1 h-1.5 rounded-full transition-all"
          style={{
            background: i < current ? '#0d7377' : i === current ? '#0d7377' : 'var(--color-border, #e5e7eb)',
            opacity: i < current ? 0.4 : i === current ? 1 : 1,
          }} />
      ))}
    </div>
  );
}

// ── Payment Badge ─────────────────────────────────────────────
function PaymentBadge({ status, amount, paidAmount, currency }) {
  if (status === 'paid')
    return <span className="text-[10px] font-semibold text-green-fg">💰 مدفوع</span>;
  if (status === 'partial')
    return <span className="text-[10px] font-semibold text-amber-fg">💳 {paidAmount || 0}/{amount} {currency}</span>;
  return <span className="text-[10px] font-semibold text-red-fg">⏳ غير مدفوع</span>;
}

// ── Invoice Modal ─────────────────────────────────────────────
function InvoiceModal({ order, onClose }) {
  const ref = useRef(null);
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState('');

  const paymentText =
    order.payment_status === 'paid'    ? 'مدفوع بالكامل ✓' :
    order.payment_status === 'partial' ? `مدفوع جزئياً — ${order.paid_amount} ${order.currency} · المتبقّي: ${Math.max(0, Number(order.amount) - Number(order.paid_amount || 0)).toFixed(0)} ${order.currency}` :
    'غير مدفوع — الدفع عند الاستلام';

  const capture = async () => {
    if (!ref.current) return null;
    const { toPng } = await import('html-to-image');
    return await toPng(ref.current, { pixelRatio: 2, backgroundColor: '#ffffff' });
  };

  const handleDownload = async () => {
    setGenerating(true);
    try {
      const dataUrl = await capture();
      const link = document.createElement('a');
      link.download = `invoice-${order.order_id}.png`;
      link.href = dataUrl;
      link.click();
      setMsg('تم تحميل الفاتورة ✓');
    } catch { setMsg('حدث خطأ أثناء التحميل'); }
    finally { setGenerating(false); }
  };

  const handleWhatsApp = async () => {
    setGenerating(true);
    setMsg('');
    try {
      const dataUrl = await capture();
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `invoice-${order.order_id}.png`, { type: 'image/png' });
      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `فاتورة ${order.order_id}` });
      } else {
        // Fallback: download
        const link = document.createElement('a');
        link.download = `invoice-${order.order_id}.png`;
        link.href = dataUrl;
        link.click();
        setMsg('تم تحميل الفاتورة (افتح واتساب وأرسلها يدوياً)');
      }
    } catch { setMsg('حدث خطأ'); }
    finally { setGenerating(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto"
      onClick={onClose}>
      <div className="bg-surface rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden my-auto"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40" dir="rtl">
          <h3 className="font-bold text-sm text-text">🧾 فاتورة الطلب</h3>
          <button onClick={onClose} className="text-muted hover:text-text w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface-alt transition text-sm">✕</button>
        </div>

        {/* Invoice (captured as image) */}
        <div ref={ref} dir="rtl" style={{
          background: '#ffffff', padding: '24px',
          fontFamily: '"Tajawal", "Segoe UI", Arial, sans-serif', color: '#111827',
        }}>
          {/* Brand header */}
          <div style={{ textAlign: 'center', borderBottom: '2px solid #0f1f3d22', paddingBottom: '14px', marginBottom: '14px' }}>
            <div style={{ fontSize: '20px', fontWeight: '900', color: '#0f1f3d', letterSpacing: '-0.3px' }}>
              Lowe&apos;s Professional
            </div>
            <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>منتجات عناية البشرة الاحترافية</div>
          </div>

          {/* Order meta */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', fontSize: '12px' }}>
            <div>
              <div style={{ color: '#9ca3af', fontSize: '9px', marginBottom: '2px' }}>رقم الطلب</div>
              <div style={{ fontWeight: '800', color: '#0d7377', fontSize: '14px' }}>{order.order_id}</div>
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ color: '#9ca3af', fontSize: '9px', marginBottom: '2px' }}>التاريخ</div>
              <div style={{ fontWeight: '700' }}>
                {order.order_date
                  ? new Date(order.order_date).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })
                  : '—'}
              </div>
            </div>
          </div>

          {/* Customer */}
          <div style={{ background: '#f8f7f4', borderRadius: '10px', padding: '10px', marginBottom: '14px' }}>
            <div style={{ fontSize: '9px', color: '#9ca3af', fontWeight: '700', marginBottom: '5px' }}>بيانات العميل</div>
            <div style={{ fontSize: '14px', fontWeight: '800', marginBottom: '3px' }}>{order.customer_name}</div>
            {order.phone_1 && <div style={{ fontSize: '11px', color: '#374151', direction: 'ltr' }}>{order.phone_1}</div>}
            {order.city && (
              <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '2px' }}>
                {order.city}{order.district ? ` · ${order.district}` : ''}{order.address ? ` — ${order.address}` : ''}
              </div>
            )}
          </div>

          {/* Items */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '9px', color: '#9ca3af', fontWeight: '700', marginBottom: '7px' }}>المنتجات</div>
            {(order.items ?? []).map((item, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '5px 0', borderBottom: '1px solid #f3f4f6', fontSize: '12px',
              }}>
                <span>{item.name}</span>
                <span style={{ fontWeight: '700', color: '#0d7377' }}>×{item.qty}</span>
              </div>
            ))}
          </div>

          {/* Total */}
          {order.amount > 0 && (
            <div style={{
              background: '#0f1f3d0d', borderRadius: '10px', padding: '10px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px',
            }}>
              <span style={{ fontSize: '12px', fontWeight: '700' }}>الإجمالي</span>
              <span style={{ fontSize: '18px', fontWeight: '900', color: '#0f1f3d' }}>
                {order.amount} <span style={{ fontSize: '12px' }}>{order.currency}</span>
              </span>
            </div>
          )}

          {/* Payment */}
          <div style={{
            fontSize: '10px', color: '#6b7280', marginBottom: '10px',
            padding: '7px', background: '#f9fafb', borderRadius: '8px', textAlign: 'center',
          }}>
            {paymentText}
          </div>

          {/* Shipping */}
          {order.shipping_company && (
            <div style={{ fontSize: '10px', color: '#9ca3af', marginBottom: '3px' }}>
              الشحن: {order.shipping_company}
              {order.tracking_number ? ` · رقم التتبع: ${order.tracking_number}` : ''}
            </div>
          )}

          {/* Seller footer */}
          {order.handler_name && (
            <div style={{
              textAlign: 'center', fontSize: '9px', color: '#d1d5db',
              borderTop: '1px solid #f3f4f6', paddingTop: '10px', marginTop: '10px',
            }}>
              البائع: {order.handler_name}
            </div>
          )}
        </div>

        {/* Message feedback */}
        {msg && (
          <p className="text-center text-xs text-teal px-4 py-1" dir="rtl">{msg}</p>
        )}

        {/* Actions */}
        <div className="flex gap-2 p-4 border-t border-border/40">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-border text-xs text-muted hover:text-text transition">
            إغلاق
          </button>
          <button onClick={handleDownload} disabled={generating}
            className="flex-1 py-2.5 rounded-xl bg-navy/10 text-navy text-xs font-bold disabled:opacity-40 hover:bg-navy/15 transition">
            {generating ? '…' : '⬇ تحميل'}
          </button>
          <button onClick={handleWhatsApp} disabled={generating}
            className="flex-1 py-2.5 rounded-xl text-white text-xs font-bold disabled:opacity-40 hover:opacity-90 transition"
            style={{ background: '#25D366' }}>
            {generating ? '…' : '📤 واتساب'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Order Card ─────────────────────────────────────────────────
function OrderCard({ order, onStatusChange, onEdit, onInvoice, canAdvance }) {
  const [changing, setChanging] = useState(false);
  const wa   = waLink(order.wa_number || order.phone_1, order.market);
  const tUrl = trackingLink(order.shipping_company, order.tracking_number);
  const itemsSummary = (order.items ?? []).slice(0, 3).map(i => `${i.name} ×${i.qty}`).join(' · ');
  const moreItems = (order.items ?? []).length - 3;

  const NEXT = { pending: 'preparing', preparing: 'ready', ready: 'shipped', shipped: 'delivered', delivered: null, cancelled: null };
  const nextStatus = canAdvance ? NEXT[order.status] : null;

  const handleAdvance = async () => {
    if (!nextStatus || changing) return;
    setChanging(true);
    await onStatusChange(order.id, nextStatus);
    setChanging(false);
  };

  return (
    <div className="bg-surface border border-border rounded-2xl p-4 space-y-3 active:scale-[0.99] transition-transform">
      {/* Progress strip */}
      <ProgressStrip status={order.status} />

      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-muted">{order.market === 'turkey' ? '🇹🇷' : '🇸🇾'} {order.order_id}</span>
            <StatusBadge status={order.status} />
          </div>
          <p className="text-sm font-bold text-text mt-1 truncate">{order.customer_name}</p>
          {order.city && <p className="text-[11px] text-muted">{order.city}{order.district ? ` · ${order.district}` : ''}</p>}
        </div>
        <div className="flex gap-1 shrink-0">
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer"
              className="w-8 h-8 rounded-xl bg-green-bg flex items-center justify-center text-green-fg hover:opacity-80 transition">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.138.561 4.14 1.541 5.876L.057 23.886a.5.5 0 00.606.617l6.218-1.632A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.901 0-3.68-.498-5.22-1.371l-.374-.22-3.878 1.018 1.034-3.776-.241-.389A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
              </svg>
            </a>
          )}
          {tUrl && (
            <a href={tUrl} target="_blank" rel="noreferrer"
              className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700 text-xs hover:opacity-80 transition font-bold">
              تتبع
            </a>
          )}
          <button onClick={() => onInvoice(order)}
            className="w-8 h-8 rounded-xl bg-surface-alt flex items-center justify-center text-muted hover:text-text transition text-sm"
            title="فاتورة">
            🧾
          </button>
          <button onClick={() => onEdit(order)}
            className="w-8 h-8 rounded-xl bg-surface-alt flex items-center justify-center text-muted hover:text-text transition text-sm">
            ✏️
          </button>
        </div>
      </div>

      {/* Items summary */}
      <p className="text-[11px] text-muted leading-relaxed">
        📦 {itemsSummary || 'لا توجد منتجات'}
        {moreItems > 0 && <span className="text-teal font-semibold"> +{moreItems} أخرى</span>}
      </p>

      {/* Bottom row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {order.amount > 0 && (
            <span className="text-xs font-bold text-text">{order.amount} {order.currency}</span>
          )}
          <PaymentBadge
            status={order.payment_status}
            amount={order.amount}
            paidAmount={order.paid_amount}
            currency={order.currency}
          />
        </div>
        {nextStatus && (
          <button onClick={handleAdvance} disabled={changing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal/10 text-teal text-xs font-bold hover:bg-teal/20 transition disabled:opacity-40">
            {changing ? '…' : `${STATUSES[nextStatus].icon} ${STATUSES[nextStatus].label}`}
          </button>
        )}
      </div>

      {/* Handler + date */}
      <div className="flex items-center justify-between pt-1 border-t border-border/40">
        <span className="text-[10px] text-muted">{order.handler_name || '—'}</span>
        <span className="text-[10px] text-muted">
          {order.order_date ? new Date(order.order_date).toLocaleDateString('ar', { day: 'numeric', month: 'short' }) : '—'}
        </span>
      </div>
    </div>
  );
}

// ── Item Row in form ──────────────────────────────────────────
function ItemRow({ item, index, onChange, onRemove, products = [] }) {
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const q = (item.name || '').trim().toLowerCase();
    if (!q) return products.slice(0, 8);
    return products.filter(p => p.name?.toLowerCase().includes(q)).slice(0, 8);
  }, [item.name, products]);
  const pick = (p) => { onChange(index, 'name', p.name); setOpen(false); };

  return (
    <div className="flex gap-2 items-start">
      <div className="flex-1 relative">
        <input value={item.name}
          onChange={e => { onChange(index, 'name', e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="اسم المنتج (اكتب أو اختر من القائمة)"
          className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30"
        />
        {open && matches.length > 0 && (
          <div className="absolute z-20 top-full mt-1 inset-x-0 bg-surface border border-border rounded-xl shadow-xl max-h-52 overflow-y-auto">
            {matches.map(p => (
              <button key={p.id} type="button" onMouseDown={() => pick(p)}
                className="w-full text-right px-3 py-2 text-sm text-text hover:bg-teal/10 transition flex items-center justify-between gap-2 border-b border-border/40 last:border-0">
                <span className="truncate">{p.name}</span>
                {p.category && <span className="text-[10px] text-muted shrink-0">{p.category}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center border border-border rounded-xl overflow-hidden shrink-0 mt-0.5">
        <button type="button" onClick={() => onChange(index, 'qty', Math.max(1, item.qty - 1))}
          className="px-2 py-2 text-muted hover:text-text hover:bg-surface-alt transition text-sm font-bold">−</button>
        <span className="px-2 text-sm font-bold text-text tabular-nums min-w-[1.5rem] text-center">{item.qty}</span>
        <button type="button" onClick={() => onChange(index, 'qty', item.qty + 1)}
          className="px-2 py-2 text-muted hover:text-text hover:bg-surface-alt transition text-sm font-bold">+</button>
      </div>
      <button type="button" onClick={() => onRemove(index)}
        className="w-8 h-8 mt-0.5 rounded-xl bg-red-bg text-red-fg flex items-center justify-center text-xs hover:opacity-80 transition shrink-0">
        🗑
      </button>
    </div>
  );
}

// ── Order Form Modal ──────────────────────────────────────────
function OrderFormModal({ order, onClose, onSave, allOrders }) {
  const { name: userName } = useAuth();
  const isEdit = !!order?.id;

  const [form, setForm] = useState(isEdit ? {
    market:           order.market,
    brand:            order.brand            ?? 'lowes',
    order_id:         order.order_id         ?? '',
    order_date:       order.order_date ? new Date(order.order_date).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16),
    handler_name:     order.handler_name     ?? userName ?? '',
    status:           order.status           ?? 'pending',
    notes:            order.notes            ?? '',
    customer_name:    order.customer_name    ?? '',
    phone_1:          order.phone_1          ?? '',
    phone_2:          order.phone_2          ?? '',
    wa_number:        order.wa_number        ?? '',
    city:             order.city             ?? '',
    district:         order.district         ?? '',
    address:          order.address          ?? '',
    amount:           order.amount           ?? '',
    currency:         order.currency         ?? 'TRY',
    payment_method:   order.payment_method   ?? 'دفع عند الباب',
    payment_status:   order.payment_status   ?? 'unpaid',
    paid_amount:      order.paid_amount      ?? '',
    shipping_company: order.shipping_company ?? 'yurtiçi',
    pickup_type:      order.pickup_type      ?? 'عنوان منزل',
    tracking_number:  order.tracking_number  ?? '',
  } : { ...EMPTY_FORM, handler_name: userName ?? '' });

  const [items,    setItems]    = useState(isEdit ? (order.items ?? []) : [{ name: '', qty: 1 }]);
  const [saving,   setSaving]   = useState(false);
  const [products, setProducts] = useState([]);

  useEffect(() => {
    supabase.from('products').select('id, name, category').eq('is_active', true).order('name')
      .then(({ data }) => setProducts(data ?? [])).catch(() => {});
  }, []);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleMarketChange = (market) => {
    set('market', market);
    set('currency', market === 'turkey' ? 'TRY' : 'SYP');
    set('shipping_company', market === 'turkey' ? 'yurtiçi' : 'شركة الكرم');
    set('payment_method', market === 'turkey' ? 'دفع عند الباب' : 'دفع عند الاستلام');
    if (!isEdit) set('order_id', nextOrderId(market, allOrders));
  };

  useEffect(() => {
    if (!isEdit && !form.order_id) set('order_id', nextOrderId(form.market, allOrders));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addItem    = () => setItems(p => [...p, { name: '', qty: 1 }]);
  const removeItem = (i) => setItems(p => p.filter((_, idx) => idx !== i));
  const changeItem = (i, k, v) => setItems(p => p.map((item, idx) => idx === i ? { ...item, [k]: v } : item));

  // Auto-computed remaining for partial payment
  const remaining = form.payment_status === 'partial' && form.amount && form.paid_amount
    ? Math.max(0, Number(form.amount) - Number(form.paid_amount)).toFixed(0)
    : null;

  const handleSave = async () => {
    if (!form.customer_name.trim()) return;
    setSaving(true);
    const payload = {
      ...form,
      amount:      form.amount      ? Number(form.amount)      : null,
      paid_amount: form.paid_amount ? Number(form.paid_amount) : null,
      order_date:  new Date(form.order_date).toISOString(),
      items:       items.filter(i => i.name.trim()),
    };
    try { await onSave(payload, order?.id); }
    finally { setSaving(false); }
  };

  const companies = form.market === 'turkey' ? TURKEY_COMPANIES : SYRIA_COMPANIES;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto"
      onClick={onClose}>
      <div className="bg-surface rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden my-auto"
        dir="rtl" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between shrink-0 bg-gradient-to-r from-navy/5 to-transparent">
          <div>
            <h3 className="font-bold text-base text-text">{isEdit ? '✏️ تعديل طلب' : '+ طلب جديد'}</h3>
            {isEdit && <p className="text-xs text-muted mt-0.5">{order.order_id}</p>}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-surface-alt flex items-center justify-center text-muted">✕</button>
        </div>

        <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">

          {/* Market */}
          <div className="flex gap-2">
            {[{ key: 'turkey', label: 'تركيا', flag: '🇹🇷' }, { key: 'syria', label: 'سوريا', flag: '🇸🇾' }].map(m => (
              <button key={m.key} onClick={() => handleMarketChange(m.key)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition
                  ${form.market === m.key ? 'border-teal bg-teal/10 text-teal' : 'border-border text-muted hover:border-teal/40'}`}>
                {m.flag} {m.label}
              </button>
            ))}
          </div>

          {/* Brand — la ronven glow orders are isolated from Lowe's stock */}
          <div className="flex gap-2">
            {[
              { key: 'lowes', label: "Lowe's", emoji: '🌿' },
              { key: 'la_ronven_glow', label: 'la ronven glow', emoji: '💪' },
            ].map(b => (
              <button key={b.key} onClick={() => set('brand', b.key)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition
                  ${form.brand === b.key ? 'border-navy bg-navy/10 text-navy' : 'border-border text-muted hover:border-navy/40'}`}>
                {b.emoji} {b.label}
              </button>
            ))}
          </div>

          {/* Order Info */}
          <div className="space-y-3">
            <p className="text-xs font-extrabold text-muted uppercase tracking-wider">📋 معلومات الطلب</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LBL}>رقم الطلب</label>
                <input value={form.order_id} onChange={e => set('order_id', e.target.value)} className={INP} placeholder="5S100" />
              </div>
              <div>
                <label className={LBL}>البائع</label>
                <input value={form.handler_name} onChange={e => set('handler_name', e.target.value)} className={INP} placeholder="الاسم" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LBL}>التاريخ</label>
                <input type="datetime-local" value={form.order_date} onChange={e => set('order_date', e.target.value)} className={INP} />
              </div>
              <div>
                <label className={LBL}>الحالة</label>
                <select value={form.status} onChange={e => set('status', e.target.value)} className={INP}>
                  {Object.entries(STATUSES).map(([k, v]) => (
                    <option key={k} value={k}>{v.icon} {v.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Customer */}
          <div className="space-y-3">
            <p className="text-xs font-extrabold text-muted uppercase tracking-wider">👤 العميل</p>
            <input value={form.customer_name} onChange={e => set('customer_name', e.target.value)} className={INP} placeholder="اسم العميل *" />
            <div className="grid grid-cols-2 gap-3">
              <input value={form.phone_1} onChange={e => set('phone_1', e.target.value)} className={INP} placeholder="الهاتف 1" />
              <input value={form.phone_2} onChange={e => set('phone_2', e.target.value)} className={INP} placeholder="الهاتف 2" />
            </div>
            <input value={form.wa_number} onChange={e => set('wa_number', e.target.value)} className={INP}
              placeholder={`واتساب ${form.market === 'turkey' ? '(بدون +90)' : '(بدون +963)'}`} />
            <div className={`grid gap-3 ${form.market === 'turkey' ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <input value={form.city} onChange={e => set('city', e.target.value)} className={INP}
                placeholder="المدينة (اختر أو اكتب)" list="city-suggestions" autoComplete="off" />
              <datalist id="city-suggestions">
                {citiesForMarket(form.market).map(c => <option key={c} value={c} />)}
              </datalist>
              {form.market === 'turkey' && (
                <input value={form.district} onChange={e => set('district', e.target.value)} className={INP} placeholder="المنطقة / الحي" />
              )}
            </div>
            <input value={form.address} onChange={e => set('address', e.target.value)} className={INP} placeholder="العنوان التفصيلي" />
          </div>

          {/* Products */}
          <div className="space-y-3">
            <p className="text-xs font-extrabold text-muted uppercase tracking-wider">📦 المنتجات</p>
            {items.map((item, i) => (
              <ItemRow key={i} item={item} index={i} onChange={changeItem} onRemove={removeItem} products={products} />
            ))}
            <button onClick={addItem}
              className="w-full py-2 rounded-xl border-2 border-dashed border-teal/30 text-teal text-sm font-semibold hover:border-teal/60 hover:bg-teal/5 transition">
              + أضف منتج
            </button>
          </div>

          {/* Financial */}
          <div className="space-y-3">
            <p className="text-xs font-extrabold text-muted uppercase tracking-wider">💰 المالية</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className={LBL}>المبلغ الإجمالي</label>
                <input type="number" inputMode="decimal" value={form.amount}
                  onChange={e => set('amount', e.target.value)}
                  className={INP} placeholder="0" style={{ direction: 'ltr', textAlign: 'right' }} />
              </div>
              <div>
                <label className={LBL}>العملة</label>
                {form.market === 'turkey' ? (
                  <div className="border border-border rounded-xl px-3 py-2.5 text-sm bg-surface-alt text-muted">TRY</div>
                ) : (
                  <select value={form.currency} onChange={e => set('currency', e.target.value)} className={INP}>
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LBL}>طريقة الدفع</label>
                <input value={form.payment_method} onChange={e => set('payment_method', e.target.value)} className={INP} />
              </div>
              <div>
                <label className={LBL}>حالة الدفع</label>
                <select value={form.payment_status} onChange={e => set('payment_status', e.target.value)} className={INP}>
                  <option value="unpaid">⏳ غير مدفوع</option>
                  <option value="partial">💳 مدفوع جزئياً</option>
                  <option value="paid">💰 مدفوع كامل</option>
                </select>
              </div>
            </div>
            {/* Partial payment detail */}
            {form.payment_status === 'partial' && (
              <div className="bg-amber-bg border border-amber/30 rounded-xl p-3 space-y-2">
                <div>
                  <label className={LBL}>المبلغ المدفوع الآن</label>
                  <input type="number" inputMode="decimal" value={form.paid_amount}
                    onChange={e => set('paid_amount', e.target.value)}
                    className={INP} placeholder="0" style={{ direction: 'ltr', textAlign: 'right' }} />
                </div>
                {remaining !== null && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted">المتبقّي للتحصيل:</span>
                    <span className="font-bold text-amber-fg">{remaining} {form.currency}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Shipping */}
          <div className="space-y-3">
            <p className="text-xs font-extrabold text-muted uppercase tracking-wider">🚚 الشحن</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LBL}>شركة الشحن</label>
                <select value={form.shipping_company} onChange={e => set('shipping_company', e.target.value)} className={INP}>
                  {companies.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={LBL}>نوع الاستلام</label>
                <select value={form.pickup_type} onChange={e => set('pickup_type', e.target.value)} className={INP}>
                  {PICKUP_TYPES.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>
            {form.market === 'turkey' && (
              <div>
                <label className={LBL}>رقم التتبع</label>
                <div className="flex gap-2">
                  <input value={form.tracking_number} onChange={e => set('tracking_number', e.target.value)}
                    className={`${INP} flex-1`} placeholder="مثال: 6422898622431" />
                  {form.tracking_number && trackingLink(form.shipping_company, form.tracking_number) && (
                    <a href={trackingLink(form.shipping_company, form.tracking_number)} target="_blank" rel="noreferrer"
                      className="px-3 py-2 rounded-xl bg-blue-100 text-blue-700 text-xs font-bold hover:opacity-80 transition shrink-0">
                      🔍 تتبع
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className={LBL}>ملاحظات</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              rows={2} className={`${INP} resize-none`} placeholder="أي ملاحظة على الطلب..." />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-border/40 shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted hover:text-text transition">إلغاء</button>
          <button onClick={handleSave} disabled={!form.customer_name.trim() || saving}
            className="flex-1 py-2.5 rounded-xl bg-teal text-white text-sm font-bold disabled:opacity-40 hover:bg-teal/90 transition">
            {saving ? '…جاري الحفظ' : isEdit ? '✓ حفظ التعديلات' : '✓ إنشاء الطلب'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Seller Stats Card ─────────────────────────────────────────
function SellerStatsCard({ orders, userName, commissionPct }) {
  const delivered = useMemo(() =>
    orders.filter(o => o.status === 'delivered' && o.handler_name === userName),
  [orders, userName]);

  const totals = useMemo(() => delivered.reduce((acc, o) => {
    if (!o.amount) return acc;
    const c = o.currency || 'USD';
    acc[c] = (acc[c] || 0) + Number(o.amount);
    return acc;
  }, {}), [delivered]);

  const hasData = Object.keys(totals).length > 0;

  return (
    <div className="bg-gradient-to-br from-teal/10 to-navy/5 border border-teal/20 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-text">📊 مبيعاتي المسلّمة</h3>
        {commissionPct > 0 && (
          <span className="text-[10px] font-bold text-teal bg-teal/10 px-2 py-0.5 rounded-full">
            عمولة {commissionPct}%
          </span>
        )}
      </div>

      {!hasData ? (
        <p className="text-xs text-muted text-center py-2">لا توجد طلبات مسلّمة بعد</p>
      ) : (
        <div className="space-y-2">
          {Object.entries(totals).map(([currency, total]) => {
            const commission = commissionPct > 0 ? (total * commissionPct / 100).toFixed(0) : null;
            return (
              <div key={currency} className="flex justify-between items-center bg-surface rounded-xl px-3 py-2">
                <span className="text-xs font-bold text-muted">{currency}</span>
                <div className="text-right">
                  <div className="text-sm font-black text-text">{total.toFixed(0)} {currency}</div>
                  {commission && (
                    <div className="text-[10px] text-teal font-semibold">عمولتي: {commission} {currency}</div>
                  )}
                </div>
              </div>
            );
          })}
          <p className="text-[10px] text-muted text-center">{delivered.length} طلب مسلّم</p>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Main Screen
// ══════════════════════════════════════════════════════════════
export default function OrdersScreen() {
  const { role, team, name: userName, order_role, order_market } = useAuth();

  const isManager        = [ROLES.MANAGER, ROLES.ADMIN, ROLES.SALES_MANAGER].includes(role);
  const isFulfillment    = order_role === 'fulfillment';
  const userMarket       = order_market ?? teamToMarket(team) ?? null;
  const canAdvanceOrders = isFulfillment || isManager;

  const [orders,        setOrders]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [market,        setMarket]        = useState(userMarket ?? 'all');
  const [status,        setStatus]        = useState(isFulfillment ? 'pending' : 'all');
  const [search,        setSearch]        = useState('');
  const [modal,         setModal]         = useState(null);    // null | 'new' | order
  const [invoice,       setInvoice]       = useState(null);    // order | null
  const [myOrders,      setMyOrders]      = useState(false);   // «طلباتي» toggle
  const [commissionPct, setCommissionPct] = useState(0);

  // Load commission_pct for current seller
  useEffect(() => {
    if (!userName) return;
    supabase.from('profiles')
      .select('commission_pct')
      .eq('employee_name', userName)
      .maybeSingle()
      .then(({ data }) => { if (data?.commission_pct != null) setCommissionPct(Number(data.commission_pct)); })
      .catch(() => {});
  }, [userName]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from('orders').select('*').order('order_date', { ascending: false });
      if (!isManager && userMarket) q = q.eq('market', userMarket);
      const { data } = await q;
      setOrders(data ?? []);
    } catch {}
    finally { setLoading(false); }
  }, [isManager, userMarket]);

  useEffect(() => { load(); }, [load]);

  // Auto-retry: re-sync Syria orders that never reached the sheet
  useEffect(() => {
    const pending = orders.filter(o => o.market === 'syria' && o.sheet_synced !== true);
    if (pending.length === 0) return;
    pending.slice(0, 20).forEach(o => syncOrderToSheet(o.id));
  }, [orders]);

  const handleStatusChange = async (id, newStatus) => {
    await supabase.from('orders').update({ status: newStatus }).eq('id', id);
    const order = orders.find(o => o.id === id);
    setOrders(p => p.map(o => o.id === id ? { ...o, status: newStatus } : o));
    // Notify the seller their order advanced (best-effort, fire-and-forget)
    if (order) notifySellerStatusChange(order, newStatus, userName);
    // Cancelling releases reserved stock back to the source warehouse
    if (order && newStatus === 'cancelled') releaseForOrder({ ...order, status: newStatus }, userName);
  };

  const handleSave = async (form, existingId) => {
    let savedId = existingId;
    if (existingId) {
      await supabase.from('orders').update(form).eq('id', existingId);
    } else {
      const { data } = await supabase.from('orders').insert(form).select('id').single();
      savedId = data?.id;
    }
    setModal(null);
    load();
    if (savedId && form.market === 'syria') syncOrderToSheet(savedId);
    // Phase 2: reserve stock for NEW lowes-brand orders (best-effort).
    // Deducts catalog items from the seller's source warehouse.
    if (savedId && !existingId) {
      reserveForOrder({ id: savedId, ...form }, userName);
    }
  };

  const filtered = useMemo(() => orders.filter(o => {
    if (myOrders && o.handler_name !== userName) return false;
    if (market !== 'all' && o.market !== market) return false;
    if (status !== 'all' && o.status !== status) return false;
    if (search) {
      const q = search.toLowerCase();
      return o.customer_name?.toLowerCase().includes(q) ||
             o.order_id?.toLowerCase().includes(q) ||
             o.phone_1?.includes(q);
    }
    return true;
  }), [orders, market, status, search, myOrders, userName]);

  const stats = useMemo(() => ({
    total:      orders.length,
    pending:    orders.filter(o => o.status === 'pending').length,
    preparing:  orders.filter(o => o.status === 'preparing').length,
    ready:      orders.filter(o => o.status === 'ready').length,
    shipped:    orders.filter(o => o.status === 'shipped').length,
    delivered:  orders.filter(o => o.status === 'delivered').length,
    actionable: orders.filter(o => ['pending', 'preparing', 'ready'].includes(o.status)).length,
    myDelivered: orders.filter(o => o.status === 'delivered' && o.handler_name === userName).length,
  }), [orders, userName]);

  return (
    <div className="space-y-4 pb-24 sm:pb-8" dir="rtl">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-text">
            {isFulfillment ? '📦 طلبات التجهيز' : 'إدارة الطلبات'}
          </h1>
          <p className="text-xs text-muted mt-0.5">
            {isFulfillment
              ? `${stats.actionable} طلب يحتاج عملك · ${stats.delivered} تم توصيله`
              : `${stats.total} طلب · ${stats.pending} وارد · ${stats.shipped} في الشحن`}
          </p>
        </div>
        {!isFulfillment && (
          <button onClick={() => setModal('new')}
            className="px-4 py-2.5 rounded-xl bg-teal text-white text-sm font-bold hover:bg-teal/90 transition shadow-sm flex items-center gap-2 shrink-0">
            + طلب جديد
          </button>
        )}
      </div>

      {/* «طلباتي» / «كل الطلبات» toggle */}
      {!isFulfillment && (
        <div className="flex gap-2">
          <button onClick={() => setMyOrders(false)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition
              ${!myOrders ? 'border-navy bg-navy text-white' : 'border-border text-muted hover:border-navy/40'}`}>
            🌍 كل الطلبات
          </button>
          <button onClick={() => setMyOrders(true)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition
              ${myOrders ? 'border-teal bg-teal text-white' : 'border-border text-muted hover:border-teal/40'}`}>
            👤 طلباتي{stats.myDelivered > 0 ? ` · ${stats.myDelivered} ✅` : ''}
          </button>
        </div>
      )}

      {/* Seller stats — visible when in «طلباتي» mode */}
      {myOrders && !isFulfillment && (
        <SellerStatsCard orders={orders} userName={userName} commissionPct={commissionPct} />
      )}

      {/* Fulfillment banner */}
      {isFulfillment && stats.pending > 0 && (
        <div className="bg-amber-bg border border-amber/30 rounded-2xl px-4 py-3 flex items-center gap-3">
          <span className="text-2xl">📥</span>
          <div>
            <p className="text-sm font-bold text-amber-fg">{stats.pending} طلب وارد ينتظر التجهيز</p>
            <p className="text-xs text-muted">اضغط على الطلب للبدء بالفرز والتغليف</p>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'وارد',  value: stats.pending,                  color: 'text-muted',    bg: 'bg-surface-alt', onClick: () => setStatus('pending')   },
          { label: 'تجهيز', value: stats.preparing + stats.ready,  color: 'text-amber-fg', bg: 'bg-amber-bg',    onClick: () => setStatus('preparing') },
          { label: 'شحن',   value: stats.shipped,                   color: 'text-blue-700', bg: 'bg-blue-50',     onClick: () => setStatus('shipped')   },
          { label: 'وصل',   value: stats.delivered,                 color: 'text-green-fg', bg: 'bg-green-bg',    onClick: () => setStatus('delivered') },
        ].map(s => (
          <button key={s.label} onClick={s.onClick}
            className={`${s.bg} rounded-2xl p-3 text-center hover:opacity-80 transition cursor-pointer`}>
            <p className={`text-xl font-extrabold tabular-nums ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-muted mt-0.5 font-medium">{s.label}</p>
          </button>
        ))}
      </div>

      {/* Market tabs — managers only, when not in «طلباتي» */}
      {isManager && !myOrders && (
        <div className="flex gap-2">
          {[{ key: 'all', label: 'الكل', icon: '🌍' }, { key: 'turkey', label: 'تركيا', icon: '🇹🇷' }, { key: 'syria', label: 'سوريا', icon: '🇸🇾' }].map(m => (
            <button key={m.key} onClick={() => setMarket(m.key)}
              className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition
                ${market === m.key ? 'border-navy bg-navy text-white' : 'border-border text-muted hover:border-navy/40'}`}>
              {m.icon} {m.label}
            </button>
          ))}
        </div>
      )}

      {/* Status filter */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        <button onClick={() => setStatus('all')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition
            ${status === 'all' ? 'bg-text text-surface' : 'bg-surface border border-border text-muted'}`}>
          الكل
        </button>
        {Object.entries(STATUSES).map(([k, v]) => (
          <button key={k} onClick={() => setStatus(k)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition border
              ${status === k ? `${v.bg} ${v.text} ${v.border}` : 'bg-surface border-border text-muted'}`}>
            {v.icon} {v.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="🔍 بحث بالاسم أو رقم الطلب أو الهاتف..."
        className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-teal/30" />

      {/* List */}
      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-36 bg-surface-alt animate-pulse rounded-2xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted border-2 border-dashed border-border rounded-2xl">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-sm font-bold">{myOrders ? 'لا توجد طلبات باسمك بعد' : 'لا توجد طلبات'}</p>
          {!myOrders && (
            <button onClick={() => setModal('new')}
              className="mt-4 px-4 py-2 rounded-xl bg-teal/10 text-teal text-sm font-bold hover:bg-teal/20 transition">
              + أضف أول طلب
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(o => (
            <OrderCard key={o.id} order={o}
              canAdvance={canAdvanceOrders}
              onStatusChange={handleStatusChange}
              onEdit={(o) => setModal(o)}
              onInvoice={(o) => setInvoice(o)} />
          ))}
        </div>
      )}

      {/* FAB */}
      <button onClick={() => setModal('new')}
        className="fixed bottom-24 end-5 z-40 w-14 h-14 rounded-full bg-navy text-white shadow-2xl flex items-center justify-center text-2xl hover:bg-navy/90 active:scale-95 transition-transform md:bottom-8"
        aria-label="طلب جديد">
        +
      </button>

      {/* Order Form Modal */}
      {modal && (
        <OrderFormModal
          order={modal === 'new' ? null : modal}
          allOrders={orders}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}

      {/* Invoice Modal */}
      {invoice && (
        <InvoiceModal order={invoice} onClose={() => setInvoice(null)} />
      )}
    </div>
  );
}
