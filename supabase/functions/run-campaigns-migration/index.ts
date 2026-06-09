// =============================================================
// run-campaigns-migration — DISABLED (inert stub).
// آخر استخدام: تطبيق 20260610_generate_quiz_cron.sql (نجح، jobid=2).
// لإعادة الاستخدام كـ DDL runner راجع تقنية edge-ddl-migration بالذاكرة.
// =============================================================
Deno.serve(() =>
  new Response(JSON.stringify({ ok: false, error: 'gone', message: 'endpoint disabled' }), {
    status: 410,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
);
