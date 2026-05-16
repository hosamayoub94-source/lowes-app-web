// =============================================================
// CommentThread — comment list + add-comment form.
// Pure presentational, callbacks from parent.
// =============================================================

import { memo, useState, useRef } from 'react';
import { cn } from '@utils/classNames';
import { Avatar } from '@components/ui/Avatar';
import { Button } from '@components/ui/Button';
import { Textarea } from '@components/ui/Input';
import { timeAgo } from '../utils/taskUtils';

// ── Single comment ────────────────────────────────────────────
const CommentItem = memo(function CommentItem({ comment }) {
  const { author, text, created_at } = comment;
  return (
    <div className="flex gap-3 group">
      <Avatar name={author?.name} src={author?.avatar} size="sm" className="shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="bg-surface-alt rounded-xl rounded-ss-none px-3 py-2.5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-text">{author?.name || 'مجهول'}</span>
            <span className="text-[10px] text-muted">{author?.role}</span>
          </div>
          <p className="text-sm text-text leading-relaxed">{text}</p>
        </div>
        <span className="text-[10px] text-muted mt-1 block px-1">{timeAgo(created_at)}</span>
      </div>
    </div>
  );
});

// ── Add comment form ──────────────────────────────────────────
function AddCommentForm({ onSubmit, loading }) {
  const [text, setText] = useState('');
  const textareaRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    await onSubmit(trimmed);
    setText('');
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    // Ctrl/Cmd + Enter submits
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 pt-3 border-t border-border">
      <Textarea
        ref={textareaRef}
        placeholder="اكتب تعليقاً..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={2}
        className="flex-1 resize-none"
        disabled={loading}
        aria-label="إضافة تعليق"
      />
      <Button
        type="submit"
        variant="teal"
        size="sm"
        loading={loading}
        disabled={!text.trim() || loading}
        className="self-end shrink-0"
        aria-label="إرسال التعليق"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </Button>
    </form>
  );
}

// ── Main ──────────────────────────────────────────────────────
export const CommentThread = memo(function CommentThread({
  comments = [],
  onAddComment,
  loading = false,
  className = '',
}) {
  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden className="text-teal">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span className="text-sm font-bold text-text">
          التعليقات {comments.length > 0 && <span className="text-muted font-normal">({comments.length})</span>}
        </span>
      </div>

      {/* Comment list */}
      {comments.length === 0 ? (
        <p className="text-sm text-muted text-center py-4">لا توجد تعليقات بعد. كن أول من يعلق!</p>
      ) : (
        <div className="space-y-3">
          {comments.map((c) => (
            <CommentItem key={c.id} comment={c} />
          ))}
        </div>
      )}

      {/* Add comment */}
      <AddCommentForm onSubmit={onAddComment} loading={loading} />
    </div>
  );
});

export default CommentThread;
