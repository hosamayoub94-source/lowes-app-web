/* global process */
// يشغّل Migration تعرفة الشحن الحقيقية (supabase/migrations/20261028100000_shipping_carrier_rates.sql) على PostgreSQL داخل الذاكرة (PGlite)
// بلا اتصال بأي قاعدة. node test-shipping-rates-sql.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.error('FAIL', m); } };
const migration = readFileSync('supabase/migrations/20261028100000_shipping_carrier_rates.sql', 'utf8');

const db = new PGlite();
await db.exec(`
  create role authenticated; create role anon;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create function public.current_role_type() returns text language sql stable as $$ select nullif(current_setting('test.role', true), '') $$;
  grant usage on schema public to authenticated, anon; grant usage on schema auth to authenticated, anon;
  grant execute on function public.current_role_type() to authenticated, anon;
`);
await db.exec(migration);
await db.exec(migration); // قابلة لإعادة التشغيل
ok(true, 'تُطبَّق مرتين بلا خطأ');

const as = async (role) => { await db.exec(`set test.role = '${role}'; set test.uid = '11111111-1111-1111-1111-111111111111'; set role authenticated;`); };
const reset = async () => { await db.exec('reset role;'); };
const run = async (sql, params) => { try { return { r: await db.query(sql, params) }; } catch (e) { return { e: String(e.message || e) }; } };
const save = (role, args) => async () => { await as(role); const out = await run('select public.shipping_rate_save($1,$2,$3,$4,$5,$6,$7,$8,$9) d', args); await reset(); return out; };
const A = (o = {}) => ['قدموس', 'syria', 'SYP', 150, 'unknown', null, '2026-01-01', null, 'tester', ...[]].map((v, i) => (o[i] !== undefined ? o[i] : v));

