/* global process */
// «صناع المحتوى» — طابور العمل: Views/ملخص/الخطوة التالية/الأسئلة الثمانية بلا migration/Export/ترميز الاستيراد.
// Run: node test-creator-workqueue.mjs   (fake fixtures only — no network, no database)
import {
  summarizeCreators, searchCreators, VIEWS, viewOf, isGarbled, missingEssentials, collabOf, reviewTags, freeTags,
} from './supabase/functions/_shared/creatorMatch.js';
import {
  answersFromRow, verdictFor, reviewToPatch, quickRejectPatch, nextStep, toExportCsv, decodeCsvBytes, igProfile, missingAr,
} from './src/services/creatorWorkqueue.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('FAIL:', m); } };
const NOW = new Date('2026-10-10T12:00:00Z');

const base = { platform: 'instagram', country: 'SY', source: 'Modash', status: 'needs_review', verification_status: 'unverified', content_types: [], skincare_focus: [], tags: [] };
const R1 = { ...base, id: '1', handle: 'reem.skin', name: 'Reem', governorate: 'damascus', followers: 8000, tags: ['UGC'] };
const R2 = { ...base, id: '2', handle: 'pending_lana', name: 'لانا', platform: 'other', followers: null };
const R3 = { ...base, id: '3', handle: 'x_user', name: '??????', followers: 500, location: 'Damascus' };
const R4 = { ...base, id: '4', handle: 'ready.one', name: 'Ready', governorate: 'aleppo', followers: 20000, status: 'verified', tags: ['collab:ugc_ready'], content_types: ['ugc'] };
const R5 = { ...base, id: '5', handle: 'nope', name: 'Nope', governorate: 'homs', followers: 900, status: 'rejected', tags: ['collab:not_relevant', 'reject:private'] };
const R6 = { ...base, id: '6', handle: 'nosrc', name: 'No Src', city: 'حمص', followers: 100, source: null, saved: true };
const R7 = { ...base, id: '7', handle: 'gone', name: 'Gone', followers: 1, deleted_at: '2026-10-01T00:00:00Z' };
const ROWS = [R1, R2, R3, R4, R5, R6, R7];

// ---- helpers ----
ok(isGarbled(R3) && !isGarbled(R1), 'garbled name detected, normal name not');
ok(isGarbled({ name: 'ab\uFFFDcd' }), 'U+FFFD counts as garbled');
ok(missingEssentials(R2).includes('account') && missingEssentials(R2).includes('followers'), 'pending row: account + followers missing');
ok(missingEssentials(R6).join() === 'source', 'no-source row: only source missing');
ok(missingEssentials(R1).length === 0, 'complete row: nothing missing');
ok(collabOf(R4) === 'ugc_ready' && collabOf(R1) === null, 'collabOf reads the reserved tag');
ok(collabOf({ tags: ['collab:hacked'] }) === null, 'unknown collab value ignored');
ok(freeTags({ tags: ['UGC', 'r:fit=yes', 'collab:pr_ready', 'reject:private'] }).join() === 'UGC', 'reserved tags hidden from free tags');
ok(reviewTags({ tags: ['r:fit=yes', 'r:active=no', 'UGC'] }).fit === 'yes', 'reviewTags parses r:key=value');

// ---- summary (all live rows, deleted excluded) ----
const S = summarizeCreators(ROWS);
ok(S.total === 6, `total excludes deleted (${S.total})`);
ok(S.to_review === 4, `to_review = needs_review+discovered (${S.to_review})`);
ok(S.verified === 1 && S.ready === 1 && S.rejected === 1, 'verified / ready / rejected');
ok(S.no_source === 1 && S.garbled === 1 && S.saved === 1, 'no_source / garbled / saved');
ok(S.incomplete === 3, `incomplete = pending + garbled + no source (${S.incomplete})`);
ok(S.collab.ugc_ready === 1 && S.collab.not_relevant === 1, 'collab breakdown');

