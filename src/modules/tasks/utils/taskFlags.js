// =============================================================
// Tasks — rollout flags (build-time). Both default OFF so the shipped
// behaviour is unchanged until explicitly enabled in the environment.
//   VITE_TASKS_OPS_CENTER   — new «مركز العمل» page (Today, scoped tabs)
//   VITE_TASKS_V3_STATUSES  — offer/write waiting_reply, blocked, draft,
//                             archived. Enable ONLY after
//                             supabase/tasks_ops_center_v1.sql is applied.
// =============================================================
const on = (v) => String(v || '').toLowerCase() === 'true';

export const TASKS_OPS_CENTER = on(import.meta.env.VITE_TASKS_OPS_CENTER);
export const TASKS_V3_STATUSES = on(import.meta.env.VITE_TASKS_V3_STATUSES);
