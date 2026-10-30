/* global process */
// FX S3a: منطق شاشة الأسعار الشهرية + خدمة الحفظ + Migration صفوف الرواتب (PGlite اختياري). run: node test-fx-admin.mjs
import { createServer } from 'vite';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { monthsBack, validateRateInput, missingExactForMonth, buildMonthlyGrid, legacyConsistency, currentMonthKey, FX_CURRENCIES, currenciesFor } from './src/utils/fxRatesAdmin.js';

let PGlite = null;
try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { /* skipped below */ }

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.error('FAIL', m); } };

const row = (purpose, currency, month, rate, extra = {}) => ({ purpose, currency, units_per_usd: rate, period_month: month, market: null, currency_unit: 'current', status: 'confirmed', rate_quality: 'exact', source: 't', created_at: '2026-10-30T00:00:00Z', ...extra });
const ROWS = [row('delivery_accounting', 'TRY', '2026-10-01', 50), row('delivery_accounting', 'SYP', '2026-10-01', 140), row('delivery_accounting', 'TRY', '2026-09-01', 46.8),
  row('delivery_accounting', 'TRY', '2026-03-01', 45.9, { rate_quality: 'approximate' }), row('payroll', 'TRY', '2026-10-01', 50), row('delivery_accounting', 'AED', '2026-10-01', 3.6725, { status: 'superseded' })];

// ── monthsBack / currentMonthKey
ok(monthsBack(3, '2026-10-01').join() === '2026-10-01,2026-09-01,2026-08-01', 'ثلاثة أشهر تنازلياً');
ok(monthsBack(4, '2026-02-01').join() === '2026-02-01,2026-01-01,2025-12-01,2025-11-01', 'عبور السنة');
ok(currentMonthKey(new Date('2026-10-31T21:30:00Z')) === '2026-11-01' && currentMonthKey(new Date('2026-10-31T20:30:00Z')) === '2026-10-01', 'شهر اليوم بتوقيت إسطنبول');

// ── validateRateInput: لا نجاح كاذب، حواجز الأخطاء الشائعة
const v = (o) => validateRateInput({ purpose: 'delivery_accounting', currency: 'TRY', month: '2026-11-01', rate: 50, quality: 'exact', ...o });
ok(v({}).ok && v({}).warnings.length === 0, 'إدخال سليم بلا تحذير');
for (const bad of ['', null, 0, -3, 'abc', NaN]) ok(!v({ rate: bad }).ok, `سعر غير صالح مرفوض (${String(bad)})`);
ok(!v({ currency: 'SYP', rate: 13000 }).ok && /قديمة/.test(v({ currency: 'SYP', rate: 13000 }).errors[0]), 'SYP 13000 (وحدات قديمة) مرفوض برسالة واضحة');
ok(v({ currency: 'SYP', rate: 140 }).ok && !v({ currency: 'SYP', rate: 1.4 }).ok, 'SYP 140 مقبول، 1.4 مرفوض');
ok(!v({ currency: 'TRY', rate: 5000 }).ok && v({ currency: 'TRY', rate: 250 }).warnings.length === 1, 'TRY 5000 مرفوض، 250 تحذير فقط');
ok(v({ currency: 'AED', rate: 3.6725 }).ok && v({ currency: 'AED', rate: 3.6725 }).warnings.length === 0 && v({ currency: 'AED', rate: 4.2 }).warnings.length === 1, 'AED 3.6725 بلا تحذير، 4.2 تحذير');
ok(!v({ purpose: 'payroll', currency: 'AED', rate: 3.6725 }).ok && v({ purpose: 'delivery_accounting', currency: 'AED', rate: 3.6725 }).ok, 'الدرهم مرفوض للرواتب ومقبول لمحاسبة التسليم');
ok(!v({ currency: 'EUR' }).ok && !v({ purpose: 'profitability' }).ok && !v({ purpose: 'nonsense' }).ok, 'عملة/غرض غير مدعومين مرفوضان (الربحية بجدولها الخاص)');
ok(!v({ month: '2026-13' }).ok || !v({ month: 'x' }).ok, 'شهر غير صالح');
ok(!v({ quality: 'guess' }).ok, 'جودة غير معروفة مرفوضة');

