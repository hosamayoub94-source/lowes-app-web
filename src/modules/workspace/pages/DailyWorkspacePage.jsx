// =============================================================
// DailyWorkspacePage v2 — Mobile-first, fast, polished
// الصفحة الرئيسية الموحدة — mobile-first, keyboard-ready, smart
// =============================================================
import { Suspense, memo, useCallback } from 'react';
import { useNavigate }          from 'react-router-dom';
import { useWorkspace }         from '../hooks/useWorkspace';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import useWorkspaceStore        from '../store/useWorkspaceStore';
import { QuickActionsBar }      from '../components/QuickActionsBar';
import { CommandPalette }       from '../components/CommandPalette';
import { FocusModePanel }       from '../components/FocusModePanel';
import { ActivityFeed }         from '../components/ActivityFeed';
import { AttendanceWidget }     from '../components/AttendanceWidget';
import { TasksWidget }          from '../components/TasksWidget';
import { NotificationsWidget }  from '../components/NotificationsWidget';
import { SmartSuggestions }     from '../components/SmartSuggestions';
import { useFocusMode }         from '../hooks/useFocusMode';
import { ROUTES }               from '@routes/paths';
import { TeamPresenceBar }      from '@modules/collaboration/components/TeamPresenceBar';
import { CollaborationFeed }    from '@modules/collaboration/components/CollaborationFeed';
import { DiscussionDrawer }     from '@modules/collaboration/components/DiscussionDrawer';
import useCollaborationStore    from '@modules/collaboration/store/useCollaborationStore';

// ── Shared loading skeleton ────────────────────────────────────
const Skeleton = memo(function Skeleton({ rows = 3 }) {
  return (
    <div className="animate-pulse space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-4 bg-surface-alt rounded"
          style={{ width: i === 0 ? '75%' : i % 2 === 0 ? '90%' : '100%' }}
        />
      ))}
    </div>
  );
});

// ── Collapsible widget wrapper ─────────────────────────────────
const Widget = memo(function Widget({ id, title, icon, children, noPad = false, badge }) {
  const collapsed    = useWorkspaceStore((s) => s.collapsedWidgets[id]);
  const toggleWidget = useWorkspaceStore((s) => s.toggleWidget);
  const handleToggle = useCallback(() => toggleWidget(id), [id, toggleWidget]);

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden transition-shadow hover:shadow-md">
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-alt transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-text">
          <span className="text-base">{icon}</span>
          <span>{title}</span>
          {badge != null && badge > 0 && (
            <span className="bg-red-500 text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 font-bold">
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </span>
        <span className="text-muted text-xs" style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)', display: 'inline-block', transition: 'transform 0.2s' }}>
          ▲
        </span>
      </button>
      {!collapsed && (
        <div className={noPad ? '' : 'px-4 pb-4'}>
          {children}
        </div>
      )}
    </div>
  );
});

// ── Stats pill ─────────────────────────────────────────────────
const StatPill = memo(function StatPill({ value, label, colorClass }) {
  return (
    <div className="flex-1 bg-surface rounded-xl px-3 py-2.5 text-center shadow-sm border border-border">
      <p className={`text-xl font-bold leading-none ${colorClass}`}>{value}</p>
      <p className="text-xs text-muted mt-1 leading-tight">{label}</p>
    </div>
  );
});

