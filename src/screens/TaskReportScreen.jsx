// =============================================================
// TaskReportScreen — Task performance report by employee.
// Tables: tasks, profiles
// =============================================================
import { useState, useEffect, useCallback } from 'react';
import { Hero }                    from '@components/ui/Hero';
import { Card, CardTitle, CardSubtitle } from '@components/ui/Card';
import { StatCard }                from '@components/ui/StatCard';
import { EmptyState }              from '@components/ui/EmptyState';
import { useAuth }                 from '@hooks/useAuth';
import { supabase }                from '@services/supabase';

function monthOptions() {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = d.toISOString().slice(0, 7);
    const label = d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long' });
    opts.push({ val, label });
  }
  return opts;
}

function pct(done, total) {
  if (!total) return 0;
  return Math.round((done / total) * 100);
}

function ProgressBar({ value, color }) {
  const colors = { green: 'bg-green-500', amber: 'bg-amber-500', red: 'bg-red-500', blue: 'bg-blue-500' };
  return (
    <div className="h-2 bg-surface-alt rounded-full overflow-hidden mt-1.5">
      <div className={(colors[color] || colors.blue) + ' h-full rounded-full transition-all'} style={{ width: value + '%' }} />
    </div>
  );
}

function EmpRow({ emp }) {
  const completionPct = pct(emp.done, emp.total);
  const color = completionPct >= 80 ? 'green' : completionPct >= 50 ? 'amber' : 'red';
  return (
    <div className="py-3 border-b border-border last:border-0">
      <div className="flex items-center justify-between mb-1">
        <div>
          <p className="text-sm font-semibold text-text">{emp.name}</p>
          <p className="text-xs text-muted">{emp.team || '—'}</p>
        </div>
        <span className={'text-sm font-bold ' + (color === 'green' ? 'text-green-600' : color === 'amber' ? 'text-amber-600' : 'text-red-600')}>
          {completionPct}%
        </span>
      </div>
      <ProgressBar value={completionPct} color={color} />
      <div className="flex gap-4 mt-2 text-xs text-muted">
        <span>الكل: <b className="text-text">{emp.total}</b></span>
        <span>✅ منجزة: <b className="text-green-600">{emp.done}</b></span>
        <span>⏳ جارية: <b className="text-amber-600">{emp.inProgress}</b></span>
        <span>⚠️ متأخرة: <b className="text-red-600">{emp.late}</b></span>
      </div>
    </div>
  );
}

function OverdueRow({ task }) {
  const daysLate = task.due_date
    ? Math.max(0, Math.floor((new Date() - new Date(task.due_date)) / 86400000))
    : 0;
  return (
    <div className="py-3 border-b border-border last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text truncate">{task.title}</p>
          <p className="text-xs text-muted mt-0.5">{task.employee_name || task.assigned_to || '—'}</p>
        </div>
        <span className="text-xs font-bold text-red-600 shrink-0">+{daysLate} يوم</span>
      </div>
    </div>
  );
}

