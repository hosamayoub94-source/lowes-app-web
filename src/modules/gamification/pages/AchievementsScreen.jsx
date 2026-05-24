// =============================================================
// AchievementsScreen — نظام النقاط والشارات والليدربورد
// Points from task_points table + attendance-based bonuses
// =============================================================
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@services/supabase';
import { useAuth } from '@hooks/useAuth';
import { Card, CardTitle, CardSubtitle } from '@components/ui/Card';
import { Hero } from '@components/ui/Hero';

// ── Constants ──────────────────────────────────────────────────
const MONTH_NAMES = [
  'يناير','فبراير','مارس','أبريل','مايو','يونيو',
  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر',
];

const BADGES = [
  { type: 'top_month',  icon: '🏆', label: 'موظف الشهر',     desc: 'الأعلى نقاطاً هذا الشهر',      color: '#d97706', bg: '#fef3c7' },
  { type: 'pts_100',    icon: '💯', label: 'مئة نقطة',        desc: '100+ نقطة هذا الشهر',           color: '#059669', bg: '#d1fae5' },
  { type: 'tasks_10',   icon: '🌟', label: 'نجم المهام',      desc: '10+ مهمة منجزة هذا الشهر',     color: '#7c3aed', bg: '#ede9fe' },
  { type: 'att_full',   icon: '📅', label: 'الحضور المثالي', desc: '20+ يوم حضور هذا الشهر',        color: '#0d7377', bg: '#ccfbf1' },
  { type: 'att_streak', icon: '🔥', label: 'متحمس',           desc: 'حضور هذا الأسبوع كاملاً',       color: '#ea580c', bg: '#ffedd5' },
  { type: 'tasks_25',   icon: '⚡', label: 'سريع الإنجاز',    desc: '25+ مهمة منجزة هذا الشهر',     color: '#2563eb', bg: '#dbeafe' },
  { type: 'pts_50',     icon: '🎯', label: 'مستمر',           desc: '50+ نقطة هذا الشهر',            color: '#0f1f3d', bg: '#e0e7ef' },
  { type: 'top3',       icon: '🥉', label: 'من الأفضل',       desc: 'في أفضل 3 موظفين هذا الشهر',   color: '#92400e', bg: '#fef3c7' },
];

const SETUP_SQL = `-- ═══════════════════════════════════════════════════
-- نظام الإنجازات — شغّل في Supabase SQL Editor
-- ═══════════════════════════════════════════════════

-- 1) جدول الشارات
CREATE TABLE IF NOT EXISTS employee_badges (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_name text NOT NULL,
  badge_type    text NOT NULL,
  month_year    text NOT NULL,         -- e.g. '2026-05'
  earned_at     timestamptz DEFAULT now(),
  UNIQUE(employee_name, badge_type, month_year)
);
CREATE INDEX IF NOT EXISTS idx_eb_emp ON employee_badges(employee_name);

-- 2) أعمدة إضافية في profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS birthday  date,
  ADD COLUMN IF NOT EXISTS hire_date date;

-- 3) Trigger: منح نقاط عند إنجاز مهمة
CREATE OR REPLACE FUNCTION award_task_points()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE pts int := 8;
BEGIN
  IF NEW.status = 'done' AND (OLD.status IS DISTINCT FROM 'done') THEN
    IF NEW.due_date IS NOT NULL AND NEW.completed_at::date <= NEW.due_date THEN
      pts := 15;
    END IF;
    INSERT INTO task_points (employee_name, task_id, points, reason)
    VALUES (
      NEW.assigned_to, NEW.id, pts,
      CASE WHEN pts = 15 THEN 'مهمة منجزة في الوقت' ELSE 'مهمة منجزة' END
    )
    ON CONFLICT DO NOTHING;
    UPDATE profiles
      SET total_points = COALESCE(total_points, 0) + pts
    WHERE employee_name = NEW.assigned_to;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_points ON tasks;
CREATE TRIGGER trg_task_points
  AFTER UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION award_task_points();`;

// ── Sub-components ─────────────────────────────────────────────
function SetupBanner({ onDismiss }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(SETUP_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-amber-900">⚙️ إعداد نظام الإنجازات</p>
          <p className="text-amber-800 text-xs mt-0.5">
            شغّل هذا SQL في Supabase لتفعيل النقاط والشارات التلقائية
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="text-amber-600 hover:text-amber-900 text-lg leading-none flex-shrink-0"
        >✕</button>
      </div>
      <textarea
        readOnly value={SETUP_SQL}
        className="w-full h-32 text-[10px] font-mono bg-white border border-amber-200 rounded-xl p-2 resize-none"
        dir="ltr"
      />
      <button
        onClick={copy}
        className="w-full py-2.5 rounded-xl font-bold text-sm transition-colors"
        style={{ background: copied ? '#059669' : '#d97706', color: '#fff' }}
      >
        {copied ? '✓ تم النسخ!' : '📋 نسخ SQL'}
      </button>
    </div>
  );
}

