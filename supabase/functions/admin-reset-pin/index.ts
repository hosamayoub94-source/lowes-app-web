// =============================================================
// Supabase Edge Function — admin-reset-pin
// Updates profiles.pin using service_role (bypasses RLS).
// Caller must be role_type IN ('admin','manager').
//
// R-21 fix (14 Sep 2026, owner-directed emergency close of a live P0): the
// previous version had a silent bypass -- when a bearer token was present but
// `auth.getUser()` failed to resolve it to a real user (true for the
// project's own public/publishable key, which is not a secret and is
// embedded in every browser bundle), the role check was skipped entirely and
// execution fell straight through to the PIN update. Live-reproduced 3x with
// a nonexistent employeeName (zero real row ever touched): the public key
// alone reset a PIN with zero proof of identity. The `callerName`-only
// fallback (trusting a client-supplied name with no cryptographic proof) is
// removed too -- same class of problem. Rewritten as a strict, fail-closed
// check: no resolvable real session, no update, full stop. Verified live: no
// caller anywhere in this repo or lowes-classic references this function
// (grepped both), so this rewrite carries zero known compatibility risk.
//
// Deploy: supabase functions deploy admin-reset-pin --no-verify-jwt
// =============================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { employeeName, newPin } = await req.json();

    if (!employeeName || !newPin || !/^\d{4}$/.test(String(newPin))) {
      return json({ ok: false, error: 'employeeName و newPin (4 أرقام) مطلوبان' }, 400);
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Strict, fail-closed: a real, resolvable Supabase Auth session is the
    // only accepted proof of identity. No token, no resolvable user, or a
    // role other than admin/manager -> reject. No silent fallthrough.
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return json({ ok: false, error: 'Unauthorized' }, 401);

    const { data: { user } } = await serviceClient.auth.getUser(token);
    if (!user) return json({ ok: false, error: 'Unauthorized' }, 401);

    const { data: caller } = await serviceClient
      .from('profiles')
      .select('role_type')
      .eq('id', user.id)
      .maybeSingle();
    if (!caller || !['admin', 'manager'].includes(caller.role_type)) {
      return json({ ok: false, error: 'Unauthorized' }, 403);
    }

    // Update profiles.pin with service_role (bypasses column-level REVOKE)
    const { error } = await serviceClient
      .from('profiles')
      .update({ pin: String(newPin).trim() })
      .eq('employee_name', employeeName);

    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true }, 200);

  } catch (err) {
    console.error('[admin-reset-pin]', err);
    return json({ ok: false, error: String(err) }, 500);
  }

  function json(body: unknown, status: number) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