export default function TaskReportScreen() {
  const months = monthOptions();
  const [month, setMonth]       = useState(months[0].val);
  const [stats, setStats]       = useState({ total: 0, done: 0, late: 0, cancelled: 0 });
  const [empRows, setEmpRows]   = useState([]);
  const [overdue, setOverdue]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const from = month + '-01';
      const to   = new Date(new Date(from).getFullYear(), new Date(from).getMonth() + 1, 0)
                     .toISOString().slice(0, 10);

      const [taskRes, profRes] = await Promise.allSettled([
        supabase
          .from('tasks')
          .select('id, title, status, assigned_to, due_date, created_at')
          .gte('created_at', from + 'T00:00:00')
          .lte('created_at', to + 'T23:59:59'),
        supabase.from('profiles').select('id, employee_name, team'),
      ]);

      let tasks = [];
      let profs = {};
      if (taskRes.status === 'fulfilled' && !taskRes.value.error) tasks = taskRes.value.data || [];
      if (profRes.status === 'fulfilled' && !profRes.value.error) {
        (profRes.value.data || []).forEach(p => { profs[p.id] = p; });
      }

      const now = new Date();
      const enriched = tasks.map(t => ({
        ...t,
        isLate: t.status !== 'done' && t.status !== 'cancelled' && t.due_date && new Date(t.due_date) < now,
        employee_name: profs[t.assigned_to]?.employee_name || t.assigned_to || '—',
        team: profs[t.assigned_to]?.team || '—',
      }));

      const total     = enriched.length;
      const done      = enriched.filter(t => t.status === 'done').length;
      const late      = enriched.filter(t => t.isLate).length;
      const cancelled = enriched.filter(t => t.status === 'cancelled').length;
      setStats({ total, done, late, cancelled });

      const byEmp = {};
      enriched.forEach(t => {
        const key = t.assigned_to || 'unknown';
        if (!byEmp[key]) byEmp[key] = {
          id: key,
          name: t.employee_name,
          team: t.team,
          total: 0, done: 0, inProgress: 0, late: 0,
        };
        byEmp[key].total++;
        if (t.status === 'done') byEmp[key].done++;
        else if (t.status === 'in_progress') byEmp[key].inProgress++;
        if (t.isLate) byEmp[key].late++;
      });
      const empList = Object.values(byEmp).sort((a, b) => pct(b.done, b.total) - pct(a.done, a.total));
      setEmpRows(empList);
      setOverdue(enriched.filter(t => t.isLate).slice(0, 20));
    } catch (e) {
      setError(e?.message || 'تعذّر تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const completionPct = pct(stats.done, stats.total);

  return (
    <div className="space-y-5">
      <Hero
        eyebrow="المهام"
        title="تقرير المهام"
        subtitle="تحليل أداء الفريق وإنجاز المهام."
      />

      <div className="flex gap-3 items-center">
        <label className="text-xs font-semibold text-muted shrink-0">الفترة</label>
        <select
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/40"
          dir="rtl"
        >
          {months.map(m => (
            <option key={m.val} value={m.val}>{m.label}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="إجمالي المهام"  value={loading ? '—' : stats.total}     tone="blue"  />
        <StatCard label="✅ مكتملة"      value={loading ? '—' : stats.done}      tone="green" />
        <StatCard label="⚠️ متأخرة"     value={loading ? '—' : stats.late}      tone="red"   />
        <StatCard label="❌ ملغاة"       value={loading ? '—' : stats.cancelled} tone="amber" />
      </div>

      <Card>
        <CardTitle>نسبة الإنجاز الكلية</CardTitle>
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-2xl font-bold text-text">{loading ? '—' : completionPct + '%'}</span>
            <span className="text-xs text-muted">{stats.done} من {stats.total} مهمة</span>
          </div>
          <ProgressBar
            value={completionPct}
            color={completionPct >= 80 ? 'green' : completionPct >= 50 ? 'amber' : 'red'}
          />
        </div>
      </Card>

      <Card>
        <CardTitle>أداء الموظفين</CardTitle>
        <CardSubtitle>مرتّبون حسب نسبة الإنجاز</CardSubtitle>
        <div className="mt-4">
          {loading ? (
            <p className="text-sm text-muted animate-pulse py-4">جاري التحميل…</p>
          ) : error ? (
            <p className="text-sm text-red-500 py-2">⚠️ {error}</p>
          ) : empRows.length === 0 ? (
            <EmptyState description="لا توجد مهام مسجّلة في هذه الفترة" />
          ) : (
            empRows.map(emp => <EmpRow key={emp.id} emp={emp} />)
          )}
        </div>
      </Card>

      <Card>
        <CardTitle>⚠️ المهام المتأخرة</CardTitle>
        <CardSubtitle>مهام تجاوزت تاريخ الاستحقاق</CardSubtitle>
        <div className="mt-4">
          {loading ? (
            <p className="text-sm text-muted animate-pulse py-4">جاري التحميل…</p>
          ) : overdue.length === 0 ? (
            <EmptyState description="لا توجد مهام متأخرة — عمل رائع!" />
          ) : (
            overdue.map(t => <OverdueRow key={t.id} task={t} />)
          )}
        </div>
      </Card>
    </div>
  );
}