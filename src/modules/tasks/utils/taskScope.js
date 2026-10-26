// =============================================================
// Tasks — who may see what (pure, no aliases).
//
// IMPORTANT: this is APP-LAYER filtering only. The live RLS policy on
// `tasks` is USING(true) for role public (see audit), so this protects the
// UI, not the data. Do not describe it as access control.
// =============================================================
import { ownerId } from './taskWorkflow';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
/** Keep only well-formed UUIDs — used before interpolating into PostgREST .or(). */
export const safeUuids = (list) => (Array.isArray(list) ? list.filter(isUuid) : []);

// Org-wide roles see every team; team managers see their own team only.
const ORG_WIDE_ROLES = ['admin', 'manager'];
const TEAM_FOCUSED_ROLES = ['social_manager', 'sales_manager', 'media_buyer'];

/**
 * @param {object|null} session   auth session ({id, role, team})
 * @param {{hasViewAll:boolean, projectIds?:string[]}} info
 */
export function resolveTaskScope(session, info = {}) {
  if (!session?.id) {
    return { viewerId: null, viewAll: true, isAdmin: false, team: null, projectIds: [], role: '' };
  }
  const role = session.role || session.role_type || '';
  const isOrgWide = ORG_WIDE_ROLES.includes(role);
  // A team-scoped manager with no team configured keeps the old safe
  // behaviour (sees all) instead of suddenly seeing nothing.
  const viewAll = !!info.hasViewAll && (isOrgWide || !session.team);
  return {
    viewerId: session.id,
    viewAll,
    isAdmin: role === 'admin',
    team: session.team || null,
    projectIds: safeUuids(info.projectIds),
    role,
  };
}

/** Mirrors the fetch filter so client-side lists never exceed the fetch scope. */
export function canSee(task, scope) {
  if (!task || !scope) return false;
  if (task.is_sensitive && !scope.isAdmin) return false;
  if (scope.viewAll || !scope.viewerId) return true;
  const id = scope.viewerId;
  if (ownerId(task) === id) return true;
  const creator = task.created_by && typeof task.created_by === 'object' ? task.created_by.id : task.created_by;
  if (creator === id) return true;
  if (Array.isArray(task.tagged_ids) && task.tagged_ids.includes(id)) return true;
  if (task.project_id && scope.projectIds.includes(task.project_id)) return true;
  if (scope.team && task.team === scope.team) return true;
  return false;
}

// حسام أيوب (مؤسس) — معرّف profile كما في supabase/projects_and_task_visibility.sql.
// يحدّد فقط الوضع الافتراضي لعرض «قرارات واعتمادات فقط» لأدمن؛ أماني/ريم أدمن لكنهما تنفيذيتان.
export const FOUNDER_PROFILE_ID = 'a68d72e4-8c88-4554-a8c4-70f5ac813a20';

export const isMine = (task, userId) =>
  !!userId && (ownerId(task) === userId || (Array.isArray(task.tagged_ids) && task.tagged_ids.includes(userId)));

/** Tabs the viewer gets, in order. «الكل» only for org-wide viewers. */
export function tabsFor(scope) {
  const tabs = ['today', 'mine'];
  if (scope.team || scope.viewAll) tabs.push('team');
  tabs.push('projects', 'archive');
  if (scope.viewAll) tabs.push('all');
  return tabs;
}

/**
 * Landing tab. Never a project. Management and team leads land on «اليوم»
 * (what needs action), plain employees on «مهامي».
 */
export function defaultTab(scope) {
  if (scope.isAdmin || scope.viewAll) return 'today';
  if (TEAM_FOCUSED_ROLES.includes(scope.role) && scope.team) return 'today';
  return 'mine';
}
