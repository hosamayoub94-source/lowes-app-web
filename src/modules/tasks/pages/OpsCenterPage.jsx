// =============================================================
// OpsCenterPage — «مركز العمل». Lands on what needs action today.
// Tabs: اليوم · مهامي · فريقي · المشاريع · الأرشيف · الكل (إدارة فقط).
// Enabled by VITE_TASKS_OPS_CENTER; the legacy page is untouched.
// Visibility here is app-layer only (see utils/taskScope.js).
// =============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@components/ui/Button';
import { EmptyState } from '@components/ui/EmptyState';
import { Spinner } from '@components/ui/Loading';
import { Tabs } from '@components/ui/Tabs';
import { useAuthStore } from '@stores/authStore';
import { usePermissions } from '@hooks/usePermissions';
import { PERMISSIONS } from '@data/permissions';
import { useTasks } from '../hooks/useTasks';
import { useTaskStore } from '../store/useTaskStore';
import { TaskDetailsDrawer } from '../components/TaskDetailsDrawer';
import { OpsCreateTaskModal } from '../components/OpsCreateTaskModal';
import { OpsTaskCard } from '../components/OpsTaskCard';
import { TaskSection } from '../components/TaskSection';
import { TodayView } from '../components/TodayView';
import { canSee, defaultTab, FOUNDER_PROFILE_ID, isMine, tabsFor } from '../utils/taskScope';
import { bucketFor, compareForWork, isActive, isClosed, ownerId } from '../utils/taskWorkflow';
import { readLinks, projectLabel } from '../utils/taskLinks';
import { instantKey, todayKey } from '../utils/taskDates';

const TAB_META = {
  today:    { label: 'اليوم',    icon: '🎯' },
  mine:     { label: 'مهامي',    icon: '👤' },
  team:     { label: 'فريقي',    icon: '👥' },
  projects: { label: 'المشاريع', icon: '📁' },
  archive:  { label: 'الأرشيف',  icon: '🗄️' },
  all:      { label: 'الكل',     icon: '🗂️' },
};
const ARCHIVE_PAGE = 60;
const INPUT = 'rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal/40';

function CardGrid({ tasks, today, onOpen }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {tasks.map((t) => <OpsTaskCard key={t.id} task={t} today={today} onClick={() => onOpen(t.id)} />)}
    </div>
  );
}

