// =============================================================
// Employees — CRUD + per-team filtering. Maps to `employees` and
// `profiles` tables (see ../../supabase_schema.sql).
// =============================================================
import { supabase } from './supabase';

// Never select pin (revoked from anon role)
const EMP_COLS = 'id, name, team, is_active, created_at';

export async function listEmployees({ activeOnly = true } = {}) {
  let q = supabase.from('employees').select(EMP_COLS).order('team').order('name');
  if (activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function getEmployee(name) {
  const { data, error } = await supabase
    .from('employees')
    .select(EMP_COLS)
    .eq('name', name)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertProfile(profile) {
  const { data, error } = await supabase
    .from('profiles')
    .upsert(profile, { onConflict: 'employee_name' })
    // Explicit columns — never select pin/password (revoked from anon role)
    .select('id, employee_name, avatar_url, team, role_type')
    .single();
  if (error) throw error;
  return data;
}

export async function uploadAvatar(employeeName, file) {
  const ext = (file.name?.split('.').pop() || 'png').toLowerCase();
  const path = `${employeeName.replace(/\s+/g, '_')}_${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (upErr) throw upErr;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  const url = data.publicUrl;
  await upsertProfile({ employee_name: employeeName, avatar_url: url });
  return url;
}
