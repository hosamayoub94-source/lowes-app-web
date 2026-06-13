// =============================================================
// Tasks Module — Service Layer (production-grade)
// One API surface for the whole module. UI / store / hooks
// NEVER touch `supabase` directly — that contract is enforced
// here.
//
// Mode is driven by env:
//   - VITE_USE_MOCK_TASKS = 'true'  → in-memory mock
//   - VITE_USE_MOCK_TASKS = 'false' → real Supabase
//   - missing/empty                 → mock if VITE_SUPABASE_URL also missing
// =============================================================
import { supabase } from '@services/supabase';
import { MOCK_TASKS, MOCK_EMPLOYEES } from '../data/mockTasks';
import { effectiveStatus } from '../utils/taskUtils';
import { ACTIVITY_TYPE } from '../types/task.types';
import { mapTask, mapComment, mapActivity, toTaskInsert, toTaskUpdate } from './taskMappers';

// -------------------------------------------------------------
// Mode flag
// Default: MOCK is on. The user must explicitly opt into Supabase
// by setting VITE_USE_MOCK_TASKS=false in .env.local — this
// prevents broken queries before the schema migration is applied.
// -------------------------------------------------------------
const explicit = String(import.meta.env.VITE_USE_MOCK_TASKS || '').toLowerCase();
export const USE_MOCK_DATA = explicit !== 'false';

// -------------------------------------------------------------
// Supabase select strings — kept here so the wire payload is
// controllable in one place.
// -------------------------------------------------------------
const TASK_SELECT = `
  id, title, description, status, priority, progress,
  due_date, due_time, completed_at, created_at, updated_at,
  seen_by, attachments, tags, assigned_to, assignee_id, created_by,
  platform, task_type, attachments_note, completion_note, link, team,
  project_id, is_sensitive,
  assignee:profiles!tasks_assignee_id_fkey ( id, employee_name, avatar_url, role_type, team ),
  creator:profiles!tasks_created_by_fkey   ( id, employee_name, avatar_url, role_type, team ),
  comments_count:task_comments(count)
`;

const COMMENT_SELECT = `
  id, task_id, comment, created_at,
  author:profiles!task_comments_user_id_fkey ( id, employee_name, avatar_url, role_type )
`;

const ACTIVITY_SELECT = `
  id, task_id, action_type, action_label, metadata, created_at,
  actor:profiles!task_activity_user_id_fkey ( id, employee_name, avatar_url )
`;

// -------------------------------------------------------------
// Mock helpers (in-memory store)
// -------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let _mockStore = MOCK_TASKS.map((t) => ({ ...t }));
const refreshMock = () => {
  _mockStore = _mockStore.map((t) => ({ ...t, status: effectiveStatus(t) }));
};
const newId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
const findEmp = (id) => MOCK_EMPLOYEES.find((e) => e.id === id) || null;

// -------------------------------------------------------------
// Public API — Tasks
// -------------------------------------------------------------

/**
 * Load tasks with the owner's visibility model:
 *   • A task is visible to its ASSIGNEE/CREATOR, to members of its
 *     PROJECT, to members of its TEAM, and to MANAGEMENT (viewAll).
 *   • SENSITIVE tasks are visible to ADMINS ONLY (Hosam/Amany/Reem) —
 *     even managers and project/team members don't see them.
 *
 * Enforced at the app layer because the app uses mixed auth (real JWT
 * for some users, anon manual-session for others) so per-row RLS via
 * auth.uid() is unreliable here.
 *
 * params: { viewAll, viewerId, isAdmin, team, projectIds[] }
 */
