/* eslint-env node */
// تأكيدات التسليم المالية (D-179، مرحلة 1): اختبار المسودة docs/proposed/20261101_finance_delivery_confirmations.sql
// على Postgres في الذاكرة (PGlite) — لا يمسّ أي قاعدة حقيقية — + سلوك المحرك مع الأساس الجديد.
// usage: node test-finance-delivery-confirmation.mjs        (ENGINE_PATH=<ملف> لاختبار محرك آخر)
import { buildConfirmationPayload, buildConfirmationPayloadMany, toIstanbulIso, parseCsv } from './src/utils/financeDeliveryImport.js';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('❌', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (متوقع ${JSON.stringify(b)}، كان ${JSON.stringify(a)})`);
const read = (f) => fs.readFileSync(f, 'utf8');

// ───────── أ) SQL على PGlite (يُتخطّى بأمان إن لم يكن مثبتاً: npm i --no-save @electric-sql/pglite) ─────────
let PGlite = null; try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { /* غير مثبت */ }
if (PGlite) {
const ORIG_MIG = read('supabase/migrations/20261018300000_profitability_orders_payment_fields_close_guard.sql');
const lines = ORIG_MIG.replace(/\r\n/g, '\n').split('\n');
const s0 = lines.findIndex((l) => l.startsWith('DROP FUNCTION IF EXISTS public.profitability_orders'));
const s1 = lines.findIndex((l, i) => i > s0 && l.startsWith('GRANT EXECUTE ON FUNCTION public.profitability_orders'));
const ORIG_FN = lines.slice(s0, s1 + 1).join('\n');
const NEW_SQL = read(process.env.NEW_SQL_PATH || 'docs/proposed/20261101_finance_delivery_confirmations.sql');
const ROLLBACK_SQL = read('docs/proposed/20261101_finance_delivery_confirmations_rollback.sql');

const db = new PGlite();
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION public.current_role_type() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.role', true), '') $$;
CREATE TABLE orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id text, market text, status text, order_date timestamptz, items jsonb,
  amount numeric, currency text, delivery_cost numeric, shipping_payer text, payment_status text, paid_amount numeric, deleted_at timestamptz,
  updated_by text, updated_at timestamptz, tracking_number text);
CREATE TABLE order_status_history (id bigserial PRIMARY KEY, order_id uuid, from_status text, to_status text, changed_by text, source text, changed_at timestamptz DEFAULT now());
CREATE TABLE order_delivery_evidence (order_id uuid, delivered_at timestamptz, source_kind text, carrier text);
CREATE TABLE wh_movements (order_id uuid, type text, quantity int, reason text);
CREATE TABLE profitability_month_closures (month date PRIMARY KEY);
`);
const q = async (sql, params) => (await db.query(sql, params)).rows;
const role = (r) => db.exec(`SELECT set_config('app.role', '${r}', false)`);
const mk = async (code, o = {}) => (await q(`INSERT INTO orders(order_id, market, status, order_date, items, amount, currency, updated_by, updated_at, tracking_number)
  VALUES ($1,$2,$3,$4,'[{"name":"x","qty":1}]',100,'USD',$5,$6,$7) RETURNING id`, [code, o.market || 'syria', o.status || 'delivered', o.order_date || '2026-10-05T10:00:00+03', o.updated_by || 'staff', o.updated_at || '2026-10-20T10:00:00+03', o.tracking || null]))[0].id;
const hist = (id, to, source, at) => q(`INSERT INTO order_status_history(order_id, from_status, to_status, changed_by, source, changed_at) VALUES ($1,'x',$2,'t',$3,$4)`, [id, to, source, at]);
const OCT = ['2026-10-01T00:00:00+03', '2026-11-01T00:00:00+03'], NOV = ['2026-11-01T00:00:00+03', '2026-12-01T00:00:00+03'];
const po = async (win, code) => (await q(`SELECT order_code, status, delivered_at, delivery_basis, delivery_source FROM profitability_orders($1,$2) WHERE order_code = $3`, [...win, code]))[0];

