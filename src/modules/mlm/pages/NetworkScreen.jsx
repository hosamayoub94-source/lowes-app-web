// =============================================================
// NetworkScreen — شبكتي: رتبتي + رمز دعوتي + شجرة فريقي.
// موبايل-أول · للمسوّقات والمشرفات ووكلاء المناطق.
// =============================================================
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useAuth } from '@hooks/useAuth';
import {
  ensureInviteCode, joinByInvite, getDownline,
  inviteWhatsAppLink, RANK_LABELS,
} from '@modules/mlm/services/mlmService';

const fmt = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

const JOIN_ERRORS = {
  invalid_code: 'رمز غير صحيح.',
  self: 'لا يمكنك استخدام رمزك أنت.',
  already_recruited: 'أنتِ مضمومة مسبقاً.',
  cycle: 'لا يمكن الضمّ — الرمز يتبع لفريقك.',
  unauthenticated: 'انتهت الجلسة.',
};

export default function NetworkScreen() {
  const { id, name } = useAuth();
  const [code, setCode]         = useState(null);
  const [downline, setDownline] = useState([]);
  const [loading, setLoading]   = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [c, d] = await Promise.all([ensureInviteCode(id), getDownline()]);
    setCode(c); setDownline(d);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => ({
    count: downline.length,
    sales: downline.reduce((s, m) => s + Number(m.month_sales || 0), 0),
  }), [downline]);

  const onShare = () => {
    if (!code) return;
    window.open(inviteWhatsAppLink(code, name || ''), '_blank');
  };

  const onJoin = async () => {
    const c = window.prompt('أدخلي رمز الدعوة الذي وصلك:', '');
    if (!c) return;
    const res = await joinByInvite(c.trim());
    if (res.ok) { window.alert('تم الانضمام ✓'); load(); }
    else window.alert(JOIN_ERRORS[res.error] || 'تعذّر الانضمام.');
  };

  return (
    <div className="space-y-4 pb-24" dir="rtl">
      {/* رمز الدعوة */}
      <div className="rounded-2xl bg-gradient-to-l from-navy to-teal px-5 py-6 text-white shadow-md">
        <p className="text-white/70 text-xs font-bold">رمز دعوتي</p>
        <p className="text-3xl font-black mt-1 tracking-[0.2em]">{code || '——————'}</p>
        <div className="flex gap-2 mt-4">
          <button onClick={onShare} disabled={!code}
            className="flex-1 bg-white/15 hover:bg-white/25 disabled:opacity-50 rounded-xl py-2.5 text-sm font-black transition-colors active:scale-[0.99]">
            مشاركة على واتساب 📲
          </button>
          <button onClick={onJoin}
            className="bg-white/10 hover:bg-white/20 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors">
            عندي رمز
          </button>
        </div>
      </div>

      {/* ملخص الفريق */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-surface border border-border p-4 text-center">
          <p className="text-2xl font-black">{totals.count}</p>
          <p className="text-muted text-xs mt-1">عضوات الفريق</p>
        </div>
        <div className="rounded-2xl bg-surface border border-border p-4 text-center">
          <p className="text-2xl font-black">{fmt(totals.sales)}</p>
          <p className="text-muted text-xs mt-1">مبيعات الفريق هذا الشهر</p>
        </div>
      </div>

      {/* شجرة الفريق */}
      <section className="rounded-2xl bg-surface border border-border p-4">
        <h2 className="font-black text-sm mb-3">فريقي (الداون-لاين)</h2>
        {loading ? (
          <p className="text-muted text-sm">جارٍ التحميل…</p>
        ) : downline.length === 0 ? (
          <p className="text-muted text-sm">لا عضوات بعد — شاركي رمز دعوتك لتبدأ شبكتك تكبر 🌱</p>
        ) : (
          <ul className="divide-y divide-border">
            {downline.map((m) => (
              <li key={m.id} className="py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0 flex items-center gap-2">
                  <span className="text-muted text-xs shrink-0">{'•'.repeat(Math.min(m.depth, 5))}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">{m.employee_name}</p>
                    <p className="text-muted text-xs">{RANK_LABELS[m.mlm_rank] || m.seller_type} · مستوى {m.depth}</p>
                  </div>
                </div>
                <span className="font-black text-sm shrink-0">{fmt(m.month_sales)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