export async function fetchTasks(params = {}) {
  const {
    viewAll = true, viewerId = null, isAdmin = false,
    team = null, projectIds = [],
  } = params;
  const restrict = !viewAll && !!viewerId;

  if (USE_MOCK_DATA) {
    await sleep(280);
    refreshMock();
    let tasks = [..._mockStore];
    if (restrict) {
      const projSet = new Set(projectIds);
      tasks = tasks.filter((t) =>
        t.assigned_to?.id === viewerId ||
        t.created_by?.id === viewerId ||
        (t.project_id && projSet.has(t.project_id)) ||
        (team && t.team === team),
      );
    }
    if (!isAdmin) tasks = tasks.filter((t) => !t.is_sensitive);
    if (params.assignedTo) tasks = tasks.filter((t) => t.assigned_to?.id === params.assignedTo);
    if (params.status)     tasks = tasks.filter((t) => t.status === params.status);
    if (params.priority)   tasks = tasks.filter((t) => t.priority === params.priority);
    return tasks;
  }

  let q = supabase
    .from('tasks')
    .select(TASK_SELECT)
    .order('created_at', { ascending: false });

  if (restrict) {
    // Any match → visible. assigned_to/assignee_id both hold the profile UUID.
    const clauses = [
      `assignee_id.eq.${viewerId}`,
      `assigned_to.eq.${viewerId}`,
      `created_by.eq.${viewerId}`,
    ];
    if (Array.isArray(projectIds) && projectIds.length) {
      clauses.push(`project_id.in.(${projectIds.join(',')})`);
    }
    if (team) clauses.push(`team.eq.${team}`);
    q = q.or(clauses.join(','));
  }
  // Sensitive tasks are admin-only — hide from everyone else.
  if (!isAdmin) q = q.eq('is_sensitive', false);

  if (params.assignedTo) q = q.eq('assigned_to', params.assignedTo);
  if (params.status)     q = q.eq('status', params.status);
  if (params.priority)   q = q.eq('priority', params.priority);

  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapTask).map((t) => ({ ...t, status: effectiveStatus(t) }));
}

/** Get a single task with its comments and activity loaded. */
export async function fetchTask(id) {
  if (USE_MOCK_DATA) {
    await sleep(120);
    const task = _mockStore.find((t) => t.id === id);
    if (!task) throw new Error('Task not found');
    return { ...task, status: effectiveStatus(task) };
  }

  const [{ data: taskRow, error: tErr }, { data: comments }, { data: activity }] = await Promise.all([
    supabase.from('tasks').select(TASK_SELECT).eq('id', id).single(),
    supabase.from('task_comments').select(COMMENT_SELECT).eq('task_id', id).order('created_at'),
    supabase.from('task_activity').select(ACTIVITY_SELECT).eq('task_id', id).order('created_at', { ascending: false }),
  ]);
  if (tErr) throw tErr;
  const task = mapTask(taskRow);
  task.comments = (comments || []).map(mapComment);
  task.comments_count = task.comments.length;
  task.activity = (activity || []).map(mapActivity);
  task.status = effectiveStatus(task);
  return task;
}

/** Create a new task. Logs `created` activity automatically. */
export async function createTask(payload, { actorId } = {}) {
  if (USE_MOCK_DATA) {
    await sleep(180);
    const created = {
      id: newId('task'),
      progress: 0,
      comments: [],
      activity: [],
      attachments: [],
      comments_count: 0,
      seen: true,
      tags: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...payload,
    };
    _mockStore = [created, ..._mockStore];
    created.activity = [{
      id: newId('a'),
      type: ACTIVITY_TYPE.CREATED,
      actor: created.created_by || findEmp(actorId),
      note: 'تم إنشاء المهمة',
      created_at: new Date().toISOString(),
    }];
    return created;
  }

  const insertRow = toTaskInsert({ ...payload, created_by: actorId || payload.created_by });
  const { data, error } = await supabase.from('tasks').insert(insertRow).select(TASK_SELECT).single();
  if (error) throw error;
  const task = mapTask(data);

  // Best-effort activity log — never blocks UI
  logActivity({
    task_id: task.id,
    user_id: actorId || null,
    action_type: ACTIVITY_TYPE.CREATED,
    action_label: 'تم إنشاء المهمة',
  }).catch(() => {});

  return task;
}

/** Generic patch — used by the convenience setters below. */
export async function updateTask(id, patch, { actorId } = {}) {
  if (USE_MOCK_DATA) {
    await sleep(140);
    const before = _mockStore.find((t) => t.id === id);
    _mockStore = _mockStore.map((t) =>
      t.id === id ? { ...t, ...patch, updated_at: new Date().toISOString() } : t,
    );
    const after = _mockStore.find((t) => t.id === id);
    appendMockActivity(before, after, actorId);
    return after;
  }

  const before = await fetchTask(id).catch(() => null);
  const { data, error } = await supabase
    .from('tasks')
    .update(toTaskUpdate(patch))
    .eq('id', id)
    .select(TASK_SELECT)
    .single();
  if (error) throw error;
  const after = mapTask(data);
  emitActivityForUpdate({ before, patch, taskId: id, actorId }).catch(() => {});
  return after;
}