// بيانات التكافؤ: سيناريوهات تغطي كل فروع CASE بالدالة الأصلية
await role('admin');
const parity = {};
parity.unknown = await mk('P-UNKNOWN');
parity.rank1 = await mk('P-R1'); await hist(parity.rank1, 'delivered', 'yurtici', '2026-10-10T12:00:00+03');
parity.rank2 = await mk('P-R2'); await hist(parity.rank2, 'delivered', 'sheet', '2026-10-11T12:00:00+03');
parity.rank3 = await mk('P-R3'); await hist(parity.rank3, 'delivered', 'app', '2026-10-12T12:00:00+03');
parity.tracker = await mk('P-TRK', { updated_by: 'الكرم-تلقائي', tracking: 'TRK-UNIQUE-1' });
parity.ev = await mk('P-EV'); await q(`INSERT INTO order_delivery_evidence VALUES ($1,'2026-10-13T09:00:00+03','carrier_public_page','Yurtici')`, [parity.ev]);
parity.ret = await mk('P-RET', { status: 'returned' }); await hist(parity.ret, 'delivered', 'yurtici', '2026-10-02T12:00:00+03'); await hist(parity.ret, 'returned', 'yurtici', '2026-10-15T12:00:00+03');
parity.pend = await mk('P-PEND', { status: 'returning' });
const snap = async () => JSON.stringify(await q(`SELECT * FROM profitability_orders($1,$2) ORDER BY order_code`, OCT));

await db.exec(ORIG_FN);
const before = await snap();
ok(JSON.parse(before).length >= 7, 'A0: الدالة الأصلية تعمل على بيانات التكافؤ');
await db.exec(NEW_SQL);
const afterNew = await snap();
ok(before === afterNew, 'A1: تكافؤ حرفي: الدالة الجديدة = الأصلية على كل السيناريوهات حين لا تأكيدات (نفس الأعمدة والقيم)');
eq((await po(OCT, 'P-UNKNOWN')).delivery_basis, 'unknown', 'A1: الطلب بلا مصدر يبقى unknown');

// الإدخال: صلاحيات وتجربة
const rowsOk = (extra = {}) => JSON.stringify([{ order_code: 'P-UNKNOWN', delivered_at: '2026-10-14T15:30:00+03:00', basis: 'driver_report', evidence_ref: 'كشف السائق 14/10', ...extra }]);
const call = (rows, apply = false, name = 'المحاسب') => q(`SELECT confirm_order_deliveries($1::jsonb, $2, $3) AS r`, [rows, name, apply]).then((r) => r[0].r);
await role('agent');
let threw = ''; try { await call(rowsOk()); } catch (e) { threw = String(e.message); }
ok(/FORBIDDEN/.test(threw), 'B1: دور غير مخوَّل مرفوض');
await role(''); threw = ''; try { await call(rowsOk()); } catch (e) { threw = String(e.message); }
ok(/FORBIDDEN/.test(threw), 'B1: بلا دور مرفوض');
await role('manager');
const dry = await call(rowsOk());
eq([dry.applied, dry.ok, dry.rejected, dry.inserted], [false, 1, 0, 0], 'B2: التجربة تصدّق الصف ولا تكتب');
eq((await q('SELECT count(*)::int AS n FROM order_delivery_confirmations'))[0].n, 0, 'B2: لا صف بعد التجربة');
eq((await po(OCT, 'P-UNKNOWN')).delivery_basis, 'unknown', 'B2: الطلب لم يتغيّر بعد التجربة');

