// =============================================================
// CommissionReportScreen — كشف عمولات الفريق (للإدارة).
// كل البائعين × العملة لشهر مختار + لوحة شرف.
// =============================================================
import { useEffect, useMemo, useState, useCallback } from 'react';
import { currentMonth, getManagerReport, getLeaderboard } from '@modules/commission/services/ledgerService';

const fmt = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const TYPE_AR = { field_rep: 'مندوب', marketer: 'مسوّقة', online: 'أونلاين' };

// آخر 6 أشهر كخيارات.
function recentMonths(n = 6) {
  const out = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    out.push(new Date(d.getFullYear(), d.getMonth() - i, 1).toISOString().slice(0, 7));
  }
  return out;
}

export default function CommissionReportScreen() {
  const [month, setMonth]   = useState(currentMonth());
  const [rows, setRows]     = useState([]);
  const [board, setBoard]   = useState([]);
  const [loading, setLoading] = useState(true);
  const months = useMemo(() => recentMonths(), []);

  const load = useCallback(async () => {
    setLoading(true);
    const [r, b] = await Promise.all([getManagerReport(month), getLeaderboard(month, 5)]);
    setRows(r); setBoard(b);
    setLoading(false);
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const podium = ['🥇', '🥈', '🥉'];

  return (
    <div className="space-y-4 pb-24" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="font-black text-lg">كشف عمولات الفريق</h1>
        <select value={month} onChange={e => setMonth(e.target.value)}
          className="bg-surface border border-border rounded-xl px-3 py-1.5 text-sm font-bold">
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* لوحة الشرف */}
      <section className="rounded-2xl bg-gradient-to-l from-navy to-teal text-white p-4 shadow-md">
        <h2 className="font-black text-sm mb-3">🏆 لوحة الشرف</h2>
        {board.length === 0 ? (
          <p className="text-white/70 text-sm">لا بيانات بعد.</p>
        ) : (
          <ol className="space-y-2">
            {board.map((b, i) => (
              <li key={b.seller_id} className="flex items-center justify-between text-sm">
                <span className="font-bold">{podium[i] || `${i + 1}.`} {b.employee_name}</span>
                <span className="font-black">${fmt(b.total_usd)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* الكشف التفصيلي */}
      <section className="rounded-2xl bg-surface border border-border p-4">
        <h2 className="font-black text-sm mb-3">التفصيل ({rows.length})</h2>
        {loading ? (
          <p className="text-muted text-sm">جارٍ التحميل…</p>
        ) : rows.length === 0 ? (
          <p className="text-muted text-sm">لا عمولات مسجّلة لهذا الشهر.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r, i) => (
              <li key={`${r.seller_id}-${r.currency}-${i}`} className="py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{r.employee_name}</p>
                  <p className="text-muted text-xs">{TYPE_AR[r.seller_type] || r.seller_type}</p>
                </div>
                <span className="font-black text-sm shrink-0">{fmt(r.total)} {r.currency}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
