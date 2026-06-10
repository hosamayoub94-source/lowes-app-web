// =============================================================
// run-campaigns-migration — TEMPORARY: yurtici cargoKey column.
// يضيف orders.yurtici_cargo_key (مفتاح الشحنة = order_id عند الإنشاء عبر API،
// وهو مفتاح الاستعلام keyType=0). بوّابة x-admin-key. يُعاد لستب 410 بعد النجاح.
// =============================================================
import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';

const ADMIN_KEY = 'LOWES-YURTICI-COL-2026';

const STATEMENTS = [
  `ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS yurtici_cargo_key text`,
  // أعمدة مقروءة بالـ anon/authenticated (column-level grants على بعض الجداول)
  `GRANT SELECT (yurtici_cargo_key) ON public.orders TO anon, authenticated`,
];

Deno.serve(async (req: Request) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.headers.get('x-admin-key') !== ADMIN_KEY) {
    return new Response(JSON.stringify({ ok: false, error: 'forbidden' }), { status: 403, headers });
  }
  const dbUrl = Deno.env.get('SUPABASE_DB_URL');
  if (!dbUrl) return new Response(JSON.stringify({ ok: false, error: 'SUPABASE_DB_URL missing' }), { status: 500, headers });

  const sql = postgres(dbUrl, { prepare: false });
  const results: any[] = [];
  try {
    for (const stmt of STATEMENTS) {
      try { await sql.unsafe(stmt); results.push({ stmt: stmt.slice(0, 60), ok: true }); }
      catch (e) { results.push({ stmt: stmt.slice(0, 60), ok: false, error: String(e) }); }
    }
    let col: any = null;
    try {
      const rows = await sql.unsafe(`SELECT column_name FROM information_schema.columns WHERE table_name='orders' AND column_name='yurtici_cargo_key'`);
      col = rows?.[0] ?? null;
    } catch (e) { col = { error: String(e) }; }
    return new Response(JSON.stringify({ ok: true, results, col }), { headers });
  } finally { await sql.end({ timeout: 5 }); }
});