// ── Main Page ──────────────────────────────────────────────────
export function DailyWorkspacePage() {
  const navigate = useNavigate();

  const {
    user,
    todayTasks, overdueTasks,
    myRecord, isCheckedIn, isCheckedOut, isOnBreak,
    unreadCount,
    isFocusMode,
    toggleFocusMode,
    openCommandPalette,
  } = useWorkspace();

  const { totalUrgent } = useFocusMode();

  // Collaboration drawer
  const openDrawer       = useCollaborationStore((s) => s.openDrawer);
  const collaborationUnread = useCollaborationStore((s) => s.totalUnread);

  // Activate global keyboard shortcuts
  useKeyboardShortcuts({ enabled: true });

  const today = new Date().toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', {
    weekday: 'long',
    year:    'numeric',
    month:   'long',
    day:     'numeric',
  });

  // ── Attendance status label ────────────────────────────────────
  const attStatus = isOnBreak
    ? { label: 'في استراحة', color: 'text-amber-600', bg: 'bg-amber-50',  dot: '🟡' }
    : isCheckedIn && !isCheckedOut
      ? { label: 'حاضر',      color: 'text-green-600',  bg: 'bg-green-50',  dot: '🟢' }
      : isCheckedOut
        ? { label: 'منصرف',   color: 'text-muted',       bg: 'bg-surface-alt', dot: '⚪' }
        : { label: 'لم تسجل', color: 'text-red-500',    bg: 'bg-red-50',      dot: '🔴' };

  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'صباح الخير' : hour < 17 ? 'مرحباً' : 'مساء الخير';

  return (
    <>
      {/* ── Scrollable page content ────────────────────────────── */}
      <div className="space-y-3.5 max-w-2xl mx-auto pb-24 sm:pb-6" dir="rtl">

        {/* ── Header ────────────────────────────────────────────── */}
        <div className="flex items-start justify-between pt-1">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-text truncate">
              👋 {greeting}، {user.name ?? 'موظف'}
            </h1>
            <p className="text-xs text-muted mt-0.5 truncate">{today}</p>
            <span className={`inline-flex items-center gap-1 text-xs mt-1.5 font-medium px-2 py-0.5 rounded-full ${attStatus.bg} ${attStatus.color}`}>
              {attStatus.dot} {attStatus.label}
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-none ml-2">
            {/* Focus mode toggle */}
            <button
              onClick={toggleFocusMode}
              title="F — وضع التركيز"
              className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-150 ${
                isFocusMode
                  ? 'bg-red-100 text-red-700'
                  : 'bg-surface-alt text-muted hover:bg-surface-alt/80'
              }`}
            >
              🎯
              {totalUrgent > 0 && !isFocusMode && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none font-bold">
                  {totalUrgent}
                </span>
              )}
            </button>

            {/* Discussion drawer */}
            <button
              onClick={() => openDrawer(null)}
              title="نقاشات الفريق"
              className="relative flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium bg-surface-alt text-muted hover:bg-surface-alt/80 transition-colors"
            >
              💬
              {collaborationUnread > 0 && (
                <span className="absolute -top-1 -right-1 bg-indigo-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none font-bold">
                  {collaborationUnread > 9 ? '9+' : collaborationUnread}
                </span>
              )}
            </button>

            {/* Command palette */}
            <button
              onClick={openCommandPalette}
              title="Ctrl+K"
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium bg-surface-alt text-muted hover:bg-surface-alt/80 transition-colors"
            >
              🔍
              <kbd className="hidden sm:inline text-xs text-muted">⌘K</kbd>
            </button>
          </div>
        </div>

        {/* ── Focus Mode Panel ──────────────────────────────────── */}
        {isFocusMode && (
          <Suspense fallback={<Skeleton rows={5} />}>
            <FocusModePanel />
          </Suspense>
        )}

        {/* ── Smart Suggestions (contextual, auto-hides if empty) ── */}
        <Suspense fallback={null}>
          <SmartSuggestions />
        </Suspense>

        {/* ── Quick Actions ─────────────────────────────────────── */}
        <Widget id="quick-actions" title="إجراءات سريعة" icon="⚡" noPad>
          <div className="px-3 pb-3 pt-0.5">
            <QuickActionsBar />
          </div>
        </Widget>

        {/* ── 2-col: Attendance + Notifications ────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">

          <Widget id="attendance" title="الحضور" icon="🕒">
            <Suspense fallback={<Skeleton rows={3} />}>
              <AttendanceWidget />
            </Suspense>
          </Widget>

          <Widget id="notifications" title="الإشعارات" icon="🔔" badge={unreadCount}>
            <Suspense fallback={<Skeleton rows={3} />}>
              <NotificationsWidget />
            </Suspense>
          </Widget>

        </div>

        {/* ── Tasks full-width ───────────────────────────────────── */}
        <Widget
          id="tasks"
          title="مهامي اليوم"
          icon="📋"
          badge={overdueTasks.length > 0 ? overdueTasks.length : undefined}
        >
          <Suspense fallback={<Skeleton rows={5} />}>
            <TasksWidget />
          </Suspense>
        </Widget>

        {/* ── Stats bar ─────────────────────────────────────────── */}
        <div className="flex gap-2">
          <StatPill
            value={todayTasks.length}
            label="مهام اليوم"
            colorClass="text-indigo-600"
          />
          <StatPill
            value={overdueTasks.length}
            label="متأخرة"
            colorClass={overdueTasks.length > 0 ? 'text-red-500' : 'text-green-500'}
          />
          <StatPill
            value={unreadCount}
            label="إشعارات"
            colorClass={unreadCount > 0 ? 'text-blue-500' : 'text-muted'}
          />
        </div>

        {/* ── Team Presence ────────────────────────────────────── */}
        <Suspense fallback={null}>
          <TeamPresenceBar maxVisible={6} />
        </Suspense>

        {/* ── Activity Feed ─────────────────────────────────────── */}
        <Widget id="activity" title="النشاط الأخير" icon="📡">
          <ActivityFeed maxItems={8} />
        </Widget>

        {/* ── Collaboration Feed ────────────────────────────────── */}
        <Widget id="collab-feed" title="نقاشات الفريق" icon="💬" badge={collaborationUnread}>
          <Suspense fallback={<Skeleton rows={4} />}>
            <CollaborationFeed maxItems={10} />
          </Suspense>
        </Widget>

        {/* ── Keyboard hint bar (desktop) ───────────────────────── */}
        <p className="hidden sm:block text-center text-xs text-muted/50 pb-2 select-none">
          <kbd className="bg-surface-alt px-1.5 py-0.5 rounded text-muted">Ctrl+K</kbd> بحث
          &nbsp;·&nbsp;
          <kbd className="bg-surface-alt px-1.5 py-0.5 rounded text-muted">F</kbd> تركيز
          &nbsp;·&nbsp;
          <kbd className="bg-surface-alt px-1.5 py-0.5 rounded text-muted">G→H/T/A</kbd> تنقل
        </p>

      </div>

      {/* ── Sticky Mobile Bottom Navigation ────────────────────── */}
      <div
        className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur-sm border-t border-border px-4 py-2"
        dir="rtl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 8px)' }}
      >
        <div className="flex items-center justify-around max-w-sm mx-auto">

          <button
            className="flex flex-col items-center gap-0.5 p-2 text-indigo-600"
          >
            <span className="text-xl">🏠</span>
            <span className="text-xs font-semibold">الرئيسية</span>
          </button>

          <button
            onClick={openCommandPalette}
            className="flex flex-col items-center gap-0.5 p-2 text-muted"
          >
            <span className="text-xl">🔍</span>
            <span className="text-xs">بحث</span>
          </button>

          <div className="flex flex-col items-center gap-0.5 p-2">
            <span className="text-xl">{attStatus.dot}</span>
            <span className={`text-xs ${attStatus.color}`}>{attStatus.label}</span>
          </div>

          <button
            onClick={() => navigate(ROUTES.TASKS)}
            className="relative flex flex-col items-center gap-0.5 p-2 text-muted"
          >
            {overdueTasks.length > 0 && (
              <span className="absolute top-1 right-0.5 bg-red-500 text-white text-xs rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none font-bold">
                {overdueTasks.length > 9 ? '!' : overdueTasks.length}
              </span>
            )}
            <span className="text-xl">📋</span>
            <span className="text-xs">المهام</span>
          </button>

          <button
            onClick={toggleFocusMode}
            className={`flex flex-col items-center gap-0.5 p-2 ${isFocusMode ? 'text-red-600' : 'text-muted'}`}
          >
            <span className="text-xl">🎯</span>
            <span className="text-xs">تركيز</span>
          </button>

        </div>
      </div>

      {/* ── Global Command Palette ────────────────────────────────── */}
      <CommandPalette />

      {/* ── Discussion Drawer ─────────────────────────────────────── */}
      <DiscussionDrawer />
    </>
  );
}

export default DailyWorkspacePage;