// ---- views ----
const live = ROWS.filter((r) => !r.deleted_at);
const run = (key) => searchCreators(live, { filters: viewOf(key).filters, pageSize: 60, now: NOW.getTime() }).rows.map((r) => r.id).sort().join();
ok(run('review') === '1,2,3,6', `review view (${run('review')})`);
ok(run('ready') === '4', 'ready view');
ok(run('rejected') === '5', 'rejected view');
ok(run('no_source') === '6', 'no-source view');
ok(run('garbled') === '3', 'garbled view');
ok(run('saved') === '6', 'saved view');
ok(run('incomplete') === '2,3,6', 'incomplete view');
ok(run('all') === '1,2,3,4,5,6', 'all view');
const CON = { ...base, id: 'c1', handle: 'talked.to', name: 'Talked', governorate: 'damascus', followers: 1000, status: 'contacted' };
const COL = { ...base, id: 'c2', handle: 'collab.now', name: 'Collab', governorate: 'damascus', followers: 1000, status: 'collaborating' };
const withContacted = [...live, CON, COL];
ok(searchCreators(withContacted, { filters: viewOf('contacted').filters, now: NOW.getTime() }).rows.map((r) => r.id).sort().join() === 'c1,c2', 'contacted view = contacted + interested + collaborating');
ok(summarizeCreators(withContacted).contacted === 2, 'summary counts contacted');
ok(new Set(VIEWS.map((v) => v.key)).size === VIEWS.length, 'view keys are unique');
ok(['review', 'ugc', 'skincare', 'incomplete', 'unverified', 'saved', 'contacted'].every((k) => VIEWS.some((v) => v.key === k)), 'all operational views required by the brief exist');
ok(viewOf('nope').key === 'all', 'unknown view -> all');
ok(VIEWS.every((v) => v.key === 'all' || S[v.count] !== undefined), 'every view count key exists in the summary');
// view combines with search (AND)
ok(searchCreators(live, { q: 'حلب', filters: viewOf('ready').filters, now: NOW.getTime() }).total === 1, 'view + Arabic geo search');
ok(searchCreators(live, { q: 'aleppo', filters: viewOf('review').filters, now: NOW.getTime() }).total === 0, 'view + English search excludes non-matching');
ok(searchCreators(live, { q: '@reem', now: NOW.getTime() }).total === 1, '@handle search');
// reserved tags are not searchable text
ok(searchCreators([{ ...R1, tags: ['r:fit=yes'] }], { q: 'fit', now: NOW.getTime() }).total === 0, 'reserved tags not in search haystack');

// ---- next step ----
ok(nextStep(R2).key === 'find_account', 'pending -> find account');
ok(nextStep(R3).key === 'fix_name', 'garbled -> fix name');
ok(nextStep(R1).key === 'review', 'unreviewed -> review');
ok(nextStep(R4).key === 'contact', 'verified ugc -> contact');
ok(nextStep(R5).key === 'none', 'rejected -> none');
ok(nextStep(R7).key === 'deleted', 'deleted');
ok(nextStep({ ...R4, tags: ['collab:paid_inquiry'] }).key === 'paid', 'paid inquiry');
ok(nextStep({ ...R4, platform: 'tiktok' }).key === 'find_contact', 'verified, no public route -> find contact');
ok(nextStep({ ...R4, status: 'contacted' }).key === 'follow_up', 'contacted -> follow up');
ok(nextStep({ ...R1, tags: ['r:fit=yes'] }).key === 'complete_review', 'half review -> complete');

// ---- the 8 questions without a migration ----
const fresh = answersFromRow(R1);
ok(fresh.active === 'unsure' && fresh.action === 'unsure' && fresh.videos.length === 0, 'fresh row -> all unsure');
const v0 = verdictFor(fresh, R1);
ok(v0.primary === 'needs_review', 'nothing answered -> needs review (never a guess)');

