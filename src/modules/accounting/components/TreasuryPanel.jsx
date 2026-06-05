// =============================================================
// TreasuryPanel — لوحة الخزائن والمحافظ
// يحسب الرصيد الحالي لكل محفظة بناءً على القيود المسجّلة
// =============================================================
import { useMemo, useState } from 'react';
import { WALLETS, WALLET_CURRENCY_SYMBOL } from '../types/accounting.types';

function fmtAmt(n, currency) {
  const sym = WALLET_CURRENCY_SYMBOL[currency] || '';
  const abs = Math.abs(Number(n)).toLocaleString('en-US', { maximumFractionDigits: 0 });
  return n < 0 ? `-${sym} ${abs}` : `${sym} ${abs}`;
}

export default function TreasuryPanel({ entries = [], className = '' }) {
  const [showDetails, setShowDetails] = useState(false);

  // Calculate balance per wallet from entries
  const walletBalances = useMemo(() => {
    return WALLETS.map(w => {
      const walletEntries = entries.filter(e => e.payment_method === w.id);
      const income  = walletEntries
        .filter(e => e.entry_type === 'income')
        .reduce((s, e) => s + Number(e[w.amtField] || 0), 0);
      const expense = walletEntries
        .filter(e => e.entry_type !== 'income')
        .reduce((s, e) => s + Number(e[w.amtField] || 0), 0);
      const balance = income - expense;
      return { ...w, income, expense, balance, count: walletEntries.length };
    });
  }, [entries]);

  const totalUSD = walletBalances
    .filter(w => w.currency === 'USD')
    .reduce((s, w) => s + w.balance, 0);
  const totalSYP = walletBalances
    .filter(w => w.currency === 'SYP')
    .reduce((s, w) => s + w.balance, 0);

  return (
    <div className={`bg-surface border border-border/60 rounded-2xl overflow-hidden ${className}`}>
      {/* Header */}
      <button
        onClick={() => setShowDetails(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-alt transition"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">🏦</span>
          <div className="text-right">
            <div className="text-sm font-bold text-text">لوحة الخزائن والمحافظ</div>
            <div className="text-xs text-muted flex gap-3">
              <span className={totalUSD >= 0 ? 'text-green-600' : 'text-red-500'}>
                ${totalUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </span>
              <span className={totalSYP >= 0 ? 'text-green-600' : 'text-red-500'}>
                {totalSYP.toLocaleString('en-US', { maximumFractionDigits: 0 })} ل.س
              </span>
            </div>
          </div>
        </div>
        <span className="text-muted text-xs">{showDetails ? '▲' : '▼'}</span>
      </button>

      {/* Details */}
      {showDetails && (
        <div className="border-t border-border/40 p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {walletBalances.map(w => (
              <div
                key={w.id}
                className="rounded-xl p-3 border text-center"
                style={{ background: w.bg, borderColor: `${w.color}30` }}
              >
                <div className="text-base mb-1">{w.label}</div>
                <div
                  className="text-sm font-bold"
                  style={{ color: w.balance >= 0 ? w.color : '#dc2626' }}
                >
                  {fmtAmt(w.balance, w.currency)}
                </div>
                {w.count > 0 && (
                  <div className="mt-1 text-[10px] text-muted">{w.count} قيد</div>
                )}
                {w.count === 0 && (
                  <div className="mt-1 text-[10px] text-muted/60">لا توجد حركات</div>
                )}
                {/* Micro breakdown */}
                {w.count > 0 && (
                  <div className="mt-1.5 flex justify-center gap-2 text-[10px]">
                    <span className="text-green-600">+{fmtAmt(w.income, w.currency)}</span>
                    <span className="text-red-500">-{fmtAmt(w.expense, w.currency)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Totals bar */}
          <div className="mt-3 pt-3 border-t border-border/40 flex flex-wrap gap-4 text-xs text-muted">
            <span>
              إجمالي USD:{' '}
              <span className={`font-bold ${totalUSD >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                ${totalUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </span>
            </span>
            <span>
              إجمالي SYP:{' '}
              <span className={`font-bold ${totalSYP >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {totalSYP.toLocaleString('en-US', { maximumFractionDigits: 0 })} ل.س
              </span>
            </span>
            <span className="ms-auto text-muted/60">الأرصدة تُحسب من القيود المسجّلة باستخدام محافظ محددة</span>
          </div>
        </div>
      )}
    </div>
  );
}
