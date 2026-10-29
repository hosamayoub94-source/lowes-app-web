// =============================================================
// Supabase Edge Function -- sheet-order-statuses (read-only status list for the Apps Script guard). Logic in handler.ts.
// Same sheet-token gate as sheet-to-app (tokens from environment secrets only; verify_jwt off because Apps Script cannot send a JWT).
// Deploy: supabase functions deploy sheet-order-statuses --no-verify-jwt --project-ref fghdumrgimoeqsafdhhh
// =============================================================
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleOrderStatuses } from './handler.ts';

const SERVICE_KEY = Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const VALID_TOKENS: string[] = [
  Deno.env.get('SHEET_SYNC_TOKEN'),
  Deno.env.get('TURKEY_SHEET_SYNC_TOKEN'),
  Deno.env.get('UAE_SHEET_SYNC_TOKEN'),
].filter((t): t is string => !!t && t.length >= 8);

// Constant-time comparison; checks every configured token without early exit (same as sheet-to-app).
function tokenOk(given: unknown): boolean {
  if (typeof given !== 'string' || !given) return false;
  const a = new TextEncoder().encode(given);
  let ok = 0;
  for (const t of VALID_TOKENS) {
    const b = new TextEncoder().encode(t);
    let diff = a.length ^ b.length;
    for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
    if (diff === 0) ok = 1;
  }
  return ok === 1;
}

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (body: unknown, status: number, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra } });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405, { Allow: 'POST, OPTIONS' });

  try {
    // Fail closed: no key or no configured token must never open the door.
    if (!SERVICE_KEY || VALID_TOKENS.length === 0) {
      console.error('[sheet-order-statuses] misconfigured: missing SB_SECRET_KEY or sheet tokens');
      return json({ ok: false, error: 'server_error' }, 500);
    }
    const body = await req.json().catch(() => null);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { status, body: out } = await handleOrderStatuses(
      { admin, tokenOk, log: (m: string) => console.error('[sheet-order-statuses]', m) },
      body,
    );
    return json(out, status);
  } catch (err) {
    console.error('[sheet-order-statuses] request failed', err instanceof Error ? err.name : 'unknown_error');
    return json({ ok: false, error: 'server_error' }, 500);
  }
});
