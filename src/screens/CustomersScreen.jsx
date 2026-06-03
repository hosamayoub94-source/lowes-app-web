// =============================================================
// CustomersScreen — «العملاء والأرشيف» + retention tools (everyone).
// Sections (Syria/Turkey/Strong/All) · search · VIP · «my customers»
// · «follow-up due» · per-customer notes · one-tap WhatsApp with an
// editable follow-up message. Built for repeat-sale (retention).
// =============================================================
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  listCustomers, starLabel, customerWaLink, followupMessage,
  sellerMatches, daysSince, getNotes, addNote,
} from '@services/customerService';
import { useAuth } from '@hooks/useAuth';

const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const FOLLOWUP_DAYS = 30; // re-engage customers idle this long

const SECTIONS = [
  { key: 'syria',  label: '🇸🇾 لويز سوريا', market: 'syria',  brand: 'lowes'  },
  { key: 'turkey', label: '🇹🇷 لويز تركيا', market: 'turkey', brand: 'lowes'  },
  { key: 'strong', label: '💪 سترونغ',       market: null,     brand: 'strong' },
  { key: 'all',    label: '🌍 الكل',          market: null,     brand: null     },
];

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

// ── Customer detail + notes modal ─────────────────────────────
function CustomerModal({ c, sellerName, onClose }) {
  const mkt = custMarket(c);
  const [notes, setNotes] = useState([]);
  const [text, setText]   = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { getNotes(c.phone_key).then(setNotes); }, [c.phone_key]);

  const save = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      const n = await addNote(c.phone_key, text, sellerName);
      setNotes(p => [n, ...p]);
      setText('');
    } catch {} finally { setSaving(false); }
  };

  const waPlain  = customerWaLink(c.phone, mkt);
  const waFollow = customerWaLink(c.phone, mkt, followupMessage(c.name, sellerName));
  const idle = daysSince(c.last_order);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-2 sm:p-4" dir="rtl" onClick={onClose}>
      <div className="bg-surface rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border/40 flex items-start justify-between gap-2 sticky top-0 bg-surface">
          <div className="min-w-0">
            <h3 className="font-bold text-base text-text truncate">
              {c.stars > 0 && <span className="me-1">{starLabel(c.stars)}</span>}{c.name || 'عميل'}
            </h3>
            <p className="text-[11px] text-muted" dir="ltr">{c.phone}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-surface-alt flex items-center justify-center text-muted shrink-0">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-surface-alt rounded-xl p-2"><p className="text-lg font-extrabold text-teal">{c.orders_count}</p><p className="text-[10px] text-muted">طلب</p></div>
            <div className="bg-surface-alt rounded-xl p-2"><p className="text-sm font-bold text-text">{idle === Infinity ? '—' : idle}</p><p className="text-[10px] text-muted">يوم من آخر طلب</p></div>
            <div className="bg-surface-alt rounded-xl p-2"><p className="text-sm font-bold text-text">{(c.sellers||[]).length}</p><p className="text-[10px] text-muted">بائع</p></div>
          </div>

          {idle >= FOLLOWUP_DAYS && (
            <div className="bg-amber-bg border border-amber/30 rounded-xl px-3 py-2 text-xs text-amber-fg">
              ⏰ مضى {idle} يوماً على آخر طلب — وقت ممتاز للمتابعة وإعادة البيع.
            </div>
          )}

          {/* WhatsApp actions */}
          <div className="flex gap-2">
            {waFollow && (
              <a href={waFollow} target="_blank" rel="noreferrer"
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90 transition"
                style={{ background: '#25D366' }}>
                <WaIcon /> رسالة متابعة
              </a>
            )}
            {waPlain && (
              <a href={waPlain} target="_blank" rel="noreferrer"
                className="px-4 py-2.5 rounded-xl bg-green-bg text-green-fg text-sm font-bold flex items-center justify-center hover:opacity-80 transition">
                محادثة
              </a>
            )}
          </div>

          {(c.sellers||[]).length > 0 && (
            <p className="text-[11px] text-muted">👤 البائعون: <span className="text-text">{(c.sellers||[]).join('، ')}</span></p>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <p className="text-xs font-extrabold text-muted">📝 ملاحظات تذكّرنا بالعميل</p>
            <div className="flex gap-2">
              <input value={text} onChange={e => setText(e.target.value)}
                placeholder="مثال: بشرة جافة · تحب الترطيب · اشترت لابنتها..."
                className="flex-1 border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30" />
              <button onClick={save} disabled={saving || !text.trim()}
                className="px-3 py-2 rounded-xl bg-teal text-white text-sm font-bold disabled:opacity-40">+</button>
            </div>
            {notes.length === 0 ? (
              <p className="text-[11px] text-muted text-center py-2">لا ملاحظات بعد — أضف ما يساعدك تتذكّره.</p>
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
        {idle >= FOLLOWUP_DAYS
          ? <span className="text-amber-fg font-bold">⏰ متابعة ({idle}ي)</span>
          : <span>آخر طلب: {c.last_order ? new Date(c.last_order).toLocaleDateString('ar', {month:'short', year:'2-digit'}) : '—'}</span>}
      </div>
    </div>
  );
}

export default function CustomersScreen() {
  const { name: userName } = useAuth();

  const [section, setSection]   = useState('syria');
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [search, setSearch]     = useState('');
  const [vipOnly, setVipOnly]   = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [dueOnly, setDueOnly]   = useState(false);
  const [selected, setSelected] = useState(null);

  const sec = SECTIONS.find(s => s.key === section) || SECTIONS[0];

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await listCustomers({ search, vipOnly, market: sec.market, brand: sec.brand, limit: 400 });
      setRows(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [search, vipOnly, sec.market, sec.brand]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  // «my customers» (fuzzy) + «follow-up due» filtered client-side
  const displayed = useMemo(() => rows.filter(c => {
    if (mineOnly && !sellerMatches(c.sellers, userName)) return false;
    if (dueOnly && daysSince(c.last_order) < FOLLOWUP_DAYS) return false;
    return true;
  }), [rows, mineOnly, dueOnly, userName]);

  const stats = useMemo(() => ({
    total: displayed.length,
    due: displayed.filter(r => daysSince(r.last_order) >= FOLLOWUP_DAYS).length,
    vip: displayed.filter(r => r.stars >= 2).length,
  }), [displayed]);

  return (
    <div className="space-y-4 pb-24" dir="rtl">
      <div>
        <h1 className="text-xl font-extrabold text-text">⭐ العملاء والأرشيف</h1>
        <p className="text-xs text-muted mt-0.5">{stats.total} عميل · {stats.due} للمتابعة · {stats.vip} VIP</p>
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

      {/* Search + filters */}
      <div className="flex gap-2 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 بحث بالاسم أو الهاتف..."
          className="flex-1 min-w-[150px] border border-border rounded-xl px-3 py-2.5 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-teal/30" />
        <button onClick={() => setMineOnly(v => !v)}
          className={`px-3 py-2 rounded-xl text-xs font-bold border-2 transition shrink-0 ${mineOnly ? 'border-teal bg-teal text-white' : 'border-border text-muted hover:border-teal/40'}`}>
          👤 عملائي
        </button>
        <button onClick={() => setDueOnly(v => !v)}
          className={`px-3 py-2 rounded-xl text-xs font-bold border-2 transition shrink-0 ${dueOnly ? 'border-amber bg-amber-bg text-amber-fg' : 'border-border text-muted hover:border-amber/40'}`}>
          ⏰ للمتابعة
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