// ── missingExactForMonth: التقريبي والمستبدَل والمرحَّل لا تُسقط التذكير
ok(missingExactForMonth(ROWS, 'delivery_accounting', '2026-10-15').join() === 'AED', 'أكتوبر: ينقص AED (صفه مستبدَل)');
ok(missingExactForMonth(ROWS, 'delivery_accounting', '2026-11-03').join() === 'TRY,SYP,AED', 'نوفمبر: لا سعر مؤكَّد لأي عملة رغم وجود مُرحَّل');
ok(missingExactForMonth(ROWS, 'delivery_accounting', '2026-03-10').join() === 'TRY,SYP,AED', 'مارس: التقريبي لا يكفي (مؤكَّد مطلوب)');
ok(missingExactForMonth(ROWS, 'payroll', '2026-10-01').join() === 'SYP,AED', 'غرض الرواتب مستقل');

// الرواتب: TRY وSYP فقط — لا تذكير للدرهم (وجد حيّاً: «الرواتب: AED» ضجيج)
ok(currenciesFor('payroll').join() === 'TRY,SYP' && currenciesFor('delivery_accounting').join() === 'TRY,SYP,AED', 'عملات كل غرض');
ok(missingExactForMonth(ROWS, 'payroll', '2026-10-01', currenciesFor('payroll')).join() === 'SYP', 'تذكير الرواتب لا يطلب الدرهم');

// ── buildMonthlyGrid: الحالات الأربع
const grid = buildMonthlyGrid(ROWS, 'delivery_accounting', ['2026-11-01', '2026-10-01', '2026-03-01', '2026-01-01']);
const cell = (m, c) => grid.find((g) => g.month === m).cells[c];
ok(cell('2026-10-01', 'TRY').state === 'exact' && cell('2026-10-01', 'TRY').rate === 50, 'أكتوبر TRY مؤكَّد 50');
ok(cell('2026-11-01', 'TRY').state === 'carried' && cell('2026-11-01', 'TRY').from === '2026-10-01', 'نوفمبر مُرحَّل من أكتوبر');
ok(cell('2026-03-01', 'TRY').state === 'approximate', 'مارس تقريبي');
ok(cell('2026-01-01', 'TRY').state === 'missing' && cell('2026-10-01', 'AED').state === 'missing', 'يناير لا سعر؛ AED المستبدَل لا يُعرض');
ok(FX_CURRENCIES.every((c) => 'state' in cell('2026-10-01', c)), 'كل عملة لها خلية');

// ── legacyConsistency
const legacy = [{ from_cur: 'USD', to_cur: 'TRY', rate: 50 }, { from_cur: 'USD', to_cur: 'SYP', rate: 131 }];
const dr = legacyConsistency(ROWS, legacy, '2026-10-01');
ok(dr.length === 1 && dr[0].currency === 'SYP' && dr[0].monthly === 140 && dr[0].legacy === 131, 'يكشف تعارض SYP (140 شهري مقابل 131 قديم) ولا يكشف المتطابق TRY');
ok(legacyConsistency(ROWS, [], '2026-10-01').length === 0, 'بلا قديم: لا ضجيج');
ok(legacyConsistency(ROWS, legacy, '2026-03-01').length === 0, 'شهر تقريبي لا يُقارَن (لا مؤكَّد)');

