// =============================================================
// run-campaigns-migration — DISABLED (inert stub).
// آخر استخدام: إضافة orders.yurtici_cargo_key (نجح، 10 يونيو 2026).
// لإعادة الاستخدام كـ DDL runner راجع تقنية edge-ddl-migration بالذاكرة.
// =============================================================
Deno.serve(() =>
  new Response(JSON.stringify({ ok: false, error: 'gone', message: 'endpoint disabled' }), {
    status: 410,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
);
