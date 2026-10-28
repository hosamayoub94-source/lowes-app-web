/* global process */
// يشغّل Migration أعمدة تكلفة الشحن الفعلي وتراجعها على PostgreSQL داخل الذاكرة (PGlite) بلا اتصال بأي قاعدة.
// node test-orders-carrier-cost-sql.mjs   (يتطلب: npm install --no-save @electric-sql/pglite)
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.error('FAIL', m); } };
const mig = readFileSync('supabase/migrations/20261029500000_orders_carrier_actual_cost.sql', 'utf8');
const rollback = readFileSync('docs/shipping/20261029500000_orders_carrier_actual_cost_rollback.sql', 'utf8');

const db = new PGlite();
await db.exec(`
  create table orders (id int primary key, status text, amount numeric, delivery_cost numeric, shipping_payer text default 'company');
  insert into orders values (1,'delivered',100,200,'customer'), (2,'returned',50,0,'company'), (3,'pending',70,null,'company');
`);
const snap = async () => JSON.stringify((await db.query('select * from orders order by id')).rows);
const before = await snap();
await db.exec(mig);
await db.exec(mig);
ok(true, 'تُطبَّق مرتين بلا خطأ');
const cols = (await db.query("select column_name from information_schema.columns where table_name='orders' and column_name like 'carrier_cost_%' order by 1")).rows.map((r) => r.column_name);
ok(cols.join(',') === 'carrier_cost_currency,carrier_cost_outbound,carrier_cost_return', 'الأعمدة الثلاثة أُضيفت');
ok((await db.query('select count(*)::int n from orders where carrier_cost_outbound is not null or carrier_cost_return is not null or carrier_cost_currency is not null')).rows[0].n === 0, 'كلها NULL (لا أصفار مختلَقة)');
const run = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return String(e.message || e); } };
ok(!(await run("update orders set carrier_cost_outbound = 150, carrier_cost_return = 40, carrier_cost_currency = 'SYP' where id = 2")), 'قيم صالحة تُقبل');
ok(!(await run("update orders set carrier_cost_outbound = 0 where id = 1")), 'الصفر مقبول (مجاني موثّق)');
ok(/orders_carrier_cost_nonneg/.test((await run('update orders set carrier_cost_outbound = -1 where id = 3')) || ''), 'سالب مرفوض (ذهاب)');
ok(/orders_carrier_cost_nonneg/.test((await run('update orders set carrier_cost_return = -5 where id = 3')) || ''), 'سالب مرفوض (إرجاع)');
ok(/orders_carrier_cost_currency_check/.test((await run("update orders set carrier_cost_currency = 'EUR' where id = 3")) || ''), 'عملة غير مدعومة مرفوضة');
ok(!(await run("update orders set carrier_cost_currency = 'AED' where id = 3")), 'AED مقبولة');
// الأعمدة القديمة لم تتغيّر
const old = JSON.stringify((await db.query('select id, status, amount, delivery_cost, shipping_payer from orders order by id')).rows);
ok(old === JSON.stringify(JSON.parse(before)), 'الأعمدة القديمة (المبلغ/الحالة/delivery_cost/الدافع) لم تتغيّر');
await db.exec(rollback);
await db.exec(rollback);
const after = (await db.query("select count(*)::int n from information_schema.columns where table_name='orders' and column_name like 'carrier_cost_%'")).rows[0].n;
ok(after === 0, 'التراجع يحذف الأعمدة');
ok((await snap()) === before, 'التراجع يعيد الجدول كما كان (لا أثر على الأعمدة القديمة)');
console.log(`orders carrier cost SQL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
