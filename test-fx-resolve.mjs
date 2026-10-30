/* global process */
// FX S1b: المحلّل الشهري fxResolve + خدمة القراءة fxRatesService، مع اختبار تكافؤ حيّ مع دالة القاعدة fx_rate_for/fx_unit_for (PGlite + ملفات S0/S1a الحقيقية).
// run: node test-fx-resolve.mjs
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import path from 'node:path';
import { monthKey, unitFor, resolveRate, convertToUsd, summarizeConversion } from './src/utils/fxResolve.js';

// PGlite is not a declared dependency (CI installs from package-lock): the live SQL-parity block runs only where it is installed and says so when skipped.
let PGlite = null;
try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { /* skipped below */ }

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.error('FAIL', m); } };
const near = (a, b, m, eps = 0.005) => ok(Math.abs(Number(a) - b) <= eps, `${m} (got ${a}, want ${b})`);

const D = 'delivery_accounting';
const row = (currency, month, rate, extra = {}) => ({ purpose: D, currency, units_per_usd: rate, period_month: month, market: null, currency_unit: 'current', status: 'confirmed', source: 'test', created_at: '2026-10-30T00:00:00Z', ...extra });
const ROWS = [
  row('TRY', '2026-08-01', 48), row('TRY', '2026-09-01', 46.8), row('TRY', '2026-10-01', 50),
  row('SYP', '2026-08-01', 131), row('SYP', '2026-09-01', 131), row('SYP', '2026-10-01', 140),
  row('AED', '2026-08-01', 3.6725), row('AED', '2026-09-01', 3.6725), row('AED', '2026-10-01', 3.6725),
  { ...row('TRY', null, 33), period_month: null },                       // نسخة S0 تاريخية: تُهمَل
  { ...row('TRY', '2026-11-01', 99), status: 'superseded' },             // مُستبدَلة: لا تُستعمل ولا تُرحَّل
  { ...row('TRY', '2026-11-01', 77), currency_unit: 'legacy' },          // وحدة قديمة: لا تُستعمل
  { ...row('TRY', '2026-10-01', 49.5), purpose: 'profitability' },       // غرض آخر: لا يتداخل
];
const UNITS = [
  { currency: 'SYP', unit: 'legacy', valid_from: '2000-01-01', valid_to: '2025-12-31', status: 'confirmed' },
  { currency: 'SYP', unit: 'current', valid_from: '2026-01-01', valid_to: null, status: 'confirmed' },
];

// ── monthKey (توقيت إسطنبول)
ok(monthKey('2026-10-31T22:30:00Z') === '2026-11-01', 'منتصف ليل إسطنبول: 31/10 22:30 UTC = 1 نوفمبر');
ok(monthKey('2026-10-31T20:59:59Z') === '2026-10-01', '31/10 20:59 UTC لا يزال أكتوبر');
ok(monthKey('2026-10-17') === '2026-10-01' && monthKey(new Date('2026-09-30T12:00:00Z')) === '2026-09-01', 'تاريخ بلا وقت / كائن Date');
ok(monthKey(null) === null && monthKey('garbage') === null, 'تاريخ غير مفهوم = null');