// ── خدمة الحفظ (عميل وهمي)
const server = await createServer({
  configFile: false, logLevel: 'silent', appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null },
  resolve: { alias: { '@services': path.resolve('src/services') } },
  plugins: [{ name: 'stub-sb', enforce: 'pre', resolveId(s, imp) { return imp && /fxRatesService/.test(imp) && s === './supabase' ? '\0sb' : null; }, load(id) { return id === '\0sb' ? 'export const supabase = {};' : null; } }],
});
try {
  const { saveMonthlyRate, loadFxAdminData } = await server.ssrLoadModule('/src/services/fxRatesService.js');
  const calls = [];
  const client = (res) => ({ rpc: (fn, args) => { calls.push({ fn, args }); return Promise.resolve(res); } });
  const id = await saveMonthlyRate({ purpose: 'delivery_accounting', currency: 'TRY', month: '2026-11-15', rate: '50.5', note: ' ملاحظة ', quality: 'exact' }, { client: client({ data: 'uuid-1', error: null }) });
  ok(id === 'uuid-1' && calls[0].fn === 'fx_set_monthly_rate', 'يستدعي الدالة الوحيدة fx_set_monthly_rate');
  ok(calls[0].args.p_month === '2026-11-01' && calls[0].args.p_rate === 50.5 && calls[0].args.p_note === 'ملاحظة' && calls[0].args.p_quality === 'exact' && calls[0].args.p_market === null, 'يطبّع الشهر لأوله والرقم والملاحظة');
  const e1 = await saveMonthlyRate({ purpose: 'payroll', currency: 'SYP', month: '2026-11-01', rate: 140 }, { client: client({ data: null, error: { code: '42501', message: 'fx_set_monthly_rate: admin only' } }) }).then(() => null, (e) => e.message);
  ok(/للأدمن فقط/.test(e1 || ''), 'رفض الصلاحية يظهر برسالة عربية: ' + e1);
  const e2 = await saveMonthlyRate({ purpose: 'payroll', currency: 'SYP', month: '2026-11-01', rate: 140 }, { client: client({ data: null, error: { message: 'connection reset' } }) }).then(() => null, (e) => e.message);
  ok(e2 === 'connection reset', 'خطأ الشبكة يُمرَّر لا يُبتلع');
  const e3 = await saveMonthlyRate({ purpose: 'payroll', currency: 'SYP', month: '2026-11-01', rate: 140 }, { client: client({ data: null, error: null }) }).then(() => null, (e) => e.message);
  ok(/معرّف/.test(e3 || ''), 'نجاح بلا معرّف = فشل صريح (لا نجاح كاذب)');
  // loadFxAdminData: آخر سعر قديم لكل زوج، وخطأ القراءة صريح
  const mkq = (res) => { const q = { select: () => q, not: () => q, order: () => q, then: (a, b) => Promise.resolve(res).then(a, b) }; return q; };
  const cl = (rates, legacy2) => ({ from: (t) => mkq(t === 'fx_monthly_rates' ? rates : legacy2) });
  const okData = await loadFxAdminData({ client: cl({ data: [{ currency: 'TRY' }], error: null }, { data: [{ from_cur: 'USD', to_cur: 'TRY', rate: 50 }, { from_cur: 'USD', to_cur: 'TRY', rate: 40 }], error: null }) });
  ok(okData.rows.length === 1 && okData.legacyLatest.length === 1 && okData.legacyLatest[0].rate === 50 && okData.error === null, 'يقرأ ويُبقي أحدث سعر قديم لكل زوج');
  const bad = await loadFxAdminData({ client: cl({ data: null, error: { message: 'permission denied' } }, { data: [], error: null }) });
  ok(bad.error === 'permission denied' && bad.rows.length === 0, 'فشل القراءة صريح لا قائمة فارغة صامتة');
} finally { await server.close(); }