const UGC = { ...fresh, active: 'yes', last_post: '2026-10-05', fit: 'yes', creator_type: 'skincare', face: 'yes', talks: 'yes', review: 'yes', unbox: 'no', ugc_quality: 'high', videos: ['https://www.instagram.com/reel/abc/'], skin: 'yes', pr: 'open_to_collab', action: 'ugc' };
const vu = verdictFor(UGC, R1);
ok(vu.labels.includes('ugc_ready') && vu.labels.includes('pr_ready'), `ugc + pr ready (${vu.labels})`);
ok(vu.completeness.done >= 7, `completeness counted (${vu.completeness.done})`);
const { patch: pu } = reviewToPatch(UGC, R1, NOW);
ok(pu.status === 'verified', 'ready verdict -> verified');
ok(pu.tags.includes('UGC') && pu.tags.includes('r:fit=yes') && pu.tags.includes('collab:ugc_ready'), 'free tag kept + answers + collab');
ok(!pu.tags.some((t) => t.includes('unsure')), 'unsure never written');
ok(pu.content_types.includes('review') && pu.content_types.includes('ugc') && !pu.content_types.includes('unboxing'), 'content types from answers');
ok(pu.evidence === 'video:https://www.instagram.com/reel/abc/', 'video evidence stored');
ok(pu.verification_status === 'partial' && pu.last_verified_at === NOW.toISOString(), 'manual check recorded');
ok(pu.last_active_at === '2026-10-05' && pu.creator_type === 'skincare', 'activity + type');
// round trip: the stored row re-opens with the same answers
const stored = { ...R1, ...pu };
const back = answersFromRow(stored);
ok(back.fit === 'yes' && back.face === 'yes' && back.ugc_quality === 'high' && back.action === 'ugc' && back.videos[0] === UGC.videos[0], 'answers round-trip through tags/evidence');
ok(collabOf(stored) === 'ugc_ready', 'collab readable after save');
// re-review replaces old reserved tags (no duplicates)
const { patch: p2 } = reviewToPatch({ ...back, action: 'none' }, stored, NOW);
ok(p2.tags.filter((t) => t.startsWith('collab:')).length === 1 && p2.tags.includes('collab:not_relevant'), 'collab replaced, not duplicated');
ok(p2.tags.filter((t) => t.startsWith('r:action=')).length === 1, 'answer replaced, not duplicated');
ok(p2.status === 'rejected', 'no collaboration -> rejected (excluded, kept)');
// legacy evidence text preserved
const { patch: p3 } = reviewToPatch(UGC, { ...R1, evidence: 'Medium' }, NOW);
ok(p3.evidence.startsWith('Medium video:'), 'legacy evidence level kept');
// UGC wanted but no video -> needs review, with an Arabic reason
const noVid = verdictFor({ ...UGC, videos: [], pr: 'none', action: 'ugc' }, R1);
ok(!noVid.labels.includes('ugc_ready'), 'no video -> not ugc ready');
ok(noVid.missing.some((m) => missingAr(m).includes('رابط فيديو')), 'Arabic missing reason');
// expert
ok(verdictFor({ ...fresh, active: 'yes', fit: 'partial', creator_type: 'expert', action: 'gift' }, R1).labels.includes('expert'), 'expert label');
// status already in outreach is never pushed back
ok(!('status' in reviewToPatch(UGC, { ...R1, status: 'contacted' }, NOW).patch), 'outreach status kept (not sent)');
// unchanged fields are not sent (readable audit trail)
const same = reviewToPatch(answersFromRow(stored), stored, NOW).patch;
ok(Object.keys(same).join() === 'last_verified_at', `re-saving an unchanged review sends only the check date (${Object.keys(same)})`);
// videos capped, evidence <= 500 chars
const long = Array.from({ length: 6 }, (_, i) => `https://www.instagram.com/reel/${'x'.repeat(150)}${i}/`);
const pl = reviewToPatch({ ...UGC, videos: long }, R1, NOW).patch;
ok(pl.evidence.length <= 500 && pl.evidence.split(' ').every((t) => t.endsWith('/')), `evidence capped without cutting a URL (${pl.evidence.length})`);
// invalid URLs dropped
ok(!reviewToPatch({ ...UGC, videos: ['javascript:alert(1)'] }, R1, NOW).patch.evidence, 'non-http video url ignored');