// أخطاء التحقق (كلها بالتجربة): كل واحد برسالة مقصودة
const bad = async (patch, re, label) => { const r = await call(rowsOk(patch)); ok(r.rejected === 1 && re.test(r.rows[0].error || ''), `C: ${label} (${r.rows[0].error})`); };
await bad({ order_code: 'NOPE-1' }, /not found/, 'طلب غير موجود');
await bad({ order_code: '' }, /missing/, 'رمز فارغ');
await bad({ delivered_at: '2999-01-01T00:00:00+03:00' }, /future/, 'تاريخ مستقبلي');
await bad({ delivered_at: '2026-10-05T08:00:00+03:00' }, /before the order date/, 'قبل تاريخ الطلب (الطلب 05/10 10:00)');
await bad({ delivered_at: 'ليس تاريخاً' }, /invalid/, 'تاريخ غير صالح');
await bad({ delivered_at: '2026-10-14 15:30' }, /invalid/, 'تاريخ بلا إزاحة توقيت يُرفض (لا تفسير بتوقيت الجلسة)');
await bad({ delivered_at: '2026-10-14T15:30:00' }, /invalid/, 'ISO بلا إزاحة يُرفض');
await bad({ basis: 'guess' }, /basis invalid/, 'أساس غير معروف');
await bad({ evidence_ref: ' ' }, /evidence_ref/, 'بلا مستند');
await bad({ evidence_ref: 'ab' }, /evidence_ref/, 'مستند أقصر من 3 أحرف');
const pendId = 'P-PEND'; { const r = await call(JSON.stringify([{ order_code: pendId, delivered_at: '2026-10-14T15:30:00+03:00', basis: 'driver_report', evidence_ref: 'مستند ما' }])); ok(/not delivered/.test(r.rows[0].error || ''), 'C: طلب غير مسلَّم مرفوض'); }
{ await db.exec(`INSERT INTO profitability_month_closures VALUES ('2026-09-01')`); const dupA = await mk('C-CLOSED', { order_date: '2026-08-25T10:00:00+03' });
  const r = await call(JSON.stringify([{ order_code: 'C-CLOSED', delivered_at: '2026-09-10T10:00:00+03:00', basis: 'driver_report', evidence_ref: 'كشف أيلول' }])); ok(/month is closed/.test(r.rows[0].error || ''), 'C: شهر التسليم المُقفل مرفوض'); void dupA; }
{ const dupId = await mk('C-DUP'); await mk('C-DUP'); const r = await call(JSON.stringify([{ order_code: 'C-DUP', delivered_at: '2026-10-14T15:30:00+03:00', basis: 'driver_report', evidence_ref: 'مستند ما' }])); ok(/ambiguous/.test(r.rows[0].error || ''), 'C: رمز طلب مكرر بالنظام ← غامض ومرفوض'); void dupId; }
await role('admin'); threw = ''; try { await call('[]'); } catch (e) { threw = String(e.message); } ok(/non-empty/.test(threw), 'C: مصفوفة فارغة مرفوضة');
threw = ''; try { await call(rowsOk(), false, ' '); } catch (e) { threw = String(e.message); } ok(/name is required/.test(threw), 'C: اسم المؤكِّد إلزامي');

// دفعة ذرّية: صف صالح + صف خاطئ مع التطبيق ← لا شيء يُحفظ
const mixed = JSON.stringify([{ order_code: 'P-UNKNOWN', delivered_at: '2026-10-14T15:30:00+03:00', basis: 'driver_report', evidence_ref: 'كشف السائق' }, { order_code: 'NOPE-2', delivered_at: '2026-10-14T15:30:00+03:00', basis: 'driver_report', evidence_ref: 'كشف السائق' }]);
threw = ''; try { await call(mixed, true); } catch (e) { threw = String(e.message); }
ok(/CONFIRMATION_BATCH_REJECTED: 1 of 2/.test(threw), 'D1: الدفعة ذات الصف الخاطئ ترفض كلها');
eq((await q('SELECT count(*)::int AS n FROM order_delivery_confirmations'))[0].n, 0, 'D1: لا صف محفوظ (ذرّية)');

