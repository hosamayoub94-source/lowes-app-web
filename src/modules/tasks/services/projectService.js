// =============================================================
// Projects service — registry of projects + membership.
// Drives the per-project tabs on the Tasks page and the admin
// membership panel. Visibility itself is enforced in taskService;
// this only answers "what projects exist" and "who is in them".
//
// Mirrors the tasks module mode flag so dev/mock builds don't break.
// =============================================================
import { supabase } from '@services/supabase';
import { USE_MOCK_DATA } from './taskService';

// A single in-memory project so mock/dev mode still renders a tab.
const MOCK_PROJECTS = [
  { id: 'mock_damascus_expo', key: 'damascus_expo', name: 'معرض دمشق', icon: '🎪', is_active: true },
];
let _mockMembers = []; // [{ project_id, profile_id }]

const PROJECT_SELECT = 'id, key, name, icon, is_active, created_at';

/** All active projects (for admin panel + lookups). */
export async function listProjects() {
  if (USE_MOCK_DATA) return MOCK_PROJECTS.slice();
  const { data, error } = await supabase
    .from('projects')
    .select(PROJECT_SELECT)
    .eq('is_active', true)
    .order('created_at');
  if (error) throw error;
  return data || [];
}

/** Projects the given profile is a member of (for their tabs). */
export async function listMyProjects(profileId) {
  if (!profileId) return [];
  if (USE_MOCK_DATA) return MOCK_PROJECTS.slice();
  const { data, error } = await supabase
    .from('project_members')
    .select('project:projects ( id, key, name, icon, is_active )')
    .eq('profile_id', profileId);
  if (error) throw error;
  return (data || [])
    .map((r) => r.project)
    .filter((p) => p && p.is_active);
}

/** Member profile IDs for one project. */
export async function listProjectMemberIds(projectId) {
  if (!projectId) return [];
  if (USE_MOCK_DATA) return _mockMembers.filter((m) => m.project_id === projectId).map((m) => m.profile_id);
  const { data, error } = await supabase
    .from('project_members')
    .select('profile_id')
    .eq('project_id', projectId);
  if (error) throw error;
  return (data || []).map((r) => r.profile_id);
}

export async function addProjectMember(projectId, profileId) {
  if (USE_MOCK_DATA) { _mockMembers.push({ project_id: projectId, profile_id: profileId }); return true; }
  const { error } = await supabase
    .from('project_members')
    .upsert({ project_id: projectId, profile_id: profileId }, { onConflict: 'project_id,profile_id' });
  if (error) throw error;
  return true;
}

export async function removeProjectMember(projectId, profileId) {
  if (USE_MOCK_DATA) {
    _mockMembers = _mockMembers.filter((m) => !(m.project_id === projectId && m.profile_id === profileId));
    return true;
  }
  const { error } = await supabase
    .from('project_members')
    .delete()
    .eq('project_id', projectId)
    .eq('profile_id', profileId);
  if (error) throw error;
  return true;
}

export async function createProject({ key, name, icon = '📁' }) {
  if (USE_MOCK_DATA) {
    const p = { id: `mock_${key}`, key, name, icon, is_active: true };
    MOCK_PROJECTS.push(p);
    return p;
  }
  const { data, error } = await supabase
    .from('projects')
    .insert({ key, name, icon })
    .select(PROJECT_SELECT)
    .single();
  if (error) throw error;
  return data;
}
