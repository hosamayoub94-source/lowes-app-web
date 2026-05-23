// =============================================================
// TaskDetailsDrawer — full task detail panel.
// On mobile: bottom-sheet style. On desktop: side drawer or modal.
// Contains: full info, status change, progress update, comments,
// activity timeline, attachments placeholder.
// =============================================================

import { memo, useState, useCallback } from 'react';
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
import { CommentThread } from './CommentThread';
import { ActivityTimeline } from './ActivityTimeline';

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

// ── Attachment placeholder ────────────────────────────────────
function AttachmentsSection({ attachments = [] }) {
  return (
    <Section title="المرفقات" icon="📎">
      {attachments.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 rounded-xl border border-dashed border-border text-center">
          <div className="w-10 h-10 rounded-xl bg-surface-alt grid place-items-center text-muted">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </div>
          <span className="text-xs text-muted">لا توجد مرفقات — سيتم إضافة رفع الملفات قريباً</span>
        </div>
      ) : (
        <div className="space-y-2">
          {attachments.map((att) => (
            <div key={att.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-surface-alt">
              <div className="w-8 h-8 rounded-lg bg-blue-bg grid place-items-center text-blue-fg text-xs font-bold shrink-0">
                {att.type === 'pdf' ? 'PDF' : att.type === 'archive' ? 'ZIP' : 'FILE'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-text truncate">{att.name}</p>
                <p className="text-[10px] text-muted">{att.size}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

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
function DetailsTab({ task, onStatusChange, onProgressChange, actionLoading }) {
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
      <AttachmentsSection attachments={task.attachments} />
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
  actionLoading = false,
}) {
  const [activeTab, setActiveTab] = useState('details');

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

  // Reset tab on open
  useEffect(() => {
    if (open) setActiveTab('details');
  }, [open, task?.id]);

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

  return createPortal(
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
        <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted">تفاصيل المهمة</p>
            <h2 className="text-sm font-bold text-text truncate">{task.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl hover:bg-surface-alt grid place-items-center text-muted shrink-0 transition-colors"
            aria-label="إغلاق"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Tab bar */}
        <TabBar
          active={activeTab}
          onChange={setActiveTab}
          commentCount={task.comments?.length || task.comments_count || 0}
        />

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-safe">
          {activeTab === 'details' && (
            <DetailsTab
              task={task}
              onStatusChange={handleStatusChange}
              onProgressChange={handleProgressChange}
              actionLoading={actionLoading}
            />
          )}
          {activeTab === 'comments' && (
            <div className="py-4">
              <CommentThread
                comments={task.comments || []}
                onAddComment={handleAddComment}
                loading={actionLoading}
              />
            </div>
          )}
          {activeTab === 'timeline' && (
            <div className="py-4">
              <ActivityTimeline activities={task.activity || []} />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
});

export default TaskDetailsDrawer;
