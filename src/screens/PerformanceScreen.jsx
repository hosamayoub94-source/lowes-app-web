// =============================================================
// PerformanceScreen — Employee performance scoring
// Score = Attendance % (40pts) + Task completion % (40pts)
//       + Sales contribution % (20pts, sales team only)
// Tables: profiles, attendance_logs, tasks, daily_sales_reports
// =============================================================
import { useState, useEffect, useCallback } from 'react';
import { Hero }      from '@components/ui/Hero';
import { Card, CardTitle, CardSubtitle } from '@components/ui/Card';
import { StatCard }  from '@components/ui/StatCard';
import { EmptyState } from '@components/ui/EmptyState';
import { supabase }  from '@services/supabase';

const MONTHS_AR = [
  'يناير','فبراير','مارس','أبريل','مايو','يونيو',
  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر',
];

function monthOptions() {
  const opts = [];
  const now  = new Date();
  for (let i = 0; i < 6; i++) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = d.toISOString().slice(0, 7);
    opts.push({ val, label: MONTHS_AR[d.getMonth()] + ' ' + d.getFullYear() });
  }
  return opts;
}

function clamp(v, min = 0, max = 100) { return Math.max(min, Math.min(max, v)); }

function scoreColor(s) {
  if (s >= 85) return 'text-green-fg';
  if (s >= 65) return 'text-amber-fg';
  return 'text-red-fg';
}
function scoreBg(s) {
  if (s >= 85) return 'bg-green-bg';
  if (s >= 65) return 'bg-amber-bg';
  return 'bg-red-bg';
}
function scoreLabel(s) {
  if (s >= 85) return 'ممتاز';
  if (s >= 65) return 'جيد';
  if (s >= 45) return 'مقبول';
  return 'ضعيف';
}

// ── Progress bar ────────────────────────────────────────────
function Bar({ value, color = 'bg-teal' }) {
  return (
    <div className="h-2 rounded-full bg-surface-alt overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-700 ${color}`}
        style={{ width: clamp(value) + '%' }}
      />
    </div>
  );
}

// ── Score ring ───────────────────────────────────────────────
function ScoreRing({ score }) {
  const r   = 26;
  const circ = 2 * Math.PI * r;
  const dash = circ * (1 - clamp(score) / 100);
  return (
    <svg width="64" height="64" className="shrink-0 -rotate-90">
      <circle cx="32" cy="32" r={r} fill="none" stroke="rgb(var(--color-surface-alt))" strokeWidth="5" />
      <circle
        cx="32" cy="32" r={r}
        fill="none"
        stroke={score >= 85 ? 'rgb(var(--color-green))' : score >= 65 ? 'rgb(var(--color-amber))' : 'rgb(var(--color-red))'}
        strokeWidth="5"
        strokeDasharray={circ}
        strokeDashoffset={dash}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.7s ease' }}
      />
      <text
        x="32" y="36"
        textAnchor="middle"
        className="rotate-90"
        style={{ fontSize: 13, fontWeight: 700, fill: 'rgb(var(--color-text))', transform: 'rotate(90deg)', transformOrigin: '32px 32px' }}
      >
        {score}
      </text>
    </svg>
  );
}

// ── Employee row ─────────────────────────────────────────────
function EmpCard({ emp, rank }) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-4">
      <div className="flex items-center gap-4">
        {/* Rank */}
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0 ${rank === 1 ? 'bg-amber text-white' : rank === 2 ? 'bg-surface-alt text-muted' : rank === 3 ? 'bg-amber-bg text-amber-fg' : 'bg-surface-alt text-muted'}`}>
          {rank}
        </div>

        {/* Score ring */}
        <ScoreRing score={emp.score} />

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <p className="text-sm font-bold text-text truncate">{emp.name}</p>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${scoreBg(emp.score)} ${scoreColor(emp.score)}`}>
              {scoreLabel(emp.score)}
            </span>
          </div>
          <p className="text-xs text-muted mb-2">{emp.team || '—'}</p>

          <div className="space-y-1.5">
            <div>
              <div className="flex justify-between text-[10px] text-muted mb-0.5">
                <span>الحضور</span>
                <span className="font-semibold text-text">{emp.attPct}%</span>
              </div>
              <Bar value={emp.attPct} color={emp.attPct >= 85 ? 'bg-teal' : emp.attPct >= 65 ? 'bg-amber' : 'bg-red'} />
            </div>
            <div>
              <div className="flex justify-between text-[10px] text-muted mb-0.5">
                <span>إنجاز المهام</span>
                <span className="font-semibold text-text">{emp.taskPct}% ({emp.taskDone}/{emp.taskTotal})</span>
              </div>
              <Bar value={emp.taskPct} color={emp.taskPct >= 85 ? 'bg-teal' : emp.taskPct >= 65 ? 'bg-amber' : 'bg-red'} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main screen ──────────────────────────────────────────────
