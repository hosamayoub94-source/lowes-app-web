// =============================================================
// Supabase Edge Function — pin-change (D-090 · الخطوة 2)
// غلاف HTTP فقط — المنطق كله بـhandler.ts (قابل للاختبار بلا شبكة).
// المفتاح السري يُقرأ من متغيرات بيئة الدالة فقط ولا يغادر السيرفر.
//
// Deploy: verify_jwt = true (الإعداد المقصود — نفس verify-pin وmanage-employee).
// بوابة Supabase تقبل مفتاح التطبيق العام (JWT) وجلسات Auth الحقيقية، فالجلسات
// اليدوية تبقى تعمل؛ والتحقق الفعلي من الهوية/الصلاحية يبقى داخل handler.ts:
//   supabase functions deploy pin-change --project-ref fghdumrgimoeqsafdhhh
// (بلا --no-verify-jwt، ولا حاجة لإدخال بـconfig.toml لأن الافتراضي true)
// (source recovered from the deployed version 6 on 2026-10-25 -- it was missing from the repository)
// =============================================================
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handlePinChange } from './handler.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let body: unknown;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'bad_request' }, 400); }

  try {
    const { status, body: out } = await handlePinChange(admin, body, req.headers.get('Authorization'));
    return json(out, status);
  } catch (err) {
    console.error('[pin-change]', err instanceof Error ? err.message : 'error');
    return json({ ok: false, error: 'server_error' }, 500);
  }

  function json(b: unknown, status: number) {
    return new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
