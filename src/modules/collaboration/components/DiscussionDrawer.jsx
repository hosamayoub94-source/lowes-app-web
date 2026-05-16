// =============================================================
// DiscussionDrawer — slide-in discussion panel (no page leave)
// Opens from any module. Wraps CommentThread + CollaborationFeed
// =============================================================
import { useEffect, useRef } from 'react';
import useCollaborationStore from '../store/useCollaborationStore';
import { CommentThread }     from './CommentThread';
import { CollaborationFeed } from './CollaborationFeed';
import { TeamPresenceBar }   from './TeamPresenceBar';
import { getChannels }       from '../services/collaborationService';

const ENTITY_LABELS = {
  task:       'مهمة',
  deal:       'صفقة',
  lead:       'عميل محتمل',
  file:       'ملف',
  attendance: 'حضور',
  channel:    'قناة',
};

export function DiscussionDrawer() {
  const drawerOpen    = useCollaborationStore((s) => s.drawerOpen);
  const drawerContext = useCollaborationStore((s) => s.drawerContext);
  const channels      = useCollaborationStore((s) => s.channels);
  const activeChannel = useCollaborationStore((s) => s.activeChannelId);
  const closeDrawer   = useCollaborationStore((s) => s.closeDrawer);
  const setChannels   = useCollaborationStore((s) => s.setChannels);
  const setActiveChannel = useCollaborationStore((s) => s.setActiveChannel);

  const drawerRef = useRef(null);

  // Load channels on first open
  useEffect(() => {
    if (drawerOpen && channels.length === 0) {
      getChannels().then(setChannels).catch(() => {});
    }
  }, [drawerOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on Escape
  useEffect(() => {
    if (!drawerOpen) return;
    const handler = (e) => e.key === 'Escape' && closeDrawer();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [drawerOpen, closeDrawer]);

  // Determine view mode
  const isEntityView  = Boolean(drawerContext?.entityType && drawerContext?.entityId);
  const isChannelView = Boolean(activeChannel);

  return (
    <>
      {/* Backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm sm:bg-transparent"
          onClick={closeDrawer}
        />
      )}

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        className={`
          fixed top-0 left-0 h-full z-50 flex flex-col
          bg-white border-l border-gray-100 shadow-2xl
          transition-transform duration-300 ease-out
          w-full sm:w-96
          ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        dir="rtl"
      >
        {/* ── Header ────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-none">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg">💬</span>
            <div className="min-w-0">
              {isEntityView && drawerContext ? (
                <>
                  <p className="text-sm font-semibold text-gray-800 truncate">
                    {drawerContext.entityTitle ?? 'نقاش'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {ENTITY_LABELS[drawerContext.entityType] ?? drawerContext.entityType}
                  </p>
                </>
              ) : isChannelView ? (
                <>
                  <p className="text-sm font-semibold text-gray-800">
                    # {channels.find((c) => c.id === activeChannel)?.name ?? 'قناة'}
                  </p>
                  <p className="text-xs text-gray-400">قناة فريق</p>
                </>
              ) : (
                <p className="text-sm font-semibold text-gray-800">نشاط الفريق</p>
              )}
            </div>
          </div>

          <button
            onClick={closeDrawer}
            className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors flex-none"
          >
            ✕
          </button>
        </div>

        {/* ── Channels sidebar list (top) ──────────────────────── */}
        {channels.length > 0 && !isEntityView && (
          <div className="flex gap-1.5 px-3 py-2 border-b border-gray-50 overflow-x-auto scrollbar-none flex-none">
            <button
              onClick={() => setActiveChannel(null)}
              className={`flex-none text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                !activeChannel ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              الكل
            </button>
            {channels.map((ch) => (
              <button
                key={ch.id}
                onClick={() => setActiveChannel(ch.id)}
                className={`flex-none text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  activeChannel === ch.id
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                # {ch.name}
                {ch.unread > 0 && (
                  <span className="mr-1 bg-red-500 text-white text-xs rounded-full w-3.5 h-3.5 inline-flex items-center justify-center font-bold">
                    {ch.unread}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* ── Presence bar ──────────────────────────────────────── */}
        <div className="px-3 pt-2 flex-none">
          <TeamPresenceBar maxVisible={5} />
        </div>

        {/* ── Main content ──────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          {isEntityView && drawerContext ? (
            // Entity-scoped comment thread
            <CommentThread
              entityType={drawerContext.entityType}
              entityId={drawerContext.entityId}
              placeholder={`علّق على ${ENTITY_LABELS[drawerContext.entityType] ?? 'هذا العنصر'}...`}
            />
          ) : isChannelView ? (
            // Channel messages
            <CommentThread
              entityType="channel"
              entityId={activeChannel}
              channelId={activeChannel}
              placeholder="اكتب رسالة في القناة..."
            />
          ) : (
            // Global recent feed
            <CollaborationFeed maxItems={20} />
          )}
        </div>

      </div>
    </>
  );
}

export default DiscussionDrawer;
