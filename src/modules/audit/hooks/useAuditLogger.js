// =============================================================
// Audit Module — useAuditLogger
//
// Composable hook that injects the current user context and
// exposes a stable `log` function for fire-and-forget logging.
//
// Usage:
//   const { log } = useAuditLogger();
//   log({ actionType: ACTION_TYPE.TASK_DELETED, entityType: 'task',
//         entityId: task.id, entityLabel: task.title });
// =============================================================
import { useCallback } from 'react';
import { useAuthStore } from '@stores/authStore';
import { logActivity, logActivityImmediate } from '../services/auditService';

/**
 * Returns `{ log, logImmediate }`:
 *   - log(params)           — buffered, fire-and-forget
 *   - logImmediate(params)  — bypasses buffer (auth events, critical ops)
 *
 * Both automatically inject userId and userName from the auth store.
 */
export function useAuditLogger() {
  const session = useAuthStore((s) => s.session);

  const log = useCallback(
    (params) => {
      logActivity({
        userId:   session?.id   || null,
        userName: session?.name || null,
        ...params,
      }).catch(() => { /* fire-and-forget — never crash the UI */ });
    },
    [session],
  );

  const logImmediate = useCallback(
    (params) => {
      return logActivityImmediate({
        userId:   session?.id   || null,
        userName: session?.name || null,
        ...params,
      });
    },
    [session],
  );

  return { log, logImmediate };
}
