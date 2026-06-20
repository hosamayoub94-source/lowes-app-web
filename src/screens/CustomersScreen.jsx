// =============================================================
// CustomersScreen — «العملاء والأرشيف» + retention engine (everyone).
// Sections (Syria/Turkey/Strong/All) · segments (follow-up/at-risk/
// win-back) · notes · cross-sell suggestions · reorder cycle ·
// loyalty tier · WhatsApp with editable / AI-written message.
// =============================================================
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  listCustomers, countCustomers, starLabel, customerWaLink, followupMessage,
  sellerMatches, daysSince, getNotes, addNote,
  getCustomerOrders, boughtProductNames, aiFollowupMessage,
  sellerVariants, canonicalSeller, exportMetaCSV, getSellerAliases,
} from '@services/customerService';
import { suggestComplements, REORDER_DAYS } from '@data/crossSell';
import { STATUSES } from '@data/orderStatus';
import { useAuth } from '@hooks/useAuth';
import { supabase } from '@services/supabase';
import { useNavigate } from 'react-router-dom';

const fmt = (n) => Number(n || 0).toLocaleString('en-US');

const SECTIONS = [
  { key: 'syria',  label: '🇸🇾 لويز سوريا', market: 'syria',  brand: 'lowes'  },
  { key: 'turkey', label: '🇹🇷 لويز تركيا', market: 'turkey', brand: 'lowes'  },
  { key: 'strong', label: '💪 سترونغ',       market: null,     brand: 'strong' },
  { key: 'all',    label: '🌍 الكل',          market: null,     brand: null     },
];

const SEGMENTS = [
  { key: 'all',      label: 'كل العملاء' },
  { key: 'followup', label: '⏰ للمتابعة (30+ يوم)' },
  { key: 'atrisk',   label: '⚠️ معرّضون للفقدان' },
  { key: 'winback',  label: '💔 استرجاع (90+ يوم)' },
];

function inSegment(c, seg) {
  const idle = daysSince(c.last_order);
  if (seg === 'followup') return idle >= 30;
  if (seg === 'atrisk')   return c.orders_count >= 2 && idle >= 45 && idle < 90;
  if (seg === 'winback')  return idle >= 90;
  return true;
}

function loyaltyTier(stars) {
  if (stars >= 3) return { label: '💎 بلاتيني', color: 'text-violet-700' };
  if (stars === 2) return { label: '🥇 ذهبي', color: 'text-amber-fg' };
  if (stars === 1) return { label: '🥈 فضي', color: 'text-muted' };
  return { label: '🌱 جديد', color: 'text-muted' };
}

function custMarket(c) {
  return (c.markets || []).includes('syria') ? 'syria'
       : (c.markets || []).includes('turkey') ? 'turkey' : 'syria';
}

function WaIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.138.561 4.14 1.541 5.876L.057 23.886a.5.5 0 00.606.617l6.218-1.632A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/>
    </svg>
  );
}

