// =============================================================
// TaskDetailsDrawer — full task detail panel.
// On mobile: bottom-sheet style. On desktop: side drawer or modal.
// Contains: full info, status change, progress update, comments,
// activity timeline, attachments placeholder.
// =============================================================

import { memo, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useEffect } from 'react';
import { cn } from '@utils/classNames';
import { Badge } from '@components/ui/Badge';
import { Avatar } from '@components/ui/Avatar';
import { Button } from '@components/ui/Button';
import { ProgressBar } from '@components/ui/ProgressBar';
import { Select } from '@components/ui/Input';
import { STATUS_META, PRIORITY_META, STATUS_OPTIONS, PLATFORM_META, TASK_TYPE_META, progressTone, calcTaskPointsPreview } from '../types/task.types';
import { shortDate, timeAgo, effectiveStatus } from '../utils/taskUtils';
import { useCountdown } from '../hooks/useCountdown';
import { usePermissions } from '@hooks/usePermissions';
import { useAuthStore } from '@stores/authStore';
import { PERMISSIONS } from '@data/permissions';
import { CommentThread } from './CommentThread';
import { ActivityTimeline } from './ActivityTimeline';
import { TaskAttachments } from './TaskAttachments';

// ── Section wrapper ───────────────────────────────────────────
function Section({ title, icon, children, className = '' }) {
  return (
    <div className={cn('space-y-3', className)}>
      {title && (
        <div className="flex items-center gap-2 pb-2 border-b border-border">
          {icon && <span aria-hidden className="text-teal">{icon}</span>}
          <h3 className="text-sm font-bold text-text">{title}</h3>
        </div>
      )}
      {children}
    </div>
  );
}

// ── Info row ──────────────────────────────────────────────────
function InfoRow({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-border last:border-0">
      <span className="text-xs text-muted shrink-0 pt-0.5 w-24">{label}</span>
      <div className="flex-1 min-w-0 text-end">{children}</div>
    </div>
  );
}

