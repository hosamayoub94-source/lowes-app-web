// =============================================================
// TreasuryPanel — لوحة الخزائن والمحافظ
// يحسب الرصيد الحالي لكل محفظة بناءً على القيود المسجّلة
// =============================================================
import { useMemo, useState } from 'react';
import { WALLETS, WALLET_CURRENCY_SYMBOL, walletDelta } from '../types/accounting.types';
import AccountStatement from './AccountStatement';

function fmtAmt(n, currency) {
  const sym = WALLET_CURRENCY_SYMBOL[currency] || '';
  const abs = Math.abs(Number(n)).toLocaleString('en-US', { maximumFractionDigits: 0 });
  return n < 0 ? `-${sym} ${abs}` : `${sym} ${abs}`;
}

export default function TreasuryPanel({ entries = [], className = '' }) {
  // مفتوحة افتراضياً: «اديش معنا بكل محفظة» تبيّن فوراً بلا نقرة (طلب المالك).
  const [showDetails, setShowDetails] = useState(true);
  // المحفظة المختارة لعرض كشف حركتها (نقر على البطاقة).
  const [selectedWallet, setSelectedWallet] = useState(null);

  // Calculate balance per wallet from entries.
  // walletDelta() centralizes direction (income/transfer_in = +, expense/
  // advance/salary/transfer_out = −) and legacy payment_method mapping.
  const walletBalances = useMemo(() => {
    return WALLETS.map(w => {
      let income = 0, expense = 0, count = 0;
      for (const e of entries) {
        const d = walletDelta(e, w);
        if (d === 0) continue;
        count += 1;
        if (d > 0) income += d; else expense += -d;
      }
      return { ...w, income, expense, balance: income - expense, count };
    });
  }, [entries]);

  const totalUSD = walletBalances
    .filter(w => w.currency === 'USD')
    .reduce((s, w) => s + w.balance, 0);
  const totalSYP = walletBalances
    .filter(w => w.currency === 'SYP')
    .reduce((s, w) => s + w.balance, 0);
  const totalTRY = walletBalances
    .filter(w => w.currency === 'TRY')
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
              <span className={totalTRY >= 0 ? 'text-green-600' : 'text-red-500'}>
                {totalTRY.toLocaleString('en-US', { maximumFractionDigits: 0 })} ₺
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
              <button
                key={w.id}
                type="button"
                onClick={() => setSelectedWallet(w)}
                title="اعرض كشف حركة هذه المحفظة"
                className="rounded-xl p-3 border text-center transition hover:shadow-md hover:-translate-y-0.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal/40"
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
              </button>
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
            <span>
              إجمالي TRY:{' '}
              <span className={`font-bold ${totalTRY >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {totalTRY.toLocaleString('en-US', { maximumFractionDigits: 0 })} ₺
              </span>
            </span>
            <span className="ms-auto text-muted/60">الأرصدة تُحسب من القيود (تشمل التحويلات والمحافظ القديمة)</span>
          </div>
        </div>
      )}

      {/* كشف حركة المحفظة المختارة */}
      <AccountStatement
        open={!!selectedWallet}
        onClose={() => setSelectedWallet(null)}
        kind="wallet"
        wallet={selectedWallet}
        title={selectedWallet?.label || ''}
        entries={entries}
      />
    </div>
  );
}
