// =============================================================
// FulfillmentBoard — لوحة التجهيز اليومية للمجهّز (per-market)
// «طلبات اليوم + متأخرات» · تجميع حسب جهة الإرسال · تأشير فردي/جماعي
// بخطوتين (بدء التجهيز ← تم التجهيز) · طباعة قائمة تجهيز.
// التأشير الجماعي متسلسل (درس عاصفة مزامنة الجدول — لا استدعاءات متوازية).
// =============================================================
import { useState, useMemo } from 'react';
import { STATUSES } from '@data/orderStatus';
import { labelEligible, openLabelsPrint } from '@services/labelPrint';
import { printShippingLabel } from '@utils/printShippingLabel';

// الحالات التي تعني «الطلب على طاولة المجهّز»
const ACTIONABLE = ['pending', 'preparing', 'motor_prep'];

const isMotor = (o) => /موتور|ميتور/.test(String(o.shipping_company || ''));
const isCenterPickup = (o) => String(o.pickup_type || '').includes('استلام من المركز');

// الخطوة التالية لكل طلب حسب حالته وسوقه وجهة إرساله.
export function nextStatusFor(o) {
  if (o.status === 'pending') {
    // بدء التجهيز
    return (o.market === 'turkey' && isMotor(o)) ? 'motor_prep' : 'preparing';
  }
  // تم التجهيز → خرج من المخزن
  if (o.market === 'syria') return 'shipped';
  if (isMotor(o)) return 'motor';
  if (isCenterPickup(o)) return 'at_center';
  return 'shipped';
}

const actionLabel = (o) => o.status === 'pending' ? '📦 بدء التجهيز' : '✅ تم التجهيز';

// مفتاح المجموعة: موتور / اسم شركة الشحن / استلام من المركز / غير محدد.
function groupKeyFor(o) {
  if (isMotor(o)) return '🏍️ توصيل الموتور';
  const co = String(o.shipping_company || '').trim();
  if (co) return `🚚 ${co}`;
  if (isCenterPickup(o)) return '🏢 استلام من المركز';
  return '❓ غير محدد';
}

const dayKey = () => new Date().toISOString().slice(0, 10);
const ageDays = (o) => {
  const od = (o.order_date || o.created_at || '').slice(0, 10);
  if (!od) return 0;
  return Math.max(0, Math.round((new Date(dayKey()) - new Date(od)) / 86400000));
};

// عدّاد إنجاز اليوم — localStorage لكل مستخدم/يوم.
const doneKey = (user) => `fulfill_done_${user}_${dayKey()}`;
const getDoneToday = (user) => Number(localStorage.getItem(doneKey(user)) || 0);
const bumpDoneToday = (user, n = 1) => {
  const v = getDoneToday(user) + n;
  localStorage.setItem(doneKey(user), String(v));
  return v;
};

// وضع «العرض الواضح» — لعامل التغليف ضعيف النظر (سوريا). تفضيل ثابت بين الجلسات.
// المنتجات تحت بعض، مسطّرة، خط كبير، والعدد رقم كبير واضح.
const A11Y_KEY = 'fulfillment_accessible_mode';
const getA11y = () => localStorage.getItem(A11Y_KEY) === '1';
const setA11y = (on) => localStorage.setItem(A11Y_KEY, on ? '1' : '0');

