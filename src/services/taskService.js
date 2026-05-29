// =============================================================
// Tasks — assigned work, comments, and points. Mirrors the
// `tasks`, `task_comments`, `task_points` tables.
// =============================================================
import { supabase } from './supabase';

export async function listTasks({ assignedTo, status, team } = {}) {
  let q = supabase.from('tasks').select('*').order('due_date', { ascending: true, nullsFirst: false });
  if (assignedTo) q = q.eq('assigned_to', assignedTo);
  if (status) q = q.eq('status', status);
  if (team) q = q.eq('team', team);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function createTask(payload) {
  const { data, error } = await supabase.from('tasks').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateTask(id, patch) {
  const { data, error } = await supabase
    .from('tasks')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function setTaskStatus(id, status) {
  const completed_at = (status === 'done' || status === 'completed') ? new Date().toISOString() : null;
  return updateTask(id, { status, completed_at });
}

export async function addComment(taskId, author, comment) {
  const { data, error } = await supabase
    .from('task_comments')
    .insert({ task_id: taskId, author, comment })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function awardPoints(taskId, employeeName, points, reason) {
  const { error } = await supabase
    .from('task_points')
    .insert({ task_id: taskId, employee_name: employeeName, points, reason });
  if (error) throw error;
}
