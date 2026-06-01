// =============================================================
// usePermissions — capability checks for the current user.
//
//   const { can } = usePermissions();
//   if (can(PERMISSIONS.ASSIGN_TASKS)) { ... }
// =============================================================
import { useMemo, useCallback } from 'react';
import { useAuthStore } from '@stores/authStore';
import { resolvePermissions, sessionCan } from '@data/permissions';

export function usePermissions() {
  const session = useAuthStore((s) => s.session);

  const permissions = useMemo(() => resolvePermissions(session), [session]);

  const can = useCallback(
    (permission) => sessionCan(session, permission),
    [session],
  );

  return { can, permissions, role: session?.role ?? null };
}

export default usePermissions;