// ── resolveRate
let r = resolveRate(ROWS, { purpose: D, currency: 'TRY', month: '2026-09-15' });
ok(r && r.unitsPerUsd === 46.8 && r.exact === true, 'سبتمبر = 46.8 مؤكَّد (لا سعر اليوم)');
r = resolveRate(ROWS, { purpose: D, currency: 'AED', month: '2026-09-02' });
ok(r && r.unitsPerUsd === 3.6725 && r.exact, 'الدرهم له صف صريح (D3)');
r = resolveRate(ROWS, { purpose: D, currency: 'TRY', month: '2026-12-10' });
ok(r && r.unitsPerUsd === 50 && r.exact === false && r.periodMonth === '2026-10-01', 'ديسمبر يُرحَّل من أكتوبر المؤكَّد، لا من نوفمبر المُستبدَل/القديم الوحدة');
ok(resolveRate(ROWS, { purpose: D, currency: 'TRY', month: '2026-07-15' }) === null, 'يوليو قبل أول سعر مؤكَّد = لا سعر');
ok(resolveRate(ROWS, { purpose: D, currency: 'EUR', month: '2026-10-01' }) === null, 'عملة بلا أي صف = لا سعر (لا افتراضي)');
ok(resolveRate(ROWS, { purpose: 'payroll', currency: 'TRY', month: '2026-10-01' }) === null, 'غرض بلا صفوف = لا سعر');
r = resolveRate(ROWS, { purpose: 'profitability', currency: 'TRY', month: '2026-10-05' });
ok(r && r.unitsPerUsd === 49.5, 'غرض الربحية مستقل (49.5) عن محاسبة التسليم (50)');
ok(resolveRate([{ ...row('TRY', '2026-10-01', 0) }], { purpose: D, currency: 'TRY', month: '2026-10-01' }) === null, 'سعر صفر مرفوض');
ok(resolveRate([{ ...row('TRY', '2026-10-01', 'abc') }], { purpose: D, currency: 'TRY', month: '2026-10-01' }) === null, 'سعر غير رقمي مرفوض');
const mk = [row('TRY', '2026-10-01', 50), row('TRY', '2026-10-01', 51, { market: 'turkey' })];
ok(resolveRate(mk, { purpose: D, currency: 'TRY', month: '2026-10-09', market: 'turkey' }).unitsPerUsd === 51, 'سعر خاص بالسوق يتغلّب على العام بنفس الشهر');
ok(resolveRate(mk, { purpose: D, currency: 'TRY', month: '2026-10-09', market: 'syria' }).unitsPerUsd === 50, 'سوق آخر يأخذ العام');
const mk2 = [row('TRY', '2026-09-01', 49, { market: 'turkey' }), row('TRY', '2026-10-01', 50)];
ok(resolveRate(mk2, { purpose: D, currency: 'TRY', month: '2026-10-09', market: 'turkey' }).unitsPerUsd === 50, 'العام لشهر أحدث يتغلّب على الخاص المُرحَّل');

// ── unitFor
ok(unitFor('SYP', '2025-11-15', UNITS) === 'legacy' && unitFor('SYP', '2026-01-01', UNITS) === 'current' && unitFor('SYP', '2025-12-31', UNITS) === 'legacy', 'حدود الوحدة (31/12/2025 قديمة، 1/1/2026 حالية)');
ok(unitFor('TRY', '2025-11-15', UNITS) === 'current' && unitFor('SYP', null, UNITS) === 'current', 'عملة بلا تعريف/تاريخ مجهول = current');

// ── convertToUsd: الحالات الحرجة
let c = convertToUsd({ amount: 1400, currency: 'TRY', date: '2026-10-12', purpose: D }, ROWS, UNITS);
ok(c.status === 'ok' && Math.abs(c.usd - 28) < 1e-9 && c.rate === 50, 'تركي أكتوبر 1400/50 = 28');
c = convertToUsd({ amount: 2000, currency: 'SYP', date: '2026-10-12', unitDate: '2026-10-01', purpose: D }, ROWS, UNITS);
ok(c.status === 'ok' && Math.abs(c.usd - 2000 / 140) < 1e-9, 'سوري أكتوبر 2000/140');
c = convertToUsd({ amount: 120, currency: 'USD', date: '2026-10-12', purpose: D }, [], []);
ok(c.status === 'ok' && c.usd === 120, 'USD لا يحتاج سعراً (حتى لو فشل التحميل: rows فارغة)');
c = convertToUsd({ amount: 2000, currency: 'SYP', date: '2026-10-12', purpose: D }, [], []);
ok(c.status === 'missing' && c.usd === null, 'فشل/غياب الأسعار: SYP غير محوَّل (لا تقدير)');
c = convertToUsd({ amount: 100000, currency: 'SYP', date: '2026-01-05', unitDate: '2025-11-20', purpose: D }, ROWS, UNITS);
ok(c.status === 'unit_legacy' && c.usd === null, 'مبلغ سوري سُجّل بوحدة قديمة (نوفمبر 2025) وسُلّم يناير 2026: لا يُحوَّل بسعر الوحدة الحالية');
c = convertToUsd({ amount: 100000, currency: 'SYP', date: '2025-12-20', purpose: D }, ROWS, UNITS);
ok(c.status === 'unit_legacy', 'بلا unitDate تُستعمل date');
c = convertToUsd({ amount: 500, currency: 'TRY', date: '2026-12-05', purpose: D }, ROWS, UNITS);
ok(c.status === 'carried' && c.periodMonth === '2026-10-01' && Math.abs(c.usd - 10) < 1e-9, 'شهر بلا سعر: مُرحَّل (تقديري) من أكتوبر');
for (const bad of [null, '', 'abc', NaN, undefined]) ok(convertToUsd({ amount: bad, currency: 'TRY', date: '2026-10-12', purpose: D }, ROWS, UNITS).status === 'invalid', `مبلغ غير صالح (${String(bad)}) = invalid لا صفر`);
ok(convertToUsd({ amount: 0, currency: 'TRY', date: '2026-10-12', purpose: D }, ROWS, UNITS).usd === 0, 'مبلغ صفر صالح = 0');

