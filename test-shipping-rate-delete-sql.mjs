/* global process */
// يشغّل Migration تعرفة الشحن ثم Migration «إلغاء التعرفة» وملف تراجعها على PostgreSQL داخل الذاكرة (PGlite) بلا اتصال بأي قاعدة.
// node test-shipping-rate-delete-sql.mjs   (يتطلب: npm install --no-save @electric-sql/pglite)
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.error('FAIL', m); } };
const base = readFileSync('supabase/migrations/20261028100000_shipping_carrier_rates.sql', 'utf8');
const mig = readFileSync('supabase/migrations/20261029400000_shipping_rate_delete.sql', 'utf8');
const rollback = readFileSync('docs/shipping/20261029400000_shipping_rate_delete_rollback.sql', 'utf8');

const db = new PGlite();
await db.exec(`
  create role authenticated; create role anon;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create function public.current_role_type() returns text language sql stable security definer as $$ select nullif(current_setting('test.role', true), '') $$;
  grant usage on schema public to authenticated, anon; grant usage on schema auth to authenticated, anon;
  grant execute on function public.current_role_type() to authenticated, anon;
  create table orders (id int primary key, delivery_cost numeric); insert into orders values (1, 450);
`);
await db.exec(base);
await db.exec(mig);
await db.exec(mig);
ok(true, 'تُطبَّق مرتين بلا خطأ');

const UID = '11111111-1111-1111-1111-111111111111';
const as = async (role, uid = UID) => { await db.exec(`set test.role = '${role}'; set test.uid = '${uid}'; set role authenticated;`); };
const reset = async () => { await db.exec('reset role;'); };
const run = async (sql, params) => { try { return { r: await db.query(sql, params) }; } catch (e) { return { e: String(e.message || e) }; } };
const del = (role, id, uid = UID) => async () => { await as(role, uid); const out = await run('select public.shipping_rate_delete($1, $2)', [id, 'tester']); await reset(); return out; };
const today = (await db.query("select (now() at time zone 'Europe/Istanbul')::date::text d")).rows[0].d;
const futureDate = (await db.query("select ((now() at time zone 'Europe/Istanbul')::date + interval '20 days')::date::text d")).rows[0].d;
const id = async (c, d) => (await db.query('select id from shipping_carrier_rates where carrier=$1 and effective_from=$2', [c, d])).rows[0]?.id;
const n = async (sql) => (await db.query(sql)).rows[0].n;

// بيانات: صف قديم (مقفل) + صف اليوم + صف مستقبلي
await db.exec(`insert into shipping_carrier_rates (carrier, market, currency, outbound_fee, return_policy, effective_from) values
  ('قدموس','syria','SYP',150,'none','2020-01-01'), ('بابل','syria','SYP',30,'none','${today}'), ('الكرم','syria','SYP',20,'same_as_outbound','${futureDate}')`);

