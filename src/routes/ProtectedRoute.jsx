// =============================================================
// ProtectedRoute — gates a route on authentication and access.
// Redirects to /login when not authenticated; redirects to / (home)
// when authenticated but blocked.
//
// Access is granted when the user's role is in `roles` OR the user
// holds the optional `perm` capability. This MIRRORS navigation.js
// `_visible` (role OR permission) so a nav item that is visible can
// never 404 — the two layers stay consistent by construction, and
// admin-granted extra_permissions reveal a screen everywhere at once.
// =============================================================
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@hooks/useAuth';
import { resolvePermissions } from '@data/permissions';
import { hidesSalesScreens } from '@data/salesAccess';
import { ROUTES } from './paths';

// `blockMediaStaff` — شاشات المبيعات (طلبات/عملاء) مقفولة عن موظفي فريق
// الميديا حتى لو فُتح الرابط مباشرة؛ نفس شرط إخفائها بالقائمة (salesAccess.js).
export function ProtectedRoute({ children, roles, perm, blockMediaStaff = false }) {
  const { isAuthenticated, role, team, session } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.LOGIN} state={{ from: location }} replace />;
  }

  if (blockMediaStaff && hidesSalesScreens(role, team, resolvePermissions(session))) {
    return <Navigate to={ROUTES.HOME} replace />;
  }

  const roleOk = !roles || roles.length === 0 || roles.includes(role);
  // perm: مفتاح واحد أو قائمة (أيٌّ منها يكفي) — نفس دلالة navigation.js `_visible`
  const perms = Array.isArray(perm) ? perm : perm ? [perm] : [];
  const held = perms.length ? resolvePermissions(session) : null;
  const permOk = perms.some((p) => held.has(p));
  if (!roleOk && !permOk) {
    return <Navigate to={ROUTES.HOME} replace />;
  }

  return children;
}

export default ProtectedRoute;
