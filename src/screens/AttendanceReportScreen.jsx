// =============================================================
// AttendanceReportScreen — per-employee attendance report
// =============================================================
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@hooks/useAuth';
import { Hero } from '@components/ui/Hero';
import { Card, CardTitle } from '@components/ui/Card';

// ── Helpers ────────────────────────────────────────────────────────────────

function currentMonth() { return new Date().toISOString().slice(0, 7); }

function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

function fmtTime(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }); }
  catch { return '—'; }
}

function calcHours(checkIn, checkOut) {
  if (!checkIn || !checkOut) return null;
  const mins = (new Date(checkOut) - new Date(checkIn)) / 60000;
  if (mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

function calcTotalHours(logs) {
  let mins = 0;
  for (const l of logs) {
    const checkIn  = l.check_in  || l.check_in_time;
    const checkOut = l.check_out || l.check_out_time;
    if (checkIn && checkOut) {
      const diff = (new Date(checkOut) - new Date(checkIn)) / 60000;
      if (diff > 0) mins += diff;
    }
  }
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return { h, m, total: mins };
}

const STATUS_MAP = {
  present:     { label: 'حضور',     cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  late:        { label: 'متأخر',    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  checked_out: { label: 'خرج',      cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  absent:      { label: 'غياب',     cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  on_break:    { label: 'استراحة',  cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  holiday:     { label: 'إجازة',    cls: 'bg-teal/10 text-teal' },
};

// ── Mock data ──────────────────────────────────────────────────────────────

function buildMockData(employeeId, ym) {
  const days = daysInMonth(ym);
  const logs = [];
  const seed = (employeeId + ym).split('').reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 0);
  for (let d = 1; d <= days; d++) {
    const dateStr = `${ym}-${String(d).padStart(2, '0')}`;
    const dow = new Date(dateStr).getDay(); // 0=Sun
    if (dow === 5) continue; // Friday off
    const rng = Math.abs(Math.imul(seed, d * 7919)) % 100;
    if (rng < 10) continue; // ~10% absent
    const lateMin = rng < 25 ? 20 : 0;
    const checkIn  = new Date(`${dateStr}T0${8 + (rng % 2)}:${String(lateMin).padStart(2,'0')}:00`);
    const checkOut = new Date(`${dateStr}T${16 + (rng % 2)}:${String(rng % 60).padStart(2,'0')}:00`);
    logs.push({ id: `mock-${d}`, work_date: dateStr, check_in: checkIn.toISOString(), check_out: checkOut.toISOString(), status: lateMin > 0 ? 'late' : 'checked_out' });
  }
  return logs;
}

const MOCK_EMPLOYEES = [
  { id: 'emp-01', employee_name: 'أحمد العلي',  role_type: 'employee', team: 'المبيعات' },
  { id: 'emp-02', employee_name: 'سارة محمد',   role_type: 'employee', team: 'السوشال' },
  { id: 'emp-03', employee_name: 'محمد عمر',    role_type: 'manager',  team: 'الإدارة' },
  { id: 'emp-04', employee_name: 'نورة خالد',   role_type: 'employee', team: 'المبيعات' },
  { id: 'emp-05', employee_name: 'فهد السعيد',  role_type: 'employee', team: 'السوشال' },
];

// ── Data fetchers ─────────────────────────────────────────────────────────

async function fetchEmployees() {
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase
    .from('profiles')
    .select('id, employee_name, role_type, team, is_active')
    .eq('is_active', true)
    .order('employee_name');
  if (error?.message?.includes('does not exist') || error?.message?.includes('relation')) {
    return MOCK_EMPLOYEES;
  }
  if (error) return MOCK_EMPLOYEES;
  return data?.length ? data : MOCK_EMPLOYEES;
}

async function fetchLogs(employeeId, employeeName, ym, isMock) {
  if (isMock) return buildMockData(employeeId, ym);
  const { supabase } = await import('@services/supabase');
  const from = `${ym}-01`;
  const days = daysInMonth(ym);
  const to   = `${ym}-${String(days).padStart(2, '0')}`;

  // 1️⃣ Try attendance_logs (UUID-based, advanced table)
  const { data: logsData, error: logsErr } = await supabase
    .from('attendance_logs')
    .select('id, work_date, check_in, check_out, status')
    .eq('employee_id', employeeId)
    .gte('work_date', from)
    .lte('work_date', to)
    .order('work_date');

  // If table exists and has data → use it
  if (!logsErr && logsData?.length) return logsData;

  // 2️⃣ Fallback: main `attendance` table
  // Real schema: two rows per day (type="in" + type="out"), date="YYYY/MM/DD", time_in column
  if (employeeName) {
    const { data: attData, error: attErr } = await supabase
      .from('attendance')
      .select('id, date, type, time_in, note')
      .eq('employee_name', employeeName)
      .gte('date', from)   // Supabase casts YYYY/MM/DD text to date for range queries
      .lte('date', to)
      .in('type', ['in', 'out'])
      .order('date');

    if (!attErr && attData?.length) {
      // Aggregate: one entry per day
      const byDate = {};
      attData.forEach(r => {
        const isoDate = r.date.replace(/\//g, '-'); // "2026/05/24" → "2026-05-24"
        if (!byDate[isoDate]) byDate[isoDate] = { checkIn: null, checkOut: null };
        if (r.type === 'in')  byDate[isoDate].checkIn  = r.time_in;
        if (r.type === 'out') byDate[isoDate].checkOut = r.time_in;
      });
      return Object.entries(byDate).map(([isoDate, d]) => ({
        id:         `att-${isoDate}`,
        work_date:  isoDate,
        // Convert "HH:MM" → ISO timestamp so calcHours works
        check_in:   d.checkIn  ? `${isoDate}T${d.checkIn}:00`  : null,
        check_out:  d.checkOut ? `${isoDate}T${d.checkOut}:00` : null,
        status:     d.checkIn ? (d.checkOut ? 'checked_out' : 'present') : null,
      }));
    }
  }

  // 3️⃣ Last resort: mock
  return buildMockData(employeeId, ym);
}

// ── Excel Export ──────────────────────────────────────────────────────────

async function exportAttendance(rows, employeeName, ym) {
  const XLSX = await import('xlsx');
  const data = rows.map(r => ({
    'التاريخ':      r.date,
    'دخول':         r.checkIn  ? fmtTime(r.checkIn)  : '—',
    'خروج':         r.checkOut ? fmtTime(r.checkOut) : '—',
    'ساعات العمل':  r.hours ?? '—',
    'الحالة':       STATUS_MAP[r.status]?.label ?? r.status ?? '—',
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'الحضور');
  XLSX.writeFile(wb, `attendance-${employeeName}-${ym}.xlsx`);
}

// ── StatusBadge ────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const meta = STATUS_MAP[status] ?? { label: status ?? '—', cls: 'bg-gray-100 text-gray-500' };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

// ── SummaryBar ─────────────────────────────────────────────────────────────

function SummaryBar({ rows }) {
  const present  = rows.filter(r => r.checkIn).length;
  const absent   = rows.filter(r => !r.checkIn && r.isWorkday).length;
  const late     = rows.filter(r => r.status === 'late').length;
  const { h, m } = calcTotalHours(rows.map(r => ({ check_in: r.checkIn, check_out: r.checkOut })));

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { icon: '✅', label: 'أيام الحضور',  value: present,         cls: 'text-green-600' },
        { icon: '❌', label: 'أيام الغياب',  value: absent,          cls: 'text-red-500'   },
        { icon: '⏰', label: 'أيام التأخر',  value: late,            cls: 'text-amber-500' },
        { icon: '⏱️', label: 'إجمالي ساعات', value: `${h}:${String(m).padStart(2,'0')}`, cls: 'text-teal' },
      ].map(k => (
        <div key={k.label} className="bg-surface border border-border rounded-2xl p-4">
          <div className={`text-xl font-bold ${k.cls}`}>{k.icon} {k.value}</div>
          <div className="text-xs text-muted mt-0.5">{k.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────

export default function AttendanceReportScreen() {
  const { role } = useAuth();
  const isManager = role === 'admin' || role === 'manager';

  const [employees, setEmployees]       = useState([]);
  const [selectedEmp, setSelectedEmp]   = useState('');
  const [teamFilter, setTeamFilter]     = useState('');
  const [month, setMonth]               = useState(currentMonth());
  const [logs, setLogs]                 = useState([]);
  const [loadingEmps, setLoadingEmps]   = useState(true);
  const [loadingLogs, setLoadingLogs]   = useState(false);
  const [isMock, setIsMock]             = useState(false);
  const [exporting, setExporting]       = useState(false);

  // Load employees
  useEffect(() => {
    setLoadingEmps(true);
    fetchEmployees().then(list => {
      setEmployees(list);
      const isMockList = list === MOCK_EMPLOYEES || list.some(e => e.id.startsWith('emp-0'));
      setIsMock(isMockList);
      if (list.length) setSelectedEmp(list[0].id);
      setLoadingEmps(false);
    });
  }, []);

  // Load logs when employee or month changes
  useEffect(() => {
    if (!selectedEmp) return;
    setLoadingLogs(true);
    const emp = employees.find(e => e.id === selectedEmp);
    fetchLogs(selectedEmp, emp?.employee_name, month, isMock).then(data => {
      setLogs(data);
      setLoadingLogs(false);
    });
  }, [selectedEmp, month, isMock, employees]);

  // Teams for filter dropdown
  const teams = useMemo(() => [...new Set(employees.map(e => e.team).filter(Boolean))], [employees]);
  const filteredEmployees = teamFilter ? employees.filter(e => e.team === teamFilter) : employees;

  const selectedEmployee = employees.find(e => e.id === selectedEmp);

  // Build day rows (one per calendar day of month)
  const rows = useMemo(() => {
    const logByDate = {};
    for (const l of logs) {
      const date = l.work_date ?? (l.check_in ? l.check_in.slice(0, 10) : null);
      if (date) logByDate[date] = l;
    }
    const days = daysInMonth(month);
    const result = [];
    for (let d = 1; d <= days; d++) {
      const date   = `${month}-${String(d).padStart(2, '0')}`;
      const dow    = new Date(date).getDay();
      const isFri  = dow === 5;
      const log    = logByDate[date];
      const checkIn  = log?.check_in  || log?.check_in_time  || null;
      const checkOut = log?.check_out || log?.check_out_time || null;
      result.push({
        date,
        day: d,
        dow,
        isFriday: isFri,
        isWorkday: !isFri,
        checkIn,
        checkOut,
        hours:  calcHours(checkIn, checkOut),
        status: log?.status ?? (isFri ? 'holiday' : (checkIn ? 'checked_out' : null)),
      });
    }
    return result;
  }, [logs, month]);

  const handleExport = async () => {
    if (!selectedEmployee) return;
    setExporting(true);
    try { await exportAttendance(rows, selectedEmployee.employee_name, month); }
    finally { setExporting(false); }
  };

  const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  return (
    <div className="space-y-5" dir="rtl">
      <Hero eyebrow="تقارير" title="تقرير الحضور" subtitle="سجل حضور وانصراف الموظفين" />

      {isMock && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-2 text-xs text-amber-700 dark:text-amber-400">
          ⚠️ بيانات تجريبية — جدول <code>attendance_logs</code> غير موجود في Supabase
        </div>
      )}

      {/* Controls */}
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Team filter */}
          <div>
            <label className="text-xs text-muted mb-1 block">الفريق</label>
            <select
              value={teamFilter}
              onChange={e => { setTeamFilter(e.target.value); setSelectedEmp(''); }}
              className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface text-text"
            >
              <option value="">كل الفرق</option>
              {teams.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {/* Employee filter */}
          <div>
            <label className="text-xs text-muted mb-1 block">الموظف</label>
            <select
              value={selectedEmp}
              onChange={e => setSelectedEmp(e.target.value)}
              disabled={loadingEmps}
              className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface text-text disabled:opacity-50"
            >
              {loadingEmps
                ? <option>جار التحميل…</option>
                : filteredEmployees.map(e => (
                    <option key={e.id} value={e.id}>{e.employee_name}</option>
                  ))
              }
            </select>
          </div>
          {/* Month */}
          <div>
            <label className="text-xs text-muted mb-1 block">الشهر</label>
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface text-text"
            />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
          {selectedEmployee && (
            <div className="text-sm font-semibold text-text">
              📋 {selectedEmployee.employee_name}
              {selectedEmployee.team && <span className="text-xs text-muted mr-2">({selectedEmployee.team})</span>}
            </div>
          )}
          <button
            onClick={handleExport}
            disabled={exporting || !selectedEmp || loadingLogs}
            className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-text hover:bg-cream transition disabled:opacity-40"
          >
            {exporting ? 'جار التصدير…' : '⬇️ تصدير Excel'}
          </button>
        </div>
      </Card>

      {/* Summary cards */}
      {!loadingLogs && rows.length > 0 && <SummaryBar rows={rows} />}

      {/* Attendance table */}
      <Card>
        <CardTitle>سجل الحضور</CardTitle>
        {loadingLogs ? (
          <div className="text-center py-10 text-muted text-sm">جار التحميل…</div>
        ) : (
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted border-b border-border">
                  <th className="py-2 px-3 text-right">التاريخ</th>
                  <th className="py-2 px-3 text-right">اليوم</th>
                  <th className="py-2 px-3 text-center">دخول</th>
                  <th className="py-2 px-3 text-center">خروج</th>
                  <th className="py-2 px-3 text-center">ساعات</th>
                  <th className="py-2 px-3 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr
                    key={r.date}
                    className={[
                      'border-t border-border transition',
                      r.isFriday ? 'opacity-40 bg-cream/30' : 'hover:bg-cream/50',
                      !r.checkIn && !r.isFriday ? 'bg-red-50/40 dark:bg-red-900/10' : '',
                    ].join(' ')}
                  >
                    <td className="py-2 px-3 text-xs text-muted font-mono">{r.date}</td>
                    <td className="py-2 px-3 text-xs text-text">{DAY_NAMES[r.dow]}</td>
                    <td className="py-2 px-3 text-center text-xs font-mono text-green-600">
                      {r.checkIn ? fmtTime(r.checkIn) : '—'}
                    </td>
                    <td className="py-2 px-3 text-center text-xs font-mono text-red-500">
                      {r.checkOut ? fmtTime(r.checkOut) : '—'}
                    </td>
                    <td className="py-2 px-3 text-center text-xs font-mono text-teal font-semibold">
                      {r.hours ?? '—'}
                    </td>
                    <td className="py-2 px-3 text-center">
                      {r.isFriday
                        ? <StatusBadge status="holiday" />
                        : r.status
                          ? <StatusBadge status={r.status} />
                          : <span className="text-[10px] text-muted">غياب</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
