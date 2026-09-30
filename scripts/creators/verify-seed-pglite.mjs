// Local verification of the creator migrations + seed on an in-memory Postgres (PGlite). Touches NO real database.
// usage (from repo root):  npm i --no-save @electric-sql/pglite  &&  node scripts/creators/verify-seed-pglite.mjs
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const read = f => fs.readFileSync(path.resolve(f), 'utf8');
const db = new PGlite();
await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
const mig1 = read('supabase/migrations/20260930_creator_intelligence.sql');
const mig2 = read('supabase/migrations/20260930120000_creator_intelligence_wave2.sql');
const seed = read('supabase/data/20260930_creator_syria_seed.sql');
let fails = 0;
const ok = (n, c, extra = '') => { console.log(c ? 'ok  ' : 'FAIL', n, extra); if (!c) fails++; };

await db.exec(mig1); await db.exec(mig2); await db.exec(mig1); await db.exec(mig2);
ok('migrations apply twice (idempotent)', true);
await db.exec(seed);
const q1 = async () => (await db.query(`select (select count(*) from creator_profiles)::int p,(select count(*) from creator_sources)::int s,(select count(*) from creator_contacts)::int c,(select count(*) from creator_audience_metrics)::int a,(select count(*) from creator_metrics_snapshots)::int m,(select count(*) from creator_benchmarks)::int b,(select count(*) from creator_source_history)::int h,(select count(*) from creator_platform_profiles)::int pp`)).rows[0];
const a = await q1(); await db.exec(seed); const b = await q1();
ok('seed idempotent (2nd run adds nothing)', JSON.stringify(a) === JSON.stringify(b), JSON.stringify(a));

const evidenceless = (await db.query(`select count(*)::int n from creator_profiles p where not exists (select 1 from creator_sources s where s.creator_id=p.id)`)).rows[0].n;
ok('every creator has >=1 evidence row', evidenceless === 0, `(${evidenceless} without)`);
const noSrcContact = (await db.query(`select count(*)::int n from creator_contacts where source_url is null or verified_at is null`)).rows[0].n;
ok('every contact has source_url + verified_at', noSrcContact === 0);
const badBench = (await db.query(`select count(*)::int n from creator_benchmarks where source_url is null or market_scope is null or confidence is null or benchmark_date is null`)).rows[0].n;
ok('every benchmark has source_url/scope/confidence/date', badBench === 0);

// pool parity: SQL views vs the JS pool exports
for (const [view, file] of [['creator_pool_pr', 'pr_pool'], ['creator_pool_ugc', 'ugc_pool'], ['creator_pool_paid', 'paid_pool'], ['creator_pool_expert', 'expert_pool'], ['creator_pool_media', 'media_pool']]) {
  const sql = new Set((await db.query(`select id from ${view}`)).rows.map(r => r.id));
  const js = new Set(JSON.parse(read(`data/creators/syria/seed/pools/${file}.json`)).creators.map(c => c.id));
  const same = sql.size === js.size && [...sql].every(x => js.has(x));
  ok(`pool parity ${file}`, same, `(sql ${sql.size} / js ${js.size})`);
}
// tier parity
const tiers = (await db.query(`select follower_tier t, count(*)::int n from creator_v group by 1`)).rows;
const seedJ = JSON.parse(read('data/creators/syria/seed/creators_seed.json')).records;
const jsT = {}; seedJ.forEach(r => { jsT[r.tier] = (jsT[r.tier] || 0) + 1; });
ok('tier parity (SQL function vs JS)', tiers.every(r => jsT[r.t] === r.n) && tiers.reduce((x, r) => x + r.n, 0) === seedJ.length);

