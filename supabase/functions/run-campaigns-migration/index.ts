// =============================================================
// run-campaigns-migration — TEMPORARY: quiz-cron migration runner.
// يطبّق migrations/20260610_generate_quiz_cron.sql على القاعدة الحيّة
// (pg_cron + pg_net + جدولة generate-quiz يومياً 05:00 UTC).
// بوّابة: x-admin-key ثابت. بعد النجاح يُعاد لستب 410.
// =============================================================
import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';

const ADMIN_KEY = 'LOWES-QUIZ-CRON-2026';

const STATEMENTS = [
  `CREATE EXTENSION IF NOT EXISTS pg_cron`,
  `CREATE EXTENSION IF NOT EXISTS pg_net`,
  `CREATE OR REPLACE FUNCTION public.run_quiz_generation()
   RETURNS void
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public
   AS $fn$
   BEGIN
     PERFORM net.http_post(
       url     := 'https://fghdumrgimoeqsafdhhh.supabase.co/functions/v1/generate-quiz',
       headers := jsonb_build_object(
         'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnaGR1bXJnaW1vZXFzYWZkaGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTE3OTQsImV4cCI6MjA5MTc2Nzc5NH0.e9DiuJySh4WMp7x5ErVV5LqBFawHUESrlGDRb8N5zPM',
         'Content-Type',  'application/json'
       ),
       body    := '{}'::jsonb
     );
   END;
   $fn$`,
  `SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'generate-quiz-daily'`,
  `SELECT cron.schedule('generate-quiz-daily', '0 5 * * *', 'SELECT public.run_quiz_generation()')`,
];

Deno.serve(async (req: Request) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers });

  if (req.headers.get('x-admin-key') !== ADMIN_KEY) {
    return new Response(JSON.stringify({ ok: false, error: 'forbidden' }), { status: 403, headers });
  }

  const dbUrl = Deno.env.get('SUPABASE_DB_URL');
  if (!dbUrl) {
    return new Response(JSON.stringify({ ok: false, error: 'SUPABASE_DB_URL missing' }), { status: 500, headers });
  }

  const sql = postgres(dbUrl, { prepare: false });
  const results: any[] = [];
  try {
    for (const stmt of STATEMENTS) {
      try {
        const r = await sql.unsafe(stmt);
        results.push({ stmt: stmt.slice(0, 60), ok: true, rows: r?.length ?? 0 });
      } catch (e) {
        results.push({ stmt: stmt.slice(0, 60), ok: false, error: String(e) });
      }
    }
    // Verify: read back the scheduled job
    let job: any = null;
    try {
      const rows = await sql.unsafe(`SELECT jobid, jobname, schedule, command FROM cron.job WHERE jobname = 'generate-quiz-daily'`);
      job = rows?.[0] ?? null;
    } catch (e) {
      job = { error: String(e) };
    }
    return new Response(JSON.stringify({ ok: true, results, job }), { headers });
  } finally {
    await sql.end({ timeout: 5 });
  }
});
