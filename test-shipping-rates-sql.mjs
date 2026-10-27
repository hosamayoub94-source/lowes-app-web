/* global process */
// يشغّل Migration تعرفة الشحن الحقيقية (supabase/migrations/20261028100000_shipping_carrier_rates.sql) وملف تراجعها
// على PostgreSQL داخل الذاكرة (PGlite) بلا اتصال بأي قاعدة. node test-shipping-rates-sql.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.error('FAIL', m); } };
const migration = readFileSync('supabase/migrations/20261028100000_shipping_carrier_rates.sql', 'utf8');
const rollback = readFileSync('docs/shipping/20261028100000_shipping_carrier_rates_rollback.sql', 'utf8');

const db = new PGlite();
await db.exec(`
  create role authenticated; create role anon;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create function public.current_role_type() returns text language sql stable security definer as $$ select nullif(current_setting('test.role', true), '') $$;
  grant usage on schema public to authenticated, anon; grant usage on schema auth to authenticated, anon;
  grant execute on function public.current_role_type() to authenticated, anon;
  -- جداول حيّة وهمية لاختبار أن التراجع لا يلمسها
  create table orders (id int primary key, delivery_cost numeric, shipping_payer text);
  insert into orders values (1, 450, 'company'), (2, 0, 'customer'), (3, null, 'company');
  create table payroll_entries (id int primary key, net_salary_usd numeric);
  insert into payroll_entries values (1, 300.5), (2, 410);
`);
await db.exec(migration);
await db.exec(migration);
ok(true, 'تُطبَّق مرتين بلا خطأ (قابلة لإعادة التشغيل)');

const UID = '11111111-1111-1111-1111-111111111111';
const as = async (role, uid = UID) => { await db.exec(`set test.role = '${role}'; set test.uid = '${uid}'; set role authenticated;`); };
const reset = async () => { await db.exec('reset role;'); };
const run = async (sql, params) => { try { return { r: await db.query(sql, params) }; } catch (e) { return { e: String(e.message || e) }; } };
const save = (role, args, uid = UID) => async () => { await as(role, uid); const out = await run('select public.shipping_rate_save($1,$2,$3,$4,$5,$6,$7,$8,$9) d', args); await reset(); return out; };
const today = (await db.query("select (now() at time zone 'Europe/Istanbul')::date::text d")).rows[0].d;
const A = (o = {}) => ['قدموس', 'syria', 'SYP', 150, 'unknown', null, '2026-01-01', null, 'tester'].map((v, i) => (o[i] !== undefined ? o[i] : v));

// ── تعريف الأمان (بنية الهجرة) ──
const fn = (await db.query("select prosecdef, proconfig from pg_proc where proname='shipping_rate_save'")).rows[0];
ok(fn.prosecdef === true, 'الدالة SECURITY DEFINER');
ok(Array.isArray(fn.proconfig) && fn.proconfig.some((c) => /search_path=public, pg_temp/.test(c)), 'search_path مثبّت = public, pg_temp: ' + JSON.stringify(fn.proconfig));
const priv = (role, p) => db.query('select has_table_privilege($1, $2, $3) v', [role, 'public.shipping_carrier_rates', p]).then((x) => x.rows[0].v);
ok((await priv('authenticated', 'SELECT')) === true, 'authenticated: SELECT');
for (const p of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) ok((await priv('authenticated', p)) === false, `authenticated بلا ${p} مباشر`);
ok((await priv('anon', 'SELECT')) === false, 'anon بلا SELECT');
const pol = (await db.query("select cmd from pg_policies where tablename='shipping_carrier_rates'")).rows.map((x) => x.cmd);
ok(pol.length === 1 && pol[0] === 'SELECT', 'سياسة واحدة فقط (قراءة): ' + JSON.stringify(pol));