export default function PerformanceScreen() {
  const months = monthOptions();
  const [month,   setMonth]   = useState(months[0].val);
  const [data,    setData]    = useState([]);
  const [summary, setSummary] = useState({ avg: 0, top: null, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const from = month + '-01';
      const to   = new Date(
        new Date(from).getFullYear(),
        new Date(from).getMonth() + 1, 0,
      ).toISOString().slice(0, 10);

      // Fetch all data in parallel
      const [profRes, attRes, taskRes] = await Promise.allSettled([
        supabase
          .from('profiles')
          .select('id, employee_name, team, role_type')
          .eq('is_active', true)
          .order('employee_name'),

        supabase
          .from('attendance_logs')
          .select('employee_id, work_date')
          .gte('work_date', from)
          .lte('work_date', to),

        supabase
          .from('tasks')
          .select('assigned_to, status')
          .gte('created_at', from + 'T00:00:00Z')
          .lte('created_at', to + 'T23:59:59Z'),
      ]);

      const profiles = profRes.status === 'fulfilled' ? profRes.value.data || [] : [];
      const attLogs  = attRes.status  === 'fulfilled' ? attRes.value.data  || [] : [];
      const tasks    = taskRes.status === 'fulfilled' ? taskRes.value.data || [] : [];

      // Working days in the month (Mon-Fri only)
      let workDays = 0;
      const cur = new Date(from);
      const end = new Date(to);
      while (cur <= end) {
        const dow = cur.getDay();
        if (dow !== 0 && dow !== 6) workDays++;
        cur.setDate(cur.getDate() + 1);
      }
      workDays = Math.max(workDays, 1);

      // Aggregate attendance per employee
      const attByEmp = {};
      attLogs.forEach(l => {
        attByEmp[l.employee_id] = (attByEmp[l.employee_id] || new Set());
        attByEmp[l.employee_id].add(l.work_date);
      });

      // Aggregate tasks per employee
      const taskByEmp = {};
      tasks.forEach(t => {
        if (!taskByEmp[t.assigned_to]) taskByEmp[t.assigned_to] = { total: 0, done: 0 };
        taskByEmp[t.assigned_to].total++;
        if (t.status === 'done' || t.status === 'completed') taskByEmp[t.assigned_to].done++;
      });

      // Build scored list
      const scored = profiles.map(p => {
        const attDays  = attByEmp[p.id]?.size || 0;
        const attPct   = clamp(Math.round((attDays / workDays) * 100));
        const tData    = taskByEmp[p.id] || { total: 0, done: 0 };
        const taskPct  = tData.total > 0 ? clamp(Math.round((tData.done / tData.total) * 100)) : 0;

        // Score formula: attendance 50% + tasks 50%
        // (if no tasks assigned, attendance is 100%)
        const score = tData.total === 0
          ? clamp(Math.round(attPct))
          : clamp(Math.round(attPct * 0.5 + taskPct * 0.5));

        return {
          id:       p.id,
          name:     p.employee_name,
          team:     p.team || '—',
          role:     p.role_type,
          attPct,
          attDays,
          taskTotal: tData.total,
          taskDone:  tData.done,
          taskPct,
          score,
        };
      }).sort((a, b) => b.score - a.score);

      setData(scored);

      const total = scored.length;
      const avg   = total > 0 ? Math.round(scored.reduce((s, e) => s + e.score, 0) / total) : 0;
      const top   = scored[0] || null;
      setSummary({ avg, top, total });
    } catch (e) {
      setError(e?.message || 'تعذّر تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const excellent = data.filter(e => e.score >= 85).length;
  const good      = data.filter(e => e.score >= 65 && e.score < 85).length;
  const poor      = data.filter(e => e.score < 65).length;

  return (
    <div className="space-y-5">
      <Hero
        eyebrow="الموارد البشرية"
        title="أداء الفريق"
        subtitle="سكور أوتوماتيكي لكل موظف بناءً على الحضور وإنجاز المهام."
      />

      {/* Month selector */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-semibold text-muted shrink-0">الشهر</label>
        <select
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/40"
          dir="rtl"
        >
          {months.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
        </select>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="إجمالي الموظفين" value={loading ? '—' : summary.total}   tone="blue"  />
        <StatCard label="متوسط الأداء"    value={loading ? '—' : summary.avg + '%'} tone="teal"  />
        <StatCard label="ممتاز (85%+)"    value={loading ? '—' : excellent}         tone="green" />
        <StatCard label="يحتاج تحسين"     value={loading ? '—' : poor}             tone="red"   />
      </div>

      {/* Distribution */}
      {!loading && data.length > 0 && (
        <Card>
          <CardTitle>توزيع مستويات الأداء</CardTitle>
          <div className="mt-3 flex gap-3 flex-wrap">
            {[
              { label: 'ممتاز', count: excellent, color: 'bg-green-bg text-green-fg' },
              { label: 'جيد',   count: good,      color: 'bg-amber-bg text-amber-fg' },
              { label: 'يحتاج تحسين', count: poor, color: 'bg-red-bg text-red-fg' },
            ].map(item => (
              <div key={item.label} className={`flex items-center gap-2 px-4 py-2 rounded-xl ${item.color}`}>
                <span className="text-xl font-extrabold">{item.count}</span>
                <span className="text-xs font-semibold">{item.label}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Employee list */}
      <Card>
        <CardTitle>ترتيب الموظفين</CardTitle>
        <CardSubtitle>مرتّبون حسب السكور الكلي (حضور 50% + مهام 50%)</CardSubtitle>
        <div className="mt-4 space-y-3">
          {loading ? (
            <p className="text-sm text-muted animate-pulse py-6 text-center">جاري التحميل…</p>
          ) : error ? (
            <p className="text-sm text-red-fg py-2">⚠️ {error}</p>
          ) : data.length === 0 ? (
            <EmptyState description="لا توجد بيانات لهذا الشهر" />
          ) : (
            data.map((emp, i) => <EmpCard key={emp.id} emp={emp} rank={i + 1} />)
          )}
        </div>
      </Card>
    </div>
  );
}
