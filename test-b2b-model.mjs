/* eslint-env node */
// نموذج دخول الأسواق لليدز B2B (b2bModel.js): نوع الجهة ≠ طريقة التعامل، Pipeline + التوافق، 5 تقييمات منفصلة،
// حداثة/جودة المصدر، سلاسل/فروع مشتقّة، تغطية الإمارات والمحافظات (Nationwide منفصل)، لوحة السوق، العروض الجاهزة.
// Run: node test-b2b-model.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('FAIL:', m); } };
const root = process.cwd();
const out = path.join(root, '.tmp-b2b-model.mjs');
const entry = `
  export * as model from './src/services/b2bModel.js';
  export * as countries from './supabase/functions/_shared/countries.js';
`;
await build({ stdin: { contents: entry, resolveDir: root, loader: 'js' }, bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
let m;
try { m = await import(pathToFileURL(out).href + `?t=${Date.now()}`); } finally { fs.unlinkSync(out); }
const { model: M, countries: C } = m;
const NOW = Date.parse('2026-10-12T12:00:00Z');
const day = (n) => new Date(NOW - n * 86400000).toISOString();
const L = (o) => ({ country: 'AE', province: 'Dubai', lead_type: 'physical', status: 'not_contacted', verified: 'verified_single_source', source_urls: 'https://a.example/x', last_verified_at: day(5), ...o });

// ── نوع الجهة: كل توليفات category/channel الموجودة فعلاً بالقاعدة ──
const T = (category, lead_type, channel) => M.orgTypeOf({ category, lead_type, channel });
const cases = [
  ['متجر أونلاين — تجميل', 'online', 'website', 'online_store'], ['متجر أونلاين — تجميل', 'online', 'instagram', 'online_store'],
  ['متجر أونلاين — تجميل', 'online', 'marketplace', 'marketplace'], ['متجر أونلاين — عام', 'online', 'website', 'online_store'],
  ['صيدلية', 'physical', null, 'pharmacy'], ['صيدلية', 'physical', 'website', 'pharmacy'], ['موزّع', 'physical', 'website', 'distributor'],
  ['سلسلة تجميل/صيدليات', 'online', 'website', 'chain'], ['عيادة جلدية', 'physical', null, 'beauty_center'], ['مركز تجميل', 'physical', null, 'beauty_center'],
  ['متجر/مورد مستحضرات', 'physical', null, 'retail_store'], ['منصة متعددة البائعين', 'online', 'marketplace', 'marketplace'],
  ['منصة متعددة البائعين', 'online', 'app', 'marketplace'], ['منصة متعددة البائعين', 'online', 'website', 'marketplace'],
  ['صيدلية أونلاين', 'online', 'app', 'marketplace'], ['صيدلية أونلاين', 'online', 'instagram', 'online_store'], ['صيدلية أونلاين', 'online', 'facebook', 'online_store'],
  ['منصة توصيل سريع', 'online', 'app', 'quick_commerce'],
];
for (const [c, lt, ch, want] of cases) ok(T(c, lt, ch) === want, `orgType(${c}/${lt}/${ch}) = ${want}, got ${T(c, lt, ch)}`);
// Amazon ≠ صيدلية ≠ مركز تجميل ≠ موزّع : ليسوا نفس النوع ولا نفس طريقة التعامل
const amazon = L({ name: 'Amazon.ae', category: 'منصة متعددة البائعين', lead_type: 'online', channel: 'marketplace' });
const pharm = L({ category: 'صيدلية' }), salon = L({ category: 'مركز تجميل' }), dist = L({ category: 'موزّع' });
ok(new Set([amazon, pharm, salon, dist].map(M.orgTypeOf)).size === 4, 'amazon/pharmacy/salon/distributor are 4 different org types');
ok(M.approachOf(amazon) === 'account_opening' && M.approachOf(pharm) === 'direct_outreach' && M.approachOf(dist) === 'distribution', 'approach differs by type: account opening / direct outreach / distribution');
ok(M.trackOf(amazon) === 'channel' && M.trackOf(pharm) === 'local' && M.trackOf(M.orgTypeOf(dist) && dist) === 'local', 'tracks: platform=channel, pharmacy/distributor=local');
ok(M.trackOf(L({ category: 'متجر أونلاين — تجميل', lead_type: 'online', channel: 'website' })) === 'channel', 'online store is a channel opportunity');

// ── Pipeline + طبقة التوافق ──
ok(M.PIPELINE.length === 14 && M.PIPELINE[0] === 'discovered' && M.PIPELINE.includes('first_order') && M.PIPELINE.includes('paused'), 'pipeline has the 14 requested stages');
ok(M.stageOf(L({ verified: 'discovered_unconfirmed' }), NOW) === 'discovered', 'weak source -> discovered');
ok(M.stageOf(L({ website: 'https://x.example' }), NOW) === 'contact_needed', 'verified + contact path -> contact_needed');
ok(M.stageOf(L({}), NOW) === 'qualified', 'verified but no contact path -> qualified');
ok(M.stageOf(L({ status: 'contacted' }), NOW) === 'contacted', 'contacted');
ok(M.stageOf(L({ status: 'interested' }), NOW) === 'replied', 'interested -> replied');
ok(M.stageOf(L({ lowes_presence: 'in_talks' }), NOW) === 'replied', 'in_talks -> replied');
ok(M.stageOf(L({ lowes_presence: 'listed' }), NOW) === 'live', 'listed -> live');
ok(M.stageOf(L({ status: 'customer' }), NOW) === 'first_order', 'customer -> first_order');
ok(M.stageOf(L({ status: 'not_interested' }), NOW) === 'rejected' && M.stageOf(L({ lowes_presence: 'rejected' }), NOW) === 'rejected', 'not_interested / rejected -> rejected');
for (const s of M.PIPELINE) {
  const legacy = M.toLegacyStatus(s);
  ok(legacy === null || ['not_contacted', 'contacted', 'interested', 'not_interested', 'customer'].includes(legacy), `stage ${s}: maps to a legacy value or null`);
  ok(M.isPersistableStage(s) === (legacy !== null), `stage ${s}: persistable flag consistent`);
}
for (const s of M.UNTRACKED_STAGES) ok(M.toLegacyStatus(s) === null, `untracked stage ${s} is never written (needs migration)`);
// الذهاب والإياب: الحالة القديمة -> المرحلة -> الحالة القديمة لا تكسر القيمة
for (const st of ['not_contacted', 'contacted', 'interested', 'not_interested', 'customer']) {
  ok(M.toLegacyStatus(M.stageOf(L({ status: st, website: 'https://x.example' }), NOW)) === st || (st === 'customer'), `legacy round-trip keeps ${st}`);
}

// ── جودة المصدر / الحداثة ──
ok(M.sourceQualityOf(L({ verified: 'verified_multi_source' }), NOW).level === 'strong', 'multi-source -> strong');
ok(M.sourceQualityOf(L({}), NOW).level === 'medium', 'single source -> medium');
ok(M.sourceQualityOf(L({ verified: 'discovered_unconfirmed' }), NOW).level === 'weak', 'unconfirmed -> weak');
ok(M.sourceQualityOf(L({ verified: 'discovered_unconfirmed', website: 'https://shop.example', source_urls: 'https://shop.example/about' }), NOW).level === 'medium', 'own website among sources lifts weak to medium');
ok(M.sourceQualityOf(L({ verified: 'discovered_unconfirmed', source_urls: 'https://a.example/1 | https://b.example/2' }), NOW).level === 'strong', 'two different hosts -> strong');
ok(M.sourceQualityOf(L({ verified: 'closed_or_uncertain', source_urls: 'https://a.example/1 | https://b.example/2' }), NOW).level === 'weak', 'closed_or_uncertain stays weak even with 2 sources');
ok(M.sourceQualityOf(L({ verified: 'verified_multi_source', last_verified_at: day(120) }), NOW).level === 'medium', 'stale strong source is downgraded');
ok(M.sourceQualityOf(L({ verified: null, source_urls: null }), NOW).level === 'unknown', 'no info -> unknown (never assumed good)');
ok(M.sourceQualityOf(L({ verified: 'manual_team_entry', source_urls: null }), NOW).level === 'medium', 'manual team entry -> medium with explicit reason');
ok(M.freshnessOf(L({ last_verified_at: day(30) }), NOW).level === 'fresh' && M.freshnessOf(L({ last_verified_at: day(31) }), NOW).level === 'aging', 'freshness 30/31 boundary');
ok(M.freshnessOf(L({ last_verified_at: day(90) }), NOW).level === 'aging' && M.freshnessOf(L({ last_verified_at: day(91) }), NOW).level === 'stale', 'freshness 90/91 boundary');
ok(M.freshnessOf(L({ last_verified_at: null }), NOW).level === 'unknown', 'no verification date -> unknown, not fresh');
ok(M.sourceQualityOf(L({}), NOW).reasons.length > 0, 'source quality always explains itself');

// ── التقييمات الخمسة منفصلة وكل واحد مفسَّر ──
const a = M.assess(L({ category: 'منصة متعددة البائعين', lead_type: 'online', channel: 'marketplace', accepts_sellers: true, sells_beauty: true, email: 'sellers@x.example', website: 'https://p.example' }), NOW);
ok(['source', 'opportunity', 'ease', 'readiness', 'exec'].every((k) => a[k] && typeof a[k] === 'object'), 'assess returns the 5 separate evaluations');
ok(typeof a.opportunity.value === 'number' && Array.isArray(a.opportunity.reasons) && a.opportunity.reasons.length >= 3, 'opportunity is a number WITH reasons');
ok(a.exec.key === 'today' && a.exec.why.length >= 2, 'strong seller platform with direct contact -> start today, with reasons');
ok(a.readiness.level === 'unknown' && /المستندات/.test(a.readiness.reasons.join(' ')), 'readiness for an account-opening channel is UNKNOWN (docs not recorded), never assumed ready');
ok(a.ease.level === 'high', 'accepts sellers + direct contact -> ease high');
ok(M.opportunityOf(L({ lowes_presence: 'listed' })).value === 0, 'already listed -> no remaining opportunity');
// «تقبل بائعين = لا» يوقف المنصات فقط؛ متجر أونلاين لا يقبل بائعين يبقى فرصة توريد
const noSellerPlatform = L({ category: 'منصة متعددة البائعين', lead_type: 'online', channel: 'marketplace', accepts_sellers: false, website: 'https://p.example' });
ok(M.executionPriorityOf(noSellerPlatform, NOW).key === 'blocked', 'platform that does not accept sellers is blocked');
const noSellerStore = L({ category: 'متجر أونلاين — تجميل', lead_type: 'online', channel: 'instagram', accepts_sellers: false, sells_beauty: true, instagram: '@shop' });
ok(M.executionPriorityOf(noSellerStore, NOW).key !== 'blocked' && !M.opportunityOf(noSellerStore).blocked, 'an online store that "does not accept sellers" is NOT blocked (we can supply it as wholesale)');
ok(M.opportunityOf(L({ sells_beauty: false })).blocked === false, 'does-not-sell-beauty lowers the score but does not block');
// أولويات التنفيذ
ok(M.executionPriorityOf(L({ status: 'contacted', status_updated_at: day(4) }), NOW).key === 'follow_up', 'contacted 4 days ago -> follow_up');
ok(M.executionPriorityOf(L({ status: 'contacted', status_updated_at: day(1) }), NOW).key === 'waiting', 'contacted yesterday -> waiting');
ok(M.executionPriorityOf(L({ category: 'صيدلية' }), NOW).key === 'find_contact', 'no contact path -> find_contact');
ok(M.executionPriorityOf(L({ verified: 'discovered_unconfirmed', source_urls: null, category: 'منصة متعددة البائعين', lead_type: 'online', channel: 'marketplace', accepts_sellers: true, website: 'https://p.example' }), NOW).key === 'verify_first', 'big opportunity but weak source -> verify first');
ok(M.executionPriorityOf(L({ status: 'customer' }), NOW).key === 'done', 'customer -> done');
ok(M.executionPriorityOf(L({ verified: 'closed_or_uncertain' }), NOW).key === 'blocked', 'closed_or_uncertain -> blocked');
for (const l of [a, M.assess(pharm, NOW), M.assess(noSellerStore, NOW), M.assess(L({ status: 'customer' }), NOW)]) ok(l.exec.why.length > 0, 'execution priority always carries a reason');
ok(M.EXEC_RANK.follow_up < M.EXEC_RANK.today && M.EXEC_RANK.today < M.EXEC_RANK.later && M.EXEC_RANK.later < M.EXEC_RANK.blocked, 'exec rank order: follow-up, today, later, blocked');

// صيدلية تبيع عناية + مصدر قوي + قناة مباشرة = ابدأ اليوم؛ نفس الصيدلية بلا معرفة ببيع العناية = لاحقاً (المجهول لا يُفترض)
const phBeauty = L({ category: 'صيدلية', sells_beauty: true, phone: '0431', verified: 'verified_multi_source' });
const phUnknown = L({ category: 'صيدلية', phone: '0431', verified: 'verified_multi_source' });
ok(M.executionPriorityOf(phBeauty, NOW).key === 'today', 'pharmacy that sells skincare + strong source + direct contact -> today');
ok(M.executionPriorityOf(phUnknown, NOW).key === 'later' && /فرصة/.test(M.executionPriorityOf(phUnknown, NOW).why.join(' ')), 'pharmacy with unknown skincare range -> later, with the reason shown');
ok(M.ACT_THRESHOLD === 35, 'one explicit action threshold');

// ── سلسلة أم / فروع مشتقّة ──
const lifeA = L({ id: 'a', name: 'Life Pharmacy - Al Barsha', province: 'Dubai' }), lifeB = L({ id: 'b', name: 'Life Pharmacy (JLT)', province: 'Dubai' }), lifeC = L({ id: 'c', name: 'Life Pharmacy | Sharjah', province: 'Sharjah' });
const other = L({ id: 'd', name: 'Aster Pharmacy' }), syLife = L({ id: 'e', name: 'Life Pharmacy - Damascus', country: 'SY', province: 'Damascus' });
const g = M.chainGroups([lifeA, lifeB, lifeC, other, syLife]);
ok(g.length === 1 && g[0].members.length === 3, 'Life Pharmacy branches group into ONE parent with 3 branches (not 3 separate chains)');
ok(g[0].name === 'Life Pharmacy', 'chain display name is the parent name without the branch');
ok(g[0].regions.includes('Dubai') && g[0].regions.includes('Sharjah'), 'chain group lists its emirates');
ok(!g[0].members.some((x) => x.id === 'e'), 'the same chain name in another country is not merged');
ok(M.chainKeyOf(L({ name: 'Shop', website: 'https://www.instagram.com/shop' })) === null, 'social host never makes a chain');
ok(M.chainKeyOf(L({ name: 'Shop', website: 'https://www.noon.com/uae-en/shop' })) === null, 'marketplace host never makes a chain');
ok(M.chainKeyOf(L({ name: 'Glow', website: 'https://www.glow.ae/dubai' })) === 'host:glow.ae', 'own domain is a chain key');
ok(M.chainGroups([L({ id: 'x', name: 'Solo Store' }), L({ id: 'y', name: 'Another Store' })]).length === 0, 'unrelated names do not group');

// ── التغطية: الإمارات السبع + العين، المحافظات الـ14، Nationwide منفصل ──
const AE = C.COUNTRIES.AE, SY = C.COUNTRIES.SY;
ok(AE.regions.length === 7 && SY.regions.length === 14, 'config: 7 emirates, 14 Syrian provinces');
const aeLeads = [L({ id: '1', province: 'Dubai' }), L({ id: '2', province: 'Abu Dhabi', city: 'Al Ain' }), L({ id: '3', province: C.NATIONWIDE }), L({ id: '4', province: 'Dubai', status: 'contacted' }), L({ id: '5', province: 'Atlantis' })];
const cov = M.regionCoverage(aeLeads, AE.regions);
ok(cov.total === 7 && cov.covered === 2, '2 of 7 emirates covered');
ok(cov.nationwide === 1, 'Nationwide counted on its own');
ok(cov.rows.find((r) => r.region === 'Dubai').total === 2 && cov.rows.find((r) => r.region === 'Dubai').contacted === 1, 'Dubai counts: 2 leads, 1 contacted — Nationwide not folded in');
ok(cov.rows.reduce((s, r) => s + r.total, 0) + cov.nationwide + cov.unknownRegion.length === aeLeads.length, 'every lead is accounted for exactly once');
ok(cov.unknownRegion.length === 1 && cov.unknownRegion[0] === '5', 'unknown region is reported, not silently dropped or guessed');
ok(cov.uncovered.length === 5 && cov.uncovered.includes('Sharjah') && !cov.uncovered.includes('Dubai'), 'uncovered emirates listed');
ok(cov.rows.find((r) => r.region === 'Abu Dhabi').cities.includes('Al Ain'), 'Al Ain is a city under Abu Dhabi, not a separate emirate');
const syCov = M.regionCoverage([L({ country: 'SY', province: 'Damascus', city: 'Mazzeh', district: 'Malki' })], SY.regions);
ok(syCov.covered === 1 && syCov.uncovered.length === 13 && syCov.rows[0].region === 'Damascus' && syCov.rows.find((r) => r.region === 'Damascus').districts.includes('Malki'), 'Syria: provinces / cities / districts');
ok(C.normalizeRegion('AE', 'Nationwide') === C.NATIONWIDE && C.normalizeRegion('AE', 'Dubai') === 'Dubai', 'Nationwide and an emirate normalise to different keys');
ok(C.nameKey('AE', C.NATIONWIDE, 'Noon') !== C.nameKey('AE', 'Dubai', 'Noon'), 'duplicate key: the same name under Nationwide and under Dubai are different leads');
ok(C.websiteKey('https://www.Noon.com/') === C.websiteKey('http://noon.com'), 'duplicate key: website normalisation (scheme/www/slash/case)');
ok(C.nameKey('AE', 'Dubai', 'Life Pharmacy') === C.nameKey('AE', 'Dubai', 'life  pharmacy'), 'duplicate key: whitespace/case insensitive name');
ok(C.nameKey('AE', 'Dubai', 'Life') !== C.nameKey('SY', 'Dubai', 'Life'), 'duplicate key is per country');

// قنوات مستهدفة
const ch = M.channelCoverage([amazon, pharm, L({ category: 'صيدلية', lowes_presence: 'listed' })], 'AE');
ok(ch.find((c) => c.type === 'marketplace').state === 'not_present', 'marketplace discovered but we are not there');
ok(ch.find((c) => c.type === 'pharmacy').state === 'present', 'pharmacy channel where we are listed');
ok(ch.find((c) => c.type === 'quick_commerce').state === 'no_leads', 'quick commerce: nothing discovered yet');
ok(M.channelCoverage([], 'SY').every((c) => c.state === 'no_leads') && M.channelCoverage([], 'SY').length === 5, 'Syria target channels (no marketplaces/chains list)');

// ── لوحة السوق ──
const mixed = [amazon, pharm, salon, dist, aeLeads[3], L({ status: 'contacted', status_updated_at: day(6), status_updated_by: 'Diana' }), L({ verified: 'discovered_unconfirmed', source_urls: null, last_verified_at: day(200) }), L({ lowes_presence: 'listed' })];
const D = M.marketDashboard(mixed, 'AE', AE.regions, NOW);
ok(Object.values(D.stages).reduce((s, n) => s + n, 0) === mixed.length, 'dashboard: every lead lands in exactly one pipeline stage');
ok(D.total === mixed.length && D.accountOpening === 1, 'dashboard: total + account-opening opportunities (platform only)');
ok(D.followUp === 1 && D.stale === 1 && D.noSource === 1 && D.live === 1, 'dashboard: follow-up / stale / no-source / live counters');
ok(Array.isArray(D.untrackedStages) && D.untrackedStages.includes('documents_requested') && D.untrackedStages.includes('pending_approval'), 'dashboard declares the stages it cannot track yet (no invented numbers)');
ok(D.regions.total === 7 && D.channels.length === 8, 'dashboard carries region + channel coverage');
ok(D.stalePct === Math.round((D.stale / D.total) * 100), 'stale percentage');
ok(M.marketDashboard([], 'SY', SY.regions, NOW).total === 0 && M.marketDashboard([], 'SY', SY.regions, NOW).stalePct === 0, 'empty market: zeros, no NaN');

// ── عروض جاهزة ──
ok(M.READY_VIEWS.length === 12, '12 ready views');
const need = M.READY_VIEWS.filter((v) => v.needsFields);
ok(need.map((v) => v.key).sort().join() === 'in_registration,missing_docs', 'only registration/missing-docs views need new fields');
ok(need.every((v) => mixed.every((l) => v.test(l, NOW) === false)), 'views that need new fields never match anything (no invented data)');
ok(M.viewByKey('follow_up').test(L({ status: 'contacted', status_updated_at: day(5) }), NOW) && !M.viewByKey('follow_up').test(L({}), NOW), 'follow_up view');
ok(M.viewByKey('no_contact').test(L({}), NOW) && !M.viewByKey('no_contact').test(L({ phone: '1' }), NOW), 'no_contact view');
ok(M.viewByKey('platforms_to_open').test(amazon, NOW) && !M.viewByKey('platforms_to_open').test(pharm, NOW) && !M.viewByKey('platforms_to_open').test({ ...amazon, lowes_presence: 'listed' }, NOW), 'platforms_to_open: platforms only, not ones we are already on');
ok(M.viewByKey('accepts_sellers').test(L({ accepts_sellers: true })) && !M.viewByKey('accepts_sellers').test(L({ accepts_sellers: null })), 'accepts_sellers: unknown is not a yes');
ok(M.viewByKey('unverified').test(L({ verified: 'discovered_unconfirmed', source_urls: null }), NOW), 'unverified view');
ok(M.viewByKey('no_owner').test(L({})) && !M.viewByKey('no_owner').test(L({ assigned_to: 'X' })), 'no_owner view');
ok(M.viewByKey('nope') === null, 'unknown view key -> null');
ok(M.ownerOf(L({ assigned_to: 'A', status_updated_by: 'B' })) === 'A' && M.ownerOf(L({ status_updated_by: 'B' })) === 'B' && M.ownerOf(L({})) === '', 'owner precedence');

console.log(`b2b-model: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