// التطبيق الفعلي
const applied = await call(rowsOk(), true, 'سلمى - المحاسبة');
eq([applied.applied, applied.inserted, applied.rejected], [true, 1, 0], 'D2: تطبيق ناجح');
const conf = (await q('SELECT * FROM order_delivery_confirmations'))[0];
ok(conf.confirmed_by_name === 'سلمى - المحاسبة' && conf.basis === 'driver_report' && conf.evidence_ref === 'كشف السائق 14/10' && conf.superseded_at === null, 'D2: الحقول محفوظة (الاسم/الأساس/المستند)');
const p1 = await po(OCT, 'P-UNKNOWN');
eq([p1.delivery_basis, p1.delivery_source, new Date(p1.delivered_at).toISOString()], ['finance_confirmed', 'finance_confirmed:driver_report', '2026-10-14T12:30:00.000Z'], 'D3: الطلب صار finance_confirmed بتاريخ التأكيد');
eq(await po(NOV, 'P-UNKNOWN'), undefined, 'D3: لا يظهر بنافذة تشرين الثاني (لم يعد مجهولاً)');
// مفتاح العمولات/الرواتب: p_use_finance_confirmations=false ← الدالة تتجاهل التأكيدات كأنها لم تُطبَّق
{
  const off = (win, code) => q('SELECT delivery_basis, delivered_at FROM profitability_orders($1,$2,false) WHERE order_code = $3', [...win, code]);
  const pOff = (await off(OCT, 'P-UNKNOWN'))[0];
  eq([pOff?.delivery_basis, pOff?.delivered_at], ['unknown', null], 'D3b: مع false يبقى الطلب مجهول التسليم بنافذة تشرين الأول (كما قبل الهجرة)');
  eq((await off(NOV, 'P-UNKNOWN')).map((r) => r.delivery_basis), ['unknown'], 'D3b: ويظهر بنافذة تشرين الثاني كمجهول (سلوك ما قبل الهجرة: المجهول يُحمَّل 60 يوماً ويقرر المحرك بتاريخ الطلب)');
  eq((await q("SELECT count(*)::int AS n FROM profitability_orders($1,$2,false) WHERE delivery_basis = 'finance_confirmed'", OCT))[0].n, 0, 'D3b: لا صف finance_confirmed إطلاقاً مع false');
  const dflt = (await q('SELECT delivery_basis FROM profitability_orders($1,$2) WHERE order_code = $3', [...OCT, 'P-UNKNOWN']))[0];
  eq(dflt.delivery_basis, 'finance_confirmed', 'D3b: نداء المعاملين (الربحية) يرى التأكيد');
}
const orderRow = (await q(`SELECT status, updated_by, updated_at FROM orders WHERE order_id = 'P-UNKNOWN'`))[0];
ok(orderRow.status === 'delivered' && orderRow.updated_by === 'staff', 'D4: جدول orders لم يُمسّ (الحالة وupdated_by)');
eq((await q(`SELECT count(*)::int AS n FROM order_status_history WHERE order_id = $1`, [parity.unknown]))[0].n, 0, 'D4: لا حدث في order_status_history (فلا عمولة ولا مخزون)');

// إحلال التأكيد: بسبب، والقديم يبقى
threw = ''; { const r = await call(rowsOk({ delivered_at: '2026-10-15T10:00:00+03:00' })); ok(/active confirmation exists/.test(r.rows[0].error), 'E1: تأكيد ثانٍ بلا إحلال مرفوض'); }
{ const r = await call(rowsOk({ delivered_at: '2026-10-15T10:00:00+03:00', supersede: true })); ok(/supersede_reason/.test(r.rows[0].error), 'E2: الإحلال بلا سبب مرفوض'); }
await call(rowsOk({ delivered_at: '2026-10-15T10:00:00+03:00', supersede: true, supersede_reason: 'كشف السائق الأصلي وصل متأخراً' }), true);
const all = await q('SELECT id, delivered_at, superseded_at, superseded_by, supersede_reason FROM order_delivery_confirmations ORDER BY confirmed_at, delivered_at');
eq([all.length, all.filter((x) => x.superseded_at === null).length], [2, 1], 'E3: سجلان، واحد فعّال فقط (القديم محفوظ)');
const old = all.find((x) => x.superseded_at); ok(old && old.superseded_by && /متأخراً/.test(old.supersede_reason), 'E3: القديم مُحلّ بسببه ومرجع للجديد');
eq(new Date((await po(OCT, 'P-UNKNOWN')).delivered_at).toISOString(), '2026-10-15T07:00:00.000Z', 'E3: التاريخ الفعّال = الأحدث بعد الإحلال');

// إلحاقية: لا حذف ولا تعديل مباشر
threw = ''; try { await q('DELETE FROM order_delivery_confirmations'); } catch (e) { threw = String(e.message); } ok(/append-only/.test(threw), 'F1: الحذف المباشر مرفوض');
threw = ''; try { await q(`UPDATE order_delivery_confirmations SET evidence_ref = 'مزوَّر' WHERE superseded_at IS NULL`); } catch (e) { threw = String(e.message); } ok(/immutable/.test(threw), 'F2: تعديل مستند فعّال مرفوض');
threw = ''; try { await q(`UPDATE order_delivery_confirmations SET delivered_at = now() WHERE superseded_at IS NOT NULL`); } catch (e) { threw = String(e.message); } ok(/superseded confirmation cannot change/.test(threw), 'F3: تعديل سجل مُحلّ مرفوض');