// ── Migration S3a على PGlite (S0 + S1a + S3a): صفوف الرواتب الشهرية
if (!PGlite) console.log('SKIPPED: S3a SQL (PGlite not installed here) — run locally before merging');
else {
  const read = (f) => readFileSync(`supabase/migrations/${f}`, 'utf8');
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
    create table profiles (id uuid primary key, role_type text, is_active boolean default true);
    create function public.current_role_type() returns text language sql stable security definer as $$ select role_type from public.profiles where id = auth.uid() $$;
    create function public.auth_is_active_staff() returns boolean language sql stable security definer as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active) $$;
    grant execute on all functions in schema public to public;
    create table exchange_rates (id uuid primary key default gen_random_uuid(), from_cur text not null, to_cur text not null, rate numeric not null, set_by uuid, created_at timestamptz not null default now());
    create table payroll_runs (id uuid primary key default gen_random_uuid(), period_year int, period_month int, status text, rate_usd_try numeric, rate_usd_syp numeric, month_setup_confirmed_at timestamptz, created_at timestamptz default now());
    create table profitability_fx_rates (id uuid primary key default gen_random_uuid(), month date, scope text, currency text, units_per_usd numeric, note text, entered_at timestamptz default now());
    insert into payroll_runs (period_year,period_month,status,rate_usd_try,rate_usd_syp,month_setup_confirmed_at) values
      (2026,7,'draft',null,null,null),(2026,8,'draft',48,131,'2026-09-01'),(2026,9,'draft',46.8,131,'2026-10-22'),(2026,10,'draft',50,140,'2026-10-24'),(2026,11,'draft',52,145,null);
    insert into payroll_runs (period_year,period_month,status,rate_usd_try,rate_usd_syp,month_setup_confirmed_at,created_at) values (2026,10,'draft',51,141,null,'2099-01-01');
  `);
  await db.exec(read('20261030900000_fx_monthly_rates_s0.sql')); await db.exec(read('20261031000000_fx_s1a_monthly_rate_model.sql'));
  const hash = async () => (await db.query(`select md5(string_agg(id::text||coalesce(rate_usd_try::text,'')||coalesce(rate_usd_syp::text,'')||coalesce(month_setup_confirmed_at::text,''), ',' order by id)) h from payroll_runs`)).rows[0].h;
  const h0 = await hash();
  const before = (await db.query(`select count(*)::int n from fx_monthly_rates`)).rows[0].n;
  const s0Payroll = (await db.query(`select count(*)::int n from fx_monthly_rates where purpose='payroll' and period_month is null`)).rows[0].n;
const sql = read('20261031100000_fx_s3a_payroll_month_rows.sql');
  ok((await db.exec(sql).then(() => null, (e) => String(e.message))) === null, 'S3a تُطبَّق بلا أخطاء');
  ok((await db.exec(sql).then(() => null, (e) => String(e.message))) === null, 'S3a idempotent');
  const rows = (await db.query(`select currency, period_month::text m, units_per_usd::float8 r, rate_quality q from fx_monthly_rates where purpose='payroll' and period_month is not null order by currency, period_month`)).rows;
  const g = (c, m) => rows.find((x) => x.currency === c && x.m === m)?.r;
  ok(rows.length === 6 && g('TRY', '2026-08-01') === 48 && g('TRY', '2026-09-01') === 46.8 && g('TRY', '2026-10-01') === 50 && g('SYP', '2026-08-01') === 131 && g('SYP', '2026-10-01') === 140, '6 صفوف رواتب شهرية = الأسعار المجمَّدة لآب/أيلول/أكتوبر');
  ok(!rows.some((x) => x.m === '2026-11-01' || x.m === '2026-07-01'), 'دورة نوفمبر غير المثبَّتة ويوليو بلا أسعار لا تُنسخ');
  ok(rows.every((x) => x.q === 'exact'), 'كلها مؤكَّدة (مجمَّدة فعلاً)');
  ok((await db.query(`select count(*)::int n from fx_monthly_rates`)).rows[0].n === before + 6, 'أُضيفت 6 صفوف فقط');
  ok((await hash()) === h0, 'payroll_runs لم تتغير (قراءة فقط)');
  const r = (await db.query(`select units_per_usd::float8 r, exact from fx_rate_for('payroll','TRY','2026-10-20')`)).rows[0];
  ok(r && r.r === 50 && r.exact === true, 'fx_rate_for للرواتب يعمل الآن (أكتوبر 50 مؤكَّد)');
  ok((await db.query(`select * from fx_rate_for('payroll','TRY','2026-07-20')`)).rows.length === 0, 'يوليو بلا سعر رواتب = لا نتيجة');
  ok((await db.query(`select count(*)::int n from fx_monthly_rates where purpose='payroll' and period_month is null`)).rows[0].n === s0Payroll && s0Payroll > 0, 'نسخ S0 التاريخية محفوظة كما هي');
}

console.log(`\nنتيجة: ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
