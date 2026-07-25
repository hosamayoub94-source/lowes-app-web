// =============================================================
// TeamHubScreen — مساحة عمل مستقلة لكل تيم (سوشال / مبيعات):
// كل أدوات التيم في مكان واحد + معاينة سريعة لمهام التيم النشطة.
// طلب المالك 2026-07-26: فصل واضح بين تيم السوشال وتيم المبيعات.
// =============================================================
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@hooks/useAuth';
import { fetchTasks } from '@modules/tasks/services/taskService';
import { sortTasks, effectiveStatus, shortDate } from '@modules/tasks/utils/taskUtils';
import { STATUS_META } from '@modules/tasks/types/task.types';
import { ROUTES } from '@routes/paths';

const CONFIGS = {
  social: {
    title: '🌐 مساحة السوشال ميديا',
    subtitle: 'كل أدوات فريق السوشال ومهامكم النشطة في مكان واحد',
    team: 'ميديا',
    tools: [
      { icon: '🌸', label: 'استوديو السوشال', path: ROUTES.SOCIAL_STUDIO },
      { icon: '📅', label: 'تقويم المحتوى', path: ROUTES.SOCIAL_CALENDAR },
      { icon: '✨', label: 'استوديو البرومبت', path: ROUTES.PROMPT_STUDIO },
      { icon: '📡', label: 'لوحة الميديا باير', path: ROUTES.MEDIA_BUYER_BOARD },
      { icon: '📣', label: 'الحملات', path: ROUTES.CAMPAIGNS },
      { icon: '🧾', label: 'تقريري اليومي', path: ROUTES.DAILY_REPORT },
      { icon: '🎯', label: 'أدائي (KPI)', path: ROUTES.PERFORMANCE },
      { icon: '🧑‍🤝‍🧑', label: 'إدارة الفريق', path: ROUTES.SOCIAL_TEAM },
    ],
  },
  sales: {
    title: '💼 مساحة المبيعات',
    subtitle: 'كل أدوات فريق المبيعات ومهامكم النشطة في مكان واحد',
    team: null, // سوريا/تركيا — يُحدَّد من سوق المستخدم
    tools: [
      { icon: '🧾', label: 'الطلبات', path: null }, // يُملأ حسب السوق
      { icon: '⭐', label: 'العملاء والأرشيف', path: ROUTES.CUSTOMERS },
      { icon: '📈', label: 'تقارير المبيعات', path: ROUTES.SALES },
      { icon: '📣', label: 'الحملات', path: ROUTES.CAMPAIGNS },
      { icon: '🤝', label: 'CRM', path: ROUTES.CRM },
      { icon: '💎', label: 'ربحية المنتج', path: ROUTES.PROFITABILITY },
      { icon: '🧾', label: 'تقريري اليومي', path: ROUTES.DAILY_REPORT },
      { icon: '📈', label: 'لوحة المدير', path: ROUTES.MANAGER_BOARD },
    ],
  },
};

function TaskPreviewRow({ task }) {
  const eff = effectiveStatus(task);
  const meta = STATUS_META[eff] || STATUS_META.pending;
  return (
    <Link to={ROUTES.TASKS} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-surface-alt hover:bg-surface-alt/70 transition">
      <span className="text-sm shrink-0" aria-hidden>{meta.icon}</span>
      <span className="text-sm text-text truncate flex-1">{task.title}</span>
      {task.due_date && <span className="text-[11px] text-muted shrink-0">{shortDate(task.due_date)}</span>}
    </Link>
  );
}

export function TeamHub({ teamKey }) {
  const cfg = CONFIGS[teamKey];
  const { id: userId, team: viewerTeam, order_market } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const effectiveTeam = cfg.team || viewerTeam || null;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchTasks({ viewAll: false, viewerId: userId, team: effectiveTeam })
      .then((rows) => { if (alive) setTasks(rows); })
      .catch(() => { if (alive) setTasks([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [userId, effectiveTeam]);

  const active = sortTasks(tasks.filter((t) => effectiveStatus(t) !== 'completed')).slice(0, 6);

  const tools = cfg.tools.map((t) =>
    t.path ? t : { ...t, path: order_market === 'turkey' ? ROUTES.ORDERS_TURKEY : ROUTES.ORDERS_SYRIA },
  );

  return (
    <div className="max-w-2xl mx-auto pb-24 space-y-4" dir="rtl">
      <div className="bg-navy rounded-2xl p-5 text-white">
        <h1 className="text-xl font-extrabold">{cfg.title}</h1>
        <p className="text-white/70 text-xs mt-1">{cfg.subtitle}</p>
      </div>

      {/* أدوات التيم */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {tools.map((t) => (
          <Link key={t.label} to={t.path}
            className="flex flex-col items-center gap-1.5 py-4 px-2 rounded-2xl bg-surface border border-border hover:border-teal/40 hover:shadow-sm transition text-center">
            <span className="text-2xl" aria-hidden>{t.icon}</span>
            <span className="text-xs font-semibold text-text">{t.label}</span>
          </Link>
        ))}
      </div>

      {/* معاينة مهام التيم النشطة */}
      <div className="bg-surface border border-border rounded-2xl p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-text">📋 مهام الفريق النشطة</p>
          <Link to={ROUTES.TASKS} className="text-xs font-semibold text-teal hover:opacity-80">فتح كل المهام ←</Link>
        </div>
        {loading ? (
          <div className="h-24 bg-surface-alt animate-pulse rounded-xl" />
        ) : active.length === 0 ? (
          <p className="text-sm text-muted py-4 text-center">لا مهام نشطة لفريقكم حالياً 🎉</p>
        ) : (
          <div className="space-y-1.5">
            {active.map((t) => <TaskPreviewRow key={t.id} task={t} />)}
          </div>
        )}
      </div>
    </div>
  );
}

export default TeamHub;