export async function updateTaskStatus(id, status, opts) {
  const isDone = status === 'completed' || status === 'done';
  if (isDone) {
    const completedAt = new Date().toISOString();
    const task = await fetchTask(id).catch(() => null);
    const points = calcTaskPoints(task, completedAt);
    const patch = { status, completed_at: completedAt };
    const result = await updateTask(id, patch, opts);
    // Award points — best-effort, never blocks UI
    if (!USE_MOCK_DATA && task?.assigned_to?.name) {
      awardPoints(task.assigned_to.name, id, points).catch(() => {});
    }
    return result;
  }
  return updateTask(id, { status }, opts);
}
export const updateTaskProgress = (id, progress, opts) => updateTask(id, { progress }, opts);
export const updateTaskPriority = (id, priority, opts) => updateTask(id, { priority }, opts);
export const reassignTask       = (id, userId,   opts) => updateTask(id, { assigned_to: userId }, opts);
export const updateTaskDueDate  = (id, due_date, opts) => updateTask(id, { due_date }, opts);

// ── Points helpers ────────────────────────────────────────────
function calcTaskPoints(task, completedAt) {
  const base = (() => {
    if (!task?.due_date) return 15;
    const due = new Date(task.due_date + 'T23:59:59');
    const hoursLeft = (due - new Date(completedAt)) / 3_600_000;
    if (hoursLeft >= 24) return 20; // early
    if (hoursLeft >= 0)  return 15; // on time
    return 5;                        // late
  })();
  const bonus = { urgent: 5, high: 3, medium: 1, low: 0 };
  return base + (bonus[task?.priority] || 0);
}

async function awardPoints(employeeName, taskId, points) {
  if (!employeeName || points <= 0) return;
  const [{ error: insertErr }] = await Promise.all([
    supabase.from('task_points').insert({
      employee_name: employeeName,
      task_id: taskId,
      points,
      reason: 'إتمام المهمة',
    }),
  ]);
  if (insertErr) return; // task_points insert failed — still try profile update
  const { data } = await supabase
    .from('profiles')
    .select('total_points')
    .eq('employee_name', employeeName)
    .single();
  const current = typeof data?.total_points === 'number' ? data.total_points : 0;
  await supabase
    .from('profiles')
    .update({ total_points: current + points })
    .eq('employee_name', employeeName);
}

/** Delete a task — admin-only at the RLS level. */
export async function deleteTask(id) {
  if (USE_MOCK_DATA) {
    await sleep(120);
    _mockStore = _mockStore.filter((t) => t.id !== id);
    return true;
  }
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw error;
  return true;
}

/** Mark a task as seen by `userId` (idempotent). */
export async function markTaskSeen(id, userId) {
  if (USE_MOCK_DATA) {
    _mockStore = _mockStore.map((t) => (t.id === id ? { ...t, seen: true } : t));
    return true;
  }
  if (!userId) return false;

  const { data, error: readErr } = await supabase
    .from('tasks').select('seen_by').eq('id', id).single();
  if (readErr) throw readErr;
  const seen = Array.isArray(data?.seen_by) ? data.seen_by : [];
  if (seen.includes(userId)) return true;

  const { error } = await supabase
    .from('tasks')
    .update({ seen_by: [...seen, userId] })
    .eq('id', id);
  if (error) throw error;
  return true;
}

// -------------------------------------------------------------
// Comments
// -------------------------------------------------------------

export async function listComments(taskId) {
  if (USE_MOCK_DATA) {
    await sleep(80);
    return (_mockStore.find((t) => t.id === taskId)?.comments) || [];
  }
  const { data, error } = await supabase
    .from('task_comments')
    .select(COMMENT_SELECT)
    .eq('task_id', taskId)
    .order('created_at');
  if (error) throw error;
  return (data || []).map(mapComment);
}

export async function addTaskComment(taskId, { author, text, userId }) {
  const created_at = new Date().toISOString();

  if (USE_MOCK_DATA) {
    await sleep(160);
    const newComment = { id: newId('c'), author, text, created_at };
    _mockStore = _mockStore.map((t) =>
      t.id === taskId
        ? {
            ...t,
            comments: [...(t.comments || []), newComment],
            comments_count: (t.comments_count || 0) + 1,
            activity: [
              ...(t.activity || []),
              { id: newId('a'), type: ACTIVITY_TYPE.COMMENT, actor: author, note: 'أضاف تعليقًا', created_at },
            ],
            updated_at: created_at,
          }
        : t,
    );
    return newComment;
  }

  const uid = userId || author?.id || null;
  const { data, error } = await supabase
    .from('task_comments')
    .insert({ task_id: taskId, user_id: uid, comment: text })
    .select(COMMENT_SELECT)
    .single();
  if (error) throw error;

  logActivity({
    task_id: taskId,
    user_id: uid,
    action_type: ACTIVITY_TYPE.COMMENT,
    action_label: 'أضاف تعليقًا',
  }).catch(() => {});

  return mapComment(data);
}

