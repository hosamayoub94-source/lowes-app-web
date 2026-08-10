// =============================================================
// OperationalBalanceCard — بطاقة «الرصيد الموجود» (الحساب التشغيلي)
//   تعرض الرصيد لكل عملة. children = أزرار التسوية.
//   النقر على الرقم يفتح تفكيك «من وين إجا هذا الرقم؟» — بدل التخمين.
// =============================================================
import { useState } from 'react';
import { CCY } from './sourceBreakdown.logic.js';
import BalanceReconciliation from './BalanceReconciliation.jsx';

const CCY_NAME = { '$': 'دولار', '₺': 'ليرة تركية', 'ل.س': 'ليرة سورية' };

export default function OperationalBalanceCard({
  balance,
  title = '💼 الرصيد الموجود حالياً',
  subtitle,
  children,
  scopeEntries,          // القيود يلي انحسب منها الرصيد — لتفكيكه
  scopeLabel = '',
  truncated = false,     // لم يكتمل جلب الدفتر → الرقم ناقص
}) {
  const [showWhy, setShowWhy] = useState(false);
  const lines = CCY.map(c => ({ c, v: Number(balance?.[c.key]) || 0 })).filter(x => x.v !== 0);
  const canExplain = Array.isArray(scopeEntries);

  return (
    <div className="bg-surface border border-border rounded-2xl p-4" dir="rtl">
      {truncated && (
        <div className="mb-3 rounded-xl border border-red-500/40 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700">
          ⚠️ الأرقام ناقصة — لم يكتمل جلب الدفتر. لا تعتمد هذا الرصيد قبل إعادة التحميل.
        </div>
      )}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-text">{title}</h3>
          {subtitle && <p className="text-[11px] text-muted mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex gap-5 flex-wrap">
          {lines.length === 0 ? (
            <span className="text-muted text-sm">لا رصيد</span>
          ) : lines.map(({ c, v }) => (
            <div key={c.key} className="text-center">
              <div className={`text-xl font-extrabold ${v >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {v < 0 ? '−' : ''}{c.sym}{Math.abs(v).toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: c.maxFrac })}
              </div>
              <div className="text-[10px] text-muted mt-0.5">{CCY_NAME[c.sym] || c.sym}</div>
            </div>
          ))}
        </div>
      </div>

      {(children || canExplain) && (
        <div className="mt-3 pt-3 border-t border-border flex gap-2 flex-wrap items-center">
          {children}
          {canExplain && (
            <button
              onClick={() => setShowWhy(true)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold border border-border text-muted hover:text-text hover:bg-cream transition ms-auto"
            >
              🧮 من وين إجا هذا الرقم؟
            </button>
          )}
        </div>
      )}

      {canExplain && (
        <BalanceReconciliation
          open={showWhy}
          onClose={() => setShowWhy(false)}
          entries={scopeEntries}
          scopeLabel={scopeLabel}
        />
      )}
    </div>
  );
}
