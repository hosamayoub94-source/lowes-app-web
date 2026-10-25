// Server-side copy of the DEFAULT permissions per role (mirror of ROLE_PERMISSIONS in src/data/permissions.js).
// Used by Edge Functions (callerAuth.js) and as the seed for the DB table app_role_permissions
// (supabase/migrations/20261026*_rbac_primitives.sql). test-rbac-sync.mjs fails if the three drift apart.
// admin = every permission (not listed here). Unknown roles = none.
export const ROLE_DEFAULT_PERMISSIONS = {
  employee: [],
  manager: ['approve_leaves', 'assign_tasks', 'delete_task', 'edit_task', 'manage_attendance', 'manage_campaigns',
    'manage_central_stock', 'manage_guides', 'manage_kpi', 'manage_orders', 'manage_payroll', 'manage_products',
    'manage_sales_stock', 'send_whatsapp', 'view_all_attendance', 'view_all_tasks', 'view_analytics',
    'view_campaign_cost', 'view_finance', 'view_inventory', 'view_media_buyer_board'],
  media_buyer: ['assign_tasks', 'delete_task', 'edit_task', 'manage_campaigns', 'manage_orders', 'view_all_tasks',
    'view_analytics', 'view_campaign_cost', 'view_media_buyer_board'],
  sales_manager: ['assign_tasks', 'delete_task', 'edit_task', 'manage_campaigns', 'manage_kpi', 'manage_orders',
    'manage_products', 'view_all_attendance', 'view_all_tasks', 'view_analytics', 'view_inventory', 'view_media_buyer_board'],
  social_manager: ['assign_tasks', 'delete_task', 'edit_task', 'manage_campaigns', 'view_all_attendance',
    'view_all_tasks', 'view_media_buyer_board'],
  accountant: ['manage_payroll', 'view_finance'],
  hr_manager: ['approve_leaves', 'manage_payroll', 'view_all_attendance'],
  warehouse_manager: ['manage_central_stock', 'manage_sales_stock', 'view_inventory'],
  marketing_manager: ['manage_campaigns', 'view_all_tasks', 'view_analytics', 'view_campaign_cost', 'view_media_buyer_board'],
};

/** role defaults + extra − denied; admin handled by the caller (always true). */
export function effectivePermissions(role, extra, denied) {
  const base = ROLE_DEFAULT_PERMISSIONS[role] ?? [];
  const set = new Set([...base, ...(Array.isArray(extra) ? extra : [])]);
  for (const p of Array.isArray(denied) ? denied : []) set.delete(p);
  return set;
}

export function hasPermission(profile, permission) {
  if (!profile) return false;
  if (profile.role_type === 'admin') return true;
  return effectivePermissions(profile.role_type, profile.extra_permissions, profile.denied_permissions).has(permission);
}
