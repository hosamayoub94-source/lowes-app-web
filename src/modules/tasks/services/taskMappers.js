// =============================================================
// Tasks Module — DB ↔ UI mappers
// The DB stores flat IDs (assigned_to, created_by). The UI works
// with nested objects (assigned_to is an employee object). These
// are the ONLY functions that know about that translation, so
// renaming a column or remodeling a join is a one-line change.
//
// DB shape comes from a Supabase select with these joins:
//   *,
//   assignee:profiles!tasks_assigned_to_fkey(id, name, avatar_url, role_type, team),
//   creator:profiles!tasks_created_by_fkey(id, name, avatar_url),
//   comments:task_comments(...),
//   activity:task_activity(...)
// =============================================================

// -------------------------------------------------------------
// Profile
// -------------------------------------------------------------
export function mapProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.employee_name || row.name || null,
    avatar: row.avatar_url || null,
    avatar_url: row.avatar_url || null,
    role: row.role_type || row.role || null,
    role_type: row.role_type || null,
    team: row.team || null,
  };
}

// -------------------------------------------------------------
// Comment — DB row → nested UI shape
// UI expects { id, author: profile, text, created_at }
// -------------------------------------------------------------
export function mapComment(row) {
  if (!row) return null;
  return {
    id: row.id,
    task_id: row.task_id,
    author: mapProfile(row.author || row.user),
    text: row.comment || row.text || '',
    created_at: row.created_at,
  };
}

// -------------------------------------------------------------
// Activity — DB row → nested UI shape
// UI expects { id, type, actor: profile, note, created_at }
// -------------------------------------------------------------
export function mapActivity(row) {
  if (!row) return null;
  return {
    id: row.id,
    task_id: row.task_id,
    type: row.action_type || row.type,
    actor: mapProfile(row.actor || row.user),
    note: row.action_label || row.note || '',
    metadata: row.metadata || {},
    created_at: row.created_at,
  };
}

// -------------------------------------------------------------
// Task — DB row → nested UI shape
// -------------------------------------------------------------
export function mapTask(row) {
  if (!row) return null;
  const comments = Array.isArray(row.comments) ? row.comments.map(mapComment) : [];
  const activity = Array.isArray(row.activity) ? row.activity.map(mapActivity) : [];

  // Supabase returns aggregate counts as `[{ count: N }]` when using
  // the `comments_count:task_comments(count)` projection.
  const commentsCountRaw = row.comments_count;
  const comments_count = Array.isArray(commentsCountRaw)
    ? (commentsCountRaw[0]?.count ?? 0)
    : (typeof commentsCountRaw === 'number' ? commentsCountRaw : comments.length);

  return {
    id: row.id,
    title: row.title || '',
    description: row.description || '',
    status: row.status || 'pending',
    priority: row.priority || 'medium',
    progress: typeof row.progress === 'number' ? row.progress : 0,
    due_date: row.due_date || null,
    due_time: row.due_time || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    completed_at: row.completed_at || null,
    platform: row.platform || null,
    task_type: row.task_type || null,
    attachments_note: row.attachments_note || null,
    completion_note: row.completion_note || null,
    assigned_to: mapProfile(row.assignee) || (row.assigned_to ? { id: row.assigned_to } : null),
    created_by: mapProfile(row.creator) || (row.created_by ? { id: row.created_by } : null),
    seen: Array.isArray(row.seen_by) ? row.seen_by.length > 0 : !!row.seen,
    seen_by: Array.isArray(row.seen_by) ? row.seen_by : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    comments,
    comments_count,
    activity,
  };
}

// -------------------------------------------------------------
// Reverse — UI patch → DB writable columns. Strips joins, counts,
// derived state. Use before insert/update.
// -------------------------------------------------------------
const WRITABLE = [
  'title', 'description', 'status', 'priority', 'progress',
  'due_date', 'due_time', 'completed_at',
  'seen_by', 'attachments', 'tags',
  'platform', 'task_type', 'attachments_note', 'completion_note',
];

export function toTaskInsert(input) {
  const row = {};
  for (const k of WRITABLE) if (k in input) row[k] = input[k];
  // Allow caller to pass either a profile object or a raw id.
  if ('assigned_to' in input) {
    row.assigned_to = typeof input.assigned_to === 'object'
      ? input.assigned_to?.id || null
      : input.assigned_to || null;
  }
  if ('created_by' in input) {
    row.created_by = typeof input.created_by === 'object'
      ? input.created_by?.id || null
      : input.created_by || null;
  }
  return row;
}

export function toTaskUpdate(patch) {
  const row = {};
  for (const k of WRITABLE) if (k in patch) row[k] = patch[k];
  if ('assigned_to' in patch) {
    row.assigned_to = typeof patch.assigned_to === 'object'
      ? patch.assigned_to?.id || null
      : patch.assigned_to || null;
  }
  return row;
}
