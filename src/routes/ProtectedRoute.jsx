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
import { ROUTES } from './paths';

export function ProtectedRoute({ children, roles, perm }) {
  const { isAuthenticated, role, session } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.LOGIN} state={{ from: location }} replace />;
  }

  const roleOk = !roles || roles.length === 0 || roles.includes(role);
  const permOk = perm ? resolvePermissions(session).has(perm) : false;
  if (!roleOk && !permOk) {
    return <Navigate to={ROUTES.HOME} replace />;
  }

  return children;
}

export default ProtectedRoute;
