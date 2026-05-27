// =============================================================
// CommentThread — comment list + add-comment form with @mention.
// Supports employee @mention autocomplete and mention highlighting.
// =============================================================

import { memo, useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@utils/classNames';
import { Avatar } from '@components/ui/Avatar';
import { Button } from '@components/ui/Button';
import { timeAgo } from '../utils/taskUtils';

// ── Render text with @mentions highlighted ─────────────────────
function MentionText({ text }) {
  if (!text) return null;
  // Split on @word patterns
  const parts = text.split(/(@\w[\w\s.-]{0,30}?(?=\s|@|$))/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('@') ? (
          <span key={i} className="text-teal font-semibold">{part}</span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

// ── Single comment ─────────────────────────────────────────────
const CommentItem = memo(function CommentItem({ comment }) {
  const { author, text, created_at } = comment;
  return (
    <div className="flex gap-3 group">
      <Avatar name={author?.name} src={author?.avatar} size="sm" className="shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="bg-surface-alt rounded-xl rounded-ss-none px-3 py-2.5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-text">{author?.name || 'مجهول'}</span>
            {author?.role && <span className="text-[10px] text-muted">{author.role}</span>}
          </div>
          <p className="text-sm text-text leading-relaxed">
            <MentionText text={text} />
          </p>
        </div>
        <span className="text-[10px] text-muted mt-1 block px-1">{timeAgo(created_at)}</span>
      </div>
    </div>
  );
});

// ── @Mention dropdown ──────────────────────────────────────────
function MentionDropdown({ employees, query, position, onSelect, activeIdx }) {
  const filtered = employees
    .filter((e) => {
      const name = (e.name || e.employee_name || '').toLowerCase();
      return name.includes(query.toLowerCase());
    })
    .slice(0, 6);

  if (!filtered.length) return null;

  return (
    <div
      className="absolute z-50 bg-surface border border-border rounded-xl shadow-lg overflow-hidden min-w-[180px] max-w-[240px]"
      style={{ bottom: position.bottom, left: position.left }}
    >
      <div className="px-2 py-1.5 border-b border-border flex items-center gap-1.5">
        <span className="text-[10px] text-muted font-semibold">ذكر موظف</span>
      </div>
      <ul>
        {filtered.map((emp, idx) => {
          const name = emp.name || emp.employee_name || '';
          return (
            <li key={emp.id || name}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onSelect(name); }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors text-start',
                  idx === activeIdx ? 'bg-teal/10 text-teal' : 'hover:bg-surface-alt text-text',
                )}
              >
                <Avatar name={name} src={emp.avatar} size="xs" className="shrink-0" />
                <span className="truncate">{name}</span>
                {emp.role && (
                  <span className="text-[10px] text-muted ms-auto shrink-0">{emp.role}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Add comment form with @mention support ────────────────────
function AddCommentForm({ onSubmit, loading, employees = [] }) {
  const [text, setText] = useState('');
  const [mentionQuery, setMentionQuery] = useState(null); // null = no mention active
  const [mentionStart, setMentionStart]  = useState(-1);
  const [activeIdx, setActiveIdx]        = useState(0);
  const [dropPos, setDropPos]            = useState({ bottom: 0, left: 0 });
  const textareaRef = useRef(null);
  const containerRef = useRef(null);

  // Recalc dropdown position whenever mention opens
  useEffect(() => {
    if (mentionQuery === null || !textareaRef.current || !containerRef.current) return;
    const ta   = textareaRef.current;
    const rect = ta.getBoundingClientRect();
    const cRect = containerRef.current.getBoundingClientRect();
    setDropPos({
      bottom: cRect.bottom - rect.top + 4,
      left: 4,
    });
  }, [mentionQuery]);

  const handleChange = (e) => {
    const val = e.target.value;
    const cur  = e.target.selectionStart;
    setText(val);

    // Detect @mention: look for @ before cursor with no space after
    const slice = val.slice(0, cur);
    const match = slice.match(/@(\w*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionStart(cur - match[0].length);
      setActiveIdx(0);
    } else {
      setMentionQuery(null);
      setMentionStart(-1);
    }
  };

  const insertMention = useCallback((name) => {
    if (mentionStart < 0) return;
    const cur    = textareaRef.current?.selectionStart ?? text.length;
    const before = text.slice(0, mentionStart);
    const after  = text.slice(cur);
    const newText = `${before}@${name} ${after}`;
    setText(newText);
    setMentionQuery(null);
    setMentionStart(-1);
    // Restore focus + cursor
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      const pos = mentionStart + name.length + 2;
      textareaRef.current.setSelectionRange(pos, pos);
    });
  }, [mentionStart, text]);

  const handleKeyDown = (e) => {
    // @mention navigation
    if (mentionQuery !== null) {
      const filtered = employees
        .filter((emp) => (emp.name || emp.employee_name || '').toLowerCase().includes(mentionQuery.toLowerCase()))
        .slice(0, 6);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' && filtered.length > 0) {
        e.preventDefault();
        insertMention(filtered[activeIdx]?.name || filtered[activeIdx]?.employee_name || '');
        return;
      }
      if (e.key === 'Escape') {
        setMentionQuery(null);
        return;
      }
    }

    // Ctrl/Cmd + Enter submits
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      handleSubmit(e);
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    await onSubmit(trimmed);
    setText('');
    setMentionQuery(null);
    textareaRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Mention dropdown */}
      {mentionQuery !== null && (
        <MentionDropdown
          employees={employees}
          query={mentionQuery}
          position={dropPos}
          onSelect={insertMention}
          activeIdx={activeIdx}
        />
      )}

      <form onSubmit={handleSubmit} className="flex gap-2 pt-3 border-t border-border">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            placeholder="اكتب تعليقاً... (@ للذكر، Ctrl+Enter للإرسال)"
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            rows={2}
            disabled={loading}
            aria-label="إضافة تعليق"
            className={cn(
              'w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text',
              'placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal/40 resize-none',
              loading && 'opacity-50',
            )}
          />
          {employees.length > 0 && (
            <span className="absolute bottom-2 end-2 text-[10px] text-muted/50 pointer-events-none">
              @ للذكر
            </span>
          )}
        </div>
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
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────
export const CommentThread = memo(function CommentThread({
  comments = [],
  onAddComment,
  loading = false,
  className = '',
  employees = [],
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

      {/* Add comment with @mention */}
      <AddCommentForm onSubmit={onAddComment} loading={loading} employees={employees} />
    </div>
  );
});

export default CommentThread;