// -------------------------------------------------------------
// Activity
// -------------------------------------------------------------

export async function listActivity(taskId) {
  if (USE_MOCK_DATA) {
    await sleep(60);
    return (_mockStore.find((t) => t.id === taskId)?.activity) || [];
  }
  const { data, error } = await supabase
    .from('task_activity')
    .select(ACTIVITY_SELECT)
    .eq('task_id', taskId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapActivity);
}

export async function logActivity({ task_id, user_id, action_type, action_label, metadata }) {
  if (USE_MOCK_DATA) return null;
  const { data, error } = await supabase
    .from('task_activity')
    .insert({
      task_id,
      user_id: user_id || null,
      action_type,
      action_label: action_label || null,
      metadata: metadata || {},
    })
    .select(ACTIVITY_SELECT)
    .single();
  if (error) throw error;
  return mapActivity(data);
}

// -------------------------------------------------------------
// Profiles (assignee picker)
// -------------------------------------------------------------

export async function listAssignableProfiles() {
  if (USE_MOCK_DATA) {
    await sleep(60);
    return MOCK_EMPLOYEES.slice();
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('id, employee_name, avatar_url, role_type, team')
    .eq('is_active', true)
    .order('employee_name');
  if (error) throw error;
  return (data || []).map((p) => ({
    id: p.id,
    name: p.employee_name,
    avatar: p.avatar_url || null,
    role: p.role_type || null,
    team: p.team || null,
  }));
}

// -------------------------------------------------------------
// Realtime subscriptions
// Returns an unsubscribe fn. NO-OP under mock mode. Consumers
// (typically useTaskRealtime) call this from a useEffect cleanup.
// -------------------------------------------------------------
export function subscribeToTasks(handlers = {}) {
  if (USE_MOCK_DATA) return () => {};

  const channel = supabase
    .channel('tasks-stream')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
      handlers.onTaskChange?.(payload);
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'task_comments' }, (payload) => {
      handlers.onCommentInsert?.(payload);
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'task_activity' }, (payload) => {
      handlers.onActivityInsert?.(payload);
    })
    .subscribe((status) => {
      handlers.onStatus?.(status);
    });

  return () => {
    try { supabase.removeChannel(channel); } catch { /* swallow */ }
  };
}

// -------------------------------------------------------------
// Internal — diff a patch against the prior task state and emit
// granular activity rows (one per meaningful change).
// -------------------------------------------------------------
async function emitActivityForUpdate({ before, patch, taskId, actorId }) {
  if (!before) return;
  const events = [];

  if ('status' in patch && patch.status !== before.status) {
    events.push({
      action_type: ACTIVITY_TYPE.STATUS_CHANGED,
      action_label: `الحالة: ${before.status} → ${patch.status}`,
      metadata: { from: before.status, to: patch.status },
    });
  }
  if ('progress' in patch && patch.progress !== before.progress) {
    events.push({
      action_type: ACTIVITY_TYPE.PROGRESS_UPDATED,
      action_label: `تحديث التقدم إلى ${patch.progress}٪`,
      metadata: { from: before.progress, to: patch.progress },
    });
  }
  if ('priority' in patch && patch.priority !== before.priority) {
    events.push({
      action_type: 'priority_changed',
      action_label: `الأولوية: ${before.priority} → ${patch.priority}`,
      metadata: { from: before.priority, to: patch.priority },
    });
  }
  if ('assigned_to' in patch && patch.assigned_to !== before.assigned_to?.id) {
    events.push({
      action_type: ACTIVITY_TYPE.ASSIGNED,
      action_label: 'تم الإسناد',
      metadata: { from: before.assigned_to?.id || null, to: patch.assigned_to || null },
    });
  }
  if ('due_date' in patch && patch.due_date !== before.due_date) {
    events.push({
      action_type: 'due_date_changed',
      action_label: 'تعديل تاريخ التسليم',
      metadata: { from: before.due_date, to: patch.due_date },
    });
  }

  await Promise.allSettled(
    events.map((e) => logActivity({ task_id: taskId, user_id: actorId || null, ...e })),
  );
}

