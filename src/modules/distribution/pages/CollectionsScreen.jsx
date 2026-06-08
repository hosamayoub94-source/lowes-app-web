// =============================================================
// CollectionsScreen — التحصيل: الطلبات المستحقّة بأعمار الديون.
// البائع يرى ذممه · الإدارة تبدّل لعرض الكل.
// =============================================================
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useAuth } from '@hooks/useAuth';
import { sessionCan } from '@data/permissions';
import { PERMISSIONS } from '@data/permissions';
import { getOverdueOrders } from '@modules/distribution/services/distributionService';

const fmt = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const BUCKET_STYLE = {
  '0-30':  'text-emerald-600',
  '31-60': 'text-amber-600',
  '61-90': 'text-orange-600',
  '90+':   'text-red-600',
};

export default function CollectionsScreen() {
  const { session } = useAuth();
  const canAll = sessionCan(session, PERMISSIONS.MANAGE_COMMISSION) || sessionCan(session, PERMISSIONS.VIEW_ANALYTICS);
  const [all, setAll]   = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setRows(await getOverdueOrders(all && canAll));
    setLoading(false);
  }, [all, canAll]);
  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const by = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    rows.forEach(r => { by[r.bucket] = (by[r.bucket] || 0) + Number(r.remaining || 0); });
    return by;
  }, [rows]);

  return (
    <div className="space-y-4 pb-24" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="font-black text-lg">التحصيل والذمم</h1>
        {canAll && (
          <button onClick={() => setAll(a => !a)}
            className="text-xs font-black bg-surface border border-border rounded-lg px-3 py-1.5">
            {all ? 'ذممي فقط' : 'كل الفريق'}
          </button>
        )}
      </div>

      {/* أعمار الديون */}
      <div className="grid grid-cols-4 gap-2">
        {['0-30', '31-60', '61-90', '90+'].map(b => (
          <div key={b} className="rounded-xl bg-surface border border-border p-2 text-center">
            <p className={`text-sm font-black ${BUCKET_STYLE[b]}`}>{fmt(totals[b])}</p>
            <p className="text-muted text-[10px] mt-0.5">{b} يوم</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl bg-surface border border-border p-4">
        {loading ? (
          <p className="text-muted text-sm">جارٍ التحميل…</p>
        ) : rows.length === 0 ? (
          <p className="text-muted text-sm">لا ذمم مستحقّة — ممتاز! ✓</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map(r => (
              <li key={r.order_id} className="py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{r.customer_name || r.order_no || '—'}</p>
                  <p className={`text-xs font-bold ${BUCKET_STYLE[r.bucket]}`}>{r.days_old} يوم · {r.bucket}</p>
                </div>
                <span className="font-black text-sm shrink-0">{fmt(r.remaining)} {r.currency}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
