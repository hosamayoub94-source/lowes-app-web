// =============================================================
// AdminReportsScreen — management analytics dashboard.
//
// Charts are built with pure CSS/SVG (no external chart library):
//   • Vertical bar chart — monthly attendance %
//   • Horizontal bar chart — tasks by status
//   • Donut ring — CRM stage distribution
//   • KPI stat cards
//
// Data is mocked; replace `MOCK_*` with real store selectors
// once reporting service is wired.
// =============================================================
import { useState } from 'react';
import { cn }       from '@utils/classNames';
import { Card }     from '@components/ui/Card';

// ── Mock data ─────────────────────────────────────────────────
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
                   'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

const MOCK_ATTENDANCE = [
  { month: 'أكتوبر', pct: 91 },
  { month: 'نوفمبر', pct: 87 },
  { month: 'ديسمبر', pct: 78 },
  { month: 'يناير',  pct: 94 },
  { month: 'فبراير', pct: 89 },
  { month: 'مارس',   pct: 96 },
];

const MOCK_TASKS = [
  { label: 'مكتملة',   value: 148, tone: 'teal'   },
  { label: 'قيد التنفيذ', value: 64, tone: 'blue'   },
  { label: 'معلقة',    value: 29, tone: 'amber'  },
  { label: 'متأخرة',   value: 17, tone: 'red'    },
];

const MOCK_CRM_STAGES = [
  { label: 'توقع',    value: 12, color: '#0ea5e9' },
  { label: 'عرض',     value: 8,  color: '#14b8a6' },
  { label: 'تفاوض',   value: 5,  color: '#a855f7' },
  { label: 'مكسوبة',  value: 21, color: '#22c55e' },
  { label: 'خسارة',   value: 7,  color: '#ef4444' },
];

const MOCK_TOP_STAFF = [
  { name: 'أحمد العمري',   dept: 'المبيعات',   tasks: 24, attendance: 98, score: 96 },
  { name: 'سارة المطيري',  dept: 'الإدارة',    tasks: 19, attendance: 100, score: 94 },
  { name: 'فهد الشمري',    dept: 'المبيعات',   tasks: 22, attendance: 95, score: 91 },
  { name: 'نورة السالم',   dept: 'خدمة العملاء', tasks: 18, attendance: 97, score: 90 },
  { name: 'خالد الدوسري',  dept: 'التقنية',    tasks: 20, attendance: 93, score: 88 },
];

// ── Colour helpers ────────────────────────────────────────────
const TONE_BAR = {
  teal:  'bg-teal',
  blue:  'bg-blue',
  amber: 'bg-amber',
  red:   'bg-red',
};

const TONE_TEXT = {
  teal:  'text-teal',
  blue:  'text-blue-fg',
  amber: 'text-amber-fg',
  red:   'text-red-fg',
};