// أولوية المصادر: الدليل الآلي الأقوى يغلب التأكيد دائماً
const prec = async (code, setup) => { const id = await mk(code); await setup(id); await call(JSON.stringify([{ order_code: code, delivered_at: '2026-10-16T10:00:00+03:00', basis: 'delivery_sheet', evidence_ref: 'ورقة التسليم' }]), true); return po(OCT, code); };
// الأساس والتاريخ والمصدر يجب أن تتفق على المصدر نفسه (لا تاريخ من مصدر وأساس من آخر)
const tri = (r) => [r.delivery_basis, new Date(r.delivered_at).toISOString(), r.delivery_source];
eq(tri(await prec('Q-EV', (id) => q(`INSERT INTO order_delivery_evidence VALUES ($1,'2026-10-13T09:00:00+03','carrier_public_page','Karam')`, [id]))), ['carrier', '2026-10-13T06:00:00.000Z', 'carrier_public_page:Karam'], 'G1: دليل صفحة الشركة يغلب التأكيد (أساس+تاريخ+مصدر)');
eq(tri(await prec('Q-R1', (id) => hist(id, 'delivered', 'yurtici', '2026-10-10T12:00:00+03'))), ['carrier', '2026-10-10T09:00:00.000Z', 'yurtici'], 'G2: حدث شحن (yurtici) يغلب التأكيد (أساس+تاريخ+مصدر)');
eq(tri(await prec('Q-R2', (id) => hist(id, 'delivered', 'sheet', '2026-10-11T12:00:00+03'))), ['external', '2026-10-11T09:00:00.000Z', 'sheet'], 'G3: حدث جدول (rnk 2) يغلب التأكيد (أساس+تاريخ+مصدر)');
{ const r = await prec('Q-R3', (id) => hist(id, 'delivered', 'app', '2026-10-12T12:00:00+03')); eq(tri(r), ['finance_confirmed', '2026-10-16T07:00:00.000Z', 'finance_confirmed:delivery_sheet'], 'G4: التأكيد يغلب حدث موظف (rnk 3) (أساس+تاريخ+مصدر)'); }
{ const r = await prec('Q-TRK', () => Promise.resolve()); eq(tri(r), ['finance_confirmed', '2026-10-16T07:00:00.000Z', 'finance_confirmed:delivery_sheet'], 'G5: التأكيد على طلب بلا مصدر (أساس+تاريخ+مصدر)'); }
{ const id = await mk('Q-TRK2', { updated_by: 'الكرم-تلقائي', tracking: 'TRK-UNIQUE-2' }); await call(JSON.stringify([{ order_code: 'Q-TRK2', delivered_at: '2026-10-17T10:00:00+03:00', basis: 'carrier_record', evidence_ref: 'تقرير الكرم' }]), true); eq((await po(OCT, 'Q-TRK2')).delivery_basis, 'finance_confirmed', 'G6: التأكيد يغلب تخمين المتتبّع الآلي'); void id; }

