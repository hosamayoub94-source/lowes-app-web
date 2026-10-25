// =============================================================
// Supabase Edge Function -- verify-pin (login gateway)
// Server-side PIN verification so the client never receives the stored PIN. The `pin` column is REVOKEd from anon,
// so only this function (service role) can read it. Audit 2026-10 additions (logic in handler.ts, testable without network):
//   * attempt limiter: DB-backed (public.consume_pin_attempt_rate_limit), keys HMAC-hashed with a DB-held pepper.
//     Active as soon as migration 20261027_login_gateway.sql is applied; before that the function behaves as before.
//   * Auth identity self-repair (F-09): a password that drifted from what login expects is re-aligned after the PIN is proven.
//   * optional auth_mode='derived': the Auth password stops being "lp:<pin>" (closes the direct Auth-endpoint brute force).
// Deploy: supabase functions deploy verify-pin --no-verify-jwt --project-ref fghdumrgimoeqsafdhhh
// =============================================================
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleVerifyPin } from './handler.ts';
import { checkPinRateLimit, hmacSha256Hex } from '../_shared/pinRateLimit.js';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (body: unknown, status: number, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extra } });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405, { Allow: 'POST, OPTIONS' });

  try {
    const body = await req.json().catch(() => ({}));
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const limiter = async (employeeName: string) => {
      const { data } = await admin.from('internal_secrets').select('name, secret')
        .in('name', ['pin_rate_pepper', 'pin_rl_window_s', 'pin_rl_account_max', 'pin_rl_source_max']);
      const s: Record<string, string> = {};
      for (const r of data ?? []) s[r.name] = r.secret;
      if (!s.pin_rate_pepper) return { allowed: true, reason: 'disabled' }; // migration not applied yet
      const env = {
        get: (k: string) => ({
          PIN_RATE_LIMIT_ENABLED: 'true',
          PIN_RATE_LIMIT_PEPPER: s.pin_rate_pepper,
          PIN_RATE_LIMIT_WINDOW_SECONDS: s.pin_rl_window_s,
          PIN_RATE_LIMIT_ACCOUNT_MAX: s.pin_rl_account_max,
          PIN_RATE_LIMIT_SOURCE_MAX: s.pin_rl_source_max,
        } as Record<string, string | undefined>)[k],
      };
      // If the gateway ever stops sending cf-connecting-ip, do not lock the company out: limit per ACCOUNT as before and put every
      // address-less request in one shared source bucket (200 / 10 min by default) instead of failing closed on the missing header.
      const request = req.headers.get('cf-connecting-ip')
        ? req
        : new Request(req.url, { method: 'POST', headers: { 'cf-connecting-ip': 'unknown-source' } });
      return await checkPinRateLimit({ request, employeeName, client: admin, env });
    };

    const { status, body: out } = await handleVerifyPin(
      { admin, limiter, hmacHex: hmacSha256Hex, log: (m: string) => console.error('[verify-pin]', m) },
      body,
    );
    return json(out, status);
  } catch (err) {
    // never return raw runtime/database text to an unauthenticated caller; never log bodies, PINs or credentials
    console.error('[verify-pin] request failed', err instanceof Error ? err.name : 'unknown_error');
    return json({ ok: false, error: 'server_error' }, 500);
  }
});
