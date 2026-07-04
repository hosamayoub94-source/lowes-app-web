// =============================================================
// AdminReportsScreen — management analytics with real Supabase data
// =============================================================
import { useState, useEffect, useCallback } from 'react';
import { cn }   from '@utils/classNames';
import { Card } from '@components/ui/Card';
import { fetchAllRows } from '@utils/fetchAllRows';

const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو',
                   'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

// ── Colour helpers ────────────────────────────────────────────
const TONE_BAR  = { teal:'bg-teal', blue:'bg-blue', amber:'bg-amber', red:'bg-red' };
const TONE_TEXT = { teal:'text-teal', blue:'text-blue-fg', amber:'text-amber-fg', red:'text-red-fg' };

// ── Period → date range ───────────────────────────────────────
function getRange(period) {
  const now = new Date();
  const to  = now.toISOString().slice(0, 10);
  let from;
  if (period === '90d') {
    const d = new Date(now); d.setDate(d.getDate() - 90);
    from = d.toISOString().slice(0, 10);
  } else if (period === '1y') {
    from = now.getFullYear() + '-01-01';
  } else {
    const d = new Date(now); d.setDate(d.getDate() - 30);
    from = d.toISOString().slice(0, 10);
  }
  return { from, to };
}

// ── Data fetcher ──────────────────────────────────────────────
async function fetchReportData(period) {
  const { supabase } = await import('@services/supabase');
  const { from, to } = getRange(period);

  // 1. Employee count (active only)
  const { count: empCount } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true);

  // 2. Attendance logs — real table uses type='in'/'out', date='YYYY/MM/DD'
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const chartFrom = sixMonthsAgo.toISOString().slice(0, 10).replace(/-/g, '/');
  const toSlash   = to.replace(/-/g, '/');
  const fromSlash = from.replace(/-/g, '/');

  const attLogs = await fetchAllRows(() => supabase
    .from('attendance')
    .select('employee_name, date')
    .eq('type', 'in')           // count each day once via the 'in' row
    .gte('date', chartFrom)
    .lte('date', toSlash));

  // Build per-month attendance map (last 6 months)
  const now = new Date();
  const monthKeys = [];
  for (let i = 5; i >= 0; i--) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0');
    monthKeys.push({ key, label: MONTHS_AR[d.getMonth()] });
  }
  const monthDays = {};
  const monthEmpDays = {};
  monthKeys.forEach(m => { monthDays[m.key] = new Set(); monthEmpDays[m.key] = new Set(); });

  for (const log of (attLogs || [])) {
    // date is 'YYYY/MM/DD' — first 7 chars = 'YYYY/MM'
    const mk = log.date ? log.date.slice(0, 7) : '';
    if (monthDays[mk]) {
      monthDays[mk].add(log.date);
      monthEmpDays[mk].add(log.employee_name + '|' + log.date);
    }
  }

  const attendanceByMonth = monthKeys.map(m => {
    const days     = monthDays[m.key].size;
    const expected = days * (empCount || 1);
    const pct      = expected > 0 ? Math.round((monthEmpDays[m.key].size / expected) * 100) : 0;
    return { month: m.label, pct: Math.min(pct, 100) };
  });

  // KPI: attendance rate within selected period
  const periodLogs = (attLogs || []).filter(l => l.date >= fromSlash && l.date <= toSlash);
  const periodDays = new Set(periodLogs.map(l => l.date));
  const totalExpected = periodDays.size * (empCount || 1);
  const overallAttRate = totalExpected > 0
    ? Math.round((periodLogs.length / totalExpected) * 100)
    : 0;

  // 3. Tasks by status
  const tasks = await fetchAllRows(() => supabase
    .from('tasks')
    .select('status, due_date'));

  const today = new Date().toISOString().slice(0, 10);
  let completed = 0, in_progress = 0, pending = 0, overdue = 0;
  for (const t of (tasks || [])) {
    if (t.status === 'completed' || t.status === 'done') { completed++; }
    else if (t.status === 'in_progress')                 { in_progress++; }
    else if (t.due_date && t.due_date < today)           { overdue++; }
    else                                                  { pending++; }
  }
  const taskData = [
    { label:'مكتملة',      value:completed,  tone:'teal'  },
    { label:'قيد التنفيذ', value:in_progress, tone:'blue'  },
    { label:'معلقة',       value:pending,     tone:'amber' },
    { label:'متأخرة',      value:overdue,     tone:'red'   },
  ];
  const totalTasks = completed + in_progress + pending + overdue;

  // 4. Sales in period
  const salesRows = await fetchAllRows(() => supabase
    .from('daily_sales_reports')
    .select('total_sales_usd')
    .gte('report_date', from)
    .lte('report_date', to));

  const totalSales = (salesRows || []).reduce((s, r) => s + Number(r.total_sales_usd || 0), 0);

  // 5. CRM stages (graceful fallback)
  let crmData = [];
  try {
    const { data: leads = [], error: crmErr } = await supabase
      .from('leads')
      .select('status')
      .gte('created_at', from + 'T00:00:00Z')
      .lte('created_at', to + 'T23:59:59Z');

    if (!crmErr && leads && leads.length > 0) {
      const stageMap = {};
      for (const l of leads) {
        const s = l.status || 'غير محدد';
        stageMap[s] = (stageMap[s] || 0) + 1;
      }
      const COLORS = ['#0ea5e9','#14b8a6','#a855f7','#22c55e','#ef4444','#f59e0b'];
      crmData = Object.entries(stageMap).map(([label, value], i) => ({
        label, value, color: COLORS[i % COLORS.length],
      }));
    }
  } catch (_) { /* table may not exist */ }

  if (!crmData.length) {
    crmData = [{ label:'لا توجد بيانات', value:1, color:'#9ca3af' }];
  }

  // 6. Top performers
  const { data: profiles = [] } = await supabase
    .from('profiles')
    .select('id, employee_name, name, team')
    .limit(30);

  const assignedTasks = await fetchAllRows(() => supabase
    .from('tasks')
    .select('assigned_to, status')
    .not('assigned_to', 'is', null));

  const tasksByEmp = {};
  const doneByEmp  = {};
  for (const t of (assignedTasks || [])) {
    tasksByEmp[t.assigned_to] = (tasksByEmp[t.assigned_to] || 0) + 1;
    if (t.status === 'completed' || t.status === 'done')
      doneByEmp[t.assigned_to] = (doneByEmp[t.assigned_to] || 0) + 1;
  }

  // attLogs is already filtered to the selected range (gte/lte in the query above)
  // and keyed by employee_name (real schema)
  // نعدّ أيام الحضور الفريدة (اسم|تاريخ) — لا كل تسجيل، وإلا تسجيلات
  // متعددة باليوم ترفع النسبة فوق 100% (كان يخفيها clamp لاحقاً).
  const attByEmp = {};
  const attSeen  = new Set();
  for (const l of (attLogs || [])) {
    if (l.date >= fromSlash) {
      const k = `${l.employee_name}|${l.date}`;
      if (attSeen.has(k)) continue;
      attSeen.add(k);
      attByEmp[l.employee_name] = (attByEmp[l.employee_name] || 0) + 1;
    }
  }

  const maxTasks = Math.max(1, ...Object.values(tasksByEmp));
  const topStaff = (profiles || [])
    .map(emp => {
      const empName  = emp.employee_name || emp.name || 'موظف';
      const empTasks = tasksByEmp[empName] || 0;
      const empAtt   = attByEmp[empName]   || 0;
      const attPct   = periodDays.size > 0 ? Math.round((empAtt / periodDays.size) * 100) : 0;
      const score    = Math.round((empTasks / maxTasks) * 60 + Math.min(attPct, 100) * 0.4);
      return { name:empName, dept:emp.team||'—', tasks:empTasks, attendance:Math.min(attPct,100), score:Math.min(score,100) };
    })
    .filter(e => e.tasks > 0 || e.attendance > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return { empCount: empCount||0, overallAttRate, totalTasks, completedTasks:completed, totalSales, attendanceByMonth, taskData, crmData, topStaff };
}