// ── summarizeConversion: مؤكَّد وتقديري منفصلان، غير المحوَّل لا يدخل مجموعاً، التقريب مرة واحدة
const mix = [
  { amount: 1400, currency: 'TRY', date: '2026-10-05' }, { amount: 2000, currency: 'SYP', date: '2026-10-05' },
  { amount: 500, currency: 'TRY', date: '2026-12-05' }, { amount: 70, currency: 'AED', date: '2026-10-05' },
  { amount: 50, currency: 'EUR', date: '2026-10-05' }, { amount: 100000, currency: 'SYP', date: '2026-01-05', unitDate: '2025-11-20' }, { amount: 'x', currency: 'TRY', date: '2026-10-05' },
];
const s = summarizeConversion(mix, ROWS, UNITS, { purpose: D });
near(s.confirmedUsd, 1400 / 50 + 2000 / 140 + 70 / 3.6725, 'المؤكَّد = تركي+سوري+درهم بأسعار أكتوبر');
near(s.estimatedUsd, 10, 'التقديري منفصل (500 ₺ مُرحَّلة)');
near(s.totalUsd, s.confirmedUsd + s.estimatedUsd, 'الإجمالي = مؤكَّد + تقديري (مجموعان منفصلان يُعرضان)', 0.011);
ok(s.missingCount === 1 && s.missingCurrencies.join() === 'EUR' && s.legacyCount === 1 && s.invalidCount === 1, 'غير المحوَّل مفصَّل: سعر ناقص (EUR) / وحدة قديمة / مبلغ غير صالح');
ok(s.final === false && s.carried.length === 1 && s.carried[0].carriedFrom === '2026-10-01' && s.carried[0].month === '2026-12-01', 'final=false مع تقدير/ناقص، ويُسجَّل مصدر الترحيل');
const clean = summarizeConversion(mix.slice(0, 2), ROWS, UNITS, { purpose: D });
ok(clean.final === true && clean.estimatedUsd === 0, 'بلا تقدير ولا نقص: final=true');
ok(summarizeConversion([], ROWS, UNITS, { purpose: D }).totalUsd === 0, 'قائمة فارغة = 0');
// التقريب: مجموع 754 مبلغ سوري 1000/140 لا ينجرف بتقريب كل طلب (الدرس من فرق 0.15$)
const many = Array.from({ length: 754 }, () => ({ amount: 1000, currency: 'SYP', date: '2026-10-05' }));
near(summarizeConversion(many, ROWS, UNITS, { purpose: D }).totalUsd, 754 * 1000 / 140, 'تجميع 754 طلباً بتقريب واحد نهائي (5385.71)', 0.0051);
ok(Math.abs(754 * Math.round((1000 / 140) * 100) / 100 - 754 * 1000 / 140) > 0.3, 'للمقارنة: التقريب لكل طلب كان سينجرف أكثر من 0.3$ هنا');

