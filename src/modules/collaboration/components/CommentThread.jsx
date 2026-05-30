// =============================================================
// CommentThread — threaded comments for any entity
// Usage: <CommentThread entityType="task" entityId={task.id} />
// =============================================================
import { useState, memo, useCallback } from 'react';
import { useComments }    from '../hooks/useComments';
import { useMentions }    from '../hooks/useMentions';
import { MentionInput }   from './MentionInput';
import { useAuth }        from '@hooks/useAuth';

// ── Time helper ────────────────────────────────────────────────
function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000)    return 'الآن';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} د`;
  if (diff < 86_400_000)return `${Math.floor(diff / 3_600_000)} س`;
  return new Date(ts).toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', { month: 'short', day: 'numeric' });
}

// ── Avatar ─────────────────────────────────────────────────────
function Avatar({ name, url, size = 'sm' }) {
  const sz = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-8 h-8 text-sm';
  if (url) return <img src={url} className={`${sz} rounded-full object-cover flex-none`} alt={name} />;
  return (
    <div className={`${sz} rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center flex-none`}>
      {name?.[0] ?? '?'}
    </div>
  );
}

// ── Single comment ─────────────────────────────────────────────
const CommentItem = memo(function CommentItem({ comment, replies, onReply, onDelete, currentUserId }) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { renderMentions } = useMentions();

  const handleReply = async () => {
    if (!replyText.trim()) return;
    setSubmitting(true);
    try {
      await onReply(comment.id, replyText);
      setReplyText('');
      setReplyOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const isOwn = comment.author_id === currentUserId;

  return (
    <div className="group">
      {/* Comment row */}
      <div className="flex items-start gap-2.5">
        <Avatar name={comment.author_name} url={comment.author_avatar} />

        <div className="flex-1 min-w-0">
          {/* Bubble */}
          <div className={`rounded-2xl px-3.5 py-2.5 text-sm ${isOwn ? 'bg-indigo-50' : 'bg-gray-50'}`}>
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="font-semibold text-gray-800 text-xs">{comment.author_name}</span>
              <span className="text-xs text-gray-400 flex-none">{timeAgo(comment.created_at)}</span>
            </div>
            {comment.is_deleted
              ? <p className="text-gray-400 italic text-xs">[تم حذف هذا التعليق]</p>
              : (
                <p
                  className="text-gray-700 break-words leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: renderMentions(comment.content) }}
                />
              )
            }
          </div>

          {/* Actions */}
          {!comment.is_deleted && (
            <div className="flex items-center gap-3 mt-1 px-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => setReplyOpen((v) => !v)}
                className="text-xs text-gray-400 hover:text-indigo-600 transition-colors"
              >
                ↩ رد
              </button>
              {isOwn && (
                <button
                  onClick={() => onDelete(comment.id)}
                  className="text-xs text-gray-300 hover:text-red-500 transition-colors"
                >
                  حذف
                </button>
              )}
              {comment.mentions?.length > 0 && (
                <span className="text-xs text-gray-300">{comment.mentions.length} إشارة</span>
              )}
            </div>
          )}

          {/* Reply input */}
          {replyOpen && (
            <div className="mt-2">
              <MentionInput
                value={replyText}
                onChange={setReplyText}
                onSubmit={handleReply}
                placeholder="اكتب رداً..."
                autoFocus
                maxRows={3}
                disabled={submitting}
              />
              <div className="flex gap-2 mt-1.5 justify-end">
                <button
                  onClick={() => { setReplyOpen(false); setReplyText(''); }}
                  className="text-xs text-gray-400 px-2 py-1"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleReply}
                  disabled={!replyText.trim() || submitting}
                  className="text-xs bg-indigo-600 text-white px-3 py-1 rounded-lg disabled:opacity-50 hover:bg-indigo-700 transition-colors"
                >
                  {submitting ? '...' : 'إرسال'}
                </button>
              </div>
            </div>
          )}

          {/* Nested replies */}
          {replies.length > 0 && (
            <div className="mt-2 mr-2 border-r-2 border-gray-100 pr-3 space-y-2">
              {replies.map((r) => (
                <CommentItem
                  key={r.id}
                  comment={r}
                  replies={[]}
                  onReply={onReply}
                  onDelete={onDelete}
                  currentUserId={currentUserId}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

// ── Main component ─────────────────────────────────────────────
export function CommentThread({
  entityType,
  entityId,
  channelId    = null,
  placeholder  = 'اكتب تعليقاً...',
  compact      = false,
  maxVisible   = 20,
}) {
  const auth    = useAuth();
  const { comments, topLevel, getReplies, loading, submit, reply, remove } =
    useComments(entityType, entityId, { channelId });

  const [text, setText]         = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showAll, setShowAll]   = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      await submit(text);
      setText('');
    } finally {
      setSubmitting(false);
    }
  }, [text, submit]);

  const visible = showAll ? topLevel : topLevel.slice(-maxVisible);
  const hidden  = Math.max(0, topLevel.length - maxVisible);

  return (
    <div className="space-y-3" dir="rtl">
      {/* Header */}
      {!compact && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500">
            💬 التعليقات {comments.length > 0 && `(${comments.length})`}
          </span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="animate-pulse space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="flex gap-2">
              <div className="w-7 h-7 bg-gray-100 rounded-full" />
              <div className="flex-1 h-12 bg-gray-50 rounded-xl" />
            </div>
          ))}
        </div>
      )}

      {/* Show more hidden */}
      {!showAll && hidden > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full text-xs text-indigo-500 hover:text-indigo-700 py-1 text-center"
        >
          عرض {hidden} تعليقات أخرى ↑
        </button>
      )}

      {/* Comments list */}
      {!loading && (
        <div className="space-y-3">
          {visible.length === 0 && (
            <p className="text-center text-xs text-gray-400 py-3">
              لا توجد تعليقات بعد. كن أول من يعلّق!
            </p>
          )}
          {visible.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              replies={getReplies(c.id)}
              onReply={reply}
              onDelete={remove}
              currentUserId={auth.id}
            />
          ))}
        </div>
      )}

      {/* Input box */}
      <div className="flex items-start gap-2.5 pt-1">
        <Avatar name={auth.name} url={auth.avatar_url} />
        <div className="flex-1 space-y-1.5">
          <MentionInput
            value={text}
            onChange={setText}
            onSubmit={handleSubmit}
            placeholder={placeholder}
            disabled={submitting}
          />
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-gray-300">Enter للإرسال · Shift+Enter سطر جديد</span>
            <button
              onClick={handleSubmit}
              disabled={!text.trim() || submitting}
              className="text-xs bg-indigo-600 text-white px-3 py-1 rounded-lg disabled:opacity-50 hover:bg-indigo-700 transition-colors"
            >
              {submitting ? '⏳' : '↩ إرسال'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CommentThread;
