// Apply SQL files to prod via Supabase Management API.
// Token from env SBP_TOKEN (never written to disk). Usage:
//   SBP_TOKEN=sbp_... node scripts/apply-mgmt.mjs file1.sql file2.sql
import { readFileSync } from 'node:fs';
const TOKEN = process.env.SBP_TOKEN;
const REF = 'fghdumrgimoeqsafdhhh';
if (!TOKEN) { console.error('❌ SBP_TOKEN env required'); process.exit(1); }

async function q(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
}

const SNAP = `select tablename, policyname, cmd from pg_policies where schemaname='public' and tablename in ('orders','crm_clients') order by 1,2;`;

(async () => {
  const ping = await q(`select current_user as u;`);
  console.log('PING', ping.status, JSON.stringify(ping.body));

  const before = await q(SNAP);
  console.log('\n📸 POLICIES BEFORE:', JSON.stringify(before.body));

  for (const f of process.argv.slice(2)) {
    const sql = readFileSync(f, 'utf8');
    process.stdout.write(`\n🚀 applying ${f} … `);
    const res = await q(sql);
    if (res.status >= 200 && res.status < 300) console.log('✅', JSON.stringify(res.body).slice(0, 80));
    else { console.log('❌', JSON.stringify(res.body).slice(0, 400)); process.exit(1); }
  }

  const after = await q(SNAP);
  console.log('\n📸 POLICIES AFTER:', JSON.stringify(after.body));
})();
