// =============================================================
// HomeScreen — landing dashboard with KPIs + Charts
// =============================================================
import { useEffect, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { Hero }     from '@components/ui/Hero';
import { StatCard } from '@components/ui/StatCard';
import { Card, CardTitle, CardSubtitle } from '@components/ui/Card';
import { Button }   from '@components/ui/Button';
import { useAuth }  from '@hooks/useAuth';
import { navItemsForRole } from '@data/navigation';
import { Link }     from 'react-router-dom';
import { supabase } from '@services/supabase';
import { ROLES }    from '@data/teams';

function todayISO() { return new Date().toISOString().slice(0, 10); }

function last7Days() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function dayLabel(iso) {
  return new Date(iso).toLocaleDateString('ar-SA', { weekday: 'short' });
}

async function fetchKPIs(name, userId, role) {
  const today = todayISO();
  const year  = new Date().getFullYear();
  const days  = last7Days();
  const from  = days[0];

  const isManager = [ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_MANAGER].includes(role);

  const queries = [
    supabase
      .from('attendance')
      .select('id', { count: 'exact', head: true })
      .eq('employee_name', name)
      .eq('date', today),

    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .in('status', ['open', 'in_progress']),

    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false),

    userId
      ? supabase
          .from('leave_balances')
          .select('total_days, used_days')
          .eq('employee_id', userId)
          .eq('year', year)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),

    // Attendance last 7 days (all team)
    supabase
      .from('attendance_logs')
      .select('work_date, employee_id')
      .gte('work_date', from)
      .lte('work_date', today),

    // Sales last 7 days (managers only — skip for employees)
    isManager
      ? supabase
          .from('daily_sales_reports')
          .select('report_date, total_sales_usd, total_orders')
          .gte('report_date', from)
          .lte('report_date', today)
      : Promise.resolve({ data: [], error: null }),
  ];

  const [attRes, tasksRes, notifRes, leaveRes, attLogsRes, salesRes] =
    await Promise.allSettled(queries);

  const attendanceCount = attRes.status === 'fulfilled' ? (attRes.value.count ?? 0) : 0;
  const tasksCount      = tasksRes.status === 'fulfilled' ? (tasksRes.value.count ?? 0) : '—';
  const notifCount      = notifRes.status === 'fulfilled' ? (notifRes.value.count ?? 0) : '—';

  let leaveBalance = '—';
  if (leaveRes.status === 'fulfilled') {
    const d = leaveRes.value?.data;
    leaveBalance = (d?.total_days ?? 15) - (d?.used_days ?? 0);
  }

  // Build attendance chart data (count unique employees per day)
  const attByDay = {};
  days.forEach(d => { attByDay[d] = new Set(); });
  if (attLogsRes.status === 'fulfilled') {
    (attLogsRes.value.data || []).forEach(r => {
      if (attByDay[r.work_date]) attByDay[r.work_date].add(r.employee_id);
    });
  }
  const attendanceChart = days.map(d => ({
    day: dayLabel(d),
    count: attByDay[d].size,
  }));

  // Build sales chart data
  const salesByDay = {};
  days.forEach(d => { salesByDay[d] = 0; });
  if (salesRes.status === 'fulfilled') {
    (salesRes.value.data || []).forEach(r => {
      if (salesByDay[r.report_date] !== undefined)
        salesByDay[r.report_date] += Number(r.total_sales_usd) || 0;
    });
  }
  const salesChart = days.map(d => ({
    day: dayLabel(d),
    sales: Math.round(salesByDay[d]),
  }));

  return { attendanceCount, tasksCount, notifCount, leaveBalance, attendanceChart, salesChart };
}

// ── Custom Tooltip ──────────────────────────────────────────
function ChartTooltip({ active, payload, label, prefix = '', suffix = '' }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-border rounded-xl px-3 py-2 text-xs shadow-soft">
      <p className="text-muted mb-0.5">{label}</p>
      <p className="font-bold text-text">{prefix}{payload[0].value}{suffix}</p>
    </div>
  );
}

