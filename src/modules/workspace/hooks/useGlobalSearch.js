// =============================================================
// useGlobalSearch — cross-module search engine
// Searches: tasks · customers · leads · files · notifications
// =============================================================
import { useMemo } from 'react';
import { useTaskStore }         from '@modules/tasks/store/useTaskStore';
import { useNotificationStore } from '@modules/notifications/store/useNotificationStore';
import useCRMStore              from '@modules/crm/store/useCRMStore';
import useFileStore             from '@modules/files/store/useFileStore';
import { ROUTES }               from '@routes/paths';

// ── Result types ───────────────────────────────────────────────
export const RESULT_TYPES = {
  TASK:         'task',
  CUSTOMER:     'customer',
  LEAD:         'lead',
  DEAL:         'deal',
  FILE:         'file',
  NOTIFICATION: 'notification',
  NAV:          'nav',
  ACTION:       'action',
};

const TYPE_META = {
  task:         { label: 'مهمة',     icon: '📋', color: 'bg-indigo-100 text-indigo-700' },
  customer:     { label: 'عميل',     icon: '👤', color: 'bg-purple-100 text-purple-700' },
  lead:         { label: 'عميل محتمل', icon: '🎯', color: 'bg-teal-100 text-teal-700' },
  deal:         { label: 'صفقة',     icon: '💼', color: 'bg-green-100 text-green-700' },
  file:         { label: 'ملف',      icon: '📄', color: 'bg-amber-100 text-amber-700' },
  notification: { label: 'إشعار',    icon: '🔔', color: 'bg-blue-100 text-blue-700' },
  nav:          { label: 'صفحة',     icon: '🔗', color: 'bg-gray-100 text-gray-600' },
  action:       { label: 'إجراء',    icon: '⚡', color: 'bg-orange-100 text-orange-700' },
};

export function getTypeMeta(type) {
  return TYPE_META[type] ?? TYPE_META.nav;
}

// ── Navigation shortcuts ───────────────────────────────────────
export const NAV_COMMANDS = [
  { id: 'nav-home',       label: 'الرئيسية',             icon: '🏠', type: RESULT_TYPES.NAV, path: ROUTES.HOME,       shortcut: 'G H' },
  { id: 'nav-attendance', label: 'الحضور',                icon: '🕒', type: RESULT_TYPES.NAV, path: ROUTES.ATTENDANCE, shortcut: 'G A' },
  { id: 'nav-tasks',      label: 'المهام',                icon: '📋', type: RESULT_TYPES.NAV, path: ROUTES.TASKS,      shortcut: 'G T' },
  { id: 'nav-team',       label: 'الفريق',                icon: '👥', type: RESULT_TYPES.NAV, path: ROUTES.TEAM,       shortcut: 'G E' },
  { id: 'nav-holidays',   label: 'الإجازات',              icon: '🏖️', type: RESULT_TYPES.NAV, path: ROUTES.HOLIDAYS },
  { id: 'nav-accounting', label: 'الحسابات',              icon: '💰', type: RESULT_TYPES.NAV, path: ROUTES.ACCOUNTING },
  { id: 'nav-profile',    label: 'الملف الشخصي',          icon: '👤', type: RESULT_TYPES.NAV, path: ROUTES.PROFILE,   shortcut: 'G P' },
  { id: 'nav-admin',      label: 'الإدارة',               icon: '⚙️', type: RESULT_TYPES.NAV, path: ROUTES.ADMIN },
];

// ── normalize Arabic text for fuzzy matching ───────────────────
function normalize(str = '') {
  return str
    .toLowerCase()
    .replace(/[ؗ-ًؚ-ْ]/g, '') // strip diacritics
    .replace(/[أإآا]/g, 'ا')
    .replace(/[ىي]/g, 'ي')
    .replace(/[هة]/g, 'ه')
    .trim();
}

function match(haystack, needle) {
  return normalize(haystack).includes(normalize(needle));
}

