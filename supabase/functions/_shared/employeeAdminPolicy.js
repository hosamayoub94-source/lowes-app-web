// Shared role-hierarchy rules for the employee-management Edge Functions
// (manage-employee). Pure functions so Node tests can exercise
// the exact code the functions run.
//
// Audit finding (Oct 2026, docs/security/ROLE_PERMISSION_AUDIT.md F-04):
// `manager` had CAN_CREATE '*', so a manager could create an admin, promote any
// account to admin, or reset/deactivate/delete an admin's PIN -- i.e. take over
// an admin account. The `admin` role is now reachable only by an admin.

export const ADMIN_ROLE = 'admin';

/** May `requesterRole` give `role` to an account (create or edit)? `allowed` is '*' or a role list. */
export function canGrantRole(requesterRole, role, allowed) {
  if (!requesterRole || !role) return false;
  if (role === ADMIN_ROLE) return requesterRole === ADMIN_ROLE;
  if (allowed === '*') return true;
  return Array.isArray(allowed) && allowed.includes(role);
}

/**
 * May `requesterRole` act on an existing account (edit, reset PIN, deactivate,
 * move group, delete)? `target` = { role_type, team }.
 * `social` = requester is social_manager (media-team employees only).
 */
export function canManageTargetAccount(requesterRole, target, allowed, social = false) {
  if (!requesterRole || !target) return { ok: false, error: 'not_found', message: 'الحساب غير موجود' };
  if (target.role_type === ADMIN_ROLE && requesterRole !== ADMIN_ROLE) {
    return { ok: false, error: 'forbidden', message: 'حسابات الأدمن يديرها الأدمن فقط' };
  }
  if (social) {
    if (target.team !== 'ميديا' || target.role_type !== 'employee') {
      return { ok: false, error: 'forbidden', message: 'يمكنك إدارة موظفي السوشال فقط' };
    }
    return { ok: true };
  }
  if (allowed !== '*' && !(Array.isArray(allowed) && allowed.includes(target.role_type))) {
    return { ok: false, error: 'forbidden', message: `لا تملك صلاحية إدارة دور «${target.role_type}»` };
  }
  return { ok: true };
}

