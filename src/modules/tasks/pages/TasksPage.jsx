// =============================================================
// TasksPage — main tasks screen. Mobile-first, production-ready.
// Wires all module components together via useTasks hook.
// No business logic here — pure composition & layout.
// =============================================================

import { memo, useCallback, useMemo } from 'react';
import { cn } from '@utils/classNames';
import { Button } from '@components/ui/Button';
import { EmptyState } from '@components/ui/EmptyState';
import { Spinner } from '@components/ui/Loading';
import { useTasks } from '../hooks/useTasks';
import { TaskCard } from '../components/TaskCard';
import { TaskStatsBar } from '../components/TaskStatsBar';
import { TaskFilters } from '../components/TaskFilters';
import { TaskDetailsDrawer } from '../components/TaskDetailsDrawer';
import { countActiveFilters } from '../utils/taskUtils';

// ── Section header ────────────────────────────────────────────
function SectionHeader({ count, hasFilters, onReset }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold text-text">
          {hasFilters ? 'نتائج الفلترة' : 'جميع المهام'}
        </h2>
        <span className="text-xs text-muted bg-surface-alt px-2 py-0.5 rounded-full font-semibold">
          {count}
        </span>
      </div>
      {hasFilters && (
        <button
          type="button"
          onClick={onReset}
          className="text-xs text-teal hover:underline font-medium"
        >
          مسح الفلاتر
        </button>
      )}
    </div>
  );
}

// ── Task grid ─────────────────────────────────────────────────
const TaskGrid = memo(function TaskGrid({ tasks, onOpen }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          onClick={() => onOpen(task.id)}
        />
      ))}
    </div>
  );
});

// ── Empty state ───────────────────────────────────────────────
function TasksEmpty({ hasFilters, onReset }) {
  return (
    <EmptyState
      icon={
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      }
      title={hasFilters ? 'لا توجد نتائج' : 'لا توجد مهام'}
      description={
        hasFilters
          ? 'لم يتطابق أي شيء مع الفلاتر المحددة. جرب تغيير معايير البحث.'
          : 'لم يتم إضافة أي مهام بعد. أضف مهمة جديدة للبدء.'
      }
      action={
        hasFilters ? (
          <Button variant="outline" size="sm" onClick={onReset}>
            مسح الفلاتر
          </Button>
        ) : null
      }
    />
  );
}

// ── Error banner ──────────────────────────────────────────────
function ErrorBanner({ message, onDismiss }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-red-bg border border-red/30 text-red-fg">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <p className="text-sm flex-1">{message}</p>
      <button type="button" onClick={onDismiss} className="text-xs underline shrink-0">
        إغلاق
      </button>
    </div>
  );
}

// ── Unseen badge ──────────────────────────────────────────────
function UnseenIndicator({ count }) {
  if (!count) return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 h-6 rounded-full bg-teal/15 text-teal text-xs font-bold">
      <span className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse" aria-hidden />
      {count} جديد
    </span>
  );
}

// ── Page header ───────────────────────────────────────────────
function PageHeader({ unseenCount, onRefresh, loading }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-xl sm:text-2xl font-extrabold text-text">المهام</h1>
          <UnseenIndicator count={unseenCount} />
        </div>
        <p className="text-sm text-muted mt-0.5">
          تابع وأدِر جميع مهام الفريق من مكان واحد
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {/* Refresh */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className={cn(
            'w-9 h-9 rounded-xl bg-surface border border-border grid place-items-center',
            'text-muted hover:text-text hover:border-teal/40 transition-all',
            loading && 'animate-spin',
          )}
          aria-label="تحديث"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M21.5 2v6h-6M2.5 22v-6h6" />
            <path d="M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
          </svg>
        </button>
        {/* Add task — placeholder for future modal */}
        <Button variant="teal" size="md" className="gap-2" disabled>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span className="hidden sm:inline">مهمة جديدة</span>
        </Button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
function TasksPage() {
  const {
    filteredTasks,
    loading,
    error,
    actionLoading,
    filters,
    stats,
    selectedTask,
    employees,
    unseenCount,
    drawerOpen,
    loadTasks,
    openTask,
    closeDrawer,
    setFilter,
    toggleFilter,
    resetFilters,
    changeStatus,
    changeProgress,
    postComment,
    clearError,
  } = useTasks();

  const hasFilters = useMemo(() => countActiveFilters(filters) > 0, [filters]);

  const handleRefresh = useCallback(() => loadTasks(), [loadTasks]);

  return (
    <div className="space-y-5 pb-24 sm:pb-8">
      {/* ── Page header ── */}
      <PageHeader
        unseenCount={unseenCount}
        onRefresh={handleRefresh}
        loading={loading}
      />

      {/* ── Error banner ── */}
      {error && <ErrorBanner message={error} onDismiss={clearError} />}

      {/* ── Stats dashboard ── */}
      {!loading && stats.total > 0 && (
        <TaskStatsBar stats={stats} />
      )}

      {/* ── Filters ── */}
      <TaskFilters
        filters={filters}
        employees={employees}
        onSetFilter={setFilter}
        onToggleFilter={toggleFilter}
        onReset={resetFilters}
      />

      {/* ── Task list ── */}
      {loading ? (
        <div className="py-16 flex items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : filteredTasks.length === 0 ? (
        <TasksEmpty hasFilters={hasFilters} onReset={resetFilters} />
      ) : (
        <div className="space-y-3">
          <SectionHeader
            count={filteredTasks.length}
            hasFilters={hasFilters}
            onReset={resetFilters}
          />
          <TaskGrid tasks={filteredTasks} onOpen={openTask} />
        </div>
      )}

      {/* ── Task details drawer ── */}
      <TaskDetailsDrawer
        task={selectedTask}
        open={drawerOpen}
        onClose={closeDrawer}
        onStatusChange={changeStatus}
        onProgressChange={changeProgress}
        onAddComment={postComment}
        actionLoading={actionLoading}
      />
    </div>
  );
}

export default TasksPage;