export default function HomeScreen() {
  const { name, role, id: userId } = useAuth();
  const items = navItemsForRole(role);
  const isManager = [ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_MANAGER].includes(role);

  const [kpi, setKpi] = useState({
    attendanceCount: '—',
    tasksCount: '—',
    notifCount: '—',
    leaveBalance: '—',
    attendanceChart: [],
    salesChart: [],
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!name) return;
    fetchKPIs(name, userId, role)
      .then(setKpi)
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [name, userId, role]);

  const attendanceLabel = loaded
    ? kpi.attendanceCount > 0 ? 'حاضر ✓' : 'غير مسجّل'
    : '—';

  const leaveLabel = typeof kpi.leaveBalance === 'number'
    ? `${kpi.leaveBalance} يوم`
    : kpi.leaveBalance;

  const [kpi, setKpi] = useState({
    attendanceCount: '—',
    tasksCount: '—',
    notifCount: '—',
    leaveBalance: '—',
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!name) return;
    fetchKPIs(name, userId)
      .then(setKpi)
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [name, userId]);

  const attendanceLabel = loaded
    ? kpi.attendanceCount > 0 ? 'حاضر ✓' : 'غير مسجّل'
    : '—';

  const leaveLabel = typeof kpi.leaveBalance === 'number'
    ? `${kpi.leaveBalance} يوم`
    : kpi.leaveBalance;

  return (
    <div className="space-y-5">
      <Hero
        eyebrow="لوحة التحكم"
        title={`أهلاً ${name || ''} 👋`}
        subtitle="تابع حضورك ومهامك وأرقام يومك من مكان واحد."
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="الحضور اليوم"
          value={attendanceLabel}
          hint="آخر تحديث الآن"
          tone="teal"
        />
        <StatCard label="مهام مفتوحة"    value={kpi.tasksCount} tone="blue"   />
        <StatCard label="الإشعارات الجديدة" value={kpi.notifCount} tone="amber" />
        <StatCard
          label="رصيد الإجازات"
          value={leaveLabel}
          hint={typeof kpi.leaveBalance === 'number' ? 'متبقٍ لهذا العام' : undefined}
          tone="purple"
        />
      </div>

      {/* Charts row */}
      {loaded && (
        <div className={`grid gap-4 ${isManager ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
          {/* Attendance chart */}
          <Card>
            <CardTitle>حضور الفريق — آخر 7 أيام</CardTitle>
            <CardSubtitle>عدد الموظفين الحاضرين يومياً</CardSubtitle>
            <div className="mt-4 h-36">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={kpi.attendanceChart} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border)/0.4)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'rgb(var(--color-muted))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'rgb(var(--color-muted))' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip suffix=" موظف" />} cursor={{ fill: 'rgb(var(--color-surface-alt))' }} />
                  <Bar dataKey="count" fill="rgb(var(--color-teal))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Sales chart — managers only */}
          {isManager && (
            <Card>
              <CardTitle>المبيعات — آخر 7 أيام</CardTitle>
              <CardSubtitle>إجمالي المبيعات اليومية بالدولار</CardSubtitle>
              <div className="mt-4 h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={kpi.salesChart} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border)/0.4)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'rgb(var(--color-muted))' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: 'rgb(var(--color-muted))' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip prefix="$" />} />
                    <Line
                      type="monotone"
                      dataKey="sales"
                      stroke="rgb(var(--color-green))"
                      strokeWidth={2.5}
                      dot={{ fill: 'rgb(var(--color-green))', r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Quick shortcuts */}
      <Card>
        <CardTitle>اختصارات سريعة</CardTitle>
        <CardSubtitle>الوصول السريع للأقسام التي تستخدمها بشكل متكرر</CardSubtitle>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {items.map((item) => (
            <Button
              key={item.id}
              as={Link}
              to={item.path}
              variant="secondary"
              size="lg"
              leftIcon={<span aria-hidden>{item.icon}</span>}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </Card>
    </div>
  );
}
