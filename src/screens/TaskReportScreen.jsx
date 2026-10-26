// =============================================================
// TaskReportScreen — outcome report (not just "% completed").
// Tables: tasks, profiles, projects
//
// Two reads:
//  • cohort   — tasks CREATED in the chosen month (completion / on-time /
//               per-project / per-team). Month bounds are LOCAL calendar
//               months (utils/taskDates.js) — never toISOString().
//  • snapshot — everything still ACTIVE today (overdue age, stuck, no owner,
//               no due date), independent of the month filter.
// Sensitive tasks are excluded unless the viewer is an admin.
// =============================================================
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Hero }                    from '@components/ui/Hero';
import { Card, CardTitle, CardSubtitle } from '@components/ui/Card';
import { StatCard }                from '@components/ui/StatCard';
import { EmptyState }              from '@components/ui/EmptyState';
import { useAuthStore }            from '@stores/authStore';
import { supabase }                from '@services/supabase';
import { fetchAllRows }            from '@utils/fetchAllRows';
import { monthOptions, monthRange, daysOverdue, todayKey, AGE_BUCKETS } from '@modules/tasks/utils/taskDates';
import { computeMetrics, ownerRows, visibleForReport } from '@modules/tasks/utils/taskMetrics';
import { isOverdue, normalizeStatus, ownerId, STATUS_META_V3 } from '@modules/tasks/utils/taskWorkflow';
import { TASKS_V3_STATUSES } from '@modules/tasks/utils/taskFlags';

const BASE_COLS = 'id, title, status, assigned_to, assignee_id, due_date, created_at, completed_at, completion_note, team, project_id, is_sensitive, updated_at';
const COLS = TASKS_V3_STATUSES ? `${BASE_COLS}, evidence, blocker, blocker_since` : BASE_COLS;
const CLOSED = '(completed,done,cancelled,archived)';

const AGE_LABEL = { '1-3': '1–3 أيام', '4-7': '4–7 أيام', '8-14': '8–14 يوماً', '15+': 'أكثر من 15 يوماً' };

function Bar({ value, tone = 'green' }) {
  const colors = { green: 'bg-green-500', amber: 'bg-amber-500', red: 'bg-red-500', blue: 'bg-blue-500' };
  return (
    <div className="h-2 bg-surface-alt rounded-full overflow-hidden mt-1.5">
      <div className={colors[tone] + ' h-full rounded-full transition-all'} style={{ width: Math.min(100, value) + '%' }} />
    </div>
  );
}

const toneFor = (p) => (p >= 80 ? 'green' : p >= 50 ? 'amber' : 'red');

function BreakdownRow({ row }) {
  return (
    <div className="py-3 border-b border-border last:border-0">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-text truncate">{row.name}</p>
        <span className="text-xs text-muted shrink-0">
          {row.onTimeOf ? <>في الموعد <b className="text-text">{row.onTimePct}%</b></> : 'لا مهام مكتملة بموعد'}
        </span>
      </div>
      {row.onTimeOf > 0 && <Bar value={row.onTimePct} tone={toneFor(row.onTimePct)} />}
      <div className="flex gap-4 mt-2 text-xs text-muted flex-wrap">
        <span>الكل: <b className="text-text">{row.total}</b></span>
        <span>مكتملة: <b className="text-green-600">{row.completed}</b></span>
        <span>متأخرة: <b className="text-red-600">{row.overdue}</b></span>
      </div>
    </div>
  );
}

function OwnerRow({ row }) {
  return (
    <div className="py-3 border-b border-border last:border-0 flex items-center justify-between gap-3">
      <p className={'text-sm font-semibold truncate ' + (row.id === 'none' ? 'text-red-600' : 'text-text')}>{row.name}</p>
      <div className="flex gap-3 text-xs text-muted shrink-0">
        <span>نشطة <b className="text-text">{row.active}</b></span>
        <span>متأخرة <b className="text-red-600">{row.overdue}</b></span>
        <span>عالقة <b className="text-amber-600">{row.blocked}</b></span>
      </div>
    </div>
  );
}

function OverdueRow({ task, ownerName, today }) {
  const days = daysOverdue(task.due_date, today);
  const st = STATUS_META_V3[normalizeStatus(task.status)];
  return (
    <div className="py-3 border-b border-border last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text truncate">{task.title}</p>
          <p className="text-xs text-muted mt-0.5">{ownerName(ownerId(task))} · {st?.label}{task.blocker ? ` · ${task.blocker}` : ''}</p>
        </div>
        <span className="text-xs font-bold text-red-600 shrink-0">+{days} يوم</span>
      </div>
    </div>
  );
}

