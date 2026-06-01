// =============================================================
// TasksPage — main tasks screen. Mobile-first, production-ready.
// Wires all module components together via useTasks hook.
// No business logic here — pure composition & layout.
// =============================================================

import { memo, useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { cn } from '@utils/classNames';
import { Button } from '@components/ui/Button';
import { EmptyState } from '@components/ui/EmptyState';
import { Spinner } from '@components/ui/Loading';
import { useTasks } from '../hooks/useTasks';
import { useAuthStore } from '@stores/authStore';
import { usePermissions } from '@hooks/usePermissions';
import { PERMISSIONS } from '@data/permissions';
import { TaskCard } from '../components/TaskCard';
import { TaskStatsBar } from '../components/TaskStatsBar';
import { TaskFilters } from '../components/TaskFilters';
import { TaskDetailsDrawer } from '../components/TaskDetailsDrawer';
import { countActiveFilters } from '../utils/taskUtils';

// ── Create task modal ─────────────────────────────────────────────
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
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} aria-hidden />
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

// ── Kanban View ───────────────────────────────────────────────
const KANBAN_COLS = [
  { key:'pending',     label:'⏳ قيد الانتظار', color:'border-amber-300 bg-amber-50/50',   dot:'bg-amber-400' },
  { key:'in_progress', label:'🔄 جارية',         color:'border-teal/30 bg-teal/5',          dot:'bg-teal'      },
  { key:'in_review',   label:'👀 مراجعة',         color:'border-violet-300 bg-violet-50/50', dot:'bg-violet-400'},
  { key:'done',        label:'✅ منجزة',          color:'border-emerald-300 bg-emerald-50/50',dot:'bg-emerald-500'},
];
const STATUS_COL_MAP = {
  pending:'pending', open:'pending', 'قيد الانتظار':'pending',
  in_progress:'in_progress', 'جارية':'in_progress', 'قيد التنفيذ':'in_progress',
  in_review:'in_review', review:'in_review', blocked:'in_review', 'مراجعة':'in_review',
  done:'done', completed:'done', 'مكتملة':'done', 'منجزة':'done',
  cancelled:'done', overdue:'pending',
};

const PRIORITY_COLOR = { urgent:'text-red-500', high:'text-orange-500', medium:'text-amber-500', low:'text-blue-400' };
const PRIORITY_ICON  = { urgent:'⚡', high:'▲', medium:'△', low:'▽' };

const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
function fmtDueDateShort(iso) { if (!iso) return ''; const d = new Date(iso); return `${d.getDate()} ${MONTHS_AR[d.getMonth()]}`; }

