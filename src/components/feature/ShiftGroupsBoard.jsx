// =============================================================
// ShiftGroupsBoard — مجموعات شركاء الدوام السارية، لكل الموظفين
//
// عرض فقط: يقرأ نفس مجموعات شاشة الإدارة (`shift_groups`) ولا يكتب شيئاً.
// يتحدّث تلقائياً لحظة تعديل المسؤول للمجموعات (اشتراك realtime).
//
// منفصل تماماً عن هيكل فريق السوشال: هذا يقول «مَن شريك مَن بالدوام»،
// وذاك يقول «مَن يتبع مَن إدارياً».
// =============================================================
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@services/supabase';
import { fetchGroupsAt, shiftPlanForSize } from '@services/shiftPartnersService';

export default function ShiftGroupsBoard({ currentUserName = null }) {
  const [groups, setGroups]   = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const gs = await fetchGroupsAt();
    setGroups(gs);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // تحديث تلقائي عند تغيير المسؤول للشركاء
  useEffect(() => {
    const ch = supabase.channel('shift_groups_board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_groups' }, () => load())
      .subscribe();
    return () => { ch.unsubscribe(); };
  }, [load]);

  // الجدول غير موجود بعد أو لا مجموعات → لا نعرض بطاقة فارغة تشوّش الشاشة
  if (!loading && groups.length === 0) return null;

  return (
    <div className="bg-surface rounded-3xl p-4 shadow-sm border border-border space-y-3" dir="rtl">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <p className="text-xs font-bold text-muted uppercase tracking-wider">👥 مجموعات الدوام</p>
        {loading && <span className="text-[10px] text-muted animate-pulse">…</span>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {groups.map((g, i) => {
          const plan = shiftPlanForSize(g.members?.length ?? 0);
          const mine = !!currentUserName && (g.members ?? []).includes(currentUserName);
          return (
            <div key={g.id}
              className={`rounded-2xl border p-3 space-y-2 ${
                mine ? 'border-teal/50 bg-teal/5' : 'border-border bg-surface-alt/40'
              }`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-text">
                  {g.name || `مجموعة ${i + 1}`}
                </p>
                {mine && (
                  <span className="text-[9px] font-bold text-teal bg-teal/10 rounded-full px-2 py-0.5">
                    مجموعتك
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {(g.members ?? []).map(m => (
                  <span key={m}
                    className={`px-2 py-0.5 rounded-full text-[11px] border ${
                      m === currentUserName
                        ? 'border-teal/40 bg-teal/10 text-teal font-semibold'
                        : 'border-border bg-surface text-text'
                    }`}>
                    {m}
                  </span>
                ))}
              </div>

              <p className="text-[10px] text-muted">
                {plan
                  ? `${plan.shifts.length} ورديات · ${plan.span.start} → ${plan.span.end}${plan.breakWindow ? ' · باستراحة' : ''}`
                  : `${g.members?.length ?? 0} أعضاء`}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