// ── KPI card ──────────────────────────────────────────────────
function KPICard({ icon, label, value, sub, tone = 'teal', delta }) {
  const deltaColor = delta > 0 ? 'text-green-fg' : delta < 0 ? 'text-red-fg' : 'text-muted';
  return (
    <div className="bg-surface rounded-xl border border-border p-4 relative overflow-hidden">
      <div className={cn('absolute top-0 inset-x-0 h-0.5', TONE_BAR[tone])} />
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl" aria-hidden>{icon}</span>
        <span className="text-xs text-muted">{label}</span>
      </div>
      <div className="text-2xl font-extrabold text-text tracking-tight">{value}</div>
      <div className="flex items-center gap-2 mt-1">
        {sub && <span className="text-xs text-muted">{sub}</span>}
        {delta != null && (
          <span className={cn('text-xs font-semibold', deltaColor)}>
            {delta > 0 ? `▲ ${delta}%` : delta < 0 ? `▼ ${Math.abs(delta)}%` : '—'}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Vertical bar chart ─────────────────────────────────────────
function AttendanceChart({ data }) {
  const max = Math.max(...data.map(d => d.pct));
  return (
    <div className="flex items-end justify-between gap-2 h-36 pt-2">
      {data.map((d, i) => {
        const h = Math.round((d.pct / max) * 100);
        const isLast = i === data.length - 1;
        return (
          <div key={d.month} className="flex-1 flex flex-col items-center gap-1.5">
            {/* Value label */}
            <span className={cn(
              'text-[10px] font-bold',
              isLast ? 'text-teal' : 'text-muted',
            )}>
              {d.pct}%
            </span>
            {/* Bar */}
            <div className="w-full rounded-t-md overflow-hidden bg-surface-alt" style={{ height: '80px' }}>
              <div
                className={cn(
                  'w-full rounded-t-md transition-all duration-700',
                  d.pct >= 90 ? 'bg-teal' : d.pct >= 80 ? 'bg-blue' : 'bg-amber',
                )}
                style={{ height: `${h}%`, marginTop: `${100 - h}%` }}
              />
            </div>
            {/* Month label */}
            <span className={cn(
              'text-[10px]',
              isLast ? 'font-bold text-teal' : 'text-muted',
            )}>
              {d.month}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Horizontal bar chart ───────────────────────────────────────
function TasksChart({ data }) {
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
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── CRM donut ──────────────────────────────────────────────────
function CRMDonut({ data }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  // Build conic-gradient segments
  let cursor = 0;
  const segments = data.map(d => {
    const pct = total > 0 ? (d.value / total) * 100 : 0;
    const seg = { ...d, start: cursor, pct };
    cursor += pct;
    return seg;
  });

  const gradient = segments
    .map(s => `${s.color} ${s.start.toFixed(1)}% ${(s.start + s.pct).toFixed(1)}%`)
    .join(', ');

  return (
    <div className="flex items-center gap-6">
      {/* Ring */}
      <div className="relative shrink-0" style={{ width: 100, height: 100 }}>
        <div
          className="w-full h-full rounded-full"
          style={{ background: `conic-gradient(${gradient})` }}
        />
        {/* Hole */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-[58px] h-[58px] rounded-full bg-surface flex flex-col items-center justify-center">
            <span className="text-lg font-extrabold text-text leading-none">{total}</span>
            <span className="text-[9px] text-muted">صفقة</span>
          </div>
        </div>
      </div>
      {/* Legend */}
      <div className="flex-1 space-y-2">
        {segments.map(s => (
          <div key={s.label} className="flex items-center gap-2 text-xs">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: s.color }}
            />
            <span className="text-text flex-1">{s.label}</span>
            <span className="text-muted font-semibold">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Score badge ────────────────────────────────────────────────
function ScoreBadge({ score }) {
  const tone = score >= 90 ? 'bg-teal/10 text-teal' : score >= 80 ? 'bg-blue-bg text-blue-fg' : 'bg-amber-bg text-amber-fg';
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold', tone)}>
      {score}
    </span>
  );
}

// ── Main screen ───────────────────────────────────────────────
const PERIODS = [
  { key: '30d', label: 'آخر 30 يوماً' },
  { key: '90d', label: 'آخر 90 يوماً' },
  { key: '1y',  label: 'هذا العام'    },
];

export default function AdminReportsScreen() {
  const [period, setPeriod] = useState('30d');

  return (
    <div className="space-y-5 pb-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold text-text">📊 التقارير والتحليلات</h1>
          <p className="text-sm text-muted mt-0.5">لوحة الأداء التشغيلي للمؤسسة</p>
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-1 bg-surface-alt rounded-xl p-1 border border-border">
          {PERIODS.map(p => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                period === p.key
                  ? 'bg-surface text-text shadow-sm'
                  : 'text-muted hover:text-text',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI grid — 2 cols mobile → 4 cols lg ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard icon="👥" label="إجمالي الموظفين"  value="47"   sub="5 جدد هذا الشهر"  tone="blue"  delta={12}  />
        <KPICard icon="📅" label="معدل الحضور"      value="93%"  sub="مارس 2026"         tone="teal"  delta={4}   />
        <KPICard icon="✅" label="مهام مكتملة"      value="148"  sub="من أصل 258 مهمة"  tone="teal"  delta={8}   />
        <KPICard icon="💰" label="قيمة خط المبيعات" value="1.4M" sub="ريال سعودي"        tone="amber" delta={-3}  />
      </div>

      {/* ── Charts row — 2 cards, stack on mobile ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Attendance bar chart */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-text">معدل الحضور الشهري</h2>
              <p className="text-xs text-muted">آخر 6 أشهر</p>
            </div>
            <span className="text-xs px-2 py-1 rounded-full bg-teal/10 text-teal font-semibold">
              متوسط 89%
            </span>
          </div>
          <AttendanceChart data={MOCK_ATTENDANCE} />
        </Card>

        {/* Tasks horizontal bar */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-text">توزيع المهام</h2>
              <p className="text-xs text-muted">إجمالي 258 مهمة</p>
            </div>
            <span className="text-xs px-2 py-1 rounded-full bg-teal/10 text-teal font-semibold">
              57% مكتملة
            </span>
          </div>
          <TasksChart data={MOCK_TASKS} />
        </Card>
      </div>

      {/* ── Second row — CRM donut + Top performers ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* CRM donut */}
        <Card>
          <div className="mb-4">
            <h2 className="text-sm font-bold text-text">توزيع صفقات CRM</h2>
            <p className="text-xs text-muted">حسب مرحلة خط المبيعات</p>
          </div>
          <CRMDonut data={MOCK_CRM_STAGES} />
        </Card>

        {/* Top performers table */}
        <Card>
          <div className="mb-4">
            <h2 className="text-sm font-bold text-text">أفضل الموظفين أداءً</h2>
            <p className="text-xs text-muted">بناءً على المهام والحضور</p>
          </div>
          <div className="space-y-0 -mx-1">
            {MOCK_TOP_STAFF.map((s, i) => (
              <div
                key={s.name}
                className="flex items-center gap-3 px-1 py-2 rounded-lg hover:bg-border/20 transition-colors"
              >
                {/* Rank */}
                <span className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0',
                  i === 0 ? 'bg-amber text-white' : 'bg-surface-alt text-muted',
                )}>
                  {i + 1}
                </span>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text truncate">{s.name}</p>
                  <p className="text-xs text-muted truncate">{s.dept}</p>
                </div>
                {/* Stats */}
                <div className="hidden sm:flex items-center gap-3 text-xs text-muted">
                  <span title="مهام">✅ {s.tasks}</span>
                  <span title="حضور">📅 {s.attendance}%</span>
                </div>
                <ScoreBadge score={s.score} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ── Disclaimer ── */}
      <p className="text-center text-xs text-muted/60">
        البيانات تجريبية — سيتم ربطها بالبيانات الفعلية عند تفعيل خدمة التقارير
      </p>
    </div>
  );
}