function appendMockActivity(before, after, actorId) {
  if (!before || !after) return;
  const created_at = new Date().toISOString();
  const actor = findEmp(actorId) || after.assigned_to;
  if (before.status !== after.status) {
    after.activity = [...(after.activity || []), {
      id: newId('a'), type: ACTIVITY_TYPE.STATUS_CHANGED, actor,
      note: `الحالة: ${before.status} → ${after.status}`, created_at,
    }];
  }
  if (before.progress !== after.progress) {
    after.activity = [...(after.activity || []), {
      id: newId('a'), type: ACTIVITY_TYPE.PROGRESS_UPDATED, actor,
      note: `تحديث التقدم إلى ${after.progress}٪`, created_at,
    }];
  }
}

// -------------------------------------------------------------
// Attachment helpers
// -------------------------------------------------------------
function _formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function _fileType(filename) {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (['jpg','jpeg','png','gif','webp','svg','avif'].includes(ext)) return 'image';
  if (['mp4','mov','avi','mkv','webm'].includes(ext)) return 'video';
  if (['pdf'].includes(ext)) return 'pdf';
  if (['zip','rar','7z','tar','gz'].includes(ext)) return 'archive';
  if (['doc','docx'].includes(ext)) return 'doc';
  if (['xls','xlsx','csv'].includes(ext)) return 'excel';
  if (['ppt','pptx'].includes(ext)) return 'ppt';
  return 'file';
}

/**
 * Upload a file attachment to Supabase Storage and append metadata to
 * the task's `attachments` JSONB column.
 */
export async function uploadTaskAttachment(taskId, file) {
  if (USE_MOCK_DATA) {
    await sleep(600);
    const blobUrl = URL.createObjectURL(file);
    const att = {
      id:         newId('att'),
      name:       file.name,
      size:       file.size,
      mime:       file.type,
      type:       _fileType(file.name),
      url:        blobUrl,
      created_at: new Date().toISOString(),
    };
    _mockStore = _mockStore.map((t) =>
      t.id === taskId
        ? { ...t, attachments: [...(t.attachments || []), att] }
        : t,
    );
    return att;
  }

  // Build a unique storage path
  const ext  = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
  const path = `tasks/${taskId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  // Upload to Supabase Storage (bucket: task-attachments, must be pre-created)
  const { data: uploadData, error: uploadErr } = await supabase.storage
    .from('task-attachments')
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (uploadErr) throw uploadErr;

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from('task-attachments')
    .getPublicUrl(path);

  const att = {
    id:         path, // use storage path as stable id
    name:       file.name,
    size:       file.size,
    mime:       file.type,
    type:       _fileType(file.name),
    url:        publicUrl,
    path:       uploadData.path,
    created_at: new Date().toISOString(),
  };

  // Append to task's attachments array
  const { data: taskRow, error: readErr } = await supabase
    .from('tasks').select('attachments').eq('id', taskId).single();
  if (readErr) throw readErr;

  const current = Array.isArray(taskRow?.attachments) ? taskRow.attachments : [];
  const { error: updateErr } = await supabase
    .from('tasks')
    .update({ attachments: [...current, att] })
    .eq('id', taskId);
  if (updateErr) throw updateErr;

  logActivity({
    task_id: taskId,
    user_id: null,
    action_type: 'attachment_added',
    action_label: `أُرفق ملف: ${file.name}`,
    metadata: { name: file.name, size: file.size },
  }).catch(() => {});

  return att;
}

/**
 * Remove an attachment from Supabase Storage and from the task's
 * `attachments` JSONB column.
 */
export async function removeTaskAttachment(taskId, attachmentId) {
  if (USE_MOCK_DATA) {
    await sleep(250);
    _mockStore = _mockStore.map((t) =>
      t.id === taskId
        ? { ...t, attachments: (t.attachments || []).filter((a) => a.id !== attachmentId) }
        : t,
    );
    return true;
  }

  // Fetch current attachments
  const { data: taskRow, error: readErr } = await supabase
    .from('tasks').select('attachments').eq('id', taskId).single();
  if (readErr) throw readErr;

  const current = Array.isArray(taskRow?.attachments) ? taskRow.attachments : [];
  const att = current.find((a) => a.id === attachmentId);

  // Remove from storage
  const storagePath = att?.path || (typeof attachmentId === 'string' && attachmentId.includes('/') ? attachmentId : null);
  if (storagePath) {
    await supabase.storage.from('task-attachments').remove([storagePath]).catch(() => {});
  }

  // Update DB
  const { error: updateErr } = await supabase
    .from('tasks')
    .update({ attachments: current.filter((a) => a.id !== attachmentId) })
    .eq('id', taskId);
  if (updateErr) throw updateErr;
  return true;
}
