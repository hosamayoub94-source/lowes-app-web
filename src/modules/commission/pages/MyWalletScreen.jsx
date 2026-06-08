// =============================================================
// MyWalletScreen — محفظتي: الرصيد + الكشف الشهري + طلب سحب.
// موبايل-أول · بسيطة · رقم واحد كبير فوق ثم تفاصيل.
// =============================================================
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useAuth } from '@hooks/useAuth';
import {
  currentMonth, getWalletBalance, getStatement, getLedgerRows,
  listWithdrawals, requestWithdrawal,
  LEDGER_TYPE_LABELS, WITHDRAWAL_STATUS_LABELS,
} from '@modules/commission/services/ledgerService';
import { getMyBadges, getMyTier, tierLabel } from '@modules/gamification/services/badgeService';

const fmt = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

export default function MyWalletScreen() {
  const { id, name } = useAuth();
  const month = currentMonth();

  const [balance, setBalance]   = useState(0);
  const [statement, setStatement] = useState([]);
  const [rows, setRows]         = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [badges, setBadges]     = useState([]);
  const [tier, setTier]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [busy, setBusy]         = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [b, s, r, w, bd, t] = await Promise.all([
      getWalletBalance(id),
      getStatement(id, month),
      getLedgerRows(id, month),
      listWithdrawals(id),
      getMyBadges(id),
      getMyTier(id),
    ]);
    setBalance(b); setStatement(s); setRows(r); setWithdrawals(w); setBadges(bd); setTier(t);
    setLoading(false);
  }, [id, month]);

  useEffect(() => { load(); }, [load]);

  // العملة الغالبة للكشف (لعرض زر السحب بعملة منطقية).
  const mainCurrency = useMemo(() => statement[0]?.currency || 'USD', [statement]);

  const onWithdraw = async () => {
    const raw = window.prompt(`المبلغ المطلوب سحبه (${mainCurrency}):`, '');
    const amount = Number(raw);
    if (!(amount > 0)) return;
    setBusy(true);
    const ok = await requestWithdrawal(id, amount, mainCurrency, '');
    setBusy(false);
    if (ok) { window.alert('تم إرسال طلب السحب للإدارة ✓'); load(); }
    else window.alert('تعذّر إرسال الطلب — حاول لاحقاً.');
  };

  return (
    <div className="space-y-4 pb-24" dir="rtl">
      {/* الرصيد — الرقم الكبير */}
      <div className="rounded-2xl bg-gradient-to-l from-navy to-teal px-5 py-6 text-white shadow-md">
        <p className="text-white/70 text-xs font-bold">محفظتي — الرصيد المتاح</p>
        <p className="text-4xl font-black mt-1 tracking-tight">{fmt(balance)}</p>
        <p className="text-white/60 text-xs mt-1">
          {name || ''}{tierLabel(tier) ? ` · ${tierLabel(tier)}` : ''} · شهر {month}
        </p>
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {badges.map(b => (
              <span key={b.code} title={b.description || b.name}
                className="bg-white/15 rounded-lg px-2 py-1 text-xs font-bold">
                {b.icon} {b.name}
              </span>
            ))}
          </div>
        )}
        <button
          onClick={onWithdraw}
          disabled={busy || balance <= 0}
          className="mt-4 w-full bg-white/15 hover:bg-white/25 disabled:opacity-50 rounded-xl py-2.5 text-sm font-black transition-colors active:scale-[0.99]"
        >
          طلب سحب 💸
        </button>
      </div>

      {/* كشف الشهر مجمّعاً حسب النوع */}
      <section className="rounded-2xl bg-surface border border-border p-4">
        <h2 className="font-black text-sm mb-3">كشف عمولة الشهر</h2>
        {loading ? (
          <p className="text-muted text-sm">جارٍ التحميل…</p>
        ) : statement.length === 0 ? (
          <p className="text-muted text-sm">لا توجد عمولات مسجّلة هذا الشهر بعد.</p>
        ) : (
          <ul className="space-y-2">
            {statement.map((s, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className="text-muted">{LEDGER_TYPE_LABELS[s.type] || s.type}</span>
                <span className="font-black">{fmt(s.total)} {s.currency}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* الحركات التفصيلية */}
      <section className="rounded-2xl bg-surface border border-border p-4">
        <h2 className="font-black text-sm mb-3">الحركات ({rows.length})</h2>
        {rows.length === 0 ? (
          <p className="text-muted text-sm">لا حركات هذا الشهر.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{LEDGER_TYPE_LABELS[r.type] || r.type}</p>
                  <p className="text-muted text-xs truncate">
                    {r.note || ''}{r.pct != null ? ` · ${r.pct}%` : ''}
                  </p>
                </div>
                <span className="font-black text-sm shrink-0">{fmt(r.amount)} {r.currency}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* طلبات السحب */}
      <section className="rounded-2xl bg-surface border border-border p-4">
        <h2 className="font-black text-sm mb-3">طلبات السحب</h2>
        {withdrawals.length === 0 ? (
          <p className="text-muted text-sm">لا طلبات سحب.</p>
        ) : (
          <ul className="divide-y divide-border">
            {withdrawals.map((w) => (
              <li key={w.id} className="py-2 flex items-center justify-between gap-2">
                <span className="text-muted text-xs">
                  {new Date(w.created_at).toLocaleDateString('ar')}
                </span>
                <span className="font-bold text-sm">{fmt(w.amount)} {w.currency}</span>
                <span className="text-xs font-bold">{WITHDRAWAL_STATUS_LABELS[w.status] || w.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
