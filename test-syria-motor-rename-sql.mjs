/* global process */
// يشغّل Migration «الموتور ← مشوار» (سوريا) وملف التراجع على PostgreSQL داخل الذاكرة (PGlite) بلا اتصال بأي قاعدة.
// node test-syria-motor-rename-sql.mjs   (يتطلب: npm install --no-save @electric-sql/pglite)
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.error('FAIL', m); } };
const migration = readFileSync('supabase/migrations/20261029100000_syria_motor_to_mashwar.sql', 'utf8');
const rollback = readFileSync('docs/shipping/20261029100000_syria_motor_to_mashwar_rollback.sql', 'utf8');

const db = new PGlite();
await db.exec(`
  create role authenticated; create role anon;
  create table orders (id uuid primary key default gen_random_uuid(), market text, shipping_company text, status text, amount numeric, delivery_cost numeric, order_date timestamptz, deleted_at timestamptz);
  create table accounting_channels (id uuid primary key default gen_random_uuid(), name_ar text, kind text, market text);
  insert into accounting_channels (name_ar, kind, market) values ('الموتور','shipping','syria'), ('قدموس','shipping','syria'), ('الموتور','shipping','turkey');
  insert into orders (market, shipping_company, status, amount, delivery_cost, order_date) values
    ('syria','الموتور','delivered',100,5,'2026-09-01'), ('syria','توصيل ميتور','returned',50,0,'2026-09-02'), ('syria','توصيل موتور','settled',70,3,'2026-09-03'),
    ('syria','توصيل موتور ','delivered',80,0,'2026-09-04'), ('syria','موتور','pending',60,0,'2026-09-05'),
    ('syria','قدموس','delivered',90,0,'2026-09-06'), ('syria','مشوار','delivered',40,0,'2026-09-07'),
    ('turkey','توصيل الموتور 🏍️','delivered',500,0,'2026-09-08'), ('turkey','الموتور','delivered',200,0,'2026-09-09'), ('uae','مندوب توصيل','delivered',300,0,'2026-09-10');
`);
const snap = async () => JSON.stringify((await db.query('select id, market, status, amount, delivery_cost, order_date from orders order by id')).rows);
const before = await snap();
await db.exec(migration);
await db.exec(migration);
ok(true, 'تُطبَّق مرتين بلا خطأ (قابلة لإعادة التشغيل)');

const n = async (sql) => (await db.query(sql)).rows[0].n;
ok((await n("select count(*)::int n from orders where market='syria' and shipping_company='مشوار'")) === 6, 'كل صيغ «الموتور» السورية (5) + مشوار الموجودة = 6');
ok((await n("select count(*)::int n from orders where market='syria' and shipping_company ~ 'موتور|ميتور'")) === 0, 'لا صيغة موتور باقية بسوريا');
ok((await n("select count(*)::int n from orders where market='turkey' and shipping_company in ('توصيل الموتور 🏍️','الموتور')")) === 2, 'موتور تركيا لم يُمسّ');
ok((await n("select count(*)::int n from orders where shipping_company in ('قدموس','مندوب توصيل')")) === 2, 'شركات أخرى لم تُمسّ');
ok((await snap()) === before, 'الحالة والمبلغ وdelivery_cost والتاريخ والسوق لم تتغيّر');
ok((await n("select count(*)::int n from orders_carrier_rename_backup_20261029")) === 5, 'نسخة احتياطية لـ5 طلبات (لا مشوار القديمة ولا تركيا)');
ok((await n("select count(*)::int n from accounting_channels where kind='shipping' and market='syria' and name_ar='مشوار'")) === 1, 'قناة سوريا أُعيدت تسميتها');
ok((await n("select count(*)::int n from accounting_channels where market='turkey' and name_ar='الموتور'")) === 1, 'قناة تركيا لم تُمسّ');
// التعليمات لا تكتب فوق القيمة الأصلية عند إعادة التشغيل
const orig = (await db.query("select old_shipping_company o from orders_carrier_rename_backup_20261029 order by old_shipping_company")).rows.map((r) => r.o);
ok(orig.includes('الموتور') && orig.includes('توصيل ميتور') && orig.includes('موتور') && orig.filter((x) => x === 'مشوار').length === 0, 'النسخة تحمل الأصل لا «مشوار»');
await db.exec('set role authenticated');
let denied = '';
try { await db.query('select * from orders_carrier_rename_backup_20261029'); } catch (e) { denied = String(e.message); }
await db.exec('reset role');
ok(/permission denied/.test(denied), 'النسخة الاحتياطية غير مقروءة لـauthenticated');

await db.exec(rollback);
await db.exec(rollback);
ok((await n("select count(*)::int n from orders where market='syria' and shipping_company ~ 'موتور|ميتور'")) === 5, 'التراجع يعيد الصيغ الأصلية الخمس');
ok((await n("select count(*)::int n from orders where market='syria' and shipping_company='مشوار'")) === 1, 'مشوار الأصلية بقيت (طلب واحد)');
ok((await snap()) === before, 'التراجع لا يغيّر أي عمود آخر');
ok((await n("select count(*)::int n from accounting_channels where kind='shipping' and market='syria' and name_ar='الموتور'")) === 1, 'التراجع يعيد اسم القناة');

console.log(`syria motor rename SQL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
