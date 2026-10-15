/* eslint-env node */
// لوحة الميديا باير v2 — منطق نقي (ميزانية يومية ₺، تكلفة التأكيد، الالتزام بالأسماء،
// حفظ نتائج الإعلانات المخفية). Run: node test-media-buyer-metrics.mjs
import { build } from 'esbuild';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('FAIL:', m); } };
const root = process.cwd();
const out = path.join(process.env.TEMP || '.', 'mb_metrics_bundle.mjs');
await build({ entryPoints: [path.join(root, 'src/services/mediaBuyerMetrics.js')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
const m = await import(pathToFileURL(out).href);

// ── أيام ──
ok(m.daysInclusive('2026-10-01', '2026-10-01') === 1, 'same day = 1');
ok(m.daysInclusive('2026-10-01', '2026-10-15') === 15, '1..15 = 15');
ok(m.daysInclusive('2026-10-05', '2026-10-01') === 0, 'reversed = 0');
ok(m.daysInclusive('2026-02-27', '2026-03-02') === 4, 'month boundary');
ok(m.toISODate('2026-10-03') === '2026-10-03', 'iso passthrough');
ok(m.toISODate(null) === null, 'null date');

// ── موقوفة؟ ──
ok(m.isPaused({ is_active: false, status: 'active' }), 'is_active false = paused');
ok(m.isPaused({ is_active: true, status: 'ended' }), 'status ended = paused');
ok(!m.isPaused({ is_active: true, status: 'active' }), 'active');
ok(!m.isPaused({ is_active: null, status: 'active' }), 'null is_active = active');

// ── أيام التشغيل والإنفاق ──
const TODAY = '2026-10-15';
const running = { is_active: true, status: 'active', created_at: '2026-10-10', daily_budget_try: 100 };
ok(m.activeDaysInRange(running, '2026-10-01', '2026-10-31', TODAY) === 6, 'created 10th → today 15th = 6 days (future days not counted)');
ok(m.budgetSpendTry(running, '2026-10-01', '2026-10-31', TODAY) === 600, '100₺ × 6 = 600');
ok(m.budgetSpendTry(running, '2026-10-15', '2026-10-15', TODAY) === 100, 'today only = 1 day budget');
ok(m.budgetSpendTry(running, '2026-09-01', '2026-09-30', TODAY) === 0, 'before creation = 0');
const pausedAt12 = { is_active: false, status: 'paused', created_at: '2026-10-01', paused_at: '2026-10-12T09:30:00', daily_budget_try: 50 };
ok(m.activeDaysInRange(pausedAt12, '2026-10-01', '2026-10-31', TODAY) === 12, 'paused on 12th → 12 days incl. pause day');
ok(m.budgetSpendTry(pausedAt12, '2026-10-13', '2026-10-15', TODAY) === 0, 'after pause = 0 spend');
const pausedNoDate = { is_active: false, created_at: '2026-01-01', daily_budget_try: 200 };
ok(m.budgetSpendTry(pausedNoDate, '2026-10-01', '2026-10-15', TODAY) === 0, 'paused w/o date → no invented spend');
ok(m.budgetSpendTry({ ...running, daily_budget_try: null }, '2026-10-01', '2026-10-15', TODAY) === 0, 'no budget = 0');
ok(m.budgetSpendTry({ ...running, daily_budget_try: '75.5' }, '2026-10-15', '2026-10-15', TODAY) === 75.5, 'string numeric budget');
ok(m.budgetSpendTry({ ...running, created_at: null }, '2026-10-14', '2026-10-15', TODAY) === 200, 'no created_at → range start');

// ── تكلفة التأكيد ──
ok(m.costPerConfirmation(600, 12) === 50, '600/12 = 50');
ok(m.costPerConfirmation(100, 3) === 33.33, 'rounded 2dp');
ok(m.costPerConfirmation(600, 0) === null, 'no confirmations → null');
ok(m.costPerConfirmation(0, 5) === null, 'no spend → null');

// ── الالتزام بالأسماء ──
const reports = [
  { employee_name: 'أماني', report_date: '2026-10-13' },
  { employee_name: 'أماني', report_date: '2026-10-14' },
  { employee_name: 'أماني', report_date: '2026-10-15' },
  { employee_name: 'أماني', report_date: '2026-10-15' }, // مكرّر تاريخي — يُعدّ يوماً واحداً
  { employee_name: 'ريم', report_date: '2026-10-13' },
  { employee_name: 'غريبة', report_date: '2026-10-15' }, // غير مكلّفة — لا تظهر
];
const d = m.complianceDetail({ expected: ['أماني', 'ريم', 'سارة', 'ريم'], reports, from: '2026-10-13', to: '2026-10-15', today: TODAY });
ok(d.todayInRange === true && d.required === 3, 'range includes today, 3 days');
ok(d.rows.length === 3, 'dedup expected names, outsiders excluded');
const byName = Object.fromEntries(d.rows.map(r => [r.name, r]));
ok(byName['أماني'].reported === 3 && byName['أماني'].rate === 100 && byName['أماني'].committed, 'أماني 3/3 committed');
ok(byName['ريم'].reported === 1 && !byName['ريم'].committed && byName['ريم'].lastDate === '2026-10-13', 'ريم 1/3, not today');
ok(byName['سارة'].reported === 0 && byName['سارة'].lastDate === null && !byName['سارة'].committed, 'سارة never');
ok(d.committed.map(r => r.name).join() === 'أماني', 'committed list');
ok(d.notCommitted.length === 2 && d.rows[0].rate <= d.rows[d.rows.length - 1].rate, 'worst first');
// فترة سابقة (اليوم خارجها) ⇒ المعيار 80%
const past = m.complianceDetail({ expected: ['أماني', 'ريم'], reports: [
  ...['01', '02', '03', '04'].map(x => ({ employee_name: 'أماني', report_date: '2026-09-' + x })),
  { employee_name: 'ريم', report_date: '2026-09-01' },
], from: '2026-09-01', to: '2026-09-05', today: TODAY });
ok(!past.todayInRange && past.required === 5, 'past range');
ok(past.rows.find(r => r.name === 'أماني').committed, '4/5 = 80% committed');
ok(!past.rows.find(r => r.name === 'ريم').committed, '1/5 not committed');
// فترة مستقبلية جزئياً: المطلوب حتى اليوم فقط
ok(m.complianceDetail({ expected: ['x'], reports: [], from: '2026-10-14', to: '2026-10-31', today: TODAY }).required === 2, 'required capped at today');

// ── أرقام اليوم لكل حملة ──
const ts = m.todayStatsByCampaign([
  { report_id: 'r1', campaign_id: 'c1', messages: 10, confirmations: 2 },
  { report_id: 'r2', campaign_id: 'c1', messages: 5, confirmations: 1 },
  { report_id: 'old', campaign_id: 'c1', messages: 99, confirmations: 9 },
  { report_id: 'r1', campaign_id: 'c2', messages: 3, confirmations: 0 },
], new Set(['r1', 'r2']));
ok(ts.c1.messages === 15 && ts.c1.confirmations === 3, 'c1 today only');
ok(ts.c2.messages === 3 && !ts.c3, 'c2 + missing campaign');

// ── حفظ نتائج الإعلانات المخفية (البند 2) ──
const loaded = [
  { ad_id: 'a1', campaign_id: 'c1', messages: 4, confirmations: 1, amount_try: 500, currency: 'TRY', notes: 'n', image_urls: ['u'] },
  { ad_id: 'a2', campaign_id: 'c1', messages: 7, confirmations: 2, amount_try: 900, currency: 'TRY' },
];
const kept = m.preservedHiddenResults(loaded, new Set(['a1']));
ok(kept.length === 1 && kept[0].ad_id === 'a2', 'only hidden ad preserved');
ok(kept[0].messages === 7 && kept[0].confirmations === 2 && kept[0].amount_try === 900, 'values intact');
ok(kept[0].image_urls.length === 0 && kept[0].star_rating === null, 'defaults');
ok(m.preservedHiddenResults(loaded, new Set(['a1', 'a2'])).length === 0, 'all visible → nothing extra');
ok(m.preservedHiddenResults(loaded, new Set()).length === 2, 'ads not loaded yet → keep everything (no loss)');

console.log(`media-buyer-metrics: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
