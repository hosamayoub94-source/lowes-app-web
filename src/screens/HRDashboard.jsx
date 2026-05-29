// =============================================================
// HRDashboard — لوحة الموارد البشرية
//
// للمدير والأدمن فقط.
// يعرض:
//   • بطاقة لكل موظف (حضور + مهام + إجازات + أداء)
//   • تصفية حسب الفريق / حالة الأداء
//   • تصدير Excel
//   • تفاصيل الموظف (drawer)
// =============================================================
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@services/supabase';
import { ROLE_LABELS } from '@data/teams';
import { Hero }    from '@components/ui/Hero';
import { Card }    from '@components/ui/Card';

// ── Helpers ────────────────────────────────────────────────────

function currentMonth() { return new Date().toISOString().slice(0, 7); }

function slashMonth(ym) {
  // "2026-05" → "2026/05"
  return ym.replace('-', '/');
}

function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

function clamp(v, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, v)); }

function scoreLabel(s) {
  if (s >= 85) return { text: 'ممتاز',  cls: 'text-green-600 bg-green-50 dark:bg-green-900/30 dark:text-green-400' };
  if (s >= 65) return { text: 'جيد',    cls: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400' };
  if (s >= 45) return { text: 'مقبول',  cls: 'text-orange-600 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-400' };
  return               { text: 'ضعيف',  cls: 'text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400' };
}

function Bar({ value, color = 'bg-teal' }) {
  return (
    <div className="h-1.5 rounded-full bg-surface-alt overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: clamp(value) + '%' }} />
    </div>
  );
}

const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

function monthOpts() {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return { val: d.toISOString().slice(0, 7), label: MONTHS_AR[d.getMonth()] + ' ' + d.getFullYear() };
  });
}

