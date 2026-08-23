// =============================================================
// PartnerGroupsScreen — تبويب «شركاء الدوام» لكل المستخدمين
//
// المجموعات تُبنى تلقائياً من ملفات الموظفين:
//   • الشريك                     → profiles.shift_partner
//   • رقم الواتساب / اسم الصفحة  → profiles.page_name (حقل قائم مسبقاً)
//
// عرض فقط — لا يكتب شيئاً، ولا يمسّ مجموعات شاشة الإدارة اليدوية.
// =============================================================
import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { useAuth }  from '@hooks/useAuth';
import { Hero }     from '@components/ui/Hero';
import { Card, CardTitle } from '@components/ui/Card';
import { Avatar }   from '@components/ui/Avatar';
import { ROLES }    from '@data/teams';
import { PERMISSIONS as P, resolvePermissions } from '@data/permissions';
import { fetchDerivedPartnerGroups, shiftPlanForSize } from '@services/shiftPartnersService';

// قسم الإدارة اليدوية — يُحمَّل فقط لمن يملك صلاحيته
const ShiftPartnersManager = lazy(() => import('@screens/admin/ShiftPartnersScreen'));

export default function PartnerGroupsScreen() {
  const { name: me, role, session } = useAuth();

  // نفس شرط المسار القديم: الدور أو الصلاحية — بلا تغيير أي صلاحية
  const canManage =
    [ROLES.ADMIN, ROLES.MANAGER].includes(role) ||
    resolvePermissions(session).has(P.MANAGE_ATTENDANCE);
  const [groups, setGroups]   = useState([]);
  const [pending, setPending] = useState([]);
  const [ready, setReady]     = useState(true);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const r = await fetchDerivedPartnerGroups();
    setGroups(r.groups);
    setPending(r.pending);
    setReady(r.ready);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5" dir="rtl">
      <Hero
        eyebrow="الدوام"
        title="شركاء الدوام"
        subtitle="المجموعات تتكوّن تلقائياً من الشريك والرقم أو الصفحة بملف كل موظف"
      />

      {!ready && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-2 text-xs text-amber-700 dark:text-amber-400">
          ⚠️ حقل «الشريك» غير مضاف بقاعدة البيانات بعد — شغّل
          <code className="mx-1">supabase/migrations/20260823_profiles_shift_partner.sql</code>
          ثم ستظهر المجموعات هنا تلقائياً.
        </div>
      )}

      {loading ? (
        <Card><p className="text-center py-8 text-muted text-sm">جار التحميل…</p></Card>
      ) : groups.length === 0 ? (
        <Card>
          <p className="text-center py-8 text-muted text-sm">
            لا توجد مجموعات بعد — تتكوّن المجموعة تلقائياً عندما يشترك موظفان أو ثلاثة
            بنفس رقم الواتساب أو الصفحة ويكون لكلٍّ منهم شريك محدَّد بملفه.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {groups.map(g => {
            const mine = g.members.some(m => m.employee_name === me);
            return (
              <div key={g.key}
                className={`rounded-2xl border p-4 space-y-3 ${
                  mine ? 'border-teal/50 bg-teal/5' : 'border-border bg-surface'
                }`}>
                {/* اسم المجموعة = الأسماء الأولى للأعضاء */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-text text-sm truncate">👥 {g.name}</p>
                    {/* تحت الاسم: الرقم أو الصفحة المرتبطة بالمجموعة */}
                    <p className="text-[11px] text-muted mt-0.5 truncate" dir="ltr" style={{ textAlign: 'right' }}>
                      {g.page}
                    </p>
                  </div>
                  {mine && (
                    <span className="text-[9px] font-bold text-teal bg-teal/10 rounded-full px-2 py-0.5 shrink-0">
                      مجموعتك
                    </span>
                  )}
                </div>

                {/* أسماء الأعضاء */}
                <div className="space-y-1.5 border-t border-border pt-2">
                  {g.members.map(m => (
                    <div key={m.id} className="flex items-center gap-2">
                      <Avatar name={m.employee_name} src={m.avatar_url} size="sm" />
                      <p className={`text-sm truncate ${
                        m.employee_name === me ? 'font-bold text-teal' : 'text-text'
                      }`}>
                        {m.employee_name}
                      </p>
                    </div>
                  ))}
                </div>

                {/* نظام الورديات يُشتقّ من عدد الأعضاء تلقائياً */}
                {(() => {
                  const plan = shiftPlanForSize(g.members.length);
                  if (!plan) return <p className="text-[10px] text-muted">{g.members.length} أعضاء · بلا تقسيم ورديات</p>;
                  return (
                    <div className="border-t border-border pt-2 space-y-1">
                      <p className="text-[10px] font-bold text-muted">
                        الورديات · {plan.span.start} → {plan.span.end}
                        {plan.breakWindow && ` · استراحة ${plan.breakWindow.start}–${plan.breakWindow.end}`}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {plan.shifts.map(s => (
                          <span key={s.key} className="px-2 py-0.5 rounded-lg bg-teal/10 text-teal text-[10px] font-semibold">
                            {s.label} {s.start}–{s.end}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      {/* شركاء محدَّدون بلا رقم/صفحة — سبب عدم ظهورهم بمجموعة */}
      {!loading && pending.length > 0 && (
        <Card>
          <CardTitle>بانتظار اكتمال البيانات ({pending.length})</CardTitle>
          <p className="text-[11px] text-muted mt-1">
            لكلٍّ منهم شريك محدَّد، لكن لا يشاركه أحد نفس رقم الواتساب أو الصفحة بعد.
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {pending.map(p => (
              <span key={p.id} className="px-2.5 py-1 rounded-full bg-surface-alt border border-border text-xs text-text">
                {p.employee_name}
                {p.page_name && <span className="text-muted"> · {p.page_name}</span>}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* ── مجموعات الورديات اليدوية — للإدارة فقط، ضمن نفس التبويب ── */}
      {canManage && (
        <div className="pt-2 border-t border-border space-y-3">
          <div>
            <p className="text-sm font-bold text-text">⚙️ تجاوز يدوي للمجموعات (اختياري)</p>
            <p className="text-[11px] text-muted mt-0.5">
              المجموعات أعلاه تلقائية ويُشتقّ منها نظام الورديات وحساب التأخير مباشرةً. لا حاجة لإنشاء شيء هنا — استخدمه فقط لتثبيت مجموعة تخالف البيانات التلقائية،
              فتكون لها الأولوية عليها.
            </p>
          </div>
          <Suspense fallback={<Card><p className="text-center py-6 text-muted text-sm">جار التحميل…</p></Card>}>
            <ShiftPartnersManager embedded />
          </Suspense>
        </div>
      )}
    </div>
  );
}
