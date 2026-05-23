// =============================================================
// TasksPage — main tasks screen. Mobile-first, production-ready.
// Wires all module components together via useTasks hook.
// No business logic here — pure composition & layout.
// =============================================================

import { memo, useCallback, useMemo, useState, useRef } from 'react';
import { cn } from '@utils/classNames';
import { Button } from '@components/ui/Button';
import { EmptyState } from '@components/ui/EmptyState';
import { Spinner } from '@components/ui/Loading';
import { useTasks } from '../hooks/useTasks';
import { useAuthStore } from '@stores/authStore';
import { TaskCard } from '../components/TaskCard';
import { TaskStatsBar } from '../components/TaskStatsBar';
import { TaskFilters } from '../components/TaskFilters';
import { TaskDetailsDrawer } from '../components/TaskDetailsDrawer';
import { countActiveFilters } from '../utils/taskUtils';

// ── Create task modal ─────────────────────────────────────────
const PRIORITIES = [
  { value: 'urgent', label: '⚡ عاجلة' },
  { value: 'high',   label: '▲ مرتفعة' },
  { value: 'medium', label: '△ متوسطة' },
  { value: 'low',    label: '▽ منخفضة' },
];

const PLATFORMS = [
  { value: 'instagram', label: '📸 Instagram' },
  { value: 'tiktok',    label: '🎵 TikTok' },
  { value: 'facebook',  label: '👥 Facebook' },
  { value: 'youtube',   label: '▶️ YouTube' },
  { value: 'snapchat',  label: '👻 Snapchat' },
  { value: 'other',     label: '🌐 أخرى' },
];

const TASK_TYPES = [
  { value: 'graphic_design',     label: '🎨 تصميم جرافيك' },
  { value: 'post_story_design',  label: '🖼️ بوست / ستوري' },
  { value: 'video_editing',      label: '🎬 مونتاج فيديو' },
  { value: 'content_writing',    label: '✍️ كتابة محتوى' },
  { value: 'photo_editing',      label: '📷 تعديل صور' },
  { value: 'content_scheduling', label: '📅 جدولة محتوى' },
  { value: 'performance_report', label: '📊 تقرير أداء' },
  { value: 'design_revision',    label: '✏️ تعديل تصميم' },
  { value: 'ad_campaign',        label: '📢 حملة إعلانية' },
  { value: 'page_management',    label: '📱 إدارة صفحة' },
  { value: 'other',              label: '📌 أخرى' },
];

const EMPTY_FORM = {
  title: '', description: '', priority: 'medium',
  due_date: '', due_time: '', assigned_to: '',
  platform: '', task_type: '', attachments_note: '',
};

function CreateTaskModal({ open, onClose, onSubmit, saving, employees }) {
  const formRef = useRef(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSubmit(form);
  };

  const handleClose = () => { setForm(EMPTY_FORM); onClose(); };

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="إضافة مهمة جديدة"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} aria-hidden />

      {/* Sheet */}
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-lg bg-surface rounded-2xl shadow-modal flex flex-col max-h-[90vh] animate-pop-in"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-3 shrink-0">
          <h2 className="text-base font-bold text-text">مهمة جديدة</h2>
          <button type="button" onClick={handleClose} className="text-muted hover:text-text text-xl leading-none">×</button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-6 pb-2 space-y-4 flex-1">
          {/* Title */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted">عنوان المهمة *</label>
            <input
              autoFocus
              required
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="أدخل عنوان المهمة..."
              className="w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal/40"
            />
          </div>

          {/* Platform + Task type */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">المنصة</label>
              <select
                value={form.platform}
                onChange={(e) => set('platform', e.target.value)}
                className="w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/40"
              >
                <option value="">— المنصة —</option>
                {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">نوع المهمة</label>
              <select
                value={form.task_type}
                onChange={(e) => set('task_type', e.target.value)}
                className="w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/40"
              >
                <option value="">— النوع —</option>
                {TASK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          {/* Priority + Due date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">الأولوية</label>
              <select
                value={form.priority}
                onChange={(e) => set('priority', e.target.value)}
                className="w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/40"
              >
                {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">تاريخ الاستحقاق</label>
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => set('due_date', e.target.value)}
                className="w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/40"
              />
            </div>
          </div>

          {/* Due time */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted">وقت الاستحقاق <span className="text-muted font-normal">(اختياري)</span></label>
            <input
              type="time"
              value={form.due_time}
              onChange={(e) => set('due_time', e.target.value)}
              className="w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/40"
            />
          </div>

          {/* Assigned to */}
          {employees && employees.length > 0 && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">تعيين إلى</label>
              <select
                value={form.assigned_to}
                onChange={(e) => set('assigned_to', e.target.value)}
                className="w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/40"
              >
                <option value="">— غير معيّن —</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.employee_name || emp.name || emp.id}
                    {emp.team ? ' · ' + emp.team : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Description */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted">الوصف</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="تفاصيل اختيارية..."
              className="w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal/40 resize-none"
            />
          </div>

          {/* Attachments note */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted">ملاحظات المرفقات <span className="text-muted font-normal">(اختياري)</span></label>
            <textarea
              rows={2}
              value={form.attachments_note}
              onChange={(e) => set('attachments_note', e.target.value)}
              placeholder="رابط Drive، Dropbox، أو وصف المرفقات..."
              className="w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal/40 resize-none"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border shrink-0">
          <Button type="button" variant="outline" size="sm" onClick={handleClose}>إلغاء</Button>
          <Button type="submit" variant="teal" size="sm" disabled={saving || !form.title.trim()} className="gap-2 min-w-[90px]">
            {saving ? <Spinner size="sm" /> : 'إضافة المهمة'}
          </Button>
        </div>
      </form>
    </div>
  );
}

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
function PageHeader({ unseenCount, onRefresh, loading, onAdd }) {
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
        {/* Add task */}
        <Button variant="teal" size="md" className="gap-2" onClick={onAdd}>
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
    addTask,
    clearError,
  } = useTasks();

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const userId = useAuthStore((s) => s.user?.id);

  const hasFilters = useMemo(() => countActiveFilters(filters) > 0, [filters]);

  const handleRefresh = useCallback(() => loadTasks(), [loadTasks]);

  const handleCreateSubmit = useCallback(async (form) => {
    setCreating(true);
    try {
      await addTask({
        title:            form.title.trim(),
        description:      form.description.trim() || null,
        priority:         form.priority,
        due_date:         form.due_date || null,
        due_time:         form.due_time || null,
        status:           'pending',
        created_by:       userId || null,
        assigned_to:      form.assigned_to || null,
        platform:         form.platform || null,
        task_type:        form.task_type || null,
        attachments_note: form.attachments_note.trim() || null,
      }, userId);
      setCreateOpen(false);
    } catch {
      /* error shown via store */
    } finally {
      setCreating(false);
    }
  }, [addTask, userId]);

  return (
    <div className="space-y-5 pb-24 sm:pb-8">
      {/* ── Create task modal ── */}
      <CreateTaskModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreateSubmit}
        saving={creating}
        employees={employees}
      />

      {/* ── Page header ── */}
      <PageHeader
        unseenCount={unseenCount}
        onRefresh={handleRefresh}
        loading={loading}
        onAdd={() => setCreateOpen(true)}
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