// ── المدير والأدمن يحفظان عبر الدالة ──
let o = await save('admin', A())();
ok(!o.e, 'الأدمن يحفظ عبر الدالة (أول صف بتاريخ قديم): ' + (o.e || ''));
o = await save('manager', A({ 0: 'بابل', 3: 30, 4: 'none', 6: '2026-01-01' }))();
ok(!o.e, 'المدير يحفظ عبر الدالة: ' + (o.e || ''));
// ── مدير المبيعات: قراءة فقط ──
await as('sales_manager'); let sel = await run('select count(*)::int n from shipping_carrier_rates'); await reset();
ok(!sel.e && sel.r.rows[0].n === 2, 'مدير المبيعات يقرأ الصفوف');
o = await save('sales_manager', A({ 0: 'الكرم', 3: 20, 6: today }))();
ok(/not allowed/.test(o.e || ''), 'مدير المبيعات لا يحفظ');
o = await save('employee', A({ 0: 'الكرم', 3: 20, 6: today }))();
ok(/not allowed/.test(o.e || ''), 'الموظف لا يحفظ');
await as('employee'); sel = await run('select count(*)::int n from shipping_carrier_rates'); await reset();
ok(!sel.e && sel.r.rows[0].n === 0, 'الموظف لا يرى أي صف (RLS)');
// ── الإدخال/التعديل/الحذف المباشر يفشل لكل الأدوار حتى الأدمن ──
for (const role of ['admin', 'manager', 'sales_manager']) {
  await as(role);
  const ins = await run("insert into shipping_carrier_rates (carrier, market, currency, outbound_fee, effective_from) values ('x','syria','SYP',1,'2030-01-01')");
  const upd = await run("update shipping_carrier_rates set outbound_fee = 1 where carrier='قدموس'");
  const del = await run("delete from shipping_carrier_rates where carrier='قدموس'");
  const trn = await run('truncate shipping_carrier_rates');
  await reset();
  ok(/permission denied/.test(ins.e || ''), `${role}: إدراج مباشر يفشل`);
  ok(/permission denied/.test(upd.e || ''), `${role}: تعديل مباشر يفشل`);
  ok(/permission denied/.test(del.e || ''), `${role}: حذف مباشر يفشل`);
  ok(/permission denied/.test(trn.e || ''), `${role}: TRUNCATE يفشل`);
}
ok((await db.query('select count(*)::int n from shipping_carrier_rates')).rows[0].n === 2, 'لم يتغيّر شيء بعد المحاولات المباشرة');
// ── تعديل تعرفة شهر سابق يفشل حتى للأدمن؛ والتاريخ لا يُعاد كتابته ──
await db.exec("insert into shipping_carrier_rates (carrier, market, currency, outbound_fee, return_policy, effective_from) values ('ماضٍ','syria','SYP',20,'none','2020-01-01')");
o = await save('admin', ['ماضٍ', 'syria', 'SYP', 25, 'none', null, '2020-01-01', null, 't'])();
ok(/locked/.test(o.e || ''), 'تعديل صف شهر سابق مقفل حتى للأدمن');
o = await save('admin', A({ 3: 99, 6: '2025-12-01' }))();
ok(/never rewritten/.test(o.e || ''), 'إدراج بتاريخ أقدم من آخر تعرفة مرفوض (حتى للأدمن)');
o = await save('manager', A({ 3: 180, 6: '2026-10-01' }))();
ok(!o.e, 'إضافة تعرفة بتاريخ أحدث تنجح: ' + (o.e || ''));
const rows = (await db.query("select outbound_fee::int f, effective_from::text d from shipping_carrier_rates where carrier='قدموس' order by effective_from")).rows;
ok(rows.length === 2 && rows[0].f === 150 && rows[1].f === 180, 'السعر القديم بقي 150 والجديد 180 بتاريخ سريان');
// تصحيح بتاريخ اليوم (الشهر الحالي) مسموح بلا تكرار
o = await save('admin', ['كرم', 'syria', 'SYP', 20, 'same_as_outbound', null, today, null, 't'])();
o = await save('admin', ['كرم', 'syria', 'SYP', 22, 'fixed', 5, today, 'تصحيح', 't'])();
const k = (await db.query("select outbound_fee::int f, return_policy p, return_fee::int rf from shipping_carrier_rates where carrier='كرم'")).rows;
ok(!o.e && k.length === 1 && k[0].f === 22 && k[0].p === 'fixed' && k[0].rf === 5, 'تصحيح بتاريخ اليوم يحدّث الصف نفسه');
// ── الهوية ──
o = await save('admin', A({ 0: 'هوية', 6: today }), '')();
ok(/authentication required/.test(o.e || ''), 'بلا هوية (auth.uid فارغ) ← authentication required');
// ── anon ──
await db.exec('reset role; set role anon;');
const anonSel = await run('select count(*) from shipping_carrier_rates');
const anonFn = await run("select public.shipping_rate_save('x','syria','SYP',1,'none',null,null,null,null)");
await reset();
ok(/permission denied/.test(anonSel.e || ''), 'anon لا يقرأ الجدول');
ok(/permission denied/.test(anonFn.e || ''), 'anon لا ينفّذ الدالة');
// ── القيود ──
const bad = async (args, re, msg) => { const x = await save('admin', args)(); ok(re.test(x.e || ''), msg + ' :: ' + (x.e || 'قُبل!')); };
await bad(['شركة', 'syria', 'SYP', 10, 'fixed', null, today, null, 't'], /needs return_fee/, 'سياسة ثابتة بلا مبلغ مرفوضة');
await bad(['شركة', 'syria', 'SYP', -1, 'none', null, today, null, 't'], />= 0/, 'أجرة سالبة مرفوضة');
await bad(['شركة', 'mars', 'SYP', 1, 'none', null, today, null, 't'], /market/, 'سوق غير معروف مرفوض');
await bad(['شركة', 'syria', 'EUR', 1, 'none', null, today, null, 't'], /currency/, 'عملة غير مدعومة مرفوضة');
await bad(['   ', 'syria', 'SYP', 1, 'none', null, today, null, 't'], /carrier required/, 'اسم شركة فارغ مرفوض');
await bad(['شركة', 'syria', 'SYP', 1, 'none', null, '2099-01-01', null, 't'], /too far/, 'تاريخ بعيد مرفوض');
o = await save('admin', ['شركة٢', 'syria', 'SYP', 5, 'none', 7, today, null, 't'])();
ok(!o.e && (await db.query("select return_fee from shipping_carrier_rates where carrier='شركة٢'")).rows[0].return_fee === null, 'مبلغ المرتجع يُهمَل مع سياسة none');

// ── التراجع لا يمسّ الطلبات ولا الرواتب ──
const before = { orders: JSON.stringify((await db.query('select * from orders order by id')).rows), pay: JSON.stringify((await db.query('select * from payroll_entries order by id')).rows) };
await db.exec(rollback);
await db.exec(rollback); // قابل لإعادة التشغيل
const gone = (await db.query("select to_regclass('public.shipping_carrier_rates') t")).rows[0].t;
const fnGone = (await db.query("select count(*)::int n from pg_proc where proname='shipping_rate_save'")).rows[0].n;
ok(gone === null && fnGone === 0, 'التراجع يحذف الجدول والدالة فقط');
ok(before.orders === JSON.stringify((await db.query('select * from orders order by id')).rows), 'التراجع لا يغيّر الطلبات ولا delivery_cost ولا shipping_payer');
ok(before.pay === JSON.stringify((await db.query('select * from payroll_entries order by id')).rows), 'التراجع لا يغيّر الرواتب');
await db.exec(migration);
ok((await db.query('select count(*)::int n from shipping_carrier_rates')).rows[0].n === 0, 'تُعاد الهجرة بعد التراجع نظيفة');

console.log(`shipping rates SQL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