// ── Main hook ──────────────────────────────────────────────────
export function useGlobalSearch(query = '') {
  const tasks         = useTaskStore((s) => s.tasks);
  const notifications = useNotificationStore((s) => s.notifications);

  // CRM — safe access (module may not be initialized)
  const leads     = useCRMStore((s) => s.leads     ?? []);
  const customers = useCRMStore((s) => s.customers ?? []);
  const deals     = useCRMStore((s) => s.deals     ?? []);

  // Files — safe access
  const files = useFileStore((s) => s.files ?? []);

  const results = useMemo(() => {
    const q = (query ?? '').trim();

    // Empty query → return top nav items only
    if (!q) {
      return {
        nav:           NAV_COMMANDS.slice(0, 7),
        tasks:         [],
        notifications: [],
        customers:     [],
        leads:         [],
        deals:         [],
        files:         [],
        all:           NAV_COMMANDS.slice(0, 7),
      };
    }

    // ── Tasks ──────────────────────────────────────────────────
    const taskResults = tasks
      .filter((t) => match(t?.title ?? '', q) || match(t?.description ?? '', q))
      .slice(0, 6)
      .map((t) => ({
        id:       `task-${t.id}`,
        label:    t.title,
        subtitle: (t.status === 'done' || t.status === 'completed') ? 'مكتملة' : t.due_date ? `تستحق: ${new Date(t.due_date).toLocaleDateString('ar-SA-u-nu-latn-ca-gregory')}` : '',
        icon:     (t.status === 'done' || t.status === 'completed') ? '✅' : t.status === 'in_progress' ? '🔵' : '📋',
        type:     RESULT_TYPES.TASK,
        path:     ROUTES.TASKS,
        meta:     t,
      }));

    // ── Notifications ──────────────────────────────────────────
    const notifResults = notifications
      .filter((n) => match(n?.title ?? '', q) || match(n?.message ?? '', q))
      .slice(0, 4)
      .map((n) => ({
        id:       `notif-${n.id}`,
        label:    n.title ?? 'إشعار',
        subtitle: n.message ?? '',
        icon:     '🔔',
        type:     RESULT_TYPES.NOTIFICATION,
        meta:     n,
      }));

    // ── Customers ──────────────────────────────────────────────
    const customerResults = customers
      .filter((c) => match(c?.name ?? '', q) || match(c?.phone ?? '', q) || match(c?.email ?? '', q))
      .slice(0, 5)
      .map((c) => ({
        id:       `customer-${c.id}`,
        label:    c.name ?? 'عميل',
        subtitle: c.phone ?? c.email ?? '',
        icon:     '👤',
        type:     RESULT_TYPES.CUSTOMER,
        path:     ROUTES.ACCOUNTING,
        meta:     c,
      }));

    // ── Leads ──────────────────────────────────────────────────
    const leadResults = leads
      .filter((l) => match(l?.title ?? l?.name ?? '', q))
      .slice(0, 4)
      .map((l) => ({
        id:       `lead-${l.id}`,
        label:    l.title ?? l.name ?? 'عميل محتمل',
        subtitle: l.status ?? '',
        icon:     '🎯',
        type:     RESULT_TYPES.LEAD,
        meta:     l,
      }));

    // ── Deals ──────────────────────────────────────────────────
    const dealResults = deals
      .filter((d) => match(d?.title ?? d?.name ?? '', q))
      .slice(0, 4)
      .map((d) => ({
        id:       `deal-${d.id}`,
        label:    d.title ?? d.name ?? 'صفقة',
        subtitle: d.value ? `${d.value} ريال` : '',
        icon:     '💼',
        type:     RESULT_TYPES.DEAL,
        meta:     d,
      }));

    // ── Files ──────────────────────────────────────────────────
    const fileResults = files
      .filter((f) => match(f?.name ?? '', q))
      .slice(0, 4)
      .map((f) => ({
        id:       `file-${f.id}`,
        label:    f.name ?? 'ملف',
        subtitle: f.size ? `${(f.size / 1024).toFixed(1)} KB` : '',
        icon:     '📄',
        type:     RESULT_TYPES.FILE,
        meta:     f,
      }));

    // ── Nav ────────────────────────────────────────────────────
    const navResults = NAV_COMMANDS
      .filter((n) => match(n.label, q))
      .map((n) => ({ ...n }));

    const all = [
      ...navResults,
      ...taskResults,
      ...customerResults,
      ...leadResults,
      ...dealResults,
      ...notifResults,
      ...fileResults,
    ].slice(0, 15);

    return {
      nav:           navResults,
      tasks:         taskResults,
      notifications: notifResults,
      customers:     customerResults,
      leads:         leadResults,
      deals:         dealResults,
      files:         fileResults,
      all,
    };
  }, [query, tasks, notifications, customers, leads, deals, files]);

  const hasResults = results.all.length > 0;
  const isEmpty    = (query ?? '').trim().length > 0 && !hasResults;

  return { results, hasResults, isEmpty };
}

export default useGlobalSearch;
