// =============================================================
// CollaborationFeed — realtime feed of comments + mentions + events
// =============================================================
import { useEffect } from 'react';
import { useAuth }                from '@hooks/useAuth';
import useCollaborationStore      from '../store/useCollaborationStore';
import { getRecentComments }      from '../services/collaborationService';
import { useMentions }            from '../hooks/useMentions';
import { on }                     from '@/core/events/eventBus.js';
import { EVENTS }                 from '@/core/events/eventTypes.js';

const ENTITY_ICONS = {
  task:       '📋',
  deal:       '💼',
  lead:       '🎯',
  file:       '📄',
  attendance: '🕒',
  channel:    '💬',
};

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000)    return 'الآن';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} د`;
  if (diff < 86_400_000)return `${Math.floor(diff / 3_600_000)} س`;
  return new Date(ts).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' });
}

export function CollaborationFeed({ maxItems = 15, compact = false }) {
  const auth              = useAuth();
  const recentComments    = useCollaborationStore((s) => s.recentComments);
  const setRecentComments = useCollaborationStore((s) => s.setRecentComments);
  const prependRecent     = useCollaborationStore((s) => s.prependRecentComment);
  const totalUnread       = useCollaborationStore((s) => s.totalUnread);
  const clearAllUnread    = useCollaborationStore((s) => s.clearAllUnread);
  const { renderMentions } = useMentions();

  // ── Load recent on mount ───────────────────────────────────────
  useEffect(() => {
    getRecentComments(maxItems)
      .then(setRecentComments)
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Listen for new comments via event bus ──────────────────────
  useEffect(() => {
    const off = on(EVENTS.COMMENT_ADDED, ({ comment }) => {
      prependRecent(comment);
    });
    return off;
  }, [prependRecent]);

  const items = recentComments.slice(0, maxItems);

  return (
    <div className="space-y-1" dir="rtl">
      {/* Header */}
      {!compact && (
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-600">💬 نشاط الفريق</span>
            {totalUnread > 0 && (
              <span className="bg-indigo-600 text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 font-bold">
                {totalUnread}
              </span>
            )}
          </div>
          {totalUnread > 0 && (
            <button
              onClick={clearAllUnread}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              تعليم كقروء
            </button>
          )}
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && (
        <div className="text-center py-6 text-gray-400">
          <p className="text-2xl mb-1">💬</p>
          <p className="text-sm">لا يوجد نشاط بعد</p>
          <p className="text-xs mt-1 text-gray-300">كن أول من يبدأ نقاشاً</p>
        </div>
      )}

      {/* Feed items */}
      {items.map((comment) => {
        const isMine   = comment.author_id === auth.id;
        const entityIcon = ENTITY_ICONS[comment.entity_type] ?? '💬';

        return (
          <div
            key={comment.id}
            className="flex items-start gap-2.5 py-2 px-2 rounded-xl hover:bg-gray-50 transition-colors group"
          >
            {/* Author avatar */}
            <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center flex-none mt-0.5">
              {comment.author_name?.[0] ?? '?'}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-xs font-semibold text-gray-800">
                  {isMine ? 'أنت' : comment.author_name}
                </span>
                <span className="text-xs text-gray-400">علّق في</span>
                <span className="text-xs text-gray-500 flex items-center gap-0.5">
                  {entityIcon} {comment.entity_type}
                </span>
                {comment.parent_id && (
                  <span className="text-xs text-indigo-500">↩ رداً</span>
                )}
              </div>
              <p
                className="text-xs text-gray-600 truncate mt-0.5 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: renderMentions(comment.content) }}
              />
            </div>

            {/* Timestamp */}
            <span className="text-xs text-gray-400 flex-none mt-0.5">
              {timeAgo(comment.created_at)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default CollaborationFeed;
