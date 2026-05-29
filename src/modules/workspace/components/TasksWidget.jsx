// =============================================================
// TasksWidget — today's tasks + overdue count
// =============================================================
import { useNavigate }  from 'react-router-dom';
import { useTaskStore } from '@modules/tasks/store/useTaskStore';
import { ROUTES }       from '@routes/paths';

const STATUS_DOT = {
  done:        '✅',
  completed:   '✅',
  in_progress: '🔵',
  pending:     '⚪',
  blocked:     '🔴',
};

const isFinished = (s) => s === 'done' || s === 'completed';

export function TasksWidget() {
  const navigate = useNavigate();
  const tasks    = useTaskStore((s) => s.tasks);
  const loading  = useTaskStore((s) => s.loading);

  const now      = new Date();
  const today    = now.toDateString();

  const todayTasks = tasks.filter((t) =>
    t?.due_date && new Date(t.due_date).toDateString() === today
  );

  const overdue = tasks.filter((t) =>
    t?.due_date && new Date(t.due_date) < now && !isFinished(t?.status)
  );

  const done    = todayTasks.filter((t) => isFinished(t.status)).length;
  const total   = todayTasks.length;

  if (loading && tasks.length === 0) {
    return (
      <div className="animate-pulse space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 bg-gray-100 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Stats row */}
      <div className="flex gap-2 text-xs">
        <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded-lg font-medium">
          اليوم: {total}
        </span>
        {overdue.length > 0 && (
          <span className="bg-red-100 text-red-700 px-2 py-1 rounded-lg font-medium">
            متأخرة: {overdue.length}
          </span>
        )}
        {total > 0 && (
          <span className="bg-green-100 text-green-700 px-2 py-1 rounded-lg font-medium">
            مكتملة: {done}/{total}
          </span>
        )}
      </div>

      {/* Task list */}
      {todayTasks.length === 0 && overdue.length === 0 && (
        <div className="text-center py-4 text-gray-400 text-sm">
          <p className="text-xl mb-1">📋</p>
          <p>لا مهام لهذا اليوم</p>
        </div>
      )}

      <ul className="space-y-1">
        {[...overdue.slice(0, 2), ...todayTasks.filter((t) => !isFinished(t.status)).slice(0, 3)].map((t) => {
          const isOverdue = new Date(t.due_date) < now && !isFinished(t.status);
          return (
            <li
              key={t.id}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm cursor-pointer hover:bg-gray-50 ${isOverdue ? 'border border-red-100' : ''}`}
              onClick={() => navigate(ROUTES.TASKS)}
            >
              <span className="text-base">{STATUS_DOT[t.status] ?? '⚪'}</span>
              <span className={`flex-1 truncate ${isFinished(t.status) ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                {t.title}
              </span>
              {isOverdue && <span className="text-xs text-red-500">متأخرة</span>}
            </li>
          );
        })}
      </ul>

      <button
        onClick={() => navigate(ROUTES.TASKS)}
        className="w-full text-center text-xs text-indigo-500 hover:text-indigo-700 py-1"
      >
        عرض كل المهام ←
      </button>
    </div>
  );
}

export default TasksWidget;