// ── اختبارات ذهبية بمجاميع العملات الفعلية للشهرين (أصلية من قاعدة الإنتاج 30/10/2026)
const oct = [{ amount: 544206, currency: 'TRY' }, { amount: 572120, currency: 'SYP' }, { amount: 6230, currency: 'AED' }, { amount: 490, currency: 'USD' }].map((o) => ({ ...o, date: '2026-10-15' }));
near(summarizeConversion(oct, ROWS, UNITS, { purpose: D }).confirmedUsd, 17157.08, 'ذهبي أكتوبر (752 طلباً) = 17,157.08$ بلا أي تقدير', 0.011);
const sep = [{ amount: 690375, currency: 'TRY' }, { amount: 558540, currency: 'SYP' }, { amount: 3500, currency: 'AED' }, { amount: 202, currency: 'USD' }].map((o) => ({ ...o, date: '2026-09-15' }));
const ss = summarizeConversion(sep, ROWS, UNITS, { purpose: D });
near(ss.confirmedUsd, 690375 / 46.8 + 558540 / 131 + 3500 / 3.6725 + 202, 'ذهبي سبتمبر بأسعار سبتمبر (D2) = 20,170.29$', 0.011);
ok(ss.final && ss.missingCount === 0, 'سبتمبر كله مؤكَّد (الدرهم بسعر D3 صريح)');

// ── تكافؤ حيّ مع القاعدة: نفس السيناريوهات عبر fx_rate_for/fx_unit_for الفعلية
if (!PGlite) console.log('SKIPPED: live SQL parity (PGlite not installed here) — run locally before merging');
else {
const read = (f) => readFileSync(`supabase/migrations/${f}`, 'utf8');
const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  create table profiles (id uuid primary key, role_type text, is_active boolean default true);
  insert into profiles values ('00000000-0000-0000-0000-00000000a004','employee',true);
  create function public.current_role_type() returns text language sql stable security definer as $$ select role_type from public.profiles where id = auth.uid() $$;
  create function public.auth_is_active_staff() returns boolean language sql stable security definer as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active) $$;
  grant execute on all functions in schema public to public; grant select on profiles to authenticated;
  create table exchange_rates (id uuid primary key default gen_random_uuid(), from_cur text not null, to_cur text not null, rate numeric not null, set_by uuid, created_at timestamptz not null default now());
  create table payroll_runs (id uuid primary key default gen_random_uuid(), period_year int, period_month int, status text, rate_usd_try numeric, rate_usd_syp numeric, created_at timestamptz default now());
  create table profitability_fx_rates (id uuid primary key default gen_random_uuid(), month date, scope text, currency text, units_per_usd numeric, note text, entered_at timestamptz default now());
  insert into payroll_runs (period_year,period_month,status,rate_usd_try,rate_usd_syp) values (2026,8,'draft',48,131),(2026,9,'draft',46.8,131),(2026,10,'draft',50,140);
