// =============================================================
// CustomersScreen — «العملاء والأرشيف» (everyone).
// One practical hub: 3 archive sections (Syria / Turkey / Strong),
// search, VIP filter, «my customers» toggle, and one-tap WhatsApp.
// Data from the customer_stats view (aggregated by phone).
// =============================================================
import { useState, useEffect, useCallback, useMemo } from 'react';
import { listCustomers, starLabel, customerWaLink } from '@services/customerService';
import { useAuth } from '@hooks/useAuth';

const fmt = (n) => Number(n || 0).toLocaleString('en-US');

// Archive sections (brand + market).
const SECTIONS = [
  { key: 'syria',  label: '🇸🇾 لويز سوريا', market: 'syria',  brand: 'lowes', cc: 'syria'  },
  { key: 'turkey', label: '🇹🇷 لويز تركيا', market: 'turkey', brand: 'lowes', cc: 'turkey' },
  { key: 'strong', label: '💪 سترونغ',       market: null,     brand: 'strong', cc: 'turkey' },
  { key: 'all',    label: '🌍 الكل',          market: null,     brand: null,    cc: 'syria'  },
];

function WaIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.138.561 4.14 1.541 5.876L.057 23.886a.5.5 0 00.606.617l6.218-1.632A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/>
    </svg>
  );
}

function CustomerCard({ c, cc }) {
  const totals = [];
  if (Number(c.total_syp) > 0) totals.push(`${fmt(c.total_syp)} SYP`);
  if (Number(c.total_usd) > 0) totals.push(`${fmt(c.total_usd)} USD`);
  if (Number(c.total_try) > 0) totals.push(`${fmt(c.total_try)} TRY`);
  const multiSeller = (c.sellers || []).length > 1;
  // Country code follows the customer's own market (Syria number ≠ Turkey).
  const mkt = (c.markets || []).includes('syria') ? 'syria'
            : (c.markets || []).includes('turkey') ? 'turkey' : cc;
  const wa = customerWaLink(c.phone, mkt);

  return (
    <div className="bg-surface border border-border rounded-2xl p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-text text-sm truncate">
            {c.stars > 0 && <span className="me-1">{starLabel(c.stars)}</span>}
            {c.name || 'عميل'}
          </p>
          <p className="text-[11px] text-muted" dir="ltr">{c.phone}</p>
          {c.city && <p className="text-[11px] text-muted">{c.city}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer"
              className="w-9 h-9 rounded-xl bg-green-bg flex items-center justify-center text-green-fg hover:opacity-80 transition"
              title="مراسلة واتساب">
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
      {(c.sellers || []).length > 0 && (
        <p className="text-[11px] text-muted">
          {multiSeller ? '🔀 باعه: ' : '👤 البائع: '}
          <span className="text-text">{(c.sellers || []).join('، ')}</span>
        </p>
      )}
      <div className="flex items-center justify-between text-[10px] text-muted pt-1 border-t border-border/40">
        <span>أول: {c.first_order ? new Date(c.first_order).toLocaleDateString('ar', {month:'short', year:'2-digit'}) : '—'}</span>
        <span>آخر: {c.last_order ? new Date(c.last_order).toLocaleDateString('ar', {month:'short', year:'2-digit'}) : '—'}</span>
      </div>
    </div>
  );
}

export default function CustomersScreen() {
  const { name: userName } = useAuth();

  const [section, setSection] = useState('syria');
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [search, setSearch]   = useState('');
  const [vipOnly, setVipOnly] = useState(false);
  const [mineOnly, setMineOnly] = useState(false); // «عملائي»

  const sec = SECTIONS.find(s => s.key === section) || SECTIONS[0];

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await listCustomers({
        search, vipOnly,
        market: sec.market, brand: sec.brand,
        sellerName: mineOnly ? userName : null,
        limit: 300,
      });
      setRows(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [search, vipOnly, mineOnly, sec.market, sec.brand, userName]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  const stats = useMemo(() => ({
    total: rows.length,
    repeat: rows.filter(r => r.orders_count > 1).length,
    vip: rows.filter(r => r.stars >= 2).length,
  }), [rows]);

  return (
    <div className="space-y-4 pb-24" dir="rtl">
      <div>
        <h1 className="text-xl font-extrabold text-text">⭐ العملاء والأرشيف</h1>
        <p className="text-xs text-muted mt-0.5">
          {stats.total} عميل · {stats.repeat} متكرر · {stats.vip} VIP
        </p>
      </div>

      {/* Section tabs (archive sections) */}
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
      <div className="flex gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 بحث بالاسم أو الهاتف..."
          className="flex-1 border border-border rounded-xl px-3 py-2.5 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-teal/30" />
        <button onClick={() => setMineOnly(v => !v)}
          className={`px-3 py-2 rounded-xl text-xs font-bold border-2 transition shrink-0
            ${mineOnly ? 'border-teal bg-teal text-white' : 'border-border text-muted hover:border-teal/40'}`}>
          👤 عملائي
        </button>
        <button onClick={() => setVipOnly(v => !v)}
          className={`px-3 py-2 rounded-xl text-xs font-bold border-2 transition shrink-0
            ${vipOnly ? 'border-amber bg-amber-bg text-amber-fg' : 'border-border text-muted hover:border-amber/40'}`}>
          ⭐ VIP
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{[1,2,3,4,5,6].map(i => <div key={i} className="h-32 bg-surface-alt animate-pulse rounded-2xl" />)}</div>
      ) : error ? (
        <div className="bg-red-bg border border-red/20 text-red-fg rounded-xl px-4 py-3 text-sm flex items-center justify-between">
          <span>{error}</span><button onClick={load} className="underline text-xs">إعادة</button>
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-muted border-2 border-dashed border-border rounded-2xl">
          <p className="text-4xl mb-3">👤</p>
          <p className="text-sm font-bold">لا عملاء في هذا القسم{search ? ' لبحثك' : ''}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map(c => <CustomerCard key={c.phone_key} c={c} cc={sec.cc} />)}
        </div>
      )}
    </div>
  );
}