function KanbanCard({ task, onClick, onDragStart, onDragEnd, isDragging }) {
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && !['done','completed','in_review','cancelled'].includes(task.status);
  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(task); }}
      onDragEnd={onDragEnd}
      className={cn(
        'w-full text-start bg-surface border border-border rounded-xl p-3 shadow-sm',
        'hover:border-teal/30 hover:shadow-md transition-all duration-150 cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-40 scale-95',
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <button
          type="button"
          onClick={onClick}
          className="flex-1 text-start text-sm font-semibold text-text leading-snug line-clamp-2 hover:text-teal transition-colors"
        >
          {task.title}
        </button>
        {task.priority && (
          <span className={`text-xs shrink-0 ${PRIORITY_COLOR[task.priority] ?? 'text-muted'}`} title={task.priority}>
            {PRIORITY_ICON[task.priority] ?? '·'}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap mt-2">
        {task.assigned_to && (
          <span className="text-[10px] bg-surface-alt text-muted px-2 py-0.5 rounded-full truncate max-w-[100px]">
            👤 {task.assigned_to?.name || task.assigned_to}
          </span>
        )}
        {task.due_date && (
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${isOverdue ? 'bg-red-100 text-red-600' : 'bg-surface-alt text-muted'}`}>
            {isOverdue ? '⚠️' : '📅'} {fmtDueDateShort(task.due_date)}
          </span>
        )}
        {(task.comments_count > 0 || task.comments?.length > 0) && (
          <span className="text-[10px] bg-surface-alt text-muted px-2 py-0.5 rounded-full">
            💬 {task.comments_count || task.comments?.length}
          </span>
        )}
      </div>
    </div>
  );
}

function KanbanView({ tasks, onOpen, onStatusChange }) {
  const [draggingTask, setDraggingTask]   = useState(null);
  const [dragOverCol, setDragOverCol]     = useState(null);
  const [dragOverTask, setDragOverTask]   = useState(null);

  const byCol = useMemo(() => {
    const m = {};
    KANBAN_COLS.forEach(c => { m[c.key] = []; });
    tasks.forEach(t => {
      const col = STATUS_COL_MAP[t.status] ?? 'pending';
      m[col].push(t);
    });
    return m;
  }, [tasks]);

  const handleDragStart = useCallback((task) => {
    setDraggingTask(task);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingTask(null);
    setDragOverCol(null);
    setDragOverTask(null);
  }, []);

  const handleColDragOver = useCallback((e, colKey) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCol(colKey);
  }, []);

  const handleColDrop = useCallback((e, colKey) => {
    e.preventDefault();
    if (!draggingTask) return;
    const srcCol = STATUS_COL_MAP[draggingTask.status] ?? 'pending';
    if (srcCol !== colKey) {
      onStatusChange?.(draggingTask.id, colKey);
    }
    setDraggingTask(null);
    setDragOverCol(null);
  }, [draggingTask, onStatusChange]);

  const handleColDragLeave = useCallback((e) => {
    // Only clear if leaving the column container (not a child)
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverCol(null);
    }
  }, []);

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 -mx-1 px-1 snap-x" style={{ minHeight: '400px' }}>
      {KANBAN_COLS.map(col => {
        const isOver = dragOverCol === col.key;
        return (
          <div
            key={col.key}
            onDragOver={(e) => handleColDragOver(e, col.key)}
            onDrop={(e) => handleColDrop(e, col.key)}
            onDragLeave={handleColDragLeave}
            className={cn(
              'shrink-0 w-64 sm:w-72 rounded-2xl border-2 flex flex-col snap-start transition-all duration-150',
              col.color,
              isOver && 'ring-2 ring-teal ring-offset-1 scale-[1.01]',
            )}
          >
            {/* Column header */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-black/5">
              <div className={`w-2 h-2 rounded-full ${col.dot}`} />
              <span className="text-xs font-bold text-text">{col.label}</span>
              <span className="ms-auto text-xs font-bold text-muted bg-surface/70 px-2 py-0.5 rounded-full">
                {byCol[col.key].length}
              </span>
            </div>
            {/* Cards */}
            <div className={cn(
              'flex-1 overflow-y-auto p-2 space-y-2 min-h-[200px] rounded-b-2xl transition-colors duration-150',
              isOver && draggingTask && 'bg-teal/5',
            )}>
              {byCol[col.key].length === 0 ? (
                <div className={cn(
                  'flex items-center justify-center h-24 text-xs font-medium rounded-xl border-2 border-dashed transition-colors',
                  isOver ? 'border-teal/40 text-teal' : 'border-transparent text-muted/40',
                )}>
                  {isOver ? 'أفلت هنا' : 'لا توجد مهام'}
                </div>
              ) : (
                <>
                  {byCol[col.key].map(t => (
                    <KanbanCard
                      key={t.id}
                      task={t}
                      onClick={() => onOpen(t.id)}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      isDragging={draggingTask?.id === t.id}
                    />
                  ))}
                  {/* Drop zone hint at bottom */}
                  {isOver && draggingTask && (
                    <div className="h-1.5 rounded-full bg-teal/30 animate-pulse" />
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SectionHeader({ count, hasFilters, onReset }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold text-text">{hasFilters ? 'نتائج الفلترة' : 'جميع المهام'}</h2>
        <span className="text-xs text-muted bg-surface-alt px-2 py-0.5 rounded-full font-semibold">{count}</span>
      </div>
      {hasFilters && <button type="button" onClick={onReset} className="text-xs text-teal hover:underline font-medium">مسح الفلاتر</button>}
    </div>
  );
}

const TaskGrid = memo(function TaskGrid({ tasks, onOpen }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {tasks.map((task) => <TaskCard key={task.id} task={task} onClick={() => onOpen(task.id)} />)}
    </div>
  );
});

function TasksEmpty({ hasFilters, onReset }) {
  return (
    <EmptyState
      icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="m9 12 2 2 4-4" /></svg>}
      title={hasFilters ? 'لا توجد نتائج' : 'لا توجد مهام'}
      description={hasFilters ? 'لم يتطابق أي شيء مع الفلاتر المحددة. جرب تغيير معايير البحث.' : 'لم يتم إضافة أي مهام بعد. أضف مهمة جديدة للبدء.'}
      action={hasFilters ? <Button variant="outline" size="sm" onClick={onReset}>مسح الفلاتر</Button> : null}
    />
  );
}

function ErrorBanner({ message, onDismiss }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-red-bg border border-red/30 text-red-fg">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
      <p className="text-sm flex-1">{message}</p>
      <button type="button" onClick={onDismiss} className="text-xs underline shrink-0">إغلاق</button>
    </div>
  );
}

function UnseenIndicator({ count }) {
  if (!count) return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 h-6 rounded-full bg-teal/15 text-teal text-xs font-bold">
      <span className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse" aria-hidden />
      {count} جديد
    </span>
  );
}

function PageHeader({ unseenCount, onRefresh, loading, onAdd, viewMode, onViewChange, canAssign }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-xl sm:text-2xl font-extrabold text-text">المهام</h1>
          <UnseenIndicator count={unseenCount} />
        </div>
        <p className="text-sm text-muted mt-0.5">تابع وأدِر جميع مهام الفريق من مكان واحد</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {/* View toggle */}
        <div className="flex items-center bg-surface border border-border rounded-xl overflow-hidden">
          <button type="button" onClick={() => onViewChange('grid')} title="عرض شبكي"
            className={cn('w-9 h-9 grid place-items-center transition-all', viewMode === 'grid' ? 'bg-teal text-white' : 'text-muted hover:text-text')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
          </button>
          <button type="button" onClick={() => onViewChange('kanban')} title="عرض كانبان"
            className={cn('w-9 h-9 grid place-items-center transition-all', viewMode === 'kanban' ? 'bg-teal text-white' : 'text-muted hover:text-text')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="14" rx="1"/>
              <rect x="17" y="3" width="5" height="10" rx="1"/>
            </svg>
          </button>
        </div>
        <button type="button" onClick={onRefresh} disabled={loading}
          className={cn('w-9 h-9 rounded-xl bg-surface border border-border grid place-items-center','text-muted hover:text-text hover:border-teal/40 transition-all',loading && 'animate-spin')}
          aria-label="تحديث">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M21.5 2v6h-6M2.5 22v-6h6" /><path d="M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
          </svg>
        </button>
        {canAssign && (
          <Button variant="teal" size="md" className="gap-2" onClick={onAdd}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            <span className="hidden sm:inline">مهمة جديدة</span>
          </Button>
        )}
      </div>
    </div>
  );
}

function TasksPage() {
  const {
    filteredTasks, loading, error, actionLoading, filters, stats,
    selectedTask, employees, unseenCount, drawerOpen,
    loadTasks, openTask, closeDrawer, setFilter, toggleFilter,
    resetFilters, changeStatus, changeProgress, postComment, addTask, clearError,
    uploadAttachment, removeAttachment,
  } = useTasks();

  const { can } = usePermissions();
  const canAssign = can(PERMISSIONS.ASSIGN_TASKS);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [viewMode, setViewMode] = useState('grid');
  const userId = useAuthStore((s) => s.session?.id);
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
    } catch { /* error shown via store */ } finally { setCreating(false); }
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
        viewMode={viewMode}
        onViewChange={setViewMode}
        canAssign={canAssign}
      />

      {/* ── Error banner ── */}
      {error && <ErrorBanner message={error} onDismiss={clearError} />}
      {!loading && stats.total > 0 && <TaskStatsBar stats={stats} />}
      <TaskFilters filters={filters} employees={employees} onSetFilter={setFilter} onToggleFilter={toggleFilter} onReset={resetFilters} />
      {loading ? (
        <div className="py-16 flex items-center justify-center"><Spinner size="lg" /></div>
      ) : filteredTasks.length === 0 ? (
        <TasksEmpty hasFilters={hasFilters} onReset={resetFilters} />
      ) : (
        <div className="space-y-3">
          <SectionHeader count={filteredTasks.length} hasFilters={hasFilters} onReset={resetFilters} />
          {viewMode === 'kanban'
            ? <KanbanView tasks={filteredTasks} onOpen={openTask} onStatusChange={changeStatus} />
            : <TaskGrid tasks={filteredTasks} onOpen={openTask} />
          }
        </div>
      )}
      <TaskDetailsDrawer
        task={selectedTask}
        open={drawerOpen}
        onClose={closeDrawer}
        onStatusChange={changeStatus}
        onProgressChange={changeProgress}
        onAddComment={postComment}
        onUploadAttachment={uploadAttachment}
        onRemoveAttachment={removeAttachment}
        actionLoading={actionLoading}
        employees={employees}
      />
    </div>
  );
}

export default TasksPage;