// ── KPI card ──────────────────────────────────────────────────
function KPICard({ icon, label, value, sub, tone='teal' }) {
  return (
    <div className="bg-surface rounded-xl border border-border p-4 relative overflow-hidden">
      <div className={cn('absolute top-0 inset-x-0 h-0.5', TONE_BAR[tone])} />
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl" aria-hidden>{icon}</span>
        <span className="text-xs text-muted">{label}</span>
      </div>
      <div className="text-2xl font-extrabold text-text tracking-tight">{value}</div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </div>
  );
}

function AttendanceChart({ data = [] }) {
  const max = Math.max(...data.map(d => d.pct), 1);
  return (
    <div className="flex items-end justify-between gap-2 h-36 pt-2">
      {data.map((d, i) => {
        const h      = Math.round((d.pct / max) * 100);
        const isLast = i === data.length - 1;
        return (
          <div key={d.month + i} className="flex-1 flex flex-col items-center gap-1.5">
            <span className={cn('text-[10px] font-bold', isLast ? 'text-teal' : 'text-muted')}>
              {d.pct}%
            </span>
            <div className="w-full rounded-t-md overflow-hidden bg-surface-alt" style={{ height:'80px' }}>
              <div
                className={cn('w-full rounded-t-md transition-all duration-700',
                  d.pct >= 90 ? 'bg-teal' : d.pct >= 80 ? 'bg-blue' : 'bg-amber')}
                style={{ height: h + '%', marginTop: (100 - h) + '%' }}
              />
            </div>
            <span className={cn('text-[10px]', isLast ? 'font-bold text-teal' : 'text-muted')}>
              {d.month}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TasksChart({ data = [] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="space-y-3">
      {data.map(d => {
        const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
        return (
          <div key={d.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text font-medium">{d.label}</span>
              <span className={cn('font-bold', TONE_TEXT[d.tone])}>
                {d.value} <span className="text-muted font-normal">({pct}%)</span>
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-surface-alt overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all duration-700', TONE_BAR[d.tone])}
                style={{ width: pct + '%' }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CRMDonut({ data = [] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  let cursor = 0;
  const segments = data.map(d => {
    const pct = total > 0 ? (d.value / total) * 100 : 0;
    const seg = { ...d, start: cursor, pct };
    cursor += pct;
    return seg;
  });
  const gradient = segments
    .map(s => s.color + ' ' + s.start.toFixed(1) + '% ' + (s.start + s.pct).toFixed(1) + '%')
    .join(', ');

  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0" style={{ width:100, height:100 }}>
        <div className="w-full h-full rounded-full"
          style={{ background: 'conic-gradient(' + gradient + ')' }} />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-[58px] h-[58px] rounded-full bg-surface flex flex-col items-center justify-center">
            <span className="text-lg font-extrabold text-text leading-none">{total}</span>
            <span className="text-[9px] text-muted">صفقة</span>
          </div>
        </div>
      </div>
      <div className="flex-1 space-y-2">
        {segments.map(s => (
          <div key={s.label} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background:s.color }} />
            <span className="text-text flex-1">{s.label}</span>
            <span className="text-muted font-semibold">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreBadge({ score }) {
  const tone = score >= 90
    ? 'bg-teal/10 text-teal'
    : score >= 70
    ? 'bg-blue-bg text-blue-fg'
    : 'bg-amber-bg text-amber-fg';
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold', tone)}>
      {score}
    </span>
  );
}

// ── Skeleton loader ───────────────────────────────────────────
function SkeletonCard() {
  return <div className="bg-surface-alt rounded-xl border border-border p-4 h-24 animate-pulse" />;
}

// ── Main screen ───────────────────────────────────────────────
const PERIODS = [
  { key:'30d', label:'آخر 30 يوماً' },
  { key:'90d', label:'آخر 90 يوماً' },
  { key:'1y',  label:'هذا العام'    },
];

function fmtSales(v) {
  if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
  if (v >= 1000)    return (v / 1000).toFixed(1)    + 'K';
  return String(Math.round(v));
}

export default function AdminReportsScreen() {
  const [period,  setPeriod]  = useState('30d');
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const load = useCallback(async (p) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchReportData(p);
      setData(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(period); }, [period, load]);

  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold text-text">📊 التقارير والتحليلات</h1>
          <p className="text-sm text-muted mt-0.5">لوحة الأداء التشغيلي للمؤسسة</p>
        </div>
        <div className="flex items-center gap-1 bg-surface-alt rounded-xl p-1 border border-border">
          {PERIODS.map(p => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                period === p.key ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="text-xs text-red-fg bg-red-bg border border-red/20 rounded-xl px-4 py-3">{error}</div>
      )}

      {/* ── KPI grid ── */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICard icon="👥" label="إجمالي الموظفين"  value={data.empCount}                       tone="blue"  />
          <KPICard icon="📅" label="معدل الحضور"      value={data.overallAttRate + '%'}             tone="teal"  />
          <KPICard icon="✅" label="مهام مكتملة"
            value={data.completedTasks}
            sub={'من أصل ' + data.totalTasks + ' مهمة'}                                            tone="teal"  />
          <KPICard icon="💰" label="إجمالي المبيعات"
            value={'$' + fmtSales(data.totalSales)}
            sub="USD"                                                                               tone="amber" />
        </div>
      )}

      {/* ── Charts row ── */}
      {!loading && data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          <Card>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-text">معدل الحضور الشهري</h2>
                <p className="text-xs text-muted">آخر 6 أشهر</p>
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-teal/10 text-teal font-semibold">
                {data.overallAttRate}%
              </span>
            </div>
            <AttendanceChart data={data.attendanceByMonth} />
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-text">توزيع المهام</h2>
                <p className="text-xs text-muted">{'إجمالي ' + data.totalTasks + ' مهمة'}</p>
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-teal/10 text-teal font-semibold">
                {data.totalTasks > 0 ? Math.round((data.completedTasks / data.totalTasks) * 100) : 0}% مكتملة
              </span>
            </div>
            <TasksChart data={data.taskData} />
          </Card>
        </div>
      )}

      {/* ── Second row ── */}
      {!loading && data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          <Card>
            <div className="mb-4">
              <h2 className="text-sm font-bold text-text">توزيع صفقات CRM</h2>
              <p className="text-xs text-muted">حسب مرحلة خط المبيعات</p>
            </div>
            <CRMDonut data={data.crmData} />
          </Card>

          <Card>
            <div className="mb-4">
              <h2 className="text-sm font-bold text-text">أفضل الموظفين أداءً</h2>
              <p className="text-xs text-muted">بناءً على المهام والحضور</p>
            </div>
            {data.topStaff.length === 0 ? (
              <p className="text-xs text-muted text-center py-6">لا توجد بيانات كافية للفترة المحددة</p>
            ) : (
              <div className="space-y-0 -mx-1">
                {data.topStaff.map((s, i) => (
                  <div
                    key={s.name + i}
                    className="flex items-center gap-3 px-1 py-2 rounded-lg hover:bg-border/20 transition-colors"
                  >
                    <span className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0',
                      i === 0 ? 'bg-amber text-white' : 'bg-surface-alt text-muted',
                    )}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text truncate">{s.name}</p>
                      <p className="text-xs text-muted truncate">{s.dept}</p>
                    </div>
                    <div className="hidden sm:flex items-center gap-3 text-xs text-muted">
                      <span title="مهام">✅ {s.tasks}</span>
                      <span title="حضور">📅 {s.attendance}%</span>
                    </div>
                    <ScoreBadge score={s.score} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}