// 1) الأول بتاريخ قديم يجوز (يغطي أشهراً سابقة بتقدير)
let o = await save('admin', A())();
ok(!o.e, 'الصف الأول بتاريخ قديم مسموح: ' + (o.e || ''));
// 2) تعرفة لاحقة بتاريخ أحدث
o = await save('manager', A({ 3: 180, 6: '2026-10-01' }))();
ok(!o.e, 'تعديل بتاريخ أحدث مسموح (صف جديد): ' + (o.e || ''));
let rows = (await db.query("select outbound_fee::int f, effective_from::text d from shipping_carrier_rates where carrier='قدموس' order by effective_from")).rows;
ok(rows.length === 2 && rows[0].f === 150 && rows[1].f === 180, 'الصفان محفوظان والسعر القديم لم يتغيّر');
// 3) تاريخ أقدم من آخر تعرفة مرفوض (يعيد كتابة التاريخ)
o = await save('admin', A({ 3: 99, 6: '2026-05-01' }))();
ok(/never rewritten/.test(o.e || ''), 'إدراج أقدم من آخر تعرفة مرفوض');
// 4) إعادة حفظ نفس التاريخ القديم مرفوضة (ماضٍ مقفل)
o = await save('admin', A({ 3: 151, 6: '2026-10-01' }))();
// 2026-10-01 هو آخر صف؛ هل هو قبل الشهر الحالي؟ يعتمد على تاريخ تشغيل الاختبار — نختبر صراحةً بصف ماضٍ مضمون
await db.exec("insert into shipping_carrier_rates (carrier, market, currency, outbound_fee, return_policy, effective_from) values ('كرم_ماضٍ','syria','SYP',20,'none','2020-01-01')");
o = await save('admin', ['كرم_ماضٍ', 'syria', 'SYP', 25, 'none', null, '2020-01-01', null, 't'])();
ok(/locked/.test(o.e || ''), 'تعديل صف ماضٍ مقفل');
// 5) إعادة حفظ تعرفة بتاريخ اليوم تُحدِّث الصف نفسه (تصحيح فوري)
const today = (await db.query("select (now() at time zone 'Europe/Istanbul')::date::text d")).rows[0].d;
o = await save('admin', ['بابل', 'syria', 'SYP', 30, 'same_as_outbound', null, today, null, 't'])();
ok(!o.e, 'حفظ بتاريخ اليوم: ' + (o.e || ''));
o = await save('admin', ['بابل', 'syria', 'SYP', 35, 'fixed', 10, today, 'تصحيح', 't'])();
ok(!o.e, 'إعادة حفظ بتاريخ اليوم تُحدّث نفسه: ' + (o.e || ''));
rows = (await db.query("select outbound_fee::int f, return_policy p, return_fee::int rf from shipping_carrier_rates where carrier='بابل'")).rows;
ok(rows.length === 1 && rows[0].f === 35 && rows[0].p === 'fixed' && rows[0].rf === 10, 'صف واحد محدَّث بلا تكرار');
// 6) صلاحيات
o = await save('sales_manager', A({ 0: 'الكرم', 3: 20, 6: today }))();
ok(/not allowed/.test(o.e || ''), 'مدير المبيعات لا يكتب');
o = await save('employee', A({ 0: 'الكرم', 3: 20, 6: today }))();
ok(/not allowed/.test(o.e || ''), 'الموظف لا يكتب');
await as('sales_manager'); let sel = await run('select count(*)::int n from shipping_carrier_rates'); await reset();
ok(!sel.e && sel.r.rows[0].n >= 3, 'مدير المبيعات يقرأ (RLS)');
await as('employee'); sel = await run('select count(*)::int n from shipping_carrier_rates'); await reset();
ok(!sel.e && sel.r.rows[0].n === 0, 'الموظف لا يرى أي صف (RLS)');
// 7) قيود
o = await save('admin', ['شركة', 'syria', 'SYP', 10, 'fixed', null, today, null, 't'])();
ok(/needs return_fee/.test(o.e || ''), 'سياسة ثابتة بلا مبلغ مرفوضة');
o = await save('admin', ['شركة', 'syria', 'SYP', -1, 'none', null, today, null, 't'])();
ok(/>= 0/.test(o.e || ''), 'أجرة سالبة مرفوضة');
o = await save('admin', ['شركة', 'mars', 'SYP', 1, 'none', null, today, null, 't'])();
ok(/market/.test(o.e || ''), 'سوق غير معروف مرفوض');
o = await save('admin', ['شركة', 'syria', 'EUR', 1, 'none', null, today, null, 't'])();
ok(/currency/.test(o.e || ''), 'عملة غير مدعومة مرفوضة');
o = await save('admin', ['   ', 'syria', 'SYP', 1, 'none', null, today, null, 't'])();
ok(/carrier required/.test(o.e || ''), 'اسم شركة فارغ مرفوض');
o = await save('admin', ['شركة', 'syria', 'SYP', 1, 'none', null, '2099-01-01', null, 't'])();
ok(/too far/.test(o.e || ''), 'تاريخ بعيد مرفوض');
o = await save('admin', ['شركة', 'syria', 'SYP', 5, 'none', 7, today, null, 't'])();
rows = (await db.query("select return_fee from shipping_carrier_rates where carrier='شركة'")).rows;
ok(!o.e && rows[0].return_fee === null, 'مبلغ المرتجع يُهمَل مع سياسة none');
// 8) لا حذف ولا كتابة مباشرة بلا دور
await as('admin'); let del = await run("delete from shipping_carrier_rates where carrier='قدموس'"); await reset();
ok(/permission denied/.test(del.e || ''), 'لا DELETE لأحد: ' + (del.e || 'نجح الحذف!'));
await as('sales_manager'); let ins = await run("insert into shipping_carrier_rates (carrier, market, currency, outbound_fee, effective_from) values ('x','syria','SYP',1,'2026-10-01')"); await reset();
ok(/row-level security/.test(ins.e || ''), 'إدراج مباشر لمدير المبيعات مرفوض بالـRLS');
await as('admin'); const anonSel = await run('select 1'); await reset();
await db.exec('set role anon;'); const anon = await run('select count(*) from shipping_carrier_rates'); await reset();
ok(/permission denied/.test(anon.e || ''), 'anon لا يقرأ');

console.log(`shipping rates SQL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
