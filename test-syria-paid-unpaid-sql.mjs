/* global process */
// يشغّل Migration «Paid/Unpaid ← دافع الشحن» وملف التراجع على PostgreSQL داخل الذاكرة (PGlite) بلا اتصال بأي قاعدة.
// node test-syria-paid-unpaid-sql.mjs   (يتطلب: npm install --no-save @electric-sql/pglite)
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.error('FAIL', m); } };
const migration = readFileSync('supabase/migrations/20261029200000_syria_paid_unpaid_to_payer.sql', 'utf8');
const rollback = readFileSync('docs/shipping/20261029200000_syria_paid_unpaid_to_payer_rollback.sql', 'utf8');

const db = new PGlite();
await db.exec(`
  create role authenticated; create role anon;
  create table orders (id uuid primary key default gen_random_uuid(), market text, shipping_company text, shipping_payer text default 'company', status text, amount numeric, delivery_cost numeric, order_date timestamptz);
  insert into orders (market, shipping_company, shipping_payer, status, amount, delivery_cost, order_date) values
    ('syria','💰 Paid','company','delivered',100,0,'2026-09-01'), ('syria','❌ Unpaid','company','delivered',50,0,'2026-09-02'),
    ('syria','مدفوع الاجور','company','settled',70,0,'2026-09-03'), ('syria','غير مدفوع الاجور ','company','delivered',80,0,'2026-09-04'),
    ('syria','غيرمدفوع الاجور','company','pending',60,0,'2026-09-05'), ('syria','مدفوع','company','delivered',10,0,'2026-09-05'),
    ('syria','مدفوع الاجور /زبون مكرر','company','delivered',10,0,'2026-09-05'),
    ('syria','قدموس','company','delivered',90,0,'2026-09-06'), ('syria','بابل','customer','delivered',40,200,'2026-09-07'),
    ('turkey','💰 Paid','company','delivered',500,0,'2026-09-08'), ('uae','مندوب توصيل','company','delivered',300,0,'2026-09-10');
`);
const snap = async () => JSON.stringify((await db.query('select id, market, status, amount, delivery_cost, order_date from orders order by id')).rows);
const before = await snap();
await db.exec(migration);
await db.exec(migration);
ok(true, 'تُطبَّق مرتين بلا خطأ');
const n = async (sql) => (await db.query(sql)).rows[0].n;
ok((await n("select count(*)::int n from orders where market='syria' and shipping_company is null")) === 7, '7 طلبات سورية أُفرغ ناقلها');
ok((await n("select count(*)::int n from orders where market='syria' and shipping_company is null and shipping_payer='customer'")) === 3, 'Unpaid (3 صيغ) ← الدافع العميل');
ok((await n("select count(*)::int n from orders where market='syria' and shipping_company is null and shipping_payer='company'")) === 4, 'Paid (4 صيغ) ← الدافع علينا');
ok((await n("select count(*)::int n from orders where shipping_company in ('قدموس','بابل','مندوب توصيل')")) === 3, 'ناقلون حقيقيون لم يُمسّوا');
ok((await n("select count(*)::int n from orders where market='turkey' and shipping_company='💰 Paid'")) === 1, 'تركيا لم تُمسّ');
ok((await n("select count(*)::int n from orders where shipping_company='بابل' and shipping_payer='customer' and delivery_cost=200")) === 1, 'طلب العميل بتكلفة لم يُمسّ');
ok((await snap()) === before, 'المبلغ والحالة وdelivery_cost والتاريخ والسوق لم تتغيّر');
ok((await n('select count(*)::int n from orders_payer_cleanup_backup_20261029')) === 7, 'نسخة احتياطية لـ7 طلبات');
await db.exec('set role authenticated');
let denied = '';
try { await db.query('select * from orders_payer_cleanup_backup_20261029'); } catch (e) { denied = String(e.message); }
await db.exec('reset role');
ok(/permission denied/.test(denied), 'النسخة الاحتياطية غير مقروءة لـauthenticated');
await db.exec(rollback);
await db.exec(rollback);
ok((await n("select count(*)::int n from orders where market='syria' and shipping_company in ('💰 Paid','❌ Unpaid','مدفوع الاجور','غير مدفوع الاجور ','غيرمدفوع الاجور','مدفوع','مدفوع الاجور /زبون مكرر')")) === 7, 'التراجع يعيد الناقل الأصلي (7)');
ok((await n("select count(*)::int n from orders where market='syria' and shipping_payer='company' and shipping_company ~ 'Unpaid|غير'")) === 3, 'التراجع يعيد الدافع الأصلي (company)');
ok((await snap()) === before, 'التراجع لا يغيّر عموداً آخر');
console.log(`syria paid/unpaid SQL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
