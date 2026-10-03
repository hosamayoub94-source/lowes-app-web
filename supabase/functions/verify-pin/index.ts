// =============================================================
// Supabase Edge Function — verify-pin
// Server-side PIN verification so the client never receives the
// stored PIN. The `pin` column is REVOKEd from the anon role, so
// only this function (service role) can read it.
//
// Deploy: supabase functions deploy verify-pin --no-verify-jwt
// =============================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { employeeName, pin } = await req.json();

    if (!employeeName || pin == null) {
      return new Response(JSON.stringify({ ok: false, error: 'employeeName and pin required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    );

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, employee_name, role_type, team, manager_scope, avatar_url, is_active, order_role, order_market, extra_permissions, denied_permissions, pin')
      .eq('employee_name', employeeName)
      .limit(1)
      .maybeSingle();

    if (error)    return json({ ok: false, error: 'server_error' }, 500);
    if (!profile) return json({ ok: false, error: 'not_found' }, 200);
    // Block deactivated accounts before checking the PIN — a former employee
    // must not be able to sign in even with a still-valid PIN.
    if (profile.is_active === false) return json({ ok: false, error: 'inactive' }, 200);

    const storedPin  = String(profile.pin ?? '').trim();
    const enteredPin = String(pin ?? '').trim();

    if (!storedPin)                  return json({ ok: false, error: 'no_pin_set' }, 200);
    if (storedPin !== enteredPin)    return json({ ok: false, error: 'wrong_pin' }, 200);

    // ── Real Supabase Auth identity (3 Oct 2026) ───────────────────────────
    // Accounts without an auth.users row fall back to a "manual session" on the
    // client (no JWT). The hardened functions (ai-assistant = R-22,
    // whatsapp-send-proxy / upload / delete = R-13/R-15, manage-employee, pin-change)
    // require a real session, so those accounts got 401 → "Edge Function returned a
    // non-2xx status code" / "Louzy unavailable" (Haya Almarouf, 3 Oct 2026; 6 of 49
    // profiles had no auth user). The PIN has just been verified, so this is the one
    // place that may create the identity — with the exact convention the other 43
    // accounts already use and the client already signs in with
    // (email <profileId>@auth.lowes-pro.local, password "lp:<pin>"). Existing identities
    // are never touched. Best-effort: a failure here must never block the login.
    let authIdentity: 'exists' | 'created' | 'failed' = 'failed';
    try {
      const { data: existing } = await supabase.auth.admin.getUserById(profile.id);
      if (existing?.user) {
        authIdentity = 'exists';
      } else {
        const { error: createErr } = await supabase.auth.admin.createUser({
          id: profile.id,
          email: `${profile.id}@auth.lowes-pro.local`,
          password: `lp:${enteredPin}`,
          email_confirm: true,
          user_metadata: { name: profile.employee_name, team: profile.team ?? null, role_type: profile.role_type ?? null },
        });
        if (createErr) console.error('[verify-pin] auth provision failed', profile.employee_name, createErr.message);
        authIdentity = createErr ? 'failed' : 'created';
      }
    } catch (e) {
      console.error('[verify-pin] auth provision error', profile.employee_name, String(e));
    }

    // Strip pin before returning the profile to the client
    const { pin: _omit, ...safeProfile } = profile;
    return json({ ok: true, profile: safeProfile, authIdentity }, 200);

  } catch (err) {
    console.error('[verify-pin]', err);
    return json({ ok: false, error: String(err) }, 500);
  }

  function json(body: unknown, status: number) {
    return new Response(JSON.stringify(body), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