for (const [n, sqlText] of [
  ['quoted rate without source rejected', "insert into creator_rate_history(creator_id,kind,quoted_rate,quoted_date) select id,'quoted',50,now() from creator_profiles limit 1"],
  ['estimated without benchmark rejected', "insert into creator_rate_history(creator_id,kind,estimated_mid) select id,'estimated',50 from creator_profiles limit 1"],
  ['non-public contact rejected', "insert into creator_contacts(creator_id,type,is_public,source_url,source_type,verified_at) select id,'email',false,'x','y',now() from creator_profiles limit 1"],
  ['contact_rank out of range rejected', "insert into creator_contacts(creator_id,type,source_url,source_type,verified_at,contact_rank) select id,'email','x','y',now(),9 from creator_profiles limit 1"],
  ['invalid paid_status rejected', "update creator_profiles set paid_status='maybe' where id=(select id from creator_profiles limit 1)"],
  ['benchmark scope must be syria|mena|global', "insert into creator_benchmarks(market,platform,content_format,tier_key,low,mid,high,currency,benchmark_source,benchmark_date,benchmark_scope,market_scope) values ('syria','any','post','1k_5k',1,2,3,'USD','x',now(),'x','planet')"],
]) { let rejected = false; try { await db.exec(sqlText); } catch { rejected = true; } ok(n, rejected); }
// ─── review workbench draft migration ───
const mig3 = read('supabase/migrations/20260930130000_creator_review_workbench.sql');
await db.exec(mig3); await db.exec(mig3);
ok('review-workbench migration applies twice', true);
const cid = (await db.query('select id from creator_profiles limit 1')).rows[0].id;
const base = { rev: "'Rana'", common: "active,fit_lowes,skincare_fit,face_on_camera,talks_to_camera,does_review,does_unboxing,ugc_quality,pr_signal,action" };
const ins = (extraCols, extraVals) => db.exec(`insert into creator_reviews(creator_id,reviewer,${base.common}${extraCols}) values ('${cid}','Rana','yes','yes','yes','yes','yes','yes','no','high','none','ugc'${extraVals})`);
await ins(',video_urls,verdict', ",ARRAY['https://x.com/r'],'ugc_ready'");
await db.exec(`insert into creator_reviews(creator_id,reviewer,reviewed_at,${base.common}) values ('${cid}','Dima','2999-01-01','yes','no','yes','unsure','unsure','unsure','unsure','unsure','none','none')`);
ok('append-only history + latest view returns the newest review', (await db.query('select count(*)::int n from creator_reviews')).rows[0].n === 2 && (await db.query('select reviewer from creator_review_latest')).rows[0].reviewer === 'Dima');
let r1 = false; try { await ins(',verdict', ",'ugc_ready'"); } catch { r1 = true; } ok('UGC Ready verdict without video evidence rejected by the database', r1);
let r2 = false; try { await db.exec(`insert into creator_reviews(creator_id,reviewer,${base.common},pr_evidence_url) values ('${cid}','R','yes','yes','yes','unsure','unsure','unsure','unsure','unsure','gifted_seen','gift',NULL)`); } catch { r2 = true; } ok('gifted_seen without evidence url rejected', r2);
await db.exec("insert into creator_waves(id,name,quotas) values ('W1','Wave 01','[]')");
const ids = (await db.query('select id from creator_profiles limit 3')).rows.map(r => r.id);
await db.exec(`insert into creator_wave_members(wave_id,creator_id,status,channel,history) values ('W1','${ids[0]}','accepted','whatsapp','[{"status":"contacted"},{"status":"replied"},{"status":"accepted"}]'),('W1','${ids[1]}','contacted','instagram_dm','[{"status":"contacted"}]'),('W1','${ids[2]}','declined','email','[{"status":"contacted"},{"status":"declined"}]')`);
const fn = (await db.query("select * from creator_wave_funnel where wave_id='W1'")).rows[0];
ok('funnel view matches the app rule (reached = history or status)', fn.total === 3 && fn.contacted === 3 && fn.replied === 1 && fn.interested === 1 && fn.accepted === 1 && fn.declined === 1);
let r4 = false; try { await db.exec(`insert into creator_wave_members(wave_id,creator_id,status) values ('W1','${cid}','contacted')`); } catch { r4 = true; } ok('contacted without a contact method (channel) rejected', r4);
let r3 = false; try { await db.exec(`update creator_wave_members set status='posted' where wave_id='W1' and creator_id='${ids[1]}'`); } catch { r3 = true; } ok('posted without content_url rejected', r3);
console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
process.exit(fails ? 1 : 0);