// قائمة منتجات الطلب — عادية (مضغوطة) أو «واضحة» (عمودية كبيرة مسطّرة).
function ProductList({ items, accessible }) {
  if (!items || items.length === 0) {
    return <span className="text-[11px] text-muted">بلا منتجات مسجّلة — راجع الملاحظات</span>;
  }
  if (accessible) {
    return (
      <div className="mt-2 rounded-xl border-2 border-border overflow-hidden divide-y-2 divide-border">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5 bg-surface-alt/40">
            <span className="text-3xl font-black text-teal tabular-nums min-w-[2.75rem] text-center leading-none">{it.qty || 1}</span>
            <span className="text-xl font-bold text-text leading-snug flex-1 break-words">{it.name}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {items.map((it, i) => (
        <span key={i} className="text-[11px] bg-surface-alt border border-border rounded-lg px-2 py-0.5 font-semibold text-text">
          {it.qty || 1}× {it.name}
        </span>
      ))}
    </div>
  );
}

// تنسيق منتجات صفّ الطباعة — مسطّر عمودي (للعرض الواضح) أو سطر واحد مضغوط.
const printItems = (items, accessible) => {
  if (!items || items.length === 0) return '—';
  if (accessible) {
    return `<div class="plist">${items.map(it =>
      `<div class="prow"><b class="pqty">${it.qty || 1}</b><span class="pname">${it.name || ''}</span></div>`).join('')}</div>`;
  }
  return items.map(it => `${it.qty || 1}× ${it.name}`).join(' · ');
};

// ── طباعة قائمة التجهيز (نافذة جديدة) ─────────────────────────
function printPrepList(groups, marketLabel, accessible = false) {
  const w = window.open('', '_blank', 'width=800,height=900');
  if (!w) { window.alert('فعّل النوافذ المنبثقة للطباعة'); return; }
  const rows = groups.map(([gname, list]) => `
    <h2>${gname} — ${list.length} طلب</h2>
    <table>
      <tr><th>✓</th><th>الطلب</th><th>العميل</th><th>المدينة</th><th>المنتجات</th></tr>
      ${list.map(o => `
        <tr>
          <td class="chk">☐</td>
          <td>${o.order_id || o.id?.slice(0, 6) || ''}</td>
          <td>${o.customer_name || '—'}</td>
          <td>${o.city || '—'}</td>
          <td>${printItems(o.items, accessible)}</td>
        </tr>`).join('')}
    </table>`).join('');
  w.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
    <title>قائمة التجهيز — ${dayKey()}</title>
    <style>
      body{font-family:Tajawal,Arial,sans-serif;padding:24px;color:#111}
      h1{font-size:20px;margin:0 0 4px} .sub{color:#666;font-size:12px;margin-bottom:16px}
      h2{font-size:15px;background:#f1f5f9;padding:6px 10px;border-radius:8px;margin:18px 0 6px}
      table{width:100%;border-collapse:collapse;font-size:${accessible ? '15px' : '12px'}}
      th,td{border:1px solid #ddd;padding:${accessible ? '8px 10px' : '5px 8px'};text-align:right;vertical-align:top}
      th{background:#fafafa} .chk{width:26px;text-align:center;font-size:15px}
      .plist{display:flex;flex-direction:column}
      .prow{display:flex;align-items:center;gap:10px;padding:4px 0;border-bottom:1.5px solid #e5e7eb}
      .prow:last-child{border-bottom:0}
      .pqty{font-size:22px;font-weight:800;color:#0d7377;min-width:34px;text-align:center}
      .pname{font-size:17px;font-weight:700}
      @media print{h2{break-after:avoid}}
    </style></head><body>
    <h1>📦 قائمة التجهيز — ${marketLabel}</h1>
    <p class="sub">${new Date().toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
    ${rows}
    <script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}

// ── كرت طلب مضغوط للتجهيز ──────────────────────────────────────
function PrepCard({ o, checked, onCheck, onAdvance, busy, accessible }) {
  const meta = STATUSES[o.status] || {};
  const age = ageDays(o);
  return (
    <div className={`bg-surface border rounded-2xl p-3 flex items-start gap-3 ${checked ? 'border-teal ring-1 ring-teal/30' : 'border-border'}`}>
      <input type="checkbox" checked={checked} onChange={e => onCheck(o.id, e.target.checked)}
        className={`mt-1.5 accent-teal shrink-0 cursor-pointer ${accessible ? 'w-7 h-7' : 'w-5 h-5'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`font-bold text-text ${accessible ? 'text-lg' : 'text-sm'}`}>{o.customer_name || '—'}</p>
          <span className="text-[10px] text-muted font-mono">{o.order_id}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${meta.bg} ${meta.text}`}>{meta.icon} {meta.label}</span>
          {age >= 1 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-red-bg text-red-fg">⏰ متأخر {age} يوم</span>
          )}
        </div>
        <p className="text-[11px] text-muted mt-0.5">
          {o.city || '—'}{o.pickup_type ? ` · ${o.pickup_type}` : ''} · البائع: {o.handler_name || '—'}
        </p>
        {/* المنتجات — جوهر عمل المجهّز */}
        <ProductList items={o.items} accessible={accessible} />
        {o.notes && <p className={`text-muted mt-1 ${accessible ? 'text-sm mt-2' : 'text-[10px] line-clamp-1'}`}>📝 {o.notes}</p>}
      </div>
      <div className="shrink-0 flex flex-col gap-1.5">
        <button onClick={() => onAdvance(o)} disabled={busy}
          className={`px-3 py-2 rounded-xl text-xs font-bold transition disabled:opacity-40 ${
            o.status === 'pending' ? 'bg-amber-fg/10 text-amber-fg hover:bg-amber-fg/20' : 'bg-teal text-navy hover:bg-teal/90'}`}>
          {actionLabel(o)}
        </button>
        {labelEligible(o) && (
          <button onClick={() => printShippingLabel(o)}
            title="طباعة بوليصة الشحن لهذا الطلب"
            className="px-3 py-1.5 rounded-xl bg-[#fdfaf2] border border-[#C9A646]/50 text-[#8a6d1f] text-xs font-bold hover:bg-[#faf3df] transition">
            🖨️ بوليصة
          </button>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
export default function FulfillmentBoard({ orders, market, userName, onAdvance, onAdvanceBatch, loading, onExit, canExit }) {
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch]     = useState('');
  const [collapsed, setCollapsed] = useState(new Set());
  const [busy, setBusy]         = useState(false);
  const [progress, setProgress] = useState(null); // {done,total}
  const [doneToday, setDoneToday] = useState(() => getDoneToday(userName));
  const [accessible, setAccessibleState] = useState(getA11y);
  const toggleAccessible = () => setAccessibleState(v => { const nv = !v; setA11y(nv); return nv; });

  const marketLabel = market === 'syria' ? '🇸🇾 سوريا' : market === 'turkey' ? '🇹🇷 تركيا' : '🌍 كل الأسواق';

  // طابور التجهيز: سوقي فقط + الحالات القابلة للعمل.
  const queue = useMemo(() => orders.filter(o =>
    ACTIONABLE.includes(o.status) &&
    o.archived !== true && !o.deleted_at &&
    (market === 'all' || o.market === market) &&
    (!search || o.customer_name?.toLowerCase().includes(search.toLowerCase())
      || o.order_id?.toLowerCase().includes(search.toLowerCase())
      || (o.items || []).some(it => String(it.name || '').toLowerCase().includes(search.toLowerCase())))
  ), [orders, market, search]);

  // الطلبات الجاهزة لطباعة بوليصة الشحن (سوريا: وارد جديد · تركيا: تحضير الموتور)
  const labelReady   = useMemo(() => queue.filter(labelEligible), [queue]);
  const todayCount   = useMemo(() => queue.filter(o => ageDays(o) === 0).length, [queue]);
  const backlog      = useMemo(() => queue.filter(o => ageDays(o) >= 1), [queue]);
  const oldestAge    = useMemo(() => backlog.reduce((m, o) => Math.max(m, ageDays(o)), 0), [backlog]);

  // المجموعات حسب جهة الإرسال (الأكبر أولاً، والمتأخر أولاً داخل كل مجموعة).
  const groups = useMemo(() => {
    const map = {};
    for (const o of queue) (map[groupKeyFor(o)] ??= []).push(o);
    Object.values(map).forEach(list => list.sort((a, b) => ageDays(b) - ageDays(a)));
    return Object.entries(map).sort((a, b) => b[1].length - a[1].length);
  }, [queue]);

  const toggleCheck = (id, on) => setSelected(prev => {
    const s = new Set(prev); on ? s.add(id) : s.delete(id); return s;
  });
  const selectGroup = (list, on) => setSelected(prev => {
    const s = new Set(prev); list.forEach(o => on ? s.add(o.id) : s.delete(o.id)); return s;
  });
  const toggleCollapse = (g) => setCollapsed(prev => {
    const s = new Set(prev); s.has(g) ? s.delete(g) : s.add(g); return s;
  });

  // تأشير فردي
  const advanceOne = async (o) => {
    const next = nextStatusFor(o);
    setBusy(true);
    try {
      await onAdvance(o.id, next);
      if (o.status !== 'pending') setDoneToday(bumpDoneToday(userName)); // «تم التجهيز» فقط يُحسب إنجازاً
      setSelected(prev => { const s = new Set(prev); s.delete(o.id); return s; });
    } finally { setBusy(false); }
  };

  // تأشير جماعي — متسلسل، مع تأكيد واحد وشريط تقدّم.
  const advanceSelected = async () => {
    const list = queue.filter(o => selected.has(o.id));
    if (!list.length) return;
    const starts = list.filter(o => o.status === 'pending').length;
    const dones  = list.length - starts;
    const msg = [
      `ترحيل ${list.length} طلب للخطوة التالية:`,
      starts ? `· ${starts} وارد → في التجهيز` : null,
      dones  ? `· ${dones} مجهّز → خرج للشحن/الموتور` : null,
    ].filter(Boolean).join('\n');
    if (!window.confirm(msg)) return;
    setBusy(true); setProgress({ done: 0, total: list.length });
    try {
      const finished = await onAdvanceBatch(list, nextStatusFor, (done, total) => setProgress({ done, total }));
      const doneCount = list.filter(o => o.status !== 'pending').length;
      if (doneCount) setDoneToday(bumpDoneToday(userName, doneCount));
      setSelected(new Set());
      if (finished?.failed > 0) window.alert(`⚠️ ${finished.failed} طلب لم تنجح مزامنته مع الجدول — راجعها من القائمة.`);
    } finally { setBusy(false); setProgress(null); }
  };

  return (
    <div className="space-y-4">
      {/* الرأس اليومي */}
      <div className="bg-navy rounded-2xl p-4 text-white">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-extrabold text-base">📦 تجهيز اليوم — {marketLabel}</h2>
            <p className="text-xs text-white/70 mt-0.5">
              {queue.length} طلب بالطابور · {todayCount} وارد اليوم
              {backlog.length > 0 && ` · ${backlog.length} متأخّر (أقدمها ${oldestAge} يوم)`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={toggleAccessible}
              title={accessible ? 'إيقاف العرض الواضح' : 'تفعيل العرض الواضح (خط كبير ومنتجات مسطّرة)'}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition ${accessible ? 'bg-teal text-navy' : 'bg-white/15 text-white hover:bg-white/25'}`}>
              👁️ {accessible ? 'واضح ✓' : 'عرض واضح'}
            </button>
            {labelReady.length > 0 && (
              <button onClick={() => openLabelsPrint(labelReady)}
                title="طباعة بوليصات الشحن للطلبات الجاهزة (سوريا: وارد جديد · تركيا: تحضير الموتور) — A4، 8 بوليصات بالصفحة"
                className="px-3 py-2 rounded-xl bg-[#C9A646] text-white text-xs font-extrabold hover:bg-[#b8963d] transition shadow-sm">
                🖨️ بوليصات ({labelReady.length})
              </button>
            )}
            {queue.length > 0 && (
              <button onClick={() => printPrepList(groups, marketLabel, accessible)}
                title="طباعة قائمة التجهيز (المنتجات المطلوب تحضيرها)"
                className="px-3 py-2 rounded-xl bg-white/15 text-white text-xs font-bold hover:bg-white/25 transition">
                📋 قائمة التجهيز
              </button>
            )}
            {canExit && (
              <button onClick={onExit}
                className="px-3 py-2 rounded-xl bg-white/15 text-white text-xs font-bold hover:bg-white/25 transition">
                📋 القائمة الكاملة
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-3 mt-3">
          <div className="bg-white/10 rounded-xl px-3 py-1.5 text-center flex-1">
            <p className="text-[10px] text-white/70">بالطابور</p>
            <p className="text-lg font-black">{queue.length}</p>
          </div>
          <div className={`rounded-xl px-3 py-1.5 text-center flex-1 ${backlog.length ? 'bg-red-500/30' : 'bg-white/10'}`}>
            <p className="text-[10px] text-white/70">متأخرات</p>
            <p className="text-lg font-black">{backlog.length}</p>
          </div>
          <div className="bg-emerald-500/25 rounded-xl px-3 py-1.5 text-center flex-1">
            <p className="text-[10px] text-white/70">أنجزت اليوم</p>
            <p className="text-lg font-black">{doneToday} ✅</p>
          </div>
        </div>
      </div>

      {/* بحث سريع */}
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 بحث: عميل / رقم طلب / منتج…"
        className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-teal/30" />

      {/* شريط التأشير الجماعي */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-30 bg-navy text-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-xl">
          <p className="text-sm font-bold flex-1">{selected.size} طلب محدّد</p>
          {progress && <p className="text-xs text-white/80">{progress.done}/{progress.total}…</p>}
          <button onClick={advanceSelected} disabled={busy}
            className="px-4 py-2 rounded-xl bg-teal text-navy text-xs font-extrabold hover:bg-teal/90 transition disabled:opacity-40">
            {busy ? '⏳ جارٍ الترحيل…' : '⏭️ رحّل المحدد'}
          </button>
          <button onClick={() => setSelected(new Set())} disabled={busy}
            className="px-3 py-2 rounded-xl bg-white/15 text-white text-xs font-bold hover:bg-white/25 transition">إلغاء</button>
        </div>
      )}

      {/* المجموعات */}
      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-28 bg-surface-alt animate-pulse rounded-2xl" />)}</div>
      ) : queue.length === 0 ? (
        <div className="text-center py-16 text-muted border-2 border-dashed border-border rounded-2xl">
          <p className="text-4xl mb-3">🎉</p>
          <p className="text-sm font-bold">لا طلبات بانتظار التجهيز — كل شيء مجهّز!</p>
        </div>
      ) : groups.map(([gname, list]) => {
        const isCollapsed = collapsed.has(gname);
        const allChecked = list.every(o => selected.has(o.id));
        return (
          <div key={gname} className="space-y-2">
            <div className="flex items-center gap-2 bg-surface-alt border border-border rounded-xl px-3 py-2">
              <input type="checkbox" checked={allChecked} onChange={e => selectGroup(list, e.target.checked)}
                className="w-4 h-4 accent-teal cursor-pointer" title="تحديد المجموعة كاملة" />
              <button onClick={() => toggleCollapse(gname)} className="flex-1 flex items-center justify-between text-start">
                <span className="text-sm font-extrabold text-text">{gname}</span>
                <span className="text-xs text-muted font-bold">{list.length} طلب {isCollapsed ? '▼' : '▲'}</span>
              </button>
            </div>
            {!isCollapsed && list.map(o => (
              <PrepCard key={o.id} o={o} checked={selected.has(o.id)} onCheck={toggleCheck} onAdvance={advanceOne} busy={busy} accessible={accessible} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