// الصلاحيات: الأدمن فقط
let o = await del('manager', await id('بابل', today))();
ok(/not allowed/.test(o.e || ''), 'المدير لا يحذف');
o = await del('sales_manager', await id('بابل', today))();
ok(/not allowed/.test(o.e || ''), 'مدير المبيعات لا يحذف');
o = await del('employee', await id('بابل', today))();
ok(/not allowed/.test(o.e || ''), 'الموظف لا يحذف');
o = await del('admin', await id('بابل', today), '')();
ok(/authentication required/.test(o.e || ''), 'بلا هوية مرفوض');
ok((await n('select count(*)::int n from shipping_carrier_rates')) === 3, 'لم يُحذف شيء بالمحاولات المرفوضة');
// تعرفة شهر سابق مقفلة حتى للأدمن
o = await del('admin', await id('قدموس', '2020-01-01'))();
ok(/locked/.test(o.e || ''), 'تعرفة شهر سابق لا تُحذف حتى للأدمن');
ok((await n("select count(*)::int n from shipping_carrier_rates where carrier='قدموس'")) === 1, 'صف الشهر السابق باقٍ');
// غير موجود
o = await del('admin', '99999999-9999-9999-9999-999999999999')();
ok(/not found/.test(o.e || ''), 'معرّف غير موجود يُرفض');
// الحذف المسموح: اليوم والمستقبل
o = await del('admin', await id('بابل', today))();
ok(!o.e, 'الأدمن يحذف تعرفة اليوم: ' + (o.e || ''));
o = await del('admin', await id('الكرم', futureDate))();
ok(!o.e, 'الأدمن يحذف تعرفة مستقبلية: ' + (o.e || ''));
ok((await n('select count(*)::int n from shipping_carrier_rates')) === 1, 'بقي صف الشهر السابق فقط');
// سجل المحذوفات: نسخة كاملة + من حذف
const logs = (await db.query('select carrier, outbound_fee::int f, return_policy p, deleted_by::text by, deleted_by_name nm from shipping_carrier_rates_deleted order by carrier')).rows;
ok(logs.length === 2 && logs[0].carrier === 'الكرم' && logs[0].p === 'same_as_outbound' && logs[1].carrier === 'بابل' && logs[1].f === 30, 'السجل يحفظ نسخة الصفين');
ok(logs.every((l) => l.by === UID && l.nm === 'tester'), 'السجل يحفظ من حذف');
// لا حذف مباشر ولا كتابة بسجل المحذوفات
for (const role of ['admin', 'manager', 'sales_manager']) {
  await as(role);
  const d1 = await run("delete from shipping_carrier_rates where carrier='قدموس'");
  const d2 = await run('delete from shipping_carrier_rates_deleted');
  const i2 = await run("insert into shipping_carrier_rates_deleted (rate_id, carrier, market, currency, outbound_fee, return_policy, effective_from) values (gen_random_uuid(),'x','syria','SYP',1,'none','2030-01-01')");
  const u2 = await run("update shipping_carrier_rates_deleted set carrier='y'");
  await reset();
  ok(/permission denied/.test(d1.e || ''), `${role}: حذف مباشر من التعرفة مرفوض`);
  ok(/permission denied/.test(d2.e || '') && /permission denied/.test(i2.e || '') && /permission denied/.test(u2.e || ''), `${role}: سجل المحذوفات للقراءة فقط`);
}
await as('sales_manager'); const sel = await run('select count(*)::int n from shipping_carrier_rates_deleted'); await reset();
ok(!sel.e && sel.r.rows[0].n === 2, 'مدير المبيعات يقرأ سجل المحذوفات');
await as('employee'); const sel2 = await run('select count(*)::int n from shipping_carrier_rates_deleted'); await reset();
ok(!sel2.e && sel2.r.rows[0].n === 0, 'الموظف لا يرى السجل (RLS)');
await db.exec('set role anon;');
const anonFn = await run("select public.shipping_rate_delete('99999999-9999-9999-9999-999999999999')");
await reset();
ok(/permission denied/.test(anonFn.e || ''), 'anon لا ينفّذ الدالة');
// الدالة SECURITY DEFINER بمسار ثابت
const fn = (await db.query("select prosecdef, proconfig from pg_proc where proname='shipping_rate_delete'")).rows[0];
ok(fn.prosecdef === true && fn.proconfig.some((c) => /search_path=public, pg_temp/.test(c)), 'SECURITY DEFINER وsearch_path مثبّت');
// التراجع يحذف الدالة فقط
const ordersBefore = JSON.stringify((await db.query('select * from orders')).rows);
await db.exec(rollback); await db.exec(rollback);
ok((await n("select count(*)::int n from pg_proc where proname='shipping_rate_delete'")) === 0, 'التراجع يحذف الدالة');
ok((await n('select count(*)::int n from shipping_carrier_rates_deleted')) === 2, 'التراجع يُبقي سجل المحذوفات');
ok((await n('select count(*)::int n from shipping_carrier_rates')) === 1, 'التراجع لا يمسّ التعرفة');
ok(ordersBefore === JSON.stringify((await db.query('select * from orders')).rows), 'التراجع لا يمسّ الطلبات');
console.log(`shipping rate delete SQL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