`);
await db.exec(read('20261030900000_fx_monthly_rates_s0.sql')); await db.exec(read('20261031000000_fx_s1a_monthly_rate_model.sql'));
const dbRows = (await db.query(`select purpose, currency, units_per_usd::float8 units_per_usd, period_month::text period_month, market, currency_unit, status, source, created_at::text created_at from fx_monthly_rates where status='confirmed' and period_month is not null`)).rows;
const dbUnits = (await db.query(`select currency, unit, valid_from::text valid_from, valid_to::text valid_to, status from fx_currency_units`)).rows;
ok(dbRows.length === 9 && dbUnits.length === 2, 'الصفوف الحقيقية من S1a: 9 أسعار شهرية + تعريفا وحدة');
let parity = 0, parityTotal = 0;
for (const [cur, d] of [['TRY', '2026-08-03'], ['TRY', '2026-09-30'], ['TRY', '2026-10-31'], ['TRY', '2026-11-15'], ['TRY', '2026-07-01'], ['SYP', '2026-10-02'], ['SYP', '2026-09-10'], ['SYP', '2027-02-02'], ['AED', '2026-08-01'], ['AED', '2026-12-31'], ['EUR', '2026-10-01']]) {
  parityTotal += 1;
  const sql = (await db.query(`select units_per_usd::float8 r, period_month::text pm, exact from fx_rate_for('${D}','${cur}','${d}',null)`)).rows[0] || null;
  const js = resolveRate(dbRows, { purpose: D, currency: cur, month: d });
  const same = (!sql && !js) || (sql && js && sql.r === js.unitsPerUsd && sql.pm === js.periodMonth && sql.exact === js.exact);
  if (same) parity += 1; else console.error('PARITY DIFF', cur, d, sql, js);
}
ok(parity === parityTotal, `تكافؤ JS ↔ fx_rate_for على ${parityTotal} حالة`);
let up = 0, upTotal = 0;
for (const [cur, d] of [['SYP', '2025-12-31'], ['SYP', '2026-01-01'], ['SYP', '2025-06-01'], ['TRY', '2025-11-01'], ['SYP', '2030-01-01']]) {
  upTotal += 1;
  const sql = (await db.query(`select fx_unit_for('${cur}','${d}') u`)).rows[0].u;
  if (sql === unitFor(cur, d, dbUnits)) up += 1; else console.error('UNIT PARITY DIFF', cur, d, sql);
}
ok(up === upTotal, `تكافؤ JS ↔ fx_unit_for على ${upTotal} حالات`);
}

// ── fxRatesService: خدمة القراءة لا تبتلع الخطأ ولا تخزّن الفشل
const server = await createServer({
  configFile: false, logLevel: 'silent', appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null },
  resolve: { alias: { '@services': path.resolve('src/services') } },
  plugins: [{ name: 'stub-sb', enforce: 'pre', resolveId(s, imp) { return imp && /fxRatesService/.test(imp) && s === './supabase' ? '\0sb' : null; }, load(id) { return id === '\0sb' ? 'export const supabase = {};' : null; } }],
});
try {
  const { loadFxRates, clearFxRatesCache } = await server.ssrLoadModule('/src/services/fxRatesService.js');
  const calls = [];
  const mkClient = (res) => ({ from: (t) => { const q = { t, filters: [] }; calls.push(q); const chain = { select: (c) => { q.cols = c; return chain; }, eq: (k, v) => { q.filters.push(['eq', k, v]); return chain; }, not: (k, op, v) => { q.filters.push(['not', k, op, v]); return chain; }, then: (ok2, bad) => Promise.resolve(res[t]).then(ok2, bad) }; return chain; } });
  clearFxRatesCache();
  let out = await loadFxRates({ client: mkClient({ fx_monthly_rates: { data: [{ currency: 'TRY' }], error: null }, fx_currency_units: { data: [{ currency: 'SYP' }], error: null } }) });
  ok(out.error === null && out.rows.length === 1 && out.units.length === 1, 'خدمة القراءة: نجاح');
  const q = calls.find((x) => x.t === 'fx_monthly_rates');
  ok(q.filters.some((f) => f[0] === 'eq' && f[1] === 'status' && f[2] === 'confirmed') && q.filters.some((f) => f[0] === 'not' && f[1] === 'period_month'), 'تطلب المؤكَّد الشهري فقط (تستثني نسخ S0 والمُستبدَل)');
  const n0 = calls.length; out = await loadFxRates({ client: mkClient({}) });
  ok(calls.length === n0 && out.rows.length === 1, 'ذاكرة قصيرة: لا استعلام ثانٍ');
  clearFxRatesCache();
  out = await loadFxRates({ client: mkClient({ fx_monthly_rates: { data: null, error: { message: 'permission denied' } }, fx_currency_units: { data: [], error: null } }) });
  ok(out.error === 'permission denied' && out.rows.length === 0, 'فشل القراءة يُرجَع كخطأ صريح لا كقائمة فارغة صامتة');
  out = await loadFxRates({ client: mkClient({ fx_monthly_rates: { data: [{ currency: 'TRY' }], error: null }, fx_currency_units: { data: [], error: null } }) });
  ok(out.error === null && out.rows.length === 1, 'الفشل السابق لم يُخزَّن (إعادة المحاولة تنجح)');
} finally { await server.close(); }

console.log(`\nنتيجة: ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