// quick reject
const qr = quickRejectPatch({ ...R1, tags: ['UGC', 'r:active=yes', 'r:fit=yes', 'r:face=yes'] }, 'inactive', NOW);
ok(qr.status === 'rejected' && qr.tags.includes('reject:inactive') && qr.tags.includes('r:active=no') && !qr.tags.includes('r:active=yes'), 'quick reject inactive');
ok(qr.tags.includes('r:face=yes') && qr.tags.includes('UGC'), 'quick reject keeps other answers + free tags');
let threw = false; try { quickRejectPatch(R1, 'whatever'); } catch { threw = true; }
ok(threw, 'unknown reject reason refused');

// contacts: public source required
ok(igProfile(R1) === 'https://www.instagram.com/reem.skin/' && igProfile(R2) === '', 'instagram profile url (none for pending)');
const paid = verdictFor({ ...UGC, action: 'paid' }, { ...R1, platform: 'tiktok' });
ok(paid.missing.includes('contact') && !paid.labels.includes('paid_inquiry'), 'paid without public contact -> needs contact');
ok(verdictFor({ ...UGC, action: 'paid', email: 'a@b.co', contact_src: 'https://linktr.ee/a' }, { ...R1, platform: 'tiktok' }).labels.includes('paid_inquiry'), 'paid with sourced email');

// ---- export ----
const csvUser = toExportCsv([R1, R3, { ...R4, email: 'x@y.co', phone: '+963900' }], { withContacts: false });
const csvAdmin = toExportCsv([{ ...R4, email: 'x@y.co', phone: '+963900' }], { withContacts: true });
ok(csvUser.startsWith('\uFEFF'), 'BOM for Arabic Excel');
ok(!csvUser.includes('x@y.co') && !csvUser.includes('+963900') && !csvUser.includes('البريد'), 'export without contacts permission has no contact columns/values');
ok(csvAdmin.includes('x@y.co') && csvAdmin.includes('البريد'), 'export with contacts permission has contact columns');
ok(!csvUser.includes('??????'), 'garbled name not exported as a name');
ok(csvUser.includes('ليست تقييم جودة'), 'score column labelled as priority, not quality');
ok(toExportCsv([{ ...R1, name: '=HYPERLINK("x")' }]).includes(`"'=HYPERLINK(""x"")"`), 'formula injection neutralised');
ok(toExportCsv([]).split('\r\n').filter(Boolean).length === 1, 'empty export = header only');
ok(!toExportCsv([R1]).includes('r:'), 'reserved tags never exported');
ok(toExportCsv([R1]).split('\r\n')[1].split(',')[1] === 'reem.skin', 'handle exported plain (no @ / no quote prefix)');

// ---- import decoding ----
const utf8 = new TextEncoder().encode('\uFEFFhandle,name\n@a,ريم\n');
const d1 = decodeCsvBytes(utf8);
ok(d1.encoding === 'utf-8' && d1.text.includes('ريم') && !d1.text.startsWith('\uFEFF'), 'utf-8 decoded, BOM stripped');
// "ريم" in Windows-1256: ر=0xD1 ي=0xED م=0xE3
const cp = new Uint8Array([0x68, 0x2c, 0x6e, 0x0a, 0x61, 0x2c, 0xd1, 0xed, 0xe3, 0x0a]);
const d2 = decodeCsvBytes(cp);
ok(d2.encoding === 'windows-1256' && d2.text.includes('ريم'), `windows-1256 fallback (${d2.encoding}: ${JSON.stringify(d2.text)})`);

console.log(`creator-workqueue: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