export default function TaskReportScreen() {
  const months = useMemo(() => monthOptions(), []);
  const [month, setMonth]       = useState(months[0].val);
  const [cohort, setCohort]     = useState([]);
  const [snapshot, setSnapshot] = useState([]);
  const [profs, setProfs]       = useState({});
  const [projects, setProjects] = useState({});
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const isAdmin = useAuthStore((s) => (s.session?.role || s.session?.role_type) === 'admin');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { fromIso, toIso } = monthRange(month);
      const [cRes, sRes, pRes, prRes] = await Promise.allSettled([
        fetchAllRows(() => supabase.from('tasks').select(COLS).gte('created_at', fromIso).lt('created_at', toIso)),
        fetchAllRows(() => supabase.from('tasks').select(COLS).not('status', 'in', CLOSED)),
        fetchAllRows(() => supabase.from('profiles').select('id, employee_name, team')),
        fetchAllRows(() => supabase.from('projects').select('id, name')),
      ]);
      if (cRes.status === 'rejected' && sRes.status === 'rejected') throw cRes.reason;
      setCohort(visibleForReport(cRes.status === 'fulfilled' ? cRes.value : [], isAdmin));
      setSnapshot(visibleForReport(sRes.status === 'fulfilled' ? sRes.value : [], isAdmin));
      const pm = {}; (pRes.status === 'fulfilled' ? pRes.value : []).forEach((p) => { pm[p.id] = p; }); setProfs(pm);
      const prm = {}; (prRes.status === 'fulfilled' ? prRes.value : []).forEach((p) => { prm[p.id] = p; }); setProjects(prm);
    } catch (e) {
      setError(e?.message || 'تعذّر تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [month, isAdmin]);

  useEffect(() => { load(); }, [load]);

  const today = todayKey();
  const nameOf = useCallback((id) => profs[id]?.employee_name || (id ? 'مستخدم غير معروف' : 'بلا مالك'), [profs]);
  const projectName = useCallback((id) => (id ? projects[id]?.name || 'مشروع محذوف' : 'بلا مشروع'), [projects]);
  const teamOf = useCallback((t) => t.team || profs[ownerId(t)]?.team || 'بلا فريق', [profs]);

  const cohortM = useMemo(() => computeMetrics(cohort, { today, projectName, ownerTeam: teamOf }), [cohort, today, projectName, teamOf]);
  const snapM   = useMemo(() => computeMetrics(snapshot, { today, projectName, ownerTeam: teamOf }), [snapshot, today, projectName, teamOf]);
  const owners  = useMemo(() => ownerRows(snapshot, nameOf, today), [snapshot, nameOf, today]);
  const overdueList = useMemo(
    () => snapshot.filter((t) => isOverdue(t, today)).sort((a, b) => daysOverdue(b.due_date, today) - daysOverdue(a.due_date, today)).slice(0, 20),
    [snapshot, today],
  );

  const v = (x) => (loading ? '—' : x);
  // نطاق كل قسم صريح: «الوضع الآن» = كل المهام النشطة حالياً (لا يتأثر بالشهر)، «إنجاز الشهر» = مهام أُنشئت بالشهر المحدد فقط.
  const monthLabel = months.find((m) => m.val === month)?.label || month;

  return (
    <div className="space-y-5">
      <Hero eyebrow="المهام" title="تقرير المهام" subtitle="النتائج والالتزام بالمواعيد — لا نسبة الإكمال وحدها." />

      <div className="flex gap-3 items-center">
        <label className="text-xs font-semibold text-muted shrink-0">الفترة</label>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/40"
          dir="rtl"
        >
          {months.map((m) => <option key={m.val} value={m.val}>{m.label}</option>)}
        </select>
        <span className="text-xs text-muted">الشهر يؤثر على قسم «إنجاز الشهر» فقط (مهام أُنشئت فيه). قسم «الوضع الآن» وجدول المالكين والمتأخرات تخص كل المهام النشطة حالياً.</span>
      </div>

      {error && <p className="text-sm text-red-500">⚠️ {error}</p>}

      {/* الوضع الآن (لقطة المهام النشطة) */}
      <p className="text-xs font-bold text-muted">الوضع الآن — كل المهام النشطة حالياً ({v(snapM.total)} مهمة)، بغض النظر عن الشهر المحدد</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="⚠️ متأخرة"     value={v(snapM.overdueTotal)} tone={snapM.overdueTotal ? 'red' : 'default'} />
        <StatCard label="⛔ عالقة"       value={v(snapM.blocked)}      tone={snapM.blocked ? 'amber' : 'default'} />
        <StatCard label="💬 بانتظار رد"  value={v(snapM.waiting)}      tone="blue" />
        <StatCard label="👤 بلا مالك"    value={v(snapM.noOwner)}      tone={snapM.noOwner ? 'red' : 'default'} />
        <StatCard label="📅 بلا موعد"    value={v(snapM.noDue)}        tone={snapM.noDue ? 'amber' : 'default'} />
      </div>

      <Card>
        <CardTitle>المتأخرة حسب العمر</CardTitle>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {AGE_BUCKETS.map((b) => (
            <div key={b} className="rounded-xl bg-surface-alt p-3 text-center">
              <div className={'text-xl font-extrabold tabular-nums ' + (snapM.overdueByAge[b] ? 'text-red-600' : 'text-muted')}>{v(snapM.overdueByAge[b])}</div>
              <div className="text-[11px] text-muted mt-1">{AGE_LABEL[b]}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* إنجاز الفترة */}
      <p className="text-xs font-bold text-muted">إنجاز {monthLabel} — مهام أُنشئت في هذا الشهر فقط ({v(cohortM.total)} مهمة)، وليست كل المهام</p>
      <Card>
        <CardTitle>الإنجاز في الموعد</CardTitle>
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-2xl font-bold text-text">{loading ? '—' : cohortM.onTime.ofWhich ? cohortM.onTime.pct + '%' : 'لا بيانات'}</span>
            <span className="text-xs text-muted">{cohortM.onTime.done} من {cohortM.onTime.ofWhich} مكتملة لها موعد (من مهام {monthLabel} فقط)</span>
          </div>
          <Bar value={cohortM.onTime.pct} tone={toneFor(cohortM.onTime.pct)} />
          <p className="text-xs text-muted mt-3">
            أُغلقت بنتيجة موثقة: <b className="text-text">{v(cohortM.documentedClosed)}</b> من {v(cohortM.completed)} مكتملة
            {' · '}إكمال خام (ثانوي): {v(cohortM.rawCompletionPct + '%')}
          </p>
        </div>
      </Card>

      <Card>
        <CardTitle>حسب المشروع</CardTitle>
        <CardSubtitle>مهام {monthLabel} فقط</CardSubtitle>
        <div className="mt-2">
          {loading ? <p className="text-sm text-muted animate-pulse py-4">جاري التحميل…</p>
            : cohortM.byProject.length === 0 ? <EmptyState description="لا توجد مهام في هذه الفترة" />
            : cohortM.byProject.map((r) => <BreakdownRow key={r.name} row={r} />)}
        </div>
      </Card>

      <Card>
        <CardTitle>حسب الفريق</CardTitle>
        <CardSubtitle>مهام {monthLabel} فقط</CardSubtitle>
        <div className="mt-2">
          {loading ? <p className="text-sm text-muted animate-pulse py-4">جاري التحميل…</p>
            : cohortM.byTeam.length === 0 ? <EmptyState description="لا توجد مهام في هذه الفترة" />
            : cohortM.byTeam.map((r) => <BreakdownRow key={r.name} row={r} />)}
        </div>
      </Card>

      <Card>
        <CardTitle>العبء والتعثّر لكل مالك</CardTitle>
        <CardSubtitle>كل المهام النشطة حالياً — الأكثر تعثراً أولاً، وليس الأعلى إكمالاً</CardSubtitle>
        <div className="mt-2">
          {loading ? <p className="text-sm text-muted animate-pulse py-4">جاري التحميل…</p>
            : owners.length === 0 ? <EmptyState description="لا مهام نشطة" />
            : owners.map((r) => <OwnerRow key={r.id} row={r} />)}
        </div>
      </Card>

      <Card>
        <CardTitle>⚠️ المهام المتأخرة</CardTitle>
        <CardSubtitle>كل المهام النشطة حالياً — الأقدم أولاً</CardSubtitle>
        <div className="mt-2">
          {loading ? <p className="text-sm text-muted animate-pulse py-4">جاري التحميل…</p>
            : overdueList.length === 0 ? <EmptyState icon="🎉" description="لا توجد مهام متأخرة" />
            : overdueList.map((t) => <OverdueRow key={t.id} task={t} ownerName={nameOf} today={today} />)}
        </div>
      </Card>
    </div>
  );
}
