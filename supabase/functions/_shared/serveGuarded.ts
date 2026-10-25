// serveGuarded(policy, handler) -- drop-in replacement for Deno.serve(handler) that authenticates the caller first.
// `verify_jwt=true` alone is NOT authentication: the public anon key is a valid JWT (audit F-07). This wrapper accepts only
//   * the service/secret key        (server-to-server calls between our own functions AND pg_cron jobs, which read it from Vault)
//   * a verified Auth session of an ACTIVE profile, optionally restricted by role / permission / order_role
// Everything else (anon key, no header, banned or unknown user) gets 401/403 before any business logic or paid API runs.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { resolveCaller, callerCan, denied } from './callerAuth.js';

export interface GuardPolicy {
  kinds?: string[];
  roles?: string[];
  permissions?: string[];
  orderRoles?: string[];
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function serveGuarded(policy: GuardPolicy, handler: (req: Request, caller?: any) => Response | Promise<Response>) {
  const kinds = policy.kinds ?? ['service', 'user'];
  Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return handler(req); // CORS preflight carries no credentials
    try {
      const admin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      const caller = await resolveCaller(admin, req, {
        allowedKinds: kinds,
        serviceKeys: [Deno.env.get('SB_SECRET_KEY') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''].filter(Boolean),
        probeServiceKey: async (bearer: string) => {
          const probe = createClient(Deno.env.get('SUPABASE_URL')!, bearer, { auth: { persistSession: false, autoRefreshToken: false } });
          const { error } = await probe.from('app_role_permissions').select('role').limit(1); // revoked from anon/authenticated
          return !error;
        },
      });
      if (!caller) return denied(401, 'authentication required', cors);
      if (!callerCan(caller, policy)) return denied(403, 'not allowed for this account', cors);
      return await handler(req, caller);
    } catch (err) {
      console.error('[serveGuarded]', err instanceof Error ? err.message : 'error');
      return new Response(JSON.stringify({ ok: false, error: 'server_error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
  });
}
