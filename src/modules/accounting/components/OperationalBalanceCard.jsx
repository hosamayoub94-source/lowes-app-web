// =============================================================
// OperationalBalanceCard — بطاقة «الرصيد الموجود» (الحساب التشغيلي)
//   تعرض الرصيد لكل عملة (استلامات − مصاريف). children = أزرار التسوية.
// =============================================================
import { CCY } from './sourceBreakdown.logic.js';

const CCY_NAME = { '$': 'دولار', '₺': 'ليرة تركية', 'ل.س': 'ليرة سورية' };

export default function OperationalBalanceCard({
  balance,
  title = '💼 الرصيد الموجود حالياً',
  subtitle,
  children,
}) {
  const lines = CCY.map(c => ({ c, v: Number(balance?.[c.key]) || 0 })).filter(x => x.v !== 0);
  return (
    <div className="bg-surface border border-border rounded-2xl p-4" dir="rtl">
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
      {children && <div className="mt-3 pt-3 border-t border-border flex gap-2 flex-wrap">{children}</div>}
    </div>
  );
}
