// =============================================================
// CustomersScreen — customer intelligence directory.
// Lists customers (from customer_stats view): repeat buyers, VIP
// stars, which sellers served them, totals. Search + VIP filter.
// =============================================================
import { useState, useEffect, useCallback, useMemo } from 'react';
import { listCustomers, starLabel } from '@services/customerService';

const fmt = (n) => Number(n || 0).toLocaleString('en-US');

function CustomerCard({ c }) {
  const totals = [];
  if (Number(c.total_syp) > 0) totals.push(`${fmt(c.total_syp)} SYP`);
  if (Number(c.total_usd) > 0) totals.push(`${fmt(c.total_usd)} USD`);
  if (Number(c.total_try) > 0) totals.push(`${fmt(c.total_try)} TRY`);
  const multiSeller = (c.sellers || []).length > 1;
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
        <div className="text-left shrink-0">
          <div className="text-lg font-extrabold text-teal tabular-nums">{c.orders_count}</div>
          <div className="text-[10px] text-muted">طلب</div>
        </div>
      </div>
      {totals.length > 0 && (
        <p className="text-xs font-bold text-text">{totals.join(' · ')}</p>
      )}
      {(c.sellers || []).length > 0 && (
        <p className="text-[11px] text-muted">
          {multiSeller ? '🔀 باعه: ' : '👤 البائع: '}
          <span className="text-text">{(c.sellers || []).join('، ')}</span>
        </p>
      )}
      <div className="flex items-center justify-between text-[10px] text-muted pt-1 border-t border-border/40">
        <span>أول طلب: {c.first_order ? new Date(c.first_order).toLocaleDateString('ar', {month:'short', year:'2-digit'}) : '—'}</span>
        <span>آخر طلب: {c.last_order ? new Date(c.last_order).toLocaleDateString('ar', {month:'short', year:'2-digit'}) : '—'}</span>
      </div>
    </div>
  );
}

export default function CustomersScreen() {
  const [rows, setRows]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);
  const [search, setSearch] = useState('');
  const [vipOnly, setVipOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await listCustomers({ search, vipOnly, limit: 200 });
      setRows(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [search, vipOnly]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const stats = useMemo(() => ({
    total: rows.length,
    repeat: rows.filter(r => r.orders_count > 1).length,
    vip: rows.filter(r => r.stars >= 2).length,
  }), [rows]);

  return (
    <div className="space-y-4 pb-24" dir="rtl">
      <div>
        <h1 className="text-xl font-extrabold text-text">👥 العملاء</h1>
        <p className="text-xs text-muted mt-0.5">
          عملاؤنا · {stats.repeat} متكرر · {stats.vip} VIP ⭐
        </p>
      </div>

      <div className="flex gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 بحث بالاسم أو الهاتف..."
          className="flex-1 border border-border rounded-xl px-3 py-2.5 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-teal/30" />
        <button onClick={() => setVipOnly(v => !v)}
          className={`px-3 py-2 rounded-xl text-xs font-bold border-2 transition shrink-0
            ${vipOnly ? 'border-teal bg-teal text-white' : 'border-border text-muted hover:border-teal/40'}`}>
          ⭐ VIP فقط
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-28 bg-surface-alt animate-pulse rounded-2xl" />)}</div>
      ) : error ? (
        <div className="bg-red-bg border border-red/20 text-red-fg rounded-xl px-4 py-3 text-sm flex items-center justify-between">
          <span>{error}</span><button onClick={load} className="underline text-xs">إعادة</button>
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-muted border-2 border-dashed border-border rounded-2xl">
          <p className="text-4xl mb-3">👤</p>
          <p className="text-sm font-bold">لا عملاء مطابقون</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map(c => <CustomerCard key={c.phone_key} c={c} />)}
        </div>
      )}
    </div>
  );
}