function CustomerModal({ c, sellerName, onClose }) {
  const navigate = useNavigate();
  const mkt = custMarket(c);
  const idle = daysSince(c.last_order);
  const tier = loyaltyTier(c.stars);

  const [notes, setNotes]   = useState([]);
  const [text, setText]     = useState('');
  const [saving, setSaving] = useState(false);

  const [bought, setBought] = useState([]);
  const [history, setHistory] = useState([]);
  const [lastOrder, setLastOrder] = useState(null);
  const [lastOrderDays, setLastOrderDays] = useState(idle);
  const [msg, setMsg]       = useState(followupMessage(c.name, sellerName));
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => { getNotes(c.phone_key).then(setNotes); }, [c.phone_key]);
  useEffect(() => {
    getCustomerOrders(c.phone_key || c.phone).then((orders) => {
      setHistory(orders);
      setBought(boughtProductNames(orders));
      setLastOrder(orders[0] || null);
      if (orders[0]?.order_date) setLastOrderDays(daysSince(orders[0].order_date));
    });
  }, [c.phone_key, c.phone]);

  // One-tap reorder: open a NEW order pre-filled with this customer's
  // details + their last order's products.
  const reorder = () => {
    const lo = lastOrder || {};
    navigate('/orders', { state: { reorder: {
      market: lo.market || mkt,
      brand:  lo.brand || 'lowes',
      customer_name: c.name || lo.customer_name || '',
      phone_1: c.phone || '',
      wa_number: lo.wa_number || '',
      city: c.city || lo.city || '',
      address: lo.address || '',
      items: Array.isArray(lo.items) && lo.items.length ? lo.items : [{ name: '', qty: 1 }],
    } } });
  };

  const suggestions = useMemo(() => suggestComplements(bought), [bought]);
  const reorderDue  = lastOrderDays >= REORDER_DAYS && bought.length > 0;

  // درل-داون «مين باع شو»: جمّع طلبات العميل حسب البائع، وحدّد المنتجات المكرّرة
  // (منتج ظهر بأكتر من طلب = احتمال بيع مكرّر لنفس العميل).
  const salesHistory = useMemo(() => {
    const bySeller = new Map();
    const productOrders = new Map(); // اسم المنتج (حروف صغيرة) → عدد الطلبات التي ظهر فيها
    for (const o of history) {
      const seller = canonicalSeller(o.handler_name) || '—';
      if (!bySeller.has(seller)) bySeller.set(seller, []);
      bySeller.get(seller).push(o);
      const seen = new Set();
      for (const it of (o.items || [])) {
        const nm = String(it?.name || '').trim().toLowerCase();
        if (!nm || seen.has(nm)) continue;
        seen.add(nm);
        productOrders.set(nm, (productOrders.get(nm) || 0) + 1);
      }
    }
    const repeated = new Set([...productOrders.entries()].filter(([, n]) => n >= 2).map(([k]) => k));
    const groups = [...bySeller.entries()]
      .map(([seller, orders]) => ({ seller, orders }))
      .sort((a, b) => b.orders.length - a.orders.length);
    return { groups, sellerCount: bySeller.size, repeated, total: history.length };
  }, [history]);

  const save = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try { const n = await addNote(c.phone_key, text, sellerName); setNotes(p => [n, ...p]); setText(''); }
    catch { /* تجاهل */ } finally { setSaving(false); }
  };

  const writeWithAi = async () => {
    setAiLoading(true);
    try {
      const out = await aiFollowupMessage({ customerName: c.name, products: bought, idleDays: idle, sellerName });
      if (out) setMsg(out);
    } finally { setAiLoading(false); }
  };

  const waSend  = customerWaLink(c.phone, mkt, msg);
  const waPlain = customerWaLink(c.phone, mkt);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-2 sm:p-4" dir="rtl" onClick={onClose}>
      <div className="bg-surface rounded-2xl w-full max-w-md shadow-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border/40 flex items-start justify-between gap-2 sticky top-0 bg-surface z-10">
          <div className="min-w-0">
            <h3 className="font-bold text-base text-text truncate">
              {c.stars > 0 && <span className="me-1">{starLabel(c.stars)}</span>}{c.name || 'عميل'}
            </h3>
            <p className="text-[11px] text-muted" dir="ltr">{c.phone}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-surface-alt flex items-center justify-center text-muted shrink-0">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Stats + loyalty */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-surface-alt rounded-xl p-2"><p className="text-lg font-extrabold text-teal">{c.orders_count}</p><p className="text-[10px] text-muted">طلب</p></div>
            <div className="bg-surface-alt rounded-xl p-2"><p className="text-sm font-bold text-text">{idle === Infinity ? '—' : idle}</p><p className="text-[10px] text-muted">يوم خمول</p></div>
            <div className="bg-surface-alt rounded-xl p-2"><p className={`text-xs font-bold ${tier.color}`}>{tier.label}</p><p className="text-[10px] text-muted">الولاء</p></div>
          </div>

          {/* Reorder + win-back nudges */}
          {idle >= 90 && (
            <div className="bg-red-bg border border-red/20 rounded-xl px-3 py-2 text-xs text-red-fg">
              💔 خامل {idle} يوم — أرسل عرض «اشتقنالك» (خصم/هدية استرجاع).
            </div>
          )}
          {idle >= 45 && idle < 90 && c.orders_count >= 2 && (
            <div className="bg-amber-bg border border-amber/30 rounded-xl px-3 py-2 text-xs text-amber-fg">
              ⚠️ عميل وفيّ بدأ يبتعد ({idle} يوم) — تواصل الآن قبل ما نخسره.
            </div>
          )}
          {reorderDue && (
            <div className="bg-teal/10 border border-teal/30 rounded-xl px-3 py-2 text-xs text-teal">
              🔁 مضى {lastOrderDays} يوم على آخر طلب — غالباً منتجه قارب يخلص. ذكّره بإعادة الطلب.
            </div>
          )}

          {/* One-tap reorder */}
          <button onClick={reorder}
            className="w-full py-2.5 rounded-xl bg-navy text-white text-sm font-bold hover:bg-navy/90 transition flex items-center justify-center gap-2">
            🛒 إعادة الطلب (طلب جديد بنفس بياناته)
          </button>

          {/* Cross-sell suggestions */}
          {suggestions.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-extrabold text-muted">💡 اقترح عليه (بيع مكمّل)</p>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map(s => (
                  <span key={s} className="text-[11px] bg-teal/10 text-teal font-semibold px-2 py-1 rounded-lg">{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* درل-داون: سجل المبيعات حسب البائع + كشف البيع المكرّر */}
          {salesHistory.total > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-extrabold text-muted">📜 سجل المبيعات — مين باع شو</p>
                {salesHistory.sellerCount > 1 && (
                  <span className="text-[11px] font-bold text-amber-fg bg-amber-bg border border-amber/30 rounded-lg px-2 py-0.5">
                    🔀 باعه {salesHistory.sellerCount} بائعين
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {salesHistory.groups.map(({ seller, orders }) => (
                  <div key={seller} className="bg-surface-alt rounded-xl p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-text">👤 {seller}</span>
                      <span className="text-[10px] text-muted">{orders.length} طلب</span>
                    </div>
                    {orders.map((o, i) => (
                      <div key={o.id || o.order_id || i} className="border-t border-border/40 pt-1.5 first:border-t-0 first:pt-0">
                        <div className="flex items-center justify-between text-[10px] text-muted">
                          <span dir="ltr">{o.order_id ? `#${o.order_id}` : ''} · {o.order_date ? new Date(o.order_date).toLocaleDateString('ar', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}</span>
                          <span className="flex items-center gap-1">
                            {Number(o.amount) > 0 && <span className="font-bold text-text">{fmt(o.amount)} {o.currency || ''}</span>}
                            {STATUSES[o.status] && <span title={STATUSES[o.status].label}>{STATUSES[o.status].icon}</span>}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(o.items || []).length === 0 ? (
                            <span className="text-[10px] text-muted">—</span>
                          ) : (o.items || []).map((it, k) => {
                            const nm = String(it?.name || '').trim();
                            const isRep = nm && salesHistory.repeated.has(nm.toLowerCase());
                            return (
                              <span key={k} className={`text-[10px] px-1.5 py-0.5 rounded-md ${isRep ? 'bg-amber-bg text-amber-fg font-bold' : 'bg-surface text-muted'}`}>
                                {nm || '—'}{Number(it?.qty) > 1 ? ` ×${it.qty}` : ''}{isRep ? ' 🔁' : ''}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              {salesHistory.repeated.size > 0 && (
                <p className="text-[10px] text-amber-fg">🔁 = منتج اتباع لهالعميل بأكتر من طلب (احتمال تكرار).</p>
              )}
            </div>
          )}

          {/* WhatsApp message (editable + AI) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-extrabold text-muted">💬 رسالة المتابعة</p>
              <button onClick={writeWithAi} disabled={aiLoading}
                className="text-[11px] font-bold text-navy bg-navy/10 px-2 py-1 rounded-lg hover:bg-navy/15 transition disabled:opacity-50">
                {aiLoading ? '… لوزي تكتب' : '✨ لوزي تكتب الرسالة'}
              </button>
            </div>
            <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={4}
              className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30 resize-none" />
            <div className="flex gap-2">
              {waSend && (
                <a href={waSend} target="_blank" rel="noreferrer"
                  className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90 transition"
                  style={{ background: '#25D366' }}>
                  <WaIcon /> إرسال واتساب
                </a>
              )}
              {waPlain && (
                <a href={waPlain} target="_blank" rel="noreferrer"
                  className="px-4 py-2.5 rounded-xl bg-green-bg text-green-fg text-sm font-bold flex items-center justify-center hover:opacity-80 transition">
                  محادثة فارغة
                </a>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <p className="text-xs font-extrabold text-muted">📝 ملاحظات تذكّرنا بالعميل</p>
            <div className="flex gap-2">
              <input value={text} onChange={e => setText(e.target.value)}
                placeholder="بشرة جافة · تحب الترطيب · اشترت لابنتها..."
                className="flex-1 border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30" />
              <button onClick={save} disabled={saving || !text.trim()}
                className="px-3 py-2 rounded-xl bg-teal text-navy text-sm font-bold disabled:opacity-40">+</button>
            </div>
            {notes.length === 0 ? (
              <p className="text-[11px] text-muted text-center py-1">لا ملاحظات بعد.</p>
            ) : notes.map(n => (
              <div key={n.id} className="bg-surface-alt rounded-xl px-3 py-2">
                <p className="text-sm text-text">{n.note}</p>
                <p className="text-[10px] text-muted mt-0.5">{n.author || '—'} · {n.created_at ? new Date(n.created_at).toLocaleDateString('ar', {day:'numeric',month:'short'}) : ''}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CustomerCard({ c, onOpen }) {
  const mkt = custMarket(c);
  const totals = [];
  if (Number(c.total_syp) > 0) totals.push(`${fmt(c.total_syp)} SYP`);
  if (Number(c.total_usd) > 0) totals.push(`${fmt(c.total_usd)} USD`);
  if (Number(c.total_try) > 0) totals.push(`${fmt(c.total_try)} TRY`);
  const wa = customerWaLink(c.phone, mkt);
  const idle = daysSince(c.last_order);

  return (
    <div className="bg-surface border border-border rounded-2xl p-4 space-y-2 cursor-pointer hover:border-teal/40 transition" onClick={() => onOpen(c)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-text text-sm truncate">
            {c.stars > 0 && <span className="me-1">{starLabel(c.stars)}</span>}{c.name || 'عميل'}
          </p>
          <p className="text-[11px] text-muted" dir="ltr">{c.phone}</p>
          {c.city && <p className="text-[11px] text-muted">{c.city}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
              className="w-9 h-9 rounded-xl bg-green-bg flex items-center justify-center text-green-fg hover:opacity-80 transition" title="واتساب">
              <WaIcon />
            </a>
          )}
          <div className="text-center">
            <div className="text-lg font-extrabold text-teal tabular-nums leading-none">{c.orders_count}</div>
            <div className="text-[10px] text-muted">طلب</div>
          </div>
        </div>
      </div>
      {totals.length > 0 && <p className="text-xs font-bold text-text">{totals.join(' · ')}</p>}
      <div className="flex items-center justify-between text-[10px] text-muted pt-1 border-t border-border/40">
        <span>{(c.sellers||[]).length > 1 ? `🔀 ${(c.sellers||[]).length} بائع` : `👤 ${(c.sellers||[])[0] || '—'}`}</span>
        {idle >= 90 ? <span className="text-red-fg font-bold">💔 استرجاع ({idle}ي)</span>
          : idle >= 30 ? <span className="text-amber-fg font-bold">⏰ متابعة ({idle}ي)</span>
          : <span>آخر طلب: {c.last_order ? new Date(c.last_order).toLocaleDateString('ar', {month:'short', year:'2-digit'}) : '—'}</span>}
      </div>
    </div>
  );
}

export default function CustomersScreen() {
  const { name: userName, role } = useAuth();
  const isAdmin = role === 'admin';

  const [section, setSection]   = useState('syria');
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [search, setSearch]     = useState('');
  const [vipOnly, setVipOnly]   = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [segment, setSegment]   = useState('all');
  const [sort, setSort]         = useState('orders');
  const [selected, setSelected] = useState(null);
  const [totalCount, setTotalCount] = useState(null); // true section total
  const [exporting, setExporting] = useState(false);
  const [partnerNames, setPartnerNames] = useState([]);

  // Load accepted shift partners
  useEffect(() => {
    if (!userName) return;
    supabase.from('shift_partners')
      .select('requester, partner')
      .eq('status', 'accepted')
      .or(`requester.eq.${userName},partner.eq.${userName}`)
      .then(({ data }) => {
        const names = (data ?? []).map(r => r.requester === userName ? r.partner : r.requester);
        setPartnerNames(names);
      })
      .catch(() => {});
  }, [userName]);

  const sec = SECTIONS.find(s => s.key === section) || SECTIONS[0];
  const myNames = useMemo(() => {
    if (!userName) return null;
    const first = String(userName).trim().split(/\s+/)[0];
    const aliases = getSellerAliases(userName);
    // Include shift partners so their customers appear in «عملائي»
    const partnerAliases = partnerNames.flatMap(p => {
      const pFirst = String(p).trim().split(/\s+/)[0];
      return [p, pFirst, ...getSellerAliases(p)];
    });
    return [...new Set([userName, first, ...aliases, ...partnerAliases])];
  }, [userName, partnerNames]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await listCustomers({
        search, vipOnly, sort, market: sec.market, brand: sec.brand,
        sellerNames: mineOnly ? myNames : null,
        limit: mineOnly ? 600 : 400,
      });
      setRows(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [search, vipOnly, sort, mineOnly, myNames, sec.market, sec.brand]);

  // True total for the section (independent of the 400-row display cap).
  useEffect(() => {
    countCustomers({ market: sec.market, brand: sec.brand }).then(setTotalCount).catch(() => setTotalCount(null));
  }, [sec.market, sec.brand]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  // mineOnly is applied server-side; segment is a client-side refinement.
  const displayed = useMemo(() => rows.filter(c => inSegment(c, segment)), [rows, segment]);

  const stats = useMemo(() => ({
    total: displayed.length,
    due: displayed.filter(r => daysSince(r.last_order) >= 30).length,
    vip: displayed.filter(r => r.stars >= 2).length,
  }), [displayed]);

  return (
    <div className="space-y-4 pb-24" dir="rtl">
      <div>
        <h1 className="text-xl font-extrabold text-text">⭐ العملاء والأرشيف</h1>
        <p className="text-xs text-muted mt-0.5">
          {totalCount != null ? `${totalCount.toLocaleString('en-US')} عميل في القسم` : `${stats.total} عميل`}
          {totalCount != null && totalCount > rows.length && ` · معروض ${stats.total} (ابحث للوصول للبقية)`}
          {' · '}{stats.due} للمتابعة · {stats.vip} VIP
        </p>
      </div>

      {/* Section tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {SECTIONS.map(s => (
          <button key={s.key} onClick={() => setSection(s.key)}
            className={`px-3 py-2 rounded-xl text-xs font-bold shrink-0 border-2 transition
              ${section === s.key ? 'border-navy bg-navy text-white' : 'border-border text-muted hover:border-navy/40'}`}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Meta export — admin + turkey section only */}
      {isAdmin && section === 'turkey' && (
        <div className="flex gap-2 items-center bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl px-3 py-2">
          <span className="text-xs font-bold text-blue-700 dark:text-blue-300 flex-1">📊 تصدير Meta Ads</span>
          <button
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try { const n = await exportMetaCSV({ vipOnly: false }); alert(`✅ تم تصدير ${n.toLocaleString()} رقم (الكامل)`); }
              catch { alert('خطأ في التصدير'); }
              finally { setExporting(false); }
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition">
            {exporting ? '...' : '🌍 كامل'}
          </button>
          <button
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try { const n = await exportMetaCSV({ vipOnly: true }); alert(`✅ تم تصدير ${n.toLocaleString()} رقم (VIP)`); }
              catch { alert('خطأ في التصدير'); }
              finally { setExporting(false); }
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 transition">
            {exporting ? '...' : '💎 VIP فقط'}
          </button>
        </div>
      )}

      {/* Search + filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 بحث بالاسم أو الهاتف..."
          className="flex-1 min-w-[150px] border border-border rounded-xl px-3 py-2.5 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-teal/30" />
        <select value={segment} onChange={e => setSegment(e.target.value)}
          className="border border-border rounded-xl px-2 py-2.5 text-xs font-bold bg-surface text-text focus:outline-none shrink-0">
          {SEGMENTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select value={sort} onChange={e => setSort(e.target.value)}
          className="border border-border rounded-xl px-2 py-2.5 text-xs font-bold bg-surface text-text focus:outline-none shrink-0">
          <option value="orders">↕ الأكثر طلباً</option>
          <option value="recent">🕒 الأحدث</option>
          <option value="oldest">📅 الأقدم</option>
          <option value="name">🔤 الاسم</option>
        </select>
        <button onClick={() => setMineOnly(v => !v)}
          className={`px-3 py-2 rounded-xl text-xs font-bold border-2 transition shrink-0 ${mineOnly ? 'border-teal bg-teal text-navy' : 'border-border text-muted hover:border-teal/40'}`}>
          👤 عملائي
        </button>
        <button onClick={() => setVipOnly(v => !v)}
          className={`px-3 py-2 rounded-xl text-xs font-bold border-2 transition shrink-0 ${vipOnly ? 'border-amber bg-amber-bg text-amber-fg' : 'border-border text-muted hover:border-amber/40'}`}>
          ⭐ VIP
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{[1,2,3,4,5,6].map(i => <div key={i} className="h-32 bg-surface-alt animate-pulse rounded-2xl" />)}</div>
      ) : error ? (
        <div className="bg-red-bg border border-red/20 text-red-fg rounded-xl px-4 py-3 text-sm flex items-center justify-between">
          <span>{error}</span><button onClick={load} className="underline text-xs">إعادة</button>
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-16 text-muted border-2 border-dashed border-border rounded-2xl">
          <p className="text-4xl mb-3">👤</p>
          <p className="text-sm font-bold">لا عملاء مطابقون</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {displayed.map(c => <CustomerCard key={c.phone_key} c={c} onOpen={setSelected} />)}
        </div>
      )}

      {selected && <CustomerModal c={selected} sellerName={userName} onClose={() => setSelected(null)} />}
    </div>
  );
}
