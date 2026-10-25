// =============================================================
// TodayView — «يحتاج إجراء اليوم»: the landing view of the Ops Center.
// Five sections in order of urgency. In founder mode only decisions and
// approvals are shown — never execution work (ABOS 03_People_System §
// قاعدة تكليف المهام).
// =============================================================
import { useMemo } from 'react';
import { EmptyState } from '@components/ui/EmptyState';
import { groupForToday } from '../utils/taskWorkflow';
import { todayKey } from '../utils/taskDates';
import { OpsTaskCard } from './OpsTaskCard';
import { TaskSection } from './TaskSection';

const SECTIONS = [
  { key: 'today',      title: 'يحتاج إجراء اليوم', icon: '🎯', tone: 'teal',    hint: 'موعده اليوم أو راكدة 3 أيام+' },
  { key: 'overdue',    title: 'متأخر',              icon: '🔥', tone: 'red',     hint: 'الأقدم أولاً' },
  { key: 'waiting',    title: 'بانتظار رد',         icon: '💬', tone: 'amber' },
  { key: 'blocked',    title: 'عالق / يحتاج قرار',  icon: '⛔', tone: 'red' },
  { key: 'inprogress', title: 'قيد التنفيذ',        icon: '🔄', tone: 'blue' },
];

export function TodayView({ tasks, userId, founderMode = false, onOpen }) {
  const today = todayKey();
  const groups = useMemo(() => groupForToday(tasks, { today, userId, founderMode }), [tasks, today, userId, founderMode]);
  const total = SECTIONS.reduce((n, s) => n + groups[s.key].length, 0);

  if (total === 0) {
    return (
      <EmptyState
        icon="🎉"
        title={founderMode ? 'لا قرارات ولا اعتمادات بانتظارك' : 'لا شيء يحتاج إجراءً الآن'}
        description={founderMode ? 'تظهر هنا المهام العالقة والمراجعات المطلوبة منك والمرتبطة بقرارات D-###.' : 'كل المهام النشطة في موعدها.'}
      />
    );
  }

  return (
    <div className="space-y-6">
      {founderMode && (
        <p className="text-xs text-muted bg-surface-alt rounded-xl px-3 py-2">
          عرض القرارات والاعتمادات فقط — مهام التنفيذ تظهر لأصحابها.
        </p>
      )}
      {SECTIONS.map((s) => {
        const list = groups[s.key];
        if (!list.length) return null;
        return (
          <TaskSection key={s.key} title={s.title} icon={s.icon} count={list.length} tone={s.tone} hint={s.hint}>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {list.map((t) => <OpsTaskCard key={t.id} task={t} today={today} onClick={() => onOpen(t.id)} />)}
            </div>
          </TaskSection>
        );
      })}
    </div>
  );
}

export default TodayView;