function BadgeChip({ badge, size = 'sm' }) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full font-bold border ${
        size === 'lg' ? 'px-4 py-2 text-sm' : 'px-2.5 py-1 text-xs'
      }`}
      style={{ borderColor: badge.color + '60', backgroundColor: badge.bg, color: badge.color }}
      title={badge.desc}
    >
      <span>{badge.icon}</span>
      <span>{badge.label}</span>
    </div>
  );
}

function Podium({ top3 }) {
  // Layout: [2nd | 1st | 3rd]
  const slots = [top3[1], top3[0], top3[2]];
  const heights  = [80, 112, 64];
  const medals   = ['🥈', '🥇', '🥉'];
  const bgColors = [
    'linear-gradient(180deg,#9ca3af,#6b7280)',
    'linear-gradient(180deg,#f59e0b,#d97706)',
    'linear-gradient(180deg,#cd7f32,#b45309)',
  ];

  return (
    <div className="flex items-end justify-center gap-3 pb-2 pt-4">
      {slots.map((entry, idx) => !entry ? null : (
        <div key={entry.name} className="flex flex-col items-center gap-1 w-24">
          {/* Avatar */}
          <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white shadow-md bg-navy/10 flex items-center justify-center text-xl font-bold text-navy flex-shrink-0">
            {entry.avatar
              ? <img src={entry.avatar} className="w-full h-full object-cover" alt={entry.name} />
              : entry.name.charAt(0).toUpperCase()}
          </div>
          <p className="font-bold text-text text-xs text-center truncate w-full px-1">{entry.name}</p>
          <p className="text-teal text-xs font-bold">{entry.monthlyPoints} نقطة</p>
          {/* Podium block */}
          <div
            className="w-full rounded-t-xl flex items-center justify-center text-2xl"
            style={{ height: heights[idx], background: bgColors[idx] }}
          >
            {medals[idx]}
          </div>
        </div>
      ))}
    </div>
  );
}

function PointsBar({ value, max }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: 'rgb(var(--color-teal))' }}
        />
      </div>
    </div>
  );
}

function HowToEarnCard() {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <button
        className="w-full flex items-center justify-between text-right"
        onClick={() => setOpen(o => !o)}
      >
        <CardTitle className="mb-0">💡 كيف تكسب النقاط؟</CardTitle>
        <span className="text-muted text-lg">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { icon: '✅', label: 'مهمة في الوقت',       pts: '+15' },
            { icon: '⏳', label: 'مهمة متأخرة',         pts: '+8'  },
            { icon: '📅', label: 'يوم حضور',             pts: '+5'  },
            { icon: '🎯', label: 'أسبوع حضور كامل',      pts: '+20' },
          ].map(r => (
            <div key={r.label} className="flex items-center gap-2 p-2.5 rounded-xl bg-surface-alt">
              <span className="text-xl">{r.icon}</span>
              <span className="flex-1 text-sm text-text">{r.label}</span>
              <span className="font-black text-teal">{r.pts}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Main Screen ────────────────────────────────────────────────
export default function AchievementsScreen() {
  const { name: myName } = useAuth();
  const [leaderboard, setLeaderboard] = useState([]);
  const [myBadges,    setMyBadges]    = useState([]);
  const [myHistory,   setMyHistory]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showSetup,   setShowSetup]   = useState(false);
  const [tab,         setTab]         = useState('leaderboard'); // 'leaderboard' | 'badges'

  const now        = new Date();
  const monthLabel = MONTH_NAMES[now.getMonth()] + ' ' + now.getFullYear();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const today      = now.toISOString().slice(0, 10);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [profilesRes, ptsRes, attRes, tasksRes, historyRes] = await Promise.allSettled([
        // All active employees
        supabase
          .from('profiles')
          .select('employee_name, team, avatar_url, total_points')
          .eq('is_active', true),

        // Monthly task points aggregated
        supabase
          .from('task_points')
          .select('employee_name, points')
          .gte('created_at', monthStart + 'T00:00:00'),

        // Monthly attendance count per employee — date stored as 'YYYY/MM/DD'
        supabase
          .from('attendance')
          .select('employee_name')
          .eq('type', 'in')
          .gte('date', monthStart.replace(/-/g, '/'))
          .lte('date', today.replace(/-/g, '/')),

        // Monthly done tasks count per employee
        supabase
          .from('tasks')
          .select('assigned_to')
          .eq('status', 'done')
          .gte('completed_at', monthStart + 'T00:00:00'),

        // My points history
        myName
          ? supabase
              .from('task_points')
              .select('points, reason, created_at')
              .eq('employee_name', myName)
              .order('created_at', { ascending: false })
              .limit(15)
          : Promise.resolve({ data: [], error: null }),
      ]);

      // Detect missing tables
      const isMissing = (r) =>
        r.status === 'fulfilled' && r.value?.error?.code === '42P01';
      if (isMissing(ptsRes)) setShowSetup(true);

      const profiles  = profilesRes.value?.data  ?? [];
      const pts       = ptsRes.value?.data        ?? [];
      const att       = attRes.value?.data        ?? [];
      const doneTasks = tasksRes.value?.data      ?? [];
      const history   = historyRes.value?.data    ?? [];

      setMyHistory(history);

      // Aggregate monthly points
      const ptsMap = {};
      pts.forEach(r => {
        ptsMap[r.employee_name] = (ptsMap[r.employee_name] || 0) + (r.points || 0);
      });

      // Aggregate attendance days
      const attMap = {};
      att.forEach(r => {
        attMap[r.employee_name] = (attMap[r.employee_name] || 0) + 1;
      });

      // Aggregate done tasks
      const tasksMap = {};
      doneTasks.forEach(r => {
        tasksMap[r.assigned_to] = (tasksMap[r.assigned_to] || 0) + 1;
      });

      // Build leaderboard — fall back to task count * 10 if task_points is empty
      const hasPtsData = pts.length > 0;
      const lb = profiles
        .filter(p => p.employee_name)
        .map(p => ({
          name:          p.employee_name,
          team:          p.team || '—',
          avatar:        p.avatar_url,
          totalPoints:   p.total_points || 0,
          monthlyPoints: hasPtsData
            ? (ptsMap[p.employee_name] || 0)
            : (tasksMap[p.employee_name] || 0) * 10,
          attendanceDays: attMap[p.employee_name] || 0,
          doneTasks:      tasksMap[p.employee_name] || 0,
        }))
        .sort((a, b) => b.monthlyPoints - a.monthlyPoints);

      setLeaderboard(lb);

      // Compute my badges
      const me     = lb.find(e => e.name === myName);
      const myRank = lb.findIndex(e => e.name === myName);
      if (me) {
        const earned = [];
        if (myRank === 0 && me.monthlyPoints > 0)   earned.push('top_month');
        if (myRank < 3 && myRank > 0)               earned.push('top3');
        if (me.monthlyPoints >= 100)                earned.push('pts_100');
        if (me.monthlyPoints >= 50)                 earned.push('pts_50');
        if (me.doneTasks >= 25)                     earned.push('tasks_25');
        if (me.doneTasks >= 10)                     earned.push('tasks_10');
        if (me.attendanceDays >= 20)                earned.push('att_full');
        if (me.attendanceDays >= 5)                 earned.push('att_streak');
        setMyBadges(BADGES.filter(b => earned.includes(b.type)));
      }
    } finally {
      setLoading(false);
    }
  }, [myName, monthStart, today]);

  useEffect(() => { load(); }, [load]);

  const myEntry  = leaderboard.find(e => e.name === myName);
  const myRank   = leaderboard.findIndex(e => e.name === myName);
  const top3     = leaderboard.slice(0, 3);
  const maxPts   = leaderboard[0]?.monthlyPoints || 1;

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="space-y-4 pb-8">
      <Hero
        eyebrow="الإنجازات"
        title="نقاطك وشاراتك 🏆"
        subtitle={`ليدربورد فريق Lowe's — ${monthLabel}`}
      />

      {showSetup && <SetupBanner onDismiss={() => setShowSetup(false)} />}

      {/* My rank strip */}
      {myEntry ? (
        <Card>
          <div className="flex items-center gap-4">
            <div className="text-center flex-shrink-0">
              <div className="text-4xl font-black leading-none">
                {myRank === 0 ? '🥇' : myRank === 1 ? '🥈' : myRank === 2 ? '🥉' : `#${myRank + 1}`}
              </div>
              <p className="text-muted text-[10px] mt-1">مرتبتك</p>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-text text-lg leading-tight">
                {myName}
                <span className="text-teal text-sm font-bold mr-2">({myEntry.monthlyPoints} نقطة)</span>
              </p>
              <p className="text-muted text-xs mt-0.5">{myEntry.attendanceDays} يوم حضور · {myEntry.doneTasks} مهمة منجزة</p>
              {myBadges.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {myBadges.map(b => <BadgeChip key={b.type} badge={b} />)}
                </div>
              )}
            </div>
          </div>
        </Card>
      ) : !loading && (
        <Card>
          <p className="text-center text-muted text-sm py-2">
            لم يتم العثور على ملفك الشخصي بعد
          </p>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex gap-2 bg-surface-alt rounded-2xl p-1">
        {[
          { key: 'leaderboard', label: '🏅 الترتيب' },
          { key: 'badges',      label: '🎖️ الشارات' },
          { key: 'history',     label: '📜 سجلي'    },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${
              tab === t.key
                ? 'bg-surface text-text shadow-soft'
                : 'text-muted hover:text-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: LEADERBOARD ────────────────────────────────── */}
      {tab === 'leaderboard' && (
        <>
          {/* Podium */}
          {!loading && top3.filter(Boolean).length >= 2 && (
            <Card>
              <CardTitle>منصة الأبطال</CardTitle>
              <CardSubtitle>{monthLabel}</CardSubtitle>
              <Podium top3={top3} />
            </Card>
          )}

          {/* Full list */}
          <Card>
            <CardTitle>الترتيب الكامل</CardTitle>
            <CardSubtitle>مرتّب حسب النقاط الشهرية</CardSubtitle>
            <div className="mt-3 space-y-1.5">
              {loading ? (
                <div className="py-10 text-center text-muted text-sm">جاري التحميل...</div>
              ) : leaderboard.length === 0 ? (
                <div className="py-10 text-center text-muted text-sm">
                  <p className="text-3xl mb-2">📭</p>
                  <p>لا توجد بيانات بعد</p>
                  <p className="text-xs mt-1">ابدأ بإنجاز المهام لتظهر في الليدربورد!</p>
                </div>
              ) : leaderboard.map((entry, idx) => (
                <div
                  key={entry.name}
                  className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                    entry.name === myName
                      ? 'bg-teal/10 border border-teal/20'
                      : 'hover:bg-surface-alt'
                  }`}
                >
                  {/* Rank */}
                  <span className="text-lg w-8 text-center flex-shrink-0 font-black">
                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                  </span>

                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full overflow-hidden border border-border bg-surface-alt flex items-center justify-center font-bold text-navy flex-shrink-0">
                    {entry.avatar
                      ? <img src={entry.avatar} className="w-full h-full object-cover" alt="" />
                      : entry.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <p className="font-bold text-text text-sm truncate">{entry.name}</p>
                      {entry.name === myName && (
                        <span className="text-teal text-[10px] font-bold flex-shrink-0">أنت</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <PointsBar value={entry.monthlyPoints} max={maxPts} />
                    </div>
                  </div>

                  {/* Points */}
                  <div className="text-center flex-shrink-0">
                    <p className="font-black text-navy text-base leading-tight">
                      {entry.monthlyPoints}
                    </p>
                    <p className="text-muted text-[10px]">نقطة</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {/* ── TAB: BADGES ─────────────────────────────────────── */}
      {tab === 'badges' && (
        <Card>
          <CardTitle>كل الشارات المتاحة</CardTitle>
          <CardSubtitle>اجمعها بالإنجازات والحضور المنتظم</CardSubtitle>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {BADGES.map(badge => {
              const earned = myBadges.some(b => b.type === badge.type);
              return (
                <div
                  key={badge.type}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    earned
                      ? 'border-current shadow-sm'
                      : 'border-border opacity-50 grayscale'
                  }`}
                  style={earned ? { borderColor: badge.color + '60', backgroundColor: badge.bg } : {}}
                >
                  <span className="text-3xl">{badge.icon}</span>
                  <div>
                    <p className="font-bold text-sm" style={earned ? { color: badge.color } : {}}>
                      {badge.label}
                      {earned && <span className="mr-1 text-xs">✓</span>}
                    </p>
                    <p className="text-muted text-xs">{badge.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── TAB: MY HISTORY ─────────────────────────────────── */}
      {tab === 'history' && (
        <Card>
          <CardTitle>سجل نقاطك</CardTitle>
          <CardSubtitle>آخر 15 عملية تسجيل نقاط</CardSubtitle>
          <div className="mt-3 divide-y divide-border">
            {myHistory.length === 0 ? (
              <p className="py-10 text-center text-muted text-sm">
                لم تحصل على نقاط بعد — أنجز مهمة لتبدأ!
              </p>
            ) : myHistory.map((p, i) => (
              <div key={i} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm text-text font-medium">{p.reason || 'إنجاز مهمة'}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {new Date(p.created_at).toLocaleDateString('ar-SA', {
                      day: 'numeric', month: 'short', year: 'numeric'
                    })}
                  </p>
                </div>
                <span className="font-black text-teal text-lg">+{p.points}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <HowToEarnCard />
    </div>
  );
}