export default function OpsCenterPage() {
  const {
    tasks, loading, error, actionLoading, selectedTask, employees, drawerOpen,
    loadTasks, openTask, closeDrawer, changeStatus, changeProgress, postComment,
    addTask, editTask, deleteTask, clearError, uploadAttachment, removeAttachment, tagUser, untagUser,
  } = useTasks();

  const { can } = usePermissions();
  const canAssign = can(PERMISSIONS.ASSIGN_TASKS);
  const userId = useAuthStore((s) => s.session?.id);
  const myProjects = useTaskStore((s) => s.myProjects);
  const viewerTeam = useTaskStore((s) => s.viewerTeam);
  const viewerIsAdmin = useTaskStore((s) => s.viewerIsAdmin);
  const viewerCanSeeAll = useTaskStore((s) => s.viewerCanSeeAll);
  const viewerRole = useTaskStore((s) => s.viewerRole);

  const scope = useMemo(() => ({
    viewerId: userId || null, role: viewerRole, team: viewerTeam, isAdmin: viewerIsAdmin,
    viewAll: viewerCanSeeAll, projectIds: (myProjects || []).map((p) => p.id),
  }), [userId, viewerRole, viewerTeam, viewerIsAdmin, viewerCanSeeAll, myProjects]);

  const [activeTab, setActiveTab] = useState(null);
  const pickedTab = useRef(false);
  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [founderMode, setFounderMode] = useState(userId === FOUNDER_PROFILE_ID);
  const [archiveLimit, setArchiveLimit] = useState(ARCHIVE_PAGE);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const today = todayKey();

  useEffect(() => { setFounderMode(userId === FOUNDER_PROFILE_ID); }, [userId]);

  // Landing tab: never a project. Management/team leads → اليوم, employees → مهامي.
  useEffect(() => {
    if (loading || pickedTab.current) return;
    setActiveTab(defaultTab(scope));
  }, [loading, scope]);

  // Deep link from a notification: /tasks?task=<id>[&tab=comments] — unchanged contract.
  const [searchParams, setSearchParams] = useSearchParams();
  const deepTask = searchParams.get('task');
  const deepTab = searchParams.get('tab');
  const [drawerTab, setDrawerTab] = useState('details');
  useEffect(() => {
    if (loading || !deepTask) return;
    if (tasks.some((t) => t.id === deepTask)) {
      setDrawerTab(deepTab === 'comments' ? 'comments' : 'details');
      openTask(deepTask);
    }
    const next = new URLSearchParams(searchParams);
    next.delete('task'); next.delete('tab');
    setSearchParams(next, { replace: true });
  }, [loading, deepTask]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!drawerOpen) setDrawerTab('details'); }, [drawerOpen]);

  const pick = useCallback((k) => { pickedTab.current = true; setActiveTab(k); }, []);

  // Everything the viewer may see, after search / owner filters.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (!canSee(t, scope)) return false;
      if (ownerFilter && ownerId(t) !== ownerFilter) return false;
      if (q) {
        const hay = `${t.title} ${t.description || ''} ${t.assigned_to?.name || ''} ${t.outcome || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, scope, search, ownerFilter]);

  const active = useMemo(() => visible.filter(isActive), [visible]);
  const cmp = useMemo(() => compareForWork(today), [today]);

  // «اليوم»: team leads and management see their whole scope; employees only their own.
  const todayPool = useMemo(
    () => (scope.viewAll || scope.team ? active : active.filter((t) => isMine(t, userId))),
    [active, scope.viewAll, scope.team, userId],
  );
  const mine = useMemo(() => active.filter((t) => isMine(t, userId)).sort(cmp), [active, userId, cmp]);

  const teamsPresent = useMemo(() => [...new Set(active.map((t) => t.team).filter(Boolean))], [active]);
  const teamList = useMemo(() => {
    const wanted = scope.viewAll ? teamFilter : scope.team;
    return active.filter((t) => !wanted || t.team === wanted).sort(cmp);
  }, [active, scope.viewAll, scope.team, teamFilter, cmp]);

  const projectGroups = useMemo(() => {
    const names = Object.fromEntries((myProjects || []).map((p) => [p.id, p.name]));
    const map = new Map();
    for (const t of active) {
      const l = readLinks(t);
      const key = l.project_code ? `${l.project_code} · ${projectLabel(l.project_code)}` : (names[t.project_id] || 'بلا مشروع');
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    }
    return [...map.entries()].map(([name, list]) => [name, list.sort(cmp)]).sort((a, b) => (a[0] === 'بلا مشروع') - (b[0] === 'بلا مشروع') || b[1].length - a[1].length);
  }, [active, myProjects, cmp]);

  const archived = useMemo(
    () => visible.filter(isClosed).sort((a, b) => (instantKey(b.completed_at || b.updated_at) || '').localeCompare(instantKey(a.completed_at || a.updated_at) || '')),
    [visible],
  );
  const allActive = useMemo(
    () => active.filter((t) => !teamFilter || t.team === teamFilter).sort(cmp),
    [active, teamFilter, cmp],
  );

  const counts = {
    today: todayPool.filter((t) => ['overdue', 'today', 'blocked'].includes(bucketFor(t, { today, userId }))).length,
    mine: mine.length,
    team: teamList.length,
    projects: active.length,
    archive: archived.length,
    all: active.length,
  };

  const tabs = tabsFor(scope).map((k) => ({ key: k, ...TAB_META[k], badge: counts[k] || null }));

  const handleCreate = useCallback(async (payload, files = []) => {
    setCreating(true);
    try {
      const task = await addTask(payload, userId);
      if (files.length && task?.id) await Promise.allSettled(files.map((f) => uploadAttachment(task.id, f)));
      setCreateOpen(false);
    } catch { /* surfaced through store.error */ } finally { setCreating(false); }
  }, [addTask, uploadAttachment, userId]);

  const renderBody = () => {
    switch (activeTab) {
      case 'today':
        return (
          <div className="space-y-4">
            {viewerIsAdmin && (
              <label className="inline-flex items-center gap-2 text-xs text-muted cursor-pointer select-none">
                <input type="checkbox" checked={founderMode} onChange={(e) => setFounderMode(e.target.checked)} className="w-4 h-4 accent-teal" />
                قرارات واعتمادات فقط
              </label>
            )}
            <TodayView tasks={todayPool} userId={userId} founderMode={founderMode} onOpen={openTask} />
          </div>
        );
      case 'mine':
        return mine.length ? <CardGrid tasks={mine} today={today} onOpen={openTask} /> : <EmptyState icon="✅" title="لا مهام نشطة عليك" description="ما أُسنِد إليك أو أُشرِكت به يظهر هنا." />;
      case 'team':
        return (
          <div className="space-y-4">
            {scope.viewAll && (
              <Tabs size="sm" value={teamFilter} onChange={setTeamFilter}
                tabs={[{ key: '', label: 'كل الفرق' }, ...teamsPresent.map((t) => ({ key: t, label: t }))]} />
            )}
            {teamList.length ? <CardGrid tasks={teamList} today={today} onOpen={openTask} /> : <EmptyState icon="👥" title="لا مهام نشطة للفريق" />}
          </div>
        );
      case 'projects':
        return projectGroups.length ? (
          <div className="space-y-5">
            {projectGroups.map(([name, list]) => (
              <TaskSection key={name} title={name} icon="📁" count={list.length} tone="teal" defaultOpen={false}>
                <CardGrid tasks={list} today={today} onOpen={openTask} />
              </TaskSection>
            ))}
          </div>
        ) : <EmptyState icon="📁" title="لا مهام نشطة" />;
      case 'archive':
        return archived.length ? (
          <div className="space-y-4">
            <CardGrid tasks={archived.slice(0, archiveLimit)} today={today} onOpen={openTask} />
            {archived.length > archiveLimit && (
              <Button variant="outline" size="sm" onClick={() => setArchiveLimit((n) => n + ARCHIVE_PAGE)}>عرض المزيد ({archived.length - archiveLimit})</Button>
            )}
          </div>
        ) : <EmptyState icon="🗄️" title="الأرشيف فارغ" description="المهام المكتملة والملغاة والمؤرشفة تظهر هنا." />;
      case 'all':
        return (
          <div className="space-y-4">
            <Tabs size="sm" value={teamFilter} onChange={setTeamFilter}
              tabs={[{ key: '', label: 'كل الفرق' }, ...teamsPresent.map((t) => ({ key: t, label: t }))]} />
            {allActive.length ? <CardGrid tasks={allActive} today={today} onOpen={openTask} /> : <EmptyState icon="🗂️" title="لا مهام نشطة" />}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-5 pb-24 sm:pb-8">
      <OpsCreateTaskModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
        saving={creating}
        employees={employees}
        projects={myProjects}
        canMarkSensitive={viewerIsAdmin}
        creatorId={userId}
      />

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-text">مركز العمل</h1>
          <p className="text-sm text-muted mt-0.5">ما يحتاج إجراءً اليوم — لكل مهمة مالك ونتيجة وموعد</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={() => loadTasks()} disabled={loading} aria-label="تحديث"
            className="w-9 h-9 rounded-xl bg-surface border border-border grid place-items-center text-muted hover:text-text hover:border-teal/40 transition">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden className={loading ? 'animate-spin' : ''}>
              <path d="M21.5 2v6h-6M2.5 22v-6h6" /><path d="M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
            </svg>
          </button>
          {canAssign && <Button variant="teal" size="md" onClick={() => setCreateOpen(true)}>＋ <span className="hidden sm:inline">مهمة جديدة</span></Button>}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-bg border border-red/30 text-red-fg">
          <p className="text-sm flex-1">{error}</p>
          <button type="button" onClick={clearError} className="text-xs underline shrink-0">إغلاق</button>
        </div>
      )}

      {!loading && <Tabs tabs={tabs} value={activeTab} onChange={pick} />}

      {activeTab !== 'archive' && (
        <div className="flex flex-wrap items-center gap-2">
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث عن مهمة…" aria-label="بحث" className={`${INPUT} flex-1 min-w-[160px]`} />
          {(scope.viewAll || scope.team) && (
            <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} aria-label="المالك" className={INPUT}>
              <option value="">كل الملّاك</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          )}
        </div>
      )}

      {loading ? <div className="py-16 flex justify-center"><Spinner size="lg" /></div> : renderBody()}

      <TaskDetailsDrawer
        task={selectedTask}
        open={drawerOpen}
        onClose={closeDrawer}
        onStatusChange={changeStatus}
        onProgressChange={changeProgress}
        onAddComment={postComment}
        onUploadAttachment={uploadAttachment}
        onRemoveAttachment={removeAttachment}
        onEditTask={editTask}
        onDeleteTask={deleteTask}
        onTagUser={tagUser}
        onUntagUser={untagUser}
        actionLoading={actionLoading}
        employees={employees}
        initialTab={drawerTab}
      />
    </div>
  );
}
