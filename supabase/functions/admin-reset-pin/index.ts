// =============================================================
// Supabase Edge Function — admin-reset-pin
// Updates profiles.pin using service_role (bypasses RLS).
// Caller must be role_type IN ('admin','manager').
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
    const { employeeName, newPin, callerName } = await req.json();

    if (!employeeName || !newPin || !/^\d{4}$/.test(String(newPin))) {
      return json({ ok: false, error: 'employeeName و newPin (4 أرقام) مطلوبان' }, 400);
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Verify caller is admin or manager (via JWT if present, else via callerName)
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '').trim();
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    if (token && token !== anonKey) {
      // Real Supabase Auth JWT — verify role
      const { data: { user } } = await serviceClient.auth.getUser(token);
      if (user) {
        const { data: caller } = await serviceClient
          .from('profiles')
          .select('role_type')
          .eq('id', user.id)
          .maybeSingle();
        if (!caller || !['admin', 'manager'].includes(caller.role_type)) {
          return json({ ok: false, error: 'Unauthorized' }, 403);
        }
      }
    } else if (callerName) {
      // Manual session — check callerName role
      const { data: caller } = await serviceClient
        .from('profiles')
        .select('role_type')
        .eq('employee_name', callerName)
        .maybeSingle();
      if (!caller || !['admin', 'manager'].includes(caller.role_type)) {
        return json({ ok: false, error: 'Unauthorized' }, 403);
      }
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