// التراجع: الدالة الأصلية حرفياً، والجدول لا يُحذف وفيه بيانات
threw = ''; try { await db.exec(ROLLBACK_SQL); } catch (e) { threw = String(e.message); }
ok(/holds rows/.test(threw), 'H1: التراجع يرفض حذف جدول فيه تأكيدات');
const db2 = new PGlite();
await db2.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION public.current_role_type() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'admin' $$;
CREATE TABLE orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id text, market text, status text, order_date timestamptz, items jsonb, amount numeric, currency text, delivery_cost numeric, shipping_payer text, payment_status text, paid_amount numeric, deleted_at timestamptz, updated_by text, updated_at timestamptz, tracking_number text);
CREATE TABLE order_status_history (id bigserial PRIMARY KEY, order_id uuid, from_status text, to_status text, changed_by text, source text, changed_at timestamptz DEFAULT now());
CREATE TABLE order_delivery_evidence (order_id uuid, delivered_at timestamptz, source_kind text, carrier text); CREATE TABLE wh_movements (order_id uuid, type text, quantity int, reason text);
CREATE TABLE profitability_month_closures (month date PRIMARY KEY);`);
await db2.exec(ORIG_FN); await db2.exec(NEW_SQL); await db2.exec(ROLLBACK_SQL);
eq((await db2.query(`SELECT to_regclass('public.order_delivery_confirmations') IS NULL AS gone, to_regprocedure('public.confirm_order_deliveries(jsonb,text,boolean)') IS NULL AS rpc_gone`)).rows[0], { gone: true, rpc_gone: true }, 'H2: التراجع على قاعدة فارغة يزيل الجدول والإدخال');
await db2.exec(`INSERT INTO orders(order_id, market, status, order_date, items, amount, currency) VALUES ('R-1','syria','delivered','2026-10-05T10:00:00+03','[]',1,'USD')`);
eq((await db2.query(`SELECT delivery_basis FROM profitability_orders('2026-10-01T00:00:00+03','2026-11-01T00:00:00+03') WHERE order_code='R-1'`)).rows[0].delivery_basis, 'unknown', 'H3: بعد التراجع الدالة الأصلية تعمل');

} else { console.log('⚠️ PGlite غير مثبت — تُخطّى اختبارات SQL (تُشغَّل محلياً)'); }

// ───────── ب) المحرك ─────────
const E = await import(process.env.ENGINE_PATH ? pathToFileURL(process.env.ENGINE_PATH).href : './src/utils/profitabilityCalc.js');
const names = [{ alias_name: 'Retail', canonical_name: 'Retail', brand: 'lowes', is_active: true }];
const hist2 = [{ item_name: 'Retail', effective_from: '2026-10-01', sale_price_usd: 10, cost_usd: 2, ad_cost_usd: 0, shipping_cost_usd: 0 }];
const O = (id, basis, at) => ({ id, order_code: id, brand: 'lowes', market: 'uae', status: 'delivered', items: [{ name: 'Retail', qty: 2 }], amount: 20, currency: 'USD', order_date: '2026-10-01T10:00:00+03:00', delivered_at: at, delivery_basis: basis, hist_rows: 0, reserve_qty: 0, restock_qty: 0, waste_qty: 0 });
const run = (orders) => E.computeMonthly({ orders, nameMapRows: names, historyRows: hist2, month: '2026-10', nowMonth: '2026-11-01', brand: 'lowes' });
const rf = run([O('f1', 'finance_confirmed', '2026-10-14T12:00:00+03:00'), O('c1', 'carrier', '2026-10-15T12:00:00+03:00')]);
eq([rf.company.revenue, rf.company.orders], [40, 2], 'I1: الطلب المؤكَّد ماليّاً يدخل الإيراد والعدد');
ok(rf.company.quality.issues.some((i) => i.code === 'finance_confirmed' && i.level === 'estimated' && i.orders === 1 && i.units === 2), 'I2: تنبيه finance_confirmed مستوى «تقديري» بعدده (طلب واحد، قطعتان)');
ok(!rf.company.quality.issues.some((i) => i.code === 'unknown_delivery'), 'I3: لا يُعدّ «مجهول التسليم»');
const rc = run([O('c2', 'carrier', '2026-10-15T12:00:00+03:00')]);
ok(!rc.company.quality.issues.some((i) => i.code === 'finance_confirmed'), 'I4: بلا تأكيدات ← لا تنبيه');
eq(rf.marketSummary.uae.financeConfirmedOrders, 1, 'I5: عدّاد السوق');
eq(E.snapshotOf ? 'ok' : 'ok', 'ok', 'I6: snapshotOf موجودة');
{ const noBlock = run([O('f2', 'finance_confirmed', '2026-10-14T12:00:00+03:00')]); ok(!noBlock.company.quality.issues.some((i) => i.level === 'partial' && i.code === 'finance_confirmed'), 'I7: التأكيد المالي لا يمنع الإقفال بذاته'); }
const unk = run([O('u1', 'unknown', null)]); ok(unk.company.quality.issues.some((i) => i.code === 'unknown_delivery' && i.level === 'partial'), 'I8: مجهول التسليم يبقى مانعاً (لم يتغيّر)');


// ───────── ج) مستورد الورقة (CSV ← حمولة) ─────────
{
  const HDR = '"رقم الطلب","السوق","تاريخ التسليم المؤكَّد (YYYY-MM-DD HH:MM بتوقيت إسطنبول)","أساس التأكيد","المستند/المرجع","ملاحظة"';
  const csv = (...rows) => '﻿' + [HDR, ...rows].join('\r\n');
  eq(toIstanbulIso('2026-10-14 15:30'), { iso: '2026-10-14T15:30:00+03:00', timeAssumed: false }, 'J1: تاريخ ووقت');
  eq(toIstanbulIso('2026/10/04'), { iso: '2026-10-04T12:00:00+03:00', timeAssumed: true }, 'J2: تاريخ بلا وقت ← 12:00 ومعلَّم «مفترض» (لا دقة مزيّفة)');
  eq([toIstanbulIso('2026-13-01 10:00'), toIstanbulIso('غدا'), toIstanbulIso('2026-10-14 25:00'), toIstanbulIso('')], [null, null, null, null], 'J3: تواريخ غير صالحة ← null');
  const good = buildConfirmationPayload(csv('"SL-1","syria","2026-10-14 15:30","كشف السائق/المندوب","كشف 14/10 ص3",""', '"SL-2","syria","2026-10-15","ورقة/جدول التسليم","ورقة التسليم 15/10","ملاحظة"', '"UAE-3","uae","","","",""'));
  eq([good.payload.length, good.skipped, good.errors.length, good.assumedTime], [2, 1, 0, 1], 'J4: صفان صالحان + صف غير معبّأ يُتجاوز + وقت مفترض واحد');
  eq(good.payload[0], { order_code: 'SL-1', delivered_at: '2026-10-14T15:30:00+03:00', basis: 'driver_report', evidence_ref: 'كشف 14/10 ص3' }, 'J5: الحمولة تطابق صيغة confirm_order_deliveries');
  ok(/افتُرض 12:00/.test(good.payload[1].note) && /ملاحظة/.test(good.payload[1].note), 'J6: ملاحظة الوقت المفترض تُلحق بملاحظة المستخدم');
  eq(buildConfirmationPayload(csv('"SL-9","syria","2026-10-14 15:30","carrier_record","تتبع الكرم 123",""')).payload[0].basis, 'carrier_record', 'J7: قيمة الأساس بالإنجليزية مقبولة');
  const bads = buildConfirmationPayload(csv('"A","x","2026-10-14 15:30","تخمين","مستند طويل",""', '"B","x","2026-10-14 15:30","كشف السائق/المندوب","ab",""', '"C","x","","كشف السائق/المندوب","مستند طويل",""', '"D","x","كذا","كشف السائق/المندوب","مستند طويل",""', '"","x","2026-10-14 15:30","كشف السائق/المندوب","مستند طويل",""', '"E","x","2026-10-14 15:30","كشف السائق/المندوب","مستند طويل",""', '"E","x","2026-10-14 15:30","كشف السائق/المندوب","مستند طويل",""'));
  eq(bads.payload.map((p) => p.order_code), ['E'], 'J8: الصحيح الوحيد E (الأول من المكرر)');
  eq(bads.errors.map((e) => e.line), [2, 3, 4, 5, 6, 8], 'J9: كل خطأ برقم سطره (أساس مجهول، مستند قصير، تاريخ ناقص، تاريخ غير مفهوم، رمز فارغ، رمز مكرر)');
  ok(bads.errors.every((e) => e.error.length > 3), 'J10: كل خطأ برسالة مقروءة');
  eq(buildConfirmationPayload('رقم الطلب\n').errors[0].error, 'الملف فارغ أو بلا صفوف', 'J11: ملف بلا صفوف');
  ok(/أعمدة ناقصة/.test(buildConfirmationPayload('"a","b"\r\n"1","2"').errors[0].error), 'J12: أعمدة ناقصة تُرفض');
  eq(parseCsv('﻿"a ""b""","c\nd"\r\n1,2').slice(0, 1), [['a "b"', 'c\nd']], 'J13: CSV: اقتباس مضاعف وسطر داخل حقل وBOM');
}


// ───────── د) عدة ملفات (ورقة لكل فريق) ─────────
{
  const H2 = '"رقم الطلب","تاريخ التسليم المؤكَّد (YYYY-MM-DD HH:MM بتوقيت إسطنبول)","أساس التأكيد","المستند/المرجع","ملاحظة"';
  const f = (name, ...rows) => ({ name, text: [H2, ...rows].join('\r\n') });
  const ok1 = '"A-1","2026-10-14 15:30","كشف السائق/المندوب","كشف 14/10",""';
  const many = buildConfirmationPayloadMany([f('syria.csv', ok1, '"A-2","","","",""'), f('uae.csv', '"B-1","2026-10-15 10:00","ورقة/جدول التسليم","ورقة 15/10",""')]);
  eq([many.payload.map((p) => p.order_code), many.skipped, many.errors.length], [['A-1', 'B-1'], 1, 0], 'K1: ملفان ← حمولة واحدة بترتيب الملفات + غير المعبّأ يُتجاوز');
  eq(many.perFile.map((x) => [x.name, x.valid, x.skipped, x.errors]), [['syria.csv', 1, 1, 0], ['uae.csv', 1, 0, 0]], 'K2: إحصاء كل ملف');
  const dup = buildConfirmationPayloadMany([f('one.csv', ok1), f('two.csv', ok1.replace('كشف 14/10', 'كشف آخر'))]);
  eq([dup.payload.length, dup.errors.length], [1, 1], 'K3: الطلب المكرر بين ملفين ← يُقبل الأول ويُرفض الثاني');
  ok(/مكرر بين الملفات \(أولاً في one\.csv\)/.test(dup.errors[0].error) && dup.errors[0].file === 'two.csv', 'K4: رسالة الخطأ تسمّي الملفين');
  const mixed = buildConfirmationPayloadMany([f('good.csv', ok1), f('bad.csv', '"C-1","كذا","كشف السائق/المندوب","مستند طويل",""')]);
  eq([mixed.payload.length, mixed.errors.map((e) => `${e.file}:${e.line}`)], [1, ['bad.csv:2']], 'K5: خطأ بملف لا يُسقط صحيح الملف الآخر، ويُنسب لملفه وسطره');
  eq(buildConfirmationPayloadMany([]).payload, [], 'K6: بلا ملفات ← حمولة فارغة');
}

// تحصين الاستيراد (D-179): أرقام عربية، ثوانٍ، تقويم حقيقي، فاصلة منقوطة، تسامح بأسماء الأساس
{
  eq(toIstanbulIso('٢٠٢٦-١٠-١٤ ١٥:٣٠'), { iso: '2026-10-14T15:30:00+03:00', timeAssumed: false }, 'L1: أرقام عربية');
  eq(toIstanbulIso('2026-10-14 15:30:45'), { iso: '2026-10-14T15:30:00+03:00', timeAssumed: false }, 'L2: ثوانٍ تُقبل وتُهمل');
  eq(toIstanbulIso('2026-02-31'), null, 'L3: 31 شباط مرفوض');
  eq(toIstanbulIso('2026-10-14 24:00'), null, 'L4: الساعة 24 مرفوضة');
  eq(toIstanbulIso('14-10-2026'), null, 'L5: صيغة يوم-شهر-سنة مرفوضة (غموض)');
  const semi = 'رقم الطلب;تاريخ التسليم المؤكَّد;أساس التأكيد;المستند / المرجع\nSL-1;2026-10-14 10:00;كشف السائق/ المندوب;ورقة 3\nSL-2;٢٠٢٦-١٠-١٤;تقرير شركة الشحن;كشف ٥\n';
  const r = buildConfirmationPayload(semi);
  eq(r.payload.length, 2, 'L6: فاصلة منقوطة + تسامح مسافات الأساس ← صفّان صالحان');
  eq(r.errors.length, 0, 'L6: بلا أخطاء');
  eq(buildConfirmationPayload('رقم الطلب\tتاريخ التسليم المؤكَّد\tأساس التأكيد\tالمستند\nSL-9\t2026-10-14 10:00\tmستند آخر\tوثيقة 1\n'.replace('m', 'م')).payload.length, 1, 'L7: فاصل Tab');
}
console.log(`\nنتيجة: ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
