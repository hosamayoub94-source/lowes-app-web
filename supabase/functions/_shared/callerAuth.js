// Caller authentication for Edge Functions that run with the service key.
// Why: `verify_jwt=true` is satisfied by the PUBLIC anon key, so a function that does not check
// who is calling is effectively public (audit F-07). Pure + dependency-injected so Node tests can drive it.
//
// A caller is one of:
//   { kind: 'service' }       -- Authorization: Bearer <service/secret key>: our own functions and pg_cron jobs (key read from Vault)
//   { kind: 'user', profile } -- a verified Supabase Auth session whose profile exists and is_active
// anything else (anon key, no header, banned/inactive/unknown user) => null.
import { hasPermission } from './rolePermissions.js';

export function bearerToken(req) {
  return String(req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
}

function claimedRole(jwt) {
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload && payload.role;
  } catch { return null; }
}

/** constant-time string compare (length leak only) */
export function safeEqual(a, b) {
  const x = String(a ?? ''); const y = String(b ?? '');
  if (!x || !y || x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
}

/**
 * @param admin  Supabase client built with the service key
 * @param req    Request
 * @param opts   { serviceKeys: string[], probeServiceKey?: (bearer) => Promise<boolean>, allowedKinds?: ('service'|'user')[] }
 */
export async function resolveCaller(admin, req, opts = {}) {
  const allowed = opts.allowedKinds ?? ['service', 'user'];
  const bearer = bearerToken(req);

  if (allowed.includes('service') && bearer) {
    if ((opts.serviceKeys ?? []).some((k) => safeEqual(bearer, k))) return { kind: 'service' };
    // The Vault copy of the service key may differ from this function's env copy after a key rotation: accept a JWT that
    // CLAIMS role=service_role only if PostgREST itself accepts it for a service-only table (a forged JWT fails the signature check).
    if (opts.probeServiceKey && /^eyJ/.test(bearer) && claimedRole(bearer) === 'service_role' && await opts.probeServiceKey(bearer)) {
      return { kind: 'service' };
    }
  }
  if (allowed.includes('user') && bearer) {
    const { data, error } = await admin.auth.getUser(bearer);
    const user = data?.user;
    if (error || !user) return null;
    const { data: profile } = await admin.from('profiles')
      .select('id, employee_name, role_type, team, is_active, order_role, order_market, extra_permissions, denied_permissions')
      .eq('id', user.id).maybeSingle();
    if (!profile || profile.is_active === false) return null;
    return { kind: 'user', profile };
  }
  return null;
}

/** authorisation on top of authentication */
export function callerCan(caller, { roles, permissions, orderRoles } = {}) {
  if (!caller) return false;
  if (caller.kind === 'service') return true;
  const p = caller.profile;
  if (roles && roles.includes(p.role_type)) return true;
  if (orderRoles && p.order_role && orderRoles.includes(p.order_role)) return true;
  if (permissions && permissions.some((x) => hasPermission(p, x))) return true;
  return !roles && !permissions && !orderRoles; // authenticated-only gate
}

/** roles that run order fulfilment (shipments, carrier imports/tracking): mirrors OrdersScreen canAdvanceOrders */
export const ORDER_OPERATOR = { roles: ['admin', 'manager', 'sales_manager'], orderRoles: ['fulfillment'], permissions: ['manage_orders'] };

export function denied(status, message, headers = {}) {
  return new Response(JSON.stringify({ ok: false, error: status === 401 ? 'unauthorized' : 'forbidden', message }),
    { status, headers: { 'Content-Type': 'application/json', ...headers } });
}
