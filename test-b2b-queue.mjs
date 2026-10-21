/* eslint-env node */
// طابور العمل لليدز B2B (حالة البطاقة · الخطوة التالية · الزر الرئيسي · شريط اليوم) — منطق نقي. Run: node test-b2b-queue.mjs
import { build } from 'esbuild';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('FAIL:', m); } };
const root = process.cwd();
const out = path.join(process.env.TEMP || '.', 'b2b_queue_bundle.mjs');
await build({ entryPoints: [path.join(root, 'src/services/b2bQueue.js')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent', define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'stub', setup(b) {
    b.onResolve({ filter: /.*/ }, (x) => (x.kind === 'import-statement' && /^[@a-z]/i.test(x.path) && !/^[a-z]:/i.test(x.path) ? { path: x.path, namespace: 'stub' } : undefined));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const supabase = {}; export const createClient = () => ({}); export default {};', loader: 'js' }));
  } }] });
const Q = await import(pathToFileURL(out).href);
const M = await import(pathToFileURL((await (async () => {
  const o2 = path.join(process.env.TEMP || '.', 'b2b_queue_model_bundle.mjs');
  await build({ entryPoints: [path.join(root, 'src/services/b2bModel.js')], bundle: true, format: 'esm', platform: 'node', outfile: o2, logLevel: 'silent' });
  return o2;
})())).href);

const NOW = Date.now();
const day = (n) => new Date(NOW - n * 86400000).toISOString();
const base = { status: 'not_contacted', priority: 'C', score: 35, lead_type: 'online', discovered_at: day(30), last_verified_at: day(1), created_at: day(30), verified: 'verified_single_source', source_urls: 'https://example.com/a' };
const marketplace = { ...base, id: 'm1', name: 'Platform', category: 'منصة متعددة البائعين', channel: 'marketplace', website: 'https://platform.example', accepts_sellers: null, lowes_presence: 'unverified' };
const marketOpen = { ...marketplace, id: 'm2', accepts_sellers: true, sells_beauty: true, email: 'sell@platform.example' };
const pharmacy = { ...base, id: 'p1', lead_type: 'physical', name: 'Pharm', category: 'صيدلية', whatsapp: '0911', whatsapp_link: 'https://wa.me/963911', priority: 'B' };
const noContact = { ...base, id: 'n1', lead_type: 'physical', name: 'NoContact', category: 'صيدلية' };
const waiting = { ...pharmacy, id: 'w1', status: 'contacted', status_updated_at: day(1), assigned_to: 'ديانا' };
const follow = { ...pharmacy, id: 'f1', status: 'contacted', status_updated_at: day(6) };
const weak = { ...marketOpen, id: 'k1', verified: 'discovered_unconfirmed', source_urls: '' };
const as = (l) => M.assess(l, NOW);

// ── حالة البطاقة
ok(Q.cardStatusOf(marketplace, as(marketplace)).ar === 'لم نبدأ التسجيل', 'channel unverified presence -> لم نبدأ التسجيل');
ok(Q.cardStatusOf({ ...marketplace, lowes_presence: 'listed' }, as({ ...marketplace, lowes_presence: 'listed' })).ar === 'نحن موجودون ✓', 'listed');
ok(Q.cardStatusOf({ ...marketplace, lowes_presence: 'in_talks' }).ar === 'قيد الاتفاق', 'in_talks');
ok(Q.cardStatusOf(pharmacy).ar === 'لم نتواصل', 'local not contacted');
ok(Q.cardStatusOf(waiting).ar === 'تم التواصل', 'local contacted');
ok(!/مشتق|غير متحقق/.test(JSON.stringify(['listed', 'in_talks', 'contacted', 'rejected', 'not_applicable', 'unverified', 'not_listed'].map((p) => Q.cardStatusOf({ ...marketplace, lowes_presence: p }).ar))), 'card status never says مشتقة/غير متحقق');

// ── الخطوة التالية
ok(Q.stepOf(marketplace, as(marketplace), NOW).key === 'verify_sellers', 'platform with unknown seller acceptance -> verify first');
ok(Q.stepOf(marketOpen, as(marketOpen), NOW).key === 'start_signup', 'platform accepting sellers -> start signup');
ok(Q.stepOf(pharmacy, as(pharmacy), NOW).key === 'contact_now', 'pharmacy keeps contact_now');
ok(Q.stepOf(noContact, as(noContact), NOW).key === 'find_contact', 'no contact path -> find_contact');
ok(Q.stepOf(follow, as(follow), NOW).key === 'follow_up', 'contacted 6 days -> follow_up');
ok(Q.stepOf(weak, as(weak), NOW).key === 'verify_first', 'weak source + contact path -> verify then contact');