// ── Employee Detail Drawer ─────────────────────────────────────
function EmpDrawer({ emp, month, onClose }) {
  if (!emp) return null;

  const lv = scoreLabel(emp.score ?? 0);
  const annualUsed  = emp.leaveStats?.annualUsed  ?? 0;
  const annualTotal = 21;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" dir="rtl">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full sm:max-w-md bg-surface rounded-t-3xl sm:rounded-3xl p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-extrabold text-text">{emp.employee_name}</p>
            <p className="text-xs text-muted mt-0.5">{ROLE_LABELS[emp.role_type] ?? emp.role_type} · {emp.team ?? '—'}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-text text-xl leading-none mt-0.5">✕</button>
        </div>

        {/* Score badge */}
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold ${lv.cls}`}>
          🏅 {lv.text} — {emp.score}%
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'أيام الحضور',    value: emp.attDays,    icon: '✅', cls: 'text-green-600' },
            { label: 'أيام الغياب',    value: emp.absentDays, icon: '❌', cls: 'text-red-500'   },
            { label: 'المهام المكتملة', value: `${emp.taskDone}/${emp.taskTotal}`, icon: '📋', cls: 'text-teal' },
            { label: 'نسبة الإنجاز',   value: emp.taskPct + '%', icon: '📈', cls: 'text-indigo-600' },
          ].map(k => (
            <div key={k.label} className="bg-surface-alt rounded-2xl p-3 text-center">
              <p className={`text-xl font-extrabold ${k.cls}`}>{k.icon} {k.value}</p>
              <p className="text-[11px] text-muted mt-0.5">{k.label}</p>
            </div>
          ))}
        </div>

        {/* Attendance bar */}
        <div>
          <div className="flex justify-between text-xs text-muted mb-1">
            <span>نسبة الحضور</span>
            <span className="font-semibold">{emp.attPct}%</span>
          </div>
          <Bar value={emp.attPct} color={emp.attPct >= 85 ? 'bg-teal' : emp.attPct >= 65 ? 'bg-amber' : 'bg-red'} />
        </div>

        {/* Leave balance */}
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-4">
          <p className="text-xs font-bold text-blue-700 dark:text-blue-300 mb-2">🏖️ رصيد الإجازة السنوية</p>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted text-xs">مستخدم</span>
            <span className="font-extrabold text-text">{annualUsed} / {annualTotal} يوم</span>
            <span className="text-muted text-xs">متبقي</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-blue-200 dark:bg-blue-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-700"
              style={{ width: Math.min((annualUsed / annualTotal) * 100, 100) + '%' }}
            />
          </div>
          <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-1 text-left">
            {annualTotal - annualUsed} أيام متبقية
          </p>
        </div>

        {/* Leave requests */}
        {emp.leaveStats?.requests?.length > 0 && (
          <div>
            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">آخر طلبات الإجازة</p>
            <div className="space-y-2">
              {emp.leaveStats.requests.slice(0, 3).map(r => (
                <div key={r.id} className="flex items-center justify-between text-xs bg-surface-alt rounded-xl px-3 py-2">
                  <span className="text-muted">{r.start_date} → {r.end_date}</span>
                  <span className={`font-semibold ${r.status === 'approved' ? 'text-green-600' : r.status === 'rejected' ? 'text-red-500' : 'text-amber-500'}`}>
                    {r.status === 'approved' ? '✅' : r.status === 'rejected' ? '❌' : '⏳'} {r.days} أيام
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Profile extra info */}
        <div className="space-y-2 text-sm">
          {emp.shift_type && (
            <div className="flex justify-between">
              <span className="text-muted">الدوام</span>
              <span className="font-semibold text-text">{{ morning:'صباحي 🌅', evening:'مسائي 🌇', night:'ليلي 🌙', flexible:'مرن 🕐' }[emp.shift_type] ?? emp.shift_type}</span>
            </div>
          )}
          {emp.page_name && (
            <div className="flex justify-between">
              <span className="text-muted">الصفحة</span>
              <span className="font-semibold text-text">📱 {emp.page_name}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Employee Card ──────────────────────────────────────────────
function EmpCard({ emp, onClick }) {
  const lv = scoreLabel(emp.score ?? 0);
  return (
    <button
      onClick={onClick}
      className="bg-surface border border-border rounded-2xl p-4 text-right hover:shadow-md hover:border-teal/30 transition-all w-full"
    >
      <div className="flex items-start gap-3">
        {/* Avatar initials */}
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-extrabold shrink-0"
          style={{ background: '#0d7377' }}
        >
          {emp.employee_name?.[0] ?? '?'}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <p className="text-sm font-bold text-text truncate">{emp.employee_name}</p>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${lv.cls}`}>
              {lv.text}
            </span>
          </div>
          <p className="text-[11px] text-muted mb-2">{ROLE_LABELS[emp.role_type] ?? emp.role_type} · {emp.team ?? '—'}</p>

          {/* Mini bars */}
          <div className="space-y-1.5">
            <div>
              <div className="flex justify-between text-[10px] text-muted mb-0.5">
                <span>الحضور</span><span>{emp.attPct}%</span>
              </div>
              <Bar value={emp.attPct} color={emp.attPct >= 85 ? 'bg-teal' : emp.attPct >= 65 ? 'bg-amber' : 'bg-red'} />
            </div>
            <div>
              <div className="flex justify-between text-[10px] text-muted mb-0.5">
                <span>المهام</span><span>{emp.taskPct}%</span>
              </div>
              <Bar value={emp.taskPct} color={emp.taskPct >= 85 ? 'bg-teal' : emp.taskPct >= 65 ? 'bg-amber' : 'bg-red'} />
            </div>
          </div>

          {/* Chips */}
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <span className="text-[10px] bg-surface-alt text-muted px-2 py-0.5 rounded-full">
              ✅ {emp.attDays} حضور
            </span>
            {emp.taskTotal > 0 && (
              <span className="text-[10px] bg-surface-alt text-muted px-2 py-0.5 rounded-full">
                📋 {emp.taskDone}/{emp.taskTotal} مهمة
              </span>
            )}
            {(emp.leaveStats?.annualUsed ?? 0) > 0 && (
              <span className="text-[10px] bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 px-2 py-0.5 rounded-full">
                🏖️ {emp.leaveStats.annualUsed} إجازة
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ══════════════════════════════════════════════════════════════
export default function HRDashboard() {
  const months = monthOpts();
  const [month,     setMonth]     = useState(months[0].val);
  const [data,      setData]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [selected,  setSelected]  = useState(null); // drawer employee
  const [exporting, setExporting] = useState(false);

  // ── Fetch all data ────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = month + '-01';
      const days = daysInMonth(month);
      const to   = `${month}-${String(days).padStart(2, '0')}`;
      const ymSlash   = slashMonth(month);
      const fromSlash = `${ymSlash}/01`;
      const toSlash   = `${ymSlash}/${String(days).padStart(2, '0')}`;
      const year  = Number(month.split('-')[0]);

      const [profRes, attRes, taskRes, leaveRes] = await Promise.allSettled([
        supabase.from('profiles')
          .select('id, employee_name, role_type, team, shift_type, page_name, is_active')
          .eq('is_active', true)
          .order('employee_name'),

        supabase.from('attendance')
          .select('employee_name, date, type')
          .in('type', ['in', 'out'])
          .gte('date', fromSlash)
          .lte('date', toSlash),

        supabase.from('tasks')
          .select('assigned_to, status')
          .gte('created_at', from + 'T00:00:00Z')
          .lte('created_at', to + 'T23:59:59Z'),

        supabase.from('leave_requests')
          .select('employee_id, employee_name, type, days, status, start_date, end_date, id')
          .gte('start_date', `${year}-01-01`)
          .lte('start_date', `${year}-12-31`),
      ]);

      const profiles  = profRes.status  === 'fulfilled' ? (profRes.value.data  ?? []) : [];
      const attLogs   = attRes.status   === 'fulfilled' ? (attRes.value.data   ?? []) : [];
      const tasks     = taskRes.status  === 'fulfilled' ? (taskRes.value.data  ?? []) : [];
      const leaves    = leaveRes.status === 'fulfilled' ? (leaveRes.value.data ?? []) : [];

      // Working days in month (Mon-Fri only — same formula as PerformanceScreen)
      let workDays = 0;
      const cur = new Date(from);
      const end = new Date(to);
      while (cur <= end) {
        const dow = cur.getDay();
        if (dow !== 0 && dow !== 6) workDays++;
        cur.setDate(cur.getDate() + 1);
      }
      workDays = Math.max(workDays, 1);

      // Attendance by employee (count distinct 'in' days)
      const attByEmp = {};
      attLogs.forEach(l => {
        if (l.type !== 'in') return;
        if (!attByEmp[l.employee_name]) attByEmp[l.employee_name] = new Set();
        attByEmp[l.employee_name].add(l.date);
      });

      // Tasks by employee (assigned_to may be a name or UUID — handle both)
      const taskByEmp = {};
      tasks.forEach(t => {
        const key = t.assigned_to;
        if (!key) return;
        if (!taskByEmp[key]) taskByEmp[key] = { total: 0, done: 0 };
        taskByEmp[key].total++;
        if (['done','completed','مكتملة'].includes(t.status)) taskByEmp[key].done++;
      });

      // Leaves by employee_id
      const leaveByEmp = {};
      leaves.forEach(l => {
        if (!leaveByEmp[l.employee_id]) leaveByEmp[l.employee_id] = { annualUsed: 0, requests: [] };
        leaveByEmp[l.employee_id].requests.push(l);
        if (l.type === 'annual' && l.status === 'approved') {
          leaveByEmp[l.employee_id].annualUsed += (l.days || 0);
        }
      });

      // Build scored list
      const scored = profiles.map(p => {
        const attDays  = attByEmp[p.employee_name]?.size ?? 0;
        const attPct   = clamp(Math.round((attDays / workDays) * 100));
        const absentDays = workDays - attDays;

        // Try match by name in tasks (assigned_to might be name string)
        const tData = taskByEmp[p.employee_name] ?? taskByEmp[p.id] ?? { total: 0, done: 0 };
        const taskPct  = tData.total > 0 ? clamp(Math.round((tData.done / tData.total) * 100)) : 0;

        // If no tasks assigned yet, score is based on attendance only
        const score = tData.total === 0
          ? clamp(Math.round(attPct))
          : clamp(Math.round(attPct * 0.5 + taskPct * 0.5));

        return {
          ...p,
          attDays,
          absentDays,
          attPct,
          taskDone:  tData.done,
          taskTotal: tData.total,
          taskPct,
          score,
          leaveStats: leaveByEmp[p.id] ?? { annualUsed: 0, requests: [] },
        };
      });

      setData(scored);
    } catch (err) {
      console.error('[HR]', err);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  // ── Teams for filter ──────────────────────────────────────────
  const teams = useMemo(() => [...new Set(data.map(e => e.team).filter(Boolean))], [data]);

  // ── Filtered list ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = data;
    if (teamFilter) list = list.filter(e => e.team === teamFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(e => e.employee_name?.toLowerCase().includes(q));
    }
    return list.sort((a, b) => b.score - a.score);
  }, [data, teamFilter, search]);

  // ── Summary stats ─────────────────────────────────────────────
  const summary = useMemo(() => {
    if (!data.length) return null;
    const avg = Math.round(data.reduce((s, e) => s + e.score, 0) / data.length);
    const top = data.reduce((a, b) => (b.score > a.score ? b : a), data[0]);
    const pendingLeaves = data.reduce((s, e) =>
      s + (e.leaveStats?.requests?.filter(r => r.status === 'pending').length ?? 0), 0);
    return { avg, top: top?.employee_name, total: data.length, pendingLeaves };
  }, [data]);

  // ── Export Excel ──────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true);
    try {
      const XLSX = await import('xlsx');
      const rows = filtered.map((e, i) => ({
        '#':              i + 1,
        'الموظف':         e.employee_name,
        'الدور':          ROLE_LABELS[e.role_type] ?? e.role_type,
        'الفريق':         e.team ?? '—',
        'أيام الحضور':    e.attDays,
        'أيام الغياب':    e.absentDays,
        'نسبة الحضور':    e.attPct + '%',
        'المهام المكتملة': e.taskDone + '/' + e.taskTotal,
        'نسبة الإنجاز':   e.taskPct + '%',
        'درجة الأداء':    e.score + '%',
        'الإجازات المستخدمة': e.leaveStats?.annualUsed ?? 0,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'HR');
      XLSX.writeFile(wb, `hr-report-${month}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5" dir="rtl">
      <Hero eyebrow="الموارد البشرية" title="لوحة HR 👥" subtitle="بيانات الموظفين — الحضور والأداء والإجازات" />

      {/* ── Summary KPIs ─────────────────────────────────────── */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: '👥', label: 'إجمالي الموظفين', value: summary.total,  cls: 'text-navy dark:text-blue-300' },
            { icon: '🏅', label: 'متوسط الأداء',    value: summary.avg + '%', cls: 'text-teal'                 },
            { icon: '🌟', label: 'الأفضل أداءً',    value: summary.top,    cls: 'text-amber-600'               },
            { icon: '⏳', label: 'إجازات معلّقة',   value: summary.pendingLeaves, cls: summary.pendingLeaves > 0 ? 'text-red-500' : 'text-muted' },
          ].map(k => (
            <div key={k.label} className="bg-surface border border-border rounded-2xl p-4">
              <div className={`text-lg font-extrabold truncate ${k.cls}`}>{k.icon} {k.value}</div>
              <div className="text-[11px] text-muted mt-0.5">{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Controls ─────────────────────────────────────────── */}
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Month */}
          <div>
            <label className="text-xs text-muted mb-1 block">الشهر</label>
            <select value={month} onChange={e => setMonth(e.target.value)}
              className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface text-text">
              {months.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
            </select>
          </div>
          {/* Team filter */}
          <div>
            <label className="text-xs text-muted mb-1 block">الفريق</label>
            <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)}
              className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface text-text">
              <option value="">كل الفرق</option>
              {teams.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {/* Search */}
          <div>
            <label className="text-xs text-muted mb-1 block">بحث</label>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="اسم الموظف…"
              className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-teal/40"
            />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs text-muted">{filtered.length} موظف</p>
          <button
            onClick={handleExport} disabled={exporting || loading}
            className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-text hover:bg-surface-alt transition disabled:opacity-40">
            {exporting ? 'جار التصدير…' : '⬇️ تصدير Excel'}
          </button>
        </div>
      </Card>

      {/* ── Employee Grid ─────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-36 bg-surface border border-border rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted">
          <p className="text-3xl mb-2">👥</p>
          <p className="text-sm font-semibold">لا توجد نتائج</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map(emp => (
            <EmpCard key={emp.id} emp={emp} onClick={() => setSelected(emp)} />
          ))}
        </div>
      )}

      {/* ── Drawer ───────────────────────────────────────────── */}
      <EmpDrawer emp={selected} month={month} onClose={() => setSelected(null)} />
    </div>
  );
}