// ── Progress slider ───────────────────────────────────────────
function ProgressEditor({ value, onChange, loading }) {
  const [local, setLocal] = useState(value ?? 0);

  const handleChange = (e) => setLocal(Number(e.target.value));
  const handleCommit = () => {
    if (local !== value) onChange(local);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">نسبة الإنجاز</span>
        <span className={cn(
          'font-bold tabular-nums',
          local >= 100 ? 'text-green-fg' : local >= 60 ? 'text-teal' : 'text-amber-fg',
        )}>
          {local}%
        </span>
      </div>
      <ProgressBar value={local} max={100} tone={progressTone(local)} size="md" />
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={local}
        onChange={handleChange}
        onMouseUp={handleCommit}
        onTouchEnd={handleCommit}
        disabled={loading}
        className={cn(
          'w-full h-2 rounded-full appearance-none cursor-pointer',
          'accent-teal disabled:opacity-50',
        )}
        aria-label="تحديث نسبة الإنجاز"
      />
      <div className="flex items-center justify-between text-[10px] text-muted">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

// AttachmentsSection is replaced by TaskAttachments component (imported above)

// ── Tab bar ───────────────────────────────────────────────────
const TABS = [
  { key: 'details',  label: 'التفاصيل', icon: '📋' },
  { key: 'comments', label: 'التعليقات', icon: '💬' },
  { key: 'timeline', label: 'النشاط',    icon: '📜' },
];

function TabBar({ active, onChange, commentCount }) {
  return (
    <div className="flex border-b border-border shrink-0">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-all',
            active === tab.key
              ? 'text-teal border-b-2 border-teal'
              : 'text-muted hover:text-text',
          )}
        >
          <span aria-hidden>{tab.icon}</span>
          {tab.label}
          {tab.key === 'comments' && commentCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-teal/15 text-teal text-[9px] font-bold grid place-items-center">
              {commentCount}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Details tab ───────────────────────────────────────────────
function DetailsTab({ task, onStatusChange, onProgressChange, onUploadAttachment, onRemoveAttachment, actionLoading }) {
  const effStatus = effectiveStatus(task);
  const statusMeta   = STATUS_META[effStatus]  || STATUS_META.pending;
  const priorityMeta = PRIORITY_META[task.priority] || null;
  const platformMeta = task.platform ? PLATFORM_META[task.platform] : null;
  const taskTypeMeta = task.task_type ? TASK_TYPE_META[task.task_type] : null;
  const { label: countdown, colorClass: countdownColor } = useCountdown(task.due_date, effStatus);
  const isCompleted = effStatus === 'completed' || effStatus === 'done';
  const pointsPreview = calcTaskPointsPreview(task);

  const handleStatusChange = (e) => onStatusChange(e.target.value);

  return (
    <div className="space-y-5 py-2">
      {/* Title + description */}
      <Section>
        <h2 className="text-lg font-extrabold text-text leading-snug">{task.title}</h2>
        {task.description && (
          <p className="text-sm text-muted leading-relaxed">{task.description}</p>
        )}
        {task.attachments_note && (
          <div className="mt-2 p-2.5 rounded-xl bg-amber-bg border border-amber/20 text-xs text-amber-fg">
            <span className="font-semibold">📎 ملاحظة مرفق: </span>{task.attachments_note}
          </div>
        )}
        {task.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {task.tags.map((tag) => (
              <Badge key={tag} tone="teal" className="text-[10px]">{tag}</Badge>
            ))}
          </div>
        )}
      </Section>

      {/* Social media info */}
      {(platformMeta || taskTypeMeta || task.due_time) && (
        <Section title="تفاصيل السوشال ميديا" icon="📱">
          {platformMeta && (
            <InfoRow label="المنصة">
              <Badge tone="teal" className="gap-1">
                <span aria-hidden>{platformMeta.icon}</span>
                {platformMeta.label}
              </Badge>
            </InfoRow>
          )}
          {taskTypeMeta && (
            <InfoRow label="نوع المهمة">
              <Badge tone="neutral" className="gap-1">
                <span aria-hidden>{taskTypeMeta.icon}</span>
                {taskTypeMeta.label}
              </Badge>
            </InfoRow>
          )}
          {task.due_time && (
            <InfoRow label="وقت التسليم">
              <span className="text-sm font-semibold text-text">{task.due_time}</span>
            </InfoRow>
          )}
        </Section>
      )}

      {/* Info rows */}
      <Section>
        <InfoRow label="الحالة الحالية">
          <Badge tone={statusMeta.tone} className="gap-1">
            <span aria-hidden>{statusMeta.icon}</span>
            {statusMeta.label}
          </Badge>
        </InfoRow>
        {priorityMeta && (
          <InfoRow label="الأولوية">
            <Badge tone={priorityMeta.tone} className="gap-1">
              <span aria-hidden>{priorityMeta.icon}</span>
              {priorityMeta.label}
            </Badge>
          </InfoRow>
        )}
        {task.assigned_to && (
          <InfoRow label="المُسنَد إليه">
            <div className="flex items-center gap-2 justify-end">
              <span className="text-sm font-semibold text-text">{task.assigned_to.name}</span>
              <Avatar name={task.assigned_to.name} src={task.assigned_to.avatar} size="sm" />
            </div>
          </InfoRow>
        )}
        {task.created_by && (
          <InfoRow label="أنشأ بواسطة">
            <div className="flex items-center gap-2 justify-end">
              <span className="text-xs text-muted">{task.created_by.name}</span>
              <Avatar name={task.created_by.name} size="xs" />
            </div>
          </InfoRow>
        )}
        {task.due_date && (
          <InfoRow label="تاريخ الاستحقاق">
            <div className="text-end">
              <span className="text-sm font-semibold text-text block">{shortDate(task.due_date)}</span>
              {countdown && (
                <span className={cn('text-xs', countdownColor)}>{countdown}</span>
              )}
            </div>
          </InfoRow>
        )}
        {!isCompleted && (
          <InfoRow label="نقاط متوقعة">
            <span className="text-sm font-bold text-teal">+{pointsPreview} نقطة</span>
          </InfoRow>
        )}
        {isCompleted && task.completed_at && (
          <InfoRow label="أُنجزت في">
            <span className="text-xs text-muted">{timeAgo(task.completed_at)}</span>
          </InfoRow>
        )}
        {task.created_at && (
          <InfoRow label="تاريخ الإنشاء">
            <span className="text-xs text-muted">{timeAgo(task.created_at)}</span>
          </InfoRow>
        )}
      </Section>

      {/* Change status */}
      <Section title="تغيير الحالة" icon="↻">
        <Select
          value={effStatus}
          onChange={handleStatusChange}
          disabled={actionLoading || effStatus === 'cancelled'}
          aria-label="تغيير حالة المهمة"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>
        {effStatus === 'cancelled' && (
          <p className="text-xs text-muted">المهام الملغاة لا يمكن تغيير حالتها.</p>
        )}
      </Section>

      {/* Progress slider */}
      {effStatus !== 'cancelled' && (
        <Section title="تحديث نسبة الإنجاز" icon="▶">
          <ProgressEditor
            value={task.progress}
            onChange={(p) => onProgressChange(p)}
            loading={actionLoading}
          />
        </Section>
      )}

      {/* Attachments */}
      <TaskAttachments
        attachments={task.attachments || []}
        taskId={task.id}
        onUpload={onUploadAttachment}
        onRemove={onRemoveAttachment}
      />
    </div>
  );
}

// ── Edit form ─────────────────────────────────────────────────
const TEAM_OPTS = [
  { value: '', label: '— بدون تيم —' },
  { value: 'social', label: '📱 سوشال ميديا' },
  { value: 'sales',  label: '💼 مبيعات' },
  { value: 'ops',    label: '⚙️ عمليات' },
];
const PRIO_OPTS = [
  { value: 'urgent', label: '⚡ عاجلة' },
  { value: 'high',   label: '▲ مرتفعة' },
  { value: 'medium', label: '△ متوسطة' },
  { value: 'low',    label: '▽ منخفضة' },
];
const IC = 'w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal/40';

function EditTaskForm({ task, employees, onSave, onCancel, loading }) {
  const [form, setForm] = useState({
    title:       task.title || '',
    description: task.description || '',
    priority:    task.priority || 'medium',
    due_date:    task.due_date || '',
    due_time:    task.due_time || '',
    assigned_to: task.assigned_to?.id || '',
    team:        task.team || '',
    link:        task.link || '',
  });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const filteredEmps = form.team
    ? (employees || []).filter((e) => e.team === form.team)
    : (employees || []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSave({
      title:       form.title.trim(),
      description: form.description.trim() || null,
      priority:    form.priority,
      due_date:    form.due_date || null,
      due_time:    form.due_time || null,
      assigned_to: form.assigned_to || null,
      team:        form.team || null,
      link:        form.link.trim() || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-3">
      <div className="space-y-1">
        <label className="text-xs font-semibold text-muted">عنوان المهمة *</label>
        <input required value={form.title} onChange={(e) => set('title', e.target.value)} className={IC} />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-semibold text-muted">الوصف</label>
        <textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} className={cn(IC, 'resize-none')} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted">الأولوية</label>
          <select value={form.priority} onChange={(e) => set('priority', e.target.value)} className={IC}>
            {PRIO_OPTS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted">تاريخ الاستحقاق</label>
          <input type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} className={IC} />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-semibold text-muted">التيم</label>
        <select value={form.team} onChange={(e) => { set('team', e.target.value); set('assigned_to', ''); }} className={IC}>
          {TEAM_OPTS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      {employees && employees.length > 0 && (
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted">تعيين إلى</label>
          <select value={form.assigned_to} onChange={(e) => set('assigned_to', e.target.value)} className={IC}>
            <option value="">— غير معيّن —</option>
            {filteredEmps.map((e) => <option key={e.id} value={e.id}>{e.name || e.employee_name}</option>)}
          </select>
        </div>
      )}
      <div className="space-y-1">
        <label className="text-xs font-semibold text-muted">رابط</label>
        <input type="url" value={form.link} onChange={(e) => set('link', e.target.value)} placeholder="https://..." className={IC} />
      </div>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold text-muted hover:text-text transition-colors">إلغاء</button>
        <button type="submit" disabled={loading || !form.title.trim()} className="flex-1 rounded-xl bg-teal text-navy py-2.5 text-sm font-semibold disabled:opacity-50 hover:bg-teal/90 transition-colors">
          {loading ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}
        </button>
      </div>
    </form>
  );
}

// ── Delete confirmation ───────────────────────────────────────
function DeleteConfirm({ onConfirm, onCancel, loading }) {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} aria-hidden />
      <div className="relative z-10 bg-surface rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-4">
        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-red-500" aria-hidden>
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </div>
          <h3 className="text-base font-bold text-text">حذف المهمة</h3>
          <p className="text-sm text-muted mt-1">هذا الإجراء لا يمكن التراجع عنه. هل أنت متأكد؟</p>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold text-muted hover:text-text transition-colors">إلغاء</button>
          <button type="button" onClick={onConfirm} disabled={loading} className="flex-1 rounded-xl bg-red-500 text-white py-2.5 text-sm font-bold disabled:opacity-50 hover:bg-red-600 transition-colors">
            {loading ? 'جارٍ الحذف...' : 'حذف نهائياً'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main drawer ───────────────────────────────────────────────
export const TaskDetailsDrawer = memo(function TaskDetailsDrawer({
  task,
  open,
  onClose,
  onStatusChange,
  onProgressChange,
  onAddComment,
  onUploadAttachment,
  onRemoveAttachment,
  onEditTask,
  onDeleteTask,
  actionLoading = false,
  employees = [],
}) {
  const [activeTab, setActiveTab] = useState('details');
  const [editMode, setEditMode]   = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { can } = usePermissions();
  const canEdit   = can(PERMISSIONS.EDIT_TASK);
  const canDelete = can(PERMISSIONS.DELETE_TASK);
  const userId    = useAuthStore((s) => s.session?.id);

  // Lock scroll
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Esc key
  useEffect(() => {
    if (!open) return;
    const handler = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Reset tab + edit mode on open
  useEffect(() => {
    if (open) { setActiveTab('details'); setEditMode(false); setConfirmDelete(false); }
  }, [open, task?.id]);

  const handleSaveEdit = useCallback(async (patch) => {
    if (!onEditTask) return;
    await onEditTask(task.id, patch, userId);
    setEditMode(false);
  }, [onEditTask, task?.id, userId]);

  const handleConfirmDelete = useCallback(async () => {
    if (!onDeleteTask) return;
    await onDeleteTask(task.id);
    setConfirmDelete(false);
    onClose?.();
  }, [onDeleteTask, task?.id, onClose]);

  const handleStatusChange = useCallback(
    (status) => onStatusChange?.(task.id, status),
    [onStatusChange, task?.id],
  );

  const handleProgressChange = useCallback(
    (progress) => onProgressChange?.(task.id, progress),
    [onProgressChange, task?.id],
  );

  const handleAddComment = useCallback(
    async (text) => onAddComment?.(task.id, { author: null, text }),
    [onAddComment, task?.id],
  );

  if (!open || !task) return null;

  const drawerPortal = createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={`تفاصيل المهمة: ${task.title}`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fadeIn"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer panel */}
      <div
        className={cn(
          // Mobile: full-screen bottom sheet
          'relative w-full bg-surface text-text border-t border-border',
          'flex flex-col max-h-[92vh] rounded-t-3xl',
          'animate-slideUp',
          // Desktop: right side panel
          'sm:rounded-2xl sm:border sm:rounded-t-2xl sm:max-h-[90vh]',
          'sm:w-[480px] sm:h-[90vh] sm:max-h-[90vh]',
          'sm:me-4 sm:mb-4',
        )}
      >
        {/* Drag handle (mobile) */}
        <div className="pt-3 pb-1 grid place-items-center sm:hidden shrink-0">
          <span className="w-10 h-1.5 rounded-full bg-border" aria-hidden />
        </div>

        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted">{editMode ? 'تعديل المهمة' : 'تفاصيل المهمة'}</p>
            <h2 className="text-sm font-bold text-text truncate">{task.title}</h2>
          </div>
          {/* Edit button */}
          {canEdit && !editMode && (
            <button
              type="button"
              onClick={() => setEditMode(true)}
              className="w-9 h-9 rounded-xl hover:bg-teal/10 grid place-items-center text-teal shrink-0 transition-colors"
              aria-label="تعديل"
              title="تعديل المهمة"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          )}
          {/* Delete button */}
          {canDelete && !editMode && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="w-9 h-9 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 grid place-items-center text-red-400 hover:text-red-500 shrink-0 transition-colors"
              aria-label="حذف"
              title="حذف المهمة"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={editMode ? () => setEditMode(false) : onClose}
            className="w-9 h-9 rounded-xl hover:bg-surface-alt grid place-items-center text-muted shrink-0 transition-colors"
            aria-label={editMode ? 'إلغاء التعديل' : 'إغلاق'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Tab bar — hidden in edit mode */}
        {!editMode && (
          <TabBar
            active={activeTab}
            onChange={setActiveTab}
            commentCount={task.comments?.length || task.comments_count || 0}
          />
        )}

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-safe">
          {editMode ? (
            <EditTaskForm
              task={task}
              employees={employees}
              onSave={handleSaveEdit}
              onCancel={() => setEditMode(false)}
              loading={actionLoading}
            />
          ) : (
            <>
              {activeTab === 'details' && (
                <DetailsTab
                  task={task}
                  onStatusChange={handleStatusChange}
                  onProgressChange={handleProgressChange}
                  onUploadAttachment={onUploadAttachment}
                  onRemoveAttachment={onRemoveAttachment}
                  actionLoading={actionLoading}
                />
              )}
              {activeTab === 'comments' && (
                <div className="py-4">
                  <CommentThread
                    comments={task.comments || []}
                    onAddComment={handleAddComment}
                    loading={actionLoading}
                    employees={employees}
                  />
                </div>
              )}
              {activeTab === 'timeline' && (
                <div className="py-4">
                  <ActivityTimeline activities={task.activity || []} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );

  return (
    <>
      {drawerPortal}
      {confirmDelete && createPortal(
        <DeleteConfirm
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDelete(false)}
          loading={actionLoading}
        />,
        document.body,
      )}
    </>
  );
});

export default TaskDetailsDrawer;
