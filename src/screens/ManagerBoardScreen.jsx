// =============================================================
// ManagerBoardScreen — لوحة المدير الصباحية (#5)
// صورة واحدة عن صحة الشركة: مبيعات vs هدف · حضور · مهام · تنبيهات
// =============================================================
import { useState, useEffect, useCallback } from 'react';
import { loadManagerBoard } from '@services/managerBoardService';
import { useAuth } from '@hooks/useAuth';
import { targetForCurrency } from '@data/targets';
import { supabase } from '@services/supabase';
import { ROLES } from '@data/teams';

// ── Formatters ────────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat('en-US').format(Math.round(n || 0));
const arGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'صباح الخير';
  if (h < 17) return 'مساء النور';
  return 'مساء الخير';
};
const todayLabel = () =>
  new Date().toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

// ── Stat card ─────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, tone = 'navy' }) {
  const tones = {
    navy:   'from-navy/5 to-navy/[0.02] border-navy/10',
    teal:   'from-teal/10 to-teal/[0.02] border-teal/20',
    green:  'from-green-500/10 to-green-500/[0.02] border-green-500/20',
    red:    'from-red-500/10 to-red-500/[0.02] border-red-500/20',
    orange: 'from-orange-500/10 to-orange-500/[0.02] border-orange-500/20',
  };
  return (
    <div className={`bg-gradient-to-br ${tones[tone]} border rounded-2xl p-4`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{icon}</span>
        <span className="text-xs font-semibold text-muted">{label}</span>
      </div>
      <p className="text-2xl font-black text-text leading-none">{value}</p>
      {sub && <p className="text-[11px] text-muted mt-1.5">{sub}</p>}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────
function Section({ title, icon, children, action }) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3.5">
        <h2 className="text-sm font-bold text-text flex items-center gap-2">
          <span>{icon}</span> {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}

export default function ManagerBoardScreen() {
  const { name, role } = useAuth();
  const isAdmin = role === ROLES.ADMIN;
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [salesValue, setSalesValue] = useState(null); // admin-only revenue

  // Total sales value (archive + active) — fetched ONLY for admins, so the
  // figure never reaches non-admin clients.
  useEffect(() => {
    if (!isAdmin) return;
    supabase.from('sales_value_summary').select('*')
      .then(({ data }) => {
        const rows = data || [];
        const sum = (k) => rows.reduce((a, r) => a + Number(r[k] || 0), 0);
        setSalesValue({ rows, syp: sum('syp'), usd: sum('usd'), try: sum('try_'), orders: sum('orders') });
      })
      .catch(() => {});
  }, [isAdmin]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const d = await loadManagerBoard();
      setData(d);
    } catch (e) {
      setError(e.message || 'تعذّر تحميل اللوحة');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return (
    <div className="max-w-4xl mx-auto pb-24 space-y-4" dir="rtl">
      <div className="h-24 rounded-2xl bg-surface-alt animate-pulse" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1,2,3,4].map(i => <div key={i} className="h-28 rounded-2xl bg-surface-alt animate-pulse" />)}
      </div>
      <div className="h-48 rounded-2xl bg-surface-alt animate-pulse" />
    </div>
  );

  if (error) return (
    <div className="max-w-4xl mx-auto pt-10 text-center" dir="rtl">
      <p className="text-4xl mb-3">⚠️</p>
      <p className="text-text font-bold">{error}</p>
      <button onClick={load} className="mt-4 px-5 py-2 rounded-xl bg-teal text-white font-semibold">إعادة المحاولة</button>
    </div>
  );

  const { sales, orders, attendance, tasks, target, commissions } = data;

  // Sales display — primary in USD, with TRY/SYP secondary
  // Prefer the dashboard's achieved_usd if present, else our daily_reports sum
  const salesMonthUsd = Math.max(sales.month.usd, target?.achieved_usd || 0);
  const targetAmount  = target?.target_usd || 0;
  const targetPct     = targetAmount ? Math.min(100, Math.round((salesMonthUsd / targetAmount) * 100)) : null;

  return (
    <div className="max-w-4xl mx-auto pb-24 space-y-4" dir="rtl">

      {/* Header */}
      <div className="bg-gradient-to-l from-navy to-teal rounded-2xl p-5 text-white">
        <p className="text-white/80 text-sm">{arGreeting()}، {name} 👋</p>
        <h1 className="text-xl font-extrabold mt-1">لوحة القيادة التنفيذية</h1>
        <p className="text-white/70 text-xs mt-1">{todayLabel()}</p>
      </div>

      {/* ── إجمالي قيمة المبيعات (سري — للأدمن فقط) ── */}
      {isAdmin && salesValue && (
        <div className="bg-gradient-to-br from-navy to-navy/80 rounded-2xl p-5 text-white">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold flex items-center gap-2">💰 إجمالي قيمة المبيعات</h2>
            <span className="text-[10px] bg-white/15 px-2 py-0.5 rounded-full">🔒 للإدارة فقط · {fmt(salesValue.orders)} طلب</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {salesValue.try > 0 && (
              <div className="bg-white/10 rounded-xl p-3"><p className="text-2xl font-black">{fmt(salesValue.try)}</p><p className="text-xs text-white/70">TRY 🇹🇷</p></div>
            )}
            {salesValue.syp > 0 && (
              <div className="bg-white/10 rounded-xl p-3"><p className="text-2xl font-black">{fmt(salesValue.syp)}</p><p className="text-xs text-white/70">SYP 🇸🇾</p></div>
            )}
            {salesValue.usd > 0 && (
              <div className="bg-white/10 rounded-xl p-3"><p className="text-2xl font-black">${fmt(salesValue.usd)}</p><p className="text-xs text-white/70">USD</p></div>
            )}
          </div>
          <div className="mt-3 space-y-1">
            {salesValue.rows.map((r, i) => {
              const v = Number(r.try_ || r.try || 0) || Number(r.syp || 0) || Number(r.usd || 0);
              const cur = Number(r.try_ || r.try) > 0 ? 'TRY' : Number(r.syp) > 0 ? 'SYP' : 'USD';
              return (
                <div key={i} className="flex justify-between text-[11px] text-white/80">
                  <span>{r.market === 'turkey' ? '🇹🇷' : '🇸🇾'} {r.brand === 'strong' ? 'Strong' : "Lowe's"} · {fmt(r.orders)} طلب</span>
                  <span className="font-bold">{fmt(v)} {cur}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Refresh */}
      <div className="flex justify-end">
        <button onClick={load} disabled={loading}
          className="text-xs font-semibold text-teal hover:text-teal/70 px-3 py-1.5 rounded-xl hover:bg-teal/10 transition disabled:opacity-50">
          {loading ? 'جارٍ التحديث…' : '⟳ تحديث'}
        </button>
      </div>

      {/* ── المبيعات ─────────────────────────────── */}
      <Section title="المبيعات" icon="💰">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon="📅" label="مبيعات اليوم (USD)" value={`$${fmt(sales.today.usd)}`}
            sub={`${fmt(sales.today.try)} TRY · ${fmt(sales.today.syp)} SYP`} tone="teal" />
          <StatCard icon="📊" label="مبيعات الشهر (USD)" value={`$${fmt(salesMonthUsd)}`}
            sub={`${fmt(sales.month.try)} TRY · ${fmt(sales.month.syp)} SYP`} tone="navy" />
          <StatCard icon="✅" label="تأكيدات اليوم" value={fmt(sales.confirmsToday)}
            sub={`${fmt(sales.confirmsMonth)} هذا الشهر`} tone="green" />
          <StatCard icon="💬" label="رسائل الشهر" value={fmt(sales.msgsMonth)}
            sub="إجمالي محادثات المبيعات" tone="navy" />
        </div>

        {/* Target progress */}
        <div className="mt-4">
          {targetPct !== null ? (
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-muted font-semibold">التقدّم نحو هدف الشهر</span>
                <span className="font-bold text-text">${fmt(salesMonthUsd)} / ${fmt(targetAmount)} ({targetPct}%)</span>
              </div>
              <div className="h-2.5 rounded-full bg-surface-alt overflow-hidden">
                <div className={`h-full rounded-full transition-all ${targetPct >= 100 ? 'bg-green-500' : targetPct >= 60 ? 'bg-teal' : 'bg-orange-500'}`}
                  style={{ width: `${targetPct}%` }} />
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted bg-surface-alt rounded-xl px-3 py-2.5">
              💡 لم يُحدَّد هدف مبيعات لهذا الشهر بعد — حدّده من شاشة <span className="text-teal font-semibold">المبيعات</span> (بطاقة «هدف الشهر») لرؤية نسبة التقدّم هنا تلقائياً.
            </div>
          )}
        </div>
      </Section>

      {/* ── الحضور ───────────────────────────────── */}
      <Section title="حضور اليوم" icon="🕒">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <StatCard icon="✅" label="حاضر" value={attendance.present} tone="green" />
          <StatCard icon="❌" label="غائب" value={attendance.absent} tone="red" />
          <StatCard icon="⏰" label="متأخر" value={attendance.late} tone="orange" />
          <StatCard icon="📈" label="نسبة الالتزام" value={`${attendance.rate}%`} tone="teal" />
        </div>

        {attendance.absentList.length > 0 && (
          <div className="bg-red-500/5 border border-red-500/10 rounded-xl px-3 py-2.5">
            <p className="text-[11px] font-bold text-red-500 mb-1.5">الغائبون ({attendance.absent})</p>
            <div className="flex flex-wrap gap-1.5">
              {attendance.absentList.map((a, i) => (
                <span key={i} className="text-[11px] bg-surface text-muted px-2 py-0.5 rounded-full border border-border/50">
                  {a.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* ── الطلبات + أعلى المنتجات ───────────────── */}
      <Section title="الطلبات (هذا الشهر)" icon="📦">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <StatCard icon="📦" label="إجمالي الطلبات" value={orders.total} tone="navy" />
          <StatCard icon="⏳" label="قيد التجهيز" value={orders.pending} tone="orange" />
          <StatCard icon="🚚" label="تم التوصيل" value={orders.delivered} tone="green" />
          <StatCard icon="🚫" label="ملغاة" value={orders.cancelled} tone="red" />
        </div>

        {orders.topProducts.length > 0 && (
          <div className="bg-surface-alt rounded-xl px-3 py-2.5">
            <p className="text-[11px] font-bold text-muted mb-2">🏆 أكثر المنتجات طلباً</p>
            <div className="space-y-1.5">
              {orders.topProducts.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs font-bold text-teal w-4">{i + 1}</span>
                  <span className="flex-1 text-xs text-text truncate">{p.name}</span>
                  <span className="text-xs font-bold text-muted">{p.qty}×</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* ── عمولات البائعين (المسلّم هذا الشهر) ───── */}
      {commissions?.sellers?.length > 0 && (
        <Section title="عمولات البائعين (المسلّم هذا الشهر)" icon="📊">
          <div className="space-y-2">
            {commissions.sellers.map((s, i) => (
              <div key={i} className="flex items-center gap-3 bg-surface-alt rounded-xl px-3 py-2.5">
                <span className="text-xs font-bold text-teal w-5 shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-text truncate">{s.name}</p>
                  <p className="text-[11px] text-muted">
                    {s.count} طلب مسلّم
                    {s.pct > 0 && <span className="text-teal font-semibold"> · عمولة {s.pct}%</span>}
                  </p>
                </div>
                <div className="text-left shrink-0 space-y-0.5">
                  {Object.entries(s.totals).map(([cur, total]) => {
                    const target = targetForCurrency(cur);
                    const pct = target ? Math.round((total / target) * 100) : null;
                    return (
                      <div key={cur} className="flex items-center justify-end gap-2">
                        <span className="text-xs font-bold text-text tabular-nums">{fmt(total)} {cur}</span>
                        {pct !== null && (
                          <span className={`text-[10px] font-semibold tabular-nums ${pct >= 100 ? 'text-green-fg' : 'text-muted'}`}>
                            {pct}% من الهدف
                          </span>
                        )}
                        {s.pct > 0 && (
                          <span className="text-[10px] text-teal font-semibold tabular-nums">
                            (+{fmt(s.commissions[cur])})
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted mt-3 text-center">
            العمولة بين قوسين = قيمة المبيعات × نسبة عمولة البائع · تُضبط من «المستخدمون»
          </p>
        </Section>
      )}

      {/* ── المهام والأداء ───────────────────────── */}
      <Section title="المهام والأداء" icon="📋">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <StatCard icon="🔴" label="مهام متأخرة" value={tasks.overdue.length} tone={tasks.overdue.length ? 'red' : 'green'} />
          <StatCard icon="🔄" label="قيد التنفيذ" value={tasks.inProgress} tone="navy" />
          <StatCard icon="⭐" label="أولوية عالية" value={tasks.highPriority} tone="orange" />
          <StatCard icon="✅" label="منجزة هذا الأسبوع" value={tasks.doneThisWeek} tone="green" />
        </div>

        {tasks.overdue.length > 0 && (
          <div className="bg-red-500/5 border border-red-500/10 rounded-xl px-3 py-2.5">
            <p className="text-[11px] font-bold text-red-500 mb-1.5">⚠️ مهام تجاوزت موعدها — تحتاج متابعة</p>
            <div className="space-y-1">
              {tasks.overdue.slice(0, 6).map((t, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="flex-1 text-text truncate">{t.title}</span>
                  <span className="text-red-400 shrink-0">{t.due}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

    </div>
  );
}
