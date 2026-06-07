// =============================================================
// AccountingReport — period financial report (Task #5 stage 3)
// Pure derivation from ledger entries: net profit per currency,
// income/expense by category, and per-wallet net movement.
// Transfers are internal moves → excluded from profit & category P&L,
// but shown in the per-wallet movement section.
// =============================================================
import { useMemo } from 'react';
import { WALLETS, WALLET_CURRENCY_SYMBOL, walletDelta, ENTRY_TYPE } from '../types/accounting.types';

const CURRENCIES = [
  { key: 'amount_usd', code: 'USD', sym: '$' },
  { key: 'amount_try', code: 'TRY', sym: '₺' },
  { key: 'amount_syp', code: 'SYP', sym: 'ل.س' },
];

function fmt(n) { return Math.abs(Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }

export default function AccountingReport({ entries = [], periodLabel = '' }) {
  const report = useMemo(() => {
    // Net profit (exclude transfers) per currency
    const profit = {};
    // Category P&L per currency: { [cat]: { income, expense } }
    const catMap = {};
    for (const e of entries) {
      if (e.entry_type === ENTRY_TYPE.TRANSFER) continue;
      const isIncome = e.entry_type === ENTRY_TYPE.INCOME;
      for (const c of CURRENCIES) {
        const amt = Number(e[c.key]) || 0;
        if (!amt) continue;
        profit[c.code] = profit[c.code] || { income: 0, expense: 0 };
        if (isIncome) profit[c.code].income += amt; else profit[c.code].expense += amt;
        const cat = e.category || (isIncome ? 'دخل غير مصنّف' : 'مصروف غير مصنّف');
        catMap[cat] = catMap[cat] || { income: 0, expense: 0, code: c.code };
        if (isIncome) catMap[cat].income += amt; else catMap[cat].expense += amt;
      }
    }
    // Per-wallet net movement
    const wallets = WALLETS.map(w => {
      let net = 0, moves = 0;
      for (const e of entries) {
        const d = walletDelta(e, w);
        if (d !== 0) { net += d; moves += 1; }
      }
      return { ...w, net, moves };
    }).filter(w => w.moves > 0);

    const cats = Object.entries(catMap)
      .map(([name, v]) => ({ name, ...v, total: v.income - v.expense }))
      .sort((a, b) => (Math.abs(b.income + b.expense)) - (Math.abs(a.income + a.expense)));

    return { profit, cats, wallets };
  }, [entries]);

  const curList = CURRENCIES.filter(c => report.profit[c.code]);

  if (entries.length === 0) {
    return <p className="text-sm text-muted text-center py-6">لا توجد بيانات في هذه الفترة لإصدار تقرير.</p>;
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* Net profit per currency */}
      <div>
        <p className="text-xs font-bold text-muted mb-2">💹 صافي الربح {periodLabel && `· ${periodLabel}`}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {curList.map(c => {
            const p = report.profit[c.code];
            const net = p.income - p.expense;
            return (
              <div key={c.code} className="bg-surface border border-border rounded-2xl p-3">
                <div className="text-xs font-bold text-muted mb-1">{c.code}</div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-green-600">دخل {c.sym}{fmt(p.income)}</span>
                  <span className="text-red-500">مصروف {c.sym}{fmt(p.expense)}</span>
                </div>
                <div className={`mt-1.5 text-base font-black ${net >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {net >= 0 ? '+' : '−'}{c.sym}{fmt(net)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Category breakdown */}
      <div>
        <p className="text-xs font-bold text-muted mb-2">🏷️ حسب التصنيف</p>
        <div className="bg-surface border border-border rounded-2xl divide-y divide-border">
          {report.cats.slice(0, 12).map(cat => (
            <div key={cat.name} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="text-text truncate flex-1">{cat.name}</span>
              <span className="flex gap-3 text-xs shrink-0">
                {cat.income > 0 && <span className="text-green-600">+{fmt(cat.income)}</span>}
                {cat.expense > 0 && <span className="text-red-500">−{fmt(cat.expense)}</span>}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Per-wallet movement */}
      <div>
        <p className="text-xs font-bold text-muted mb-2">🏦 حركة المحافظ في الفترة</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {report.wallets.map(w => (
            <div key={w.id} className="rounded-xl border p-2.5 text-center" style={{ background: w.bg, borderColor: `${w.color}30` }}>
              <div className="text-xs">{w.label}</div>
              <div className="text-sm font-bold" style={{ color: w.net >= 0 ? w.color : '#dc2626' }}>
                {w.net >= 0 ? '+' : '−'}{WALLET_CURRENCY_SYMBOL[w.currency]} {fmt(w.net)}
              </div>
              <div className="text-[10px] text-muted">{w.moves} حركة</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
