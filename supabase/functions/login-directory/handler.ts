// =============================================================
// login-directory -- name list for the login screen (29 Oct 2026). No imports: the service-role client is injected so
// test-login-directory.mjs runs every branch in Node with a fake.
//
// Why it exists: the login screen (group -> name -> PIN) shows the active staff names BEFORE any session exists. It used to
// read public.profiles with the anon key; since 20261028212705 contain_anon_profile... anon has no access to profiles (and no
// usage on the public schema), so the name list came back empty and nobody whose session had ended could sign in again.
// Re-opening profiles to anon would expose the whole row again; this function returns ONLY what the picker shows.
//
// Contract: POST { roleTypes?: string[] }  ->  200 { ok:true, profiles:[{ employee_name, role_type }] }
//   * id is deliberately NOT returned: the Auth e-mail is `<profile id>@auth.lowes-pro.local` and in auth_mode='compat' the
//     password is derived from the 4-digit PIN, so a public id list would allow guessing PINs against the Auth endpoint
//     directly, around verify-pin's rate limit.
//   * avatar_url is NOT returned either: most avatar files are stored as `avatars/<profile id>`, so the URL carries the id
//     (found on the live login screen 29 Oct). The picker shows initials instead.
//   * only is_active = true rows; unknown role types are ignored (never echoed into the query).
// =============================================================

export const LOGIN_ROLE_TYPES = [
  'employee', 'admin', 'manager', 'sales_manager', 'media_buyer', 'social_manager',
  'accountant', 'hr_manager', 'warehouse_manager', 'marketing_manager',
];

export interface Deps {
  // deno-lint-ignore no-explicit-any
  admin: any;                                                         // service-role client
  log?: (msg: string) => void;
}

const res = (status: number, body: Record<string, unknown>) => ({ status, body });

export function pickRoleTypes(input: unknown): string[] {
  if (!Array.isArray(input) || input.length === 0) return LOGIN_ROLE_TYPES;
  const wanted = input.filter((r): r is string => typeof r === 'string' && LOGIN_ROLE_TYPES.includes(r));
  return [...new Set(wanted)];
}

export async function handleLoginDirectory(deps: Deps, body: Record<string, unknown> | null) {
  const roles = pickRoleTypes(body?.roleTypes);
  if (roles.length === 0) return res(200, { ok: true, profiles: [] });

  const { data, error } = await deps.admin
    .from('profiles')
    .select('employee_name, role_type')
    .eq('is_active', true)
    .in('role_type', roles)
    .order('employee_name');
  if (error) {
    deps.log?.(`profiles query failed: ${error.code ?? 'unknown'}`);
    return res(500, { ok: false, error: 'server_error' });
  }

  const profiles = (data ?? [])
    .filter((p: { employee_name?: string }) => typeof p.employee_name === 'string' && p.employee_name.trim() !== '')
    .map((p: { employee_name: string; role_type: string }) => ({
      employee_name: p.employee_name,
      role_type:     p.role_type,
    }));
  return res(200, { ok: true, profiles });
}