// ── العائق
ok(Q.blockerOf(noContact, as(noContact)) === 'لا وسيلة تواصل مسجّلة', 'blocker: no contact path');
ok(Q.blockerOf(pharmacy, as(pharmacy)) === '', 'no blocker when contactable');
ok(/بائعين/.test(Q.blockerOf({ ...marketplace, accepts_sellers: false }, as({ ...marketplace, accepts_sellers: false }))), 'blocker: platform refuses sellers');

// ── الزر الرئيسي (روابط فقط، لا إرسال)
const wa = 'https://wa.me/963911';
const pa = Q.primaryActionOf(pharmacy, Q.stepOf(pharmacy, as(pharmacy), NOW), wa);
ok(pa.kind === 'link' && pa.href === wa, 'pharmacy -> whatsapp link');
ok(Q.primaryActionOf(noContact, Q.stepOf(noContact, as(noContact), NOW), null).kind === 'details', 'no contact -> details');
ok(Q.primaryActionOf(waiting, Q.stepOf(waiting, as(waiting), NOW), wa).kind === 'details', 'waiting -> details (no nagging contact link)');
const pm = Q.primaryActionOf(marketplace, Q.stepOf(marketplace, as(marketplace), NOW), null);
ok(pm.kind === 'link' && pm.href === 'https://platform.example', 'verify sellers -> open website');
ok(Q.primaryActionOf(marketOpen, Q.stepOf(marketOpen, as(marketOpen), NOW), null).href === 'mailto:sell@platform.example', 'platform without wa/phone -> email');
ok(Q.primaryActionOf({ ...base, name: 'x' }, { key: 'contact_now' }, null).kind === 'details', 'nothing to link -> details');

// ── الشريط
const leads = [marketplace, marketOpen, pharmacy, noContact, waiting, follow, weak];
const assessed = new Map(leads.map((l) => [l.id, as(l)]));
const bar = Object.fromEntries(Q.queueBar(leads, assessed).map((x) => [x.key, x.count]));
ok(bar.today >= 2, `today bar counts actionable (got ${bar.today})`);
ok(bar.waiting === 1, `waiting bar = 1 (got ${bar.waiting})`);
ok(bar.no_owner >= 1, `no_owner counts follow_up w/o owner (got ${bar.no_owner})`);
ok(Q.QUEUE_FILTERS.length === 4, '4 bar filters');
ok(Q.queueFilterByKey('waiting').test(waiting, as(waiting)) && !Q.queueFilterByKey('waiting').test(pharmacy, as(pharmacy)), 'waiting filter test');
ok(Q.queueFilterByKey('verify').test(weak, as(weak)) && !Q.queueFilterByKey('verify').test(marketOpen, as(marketOpen)), 'verify filter = weak sources only');
ok(Q.queueFilterByKey('nope') === null, 'unknown filter -> null');

// ── تسمية «بدها مسؤول» (المنطق لم يتغيّر: نشِط/بانتظار رد وبلا مسؤول فقط؛ ليس «كل الجهات بلا مسؤول»)
const noOwnerF = Q.queueFilterByKey('no_owner');
ok(noOwnerF.ar === 'بدها مسؤول', 'bar label is بدها مسؤول');
ok(!Q.QUEUE_FILTERS.some((f) => f.ar === 'بلا مسؤول'), 'old bar label gone');
ok(noOwnerF.test(follow, as(follow)), 'actionable lead without owner counts');
ok(!noOwnerF.test(waiting, as(waiting)), 'lead with an owner does not count');
ok(!noOwnerF.test(noContact, as(noContact)), 'non-actionable unowned lead is not counted (differs from the all-leads advanced filter)');
ok(M.viewByKey('no_owner').ar === 'بلا مسؤول' && M.viewByKey('no_owner').test(noContact, NOW), 'advanced filter keeps its own label and all-unowned meaning');

// ── topPick
const sorted = [waiting, marketOpen, follow];
ok(Q.topPick(sorted, assessed).id === 'm2', 'topPick skips waiting, picks first actionable');
ok(Q.topPick([waiting], assessed) === null, 'topPick null when nothing actionable');

// ── تمييز النوع
for (const t of Object.keys(M.ORG_TYPES)) ok(!!Q.ORG_ACCENT[t], `accent defined for ${t}`);
ok(new Set(Object.values(Q.ORG_ACCENT)).size === Object.keys(Q.ORG_ACCENT).length, 'accent colors are all distinct');

console.log(`b2b-queue: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
