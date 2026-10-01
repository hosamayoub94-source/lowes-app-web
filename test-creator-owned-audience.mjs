// Owned-audience CSV intake: parsing, validation, normalisation, honest signal, no contact data. Run: node test-creator-owned-audience.mjs
import { parseCsv, toDiscoveryRows, SOURCE_TYPES } from './scripts/creators/import-owned-audience.mjs';
import { analyze } from './scripts/creators/owned-audience-report.mjs';
import { planBatches } from './src/services/creatorDiscoveryBatches.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('FAIL:', m); } };

const csv = [
  'username,profile_url,platform,display_name,followers,city,source_type,source_note,observed_at',
  '@Some.User,,instagram,"Some, User",1200,damascus,tagged_us,"tagged our post, said ""loved it""",2026-09-30',
  ',https://www.instagram.com/Another_One/,,Another,,,commented,,',
  ',https://www.tiktok.com/@tt.user,,,850,,mentioned_us,,',
  'nobody,,,,,,,,',
  ',,,,,,,,',
  'bad_type,,instagram,,,,newsletter,,',
  'bad_city,,instagram,,,paris,inquiry,,',
  'bad_fol,,instagram,,abc,,inquiry,,',
  ',https://example.com/x,,,,,other,,',
].join('\r\n');

const recs = parseCsv(csv);
ok(recs.length === 8, 'blank line skipped, quoted commas kept: ' + recs.length);
ok(recs[0].display_name === 'Some, User' && recs[0].source_note === 'tagged our post, said "loved it"', 'quotes and commas parsed');

const { rows, rejected } = toDiscoveryRows(recs, { today: '2026-10-01' });
ok(rows.length === 4, 'accepted rows: ' + rows.length);
const by = u => rows.find(r => r[1] === u);
ok(by('some.user')[0] === 'instagram' && by('some.user')[3] === 1200 && by('some.user')[5] === 'damascus', 'handle normalised (@, case), followers + city kept');
ok(by('another_one') && by('another_one')[3] === null && by('another_one')[5] === null, 'unknown followers / city stay null');
ok(by('tt.user')[0] === 'tiktok' && by('tt.user')[3] === 850, 'platform taken from the URL');
ok(by('some.user')[9] === 'medium' && by('another_one')[9] === 'weak', 'signal: medium only when the team states a city, otherwise weak (our audience is not proof of Syria)');
ok(rows.every(r => r[6] === 'owned_audience' && /discovery only/.test(r[8])), 'tagged as owned_audience, discovery only');
ok(rows.every(r => r.length === 10), 'row format matches the discovery merge');
ok(rejected.length === 4 && rejected.some(x => /source_type/.test(x.why)) && rejected.some(x => /city/.test(x.why)) && rejected.some(x => /followers/.test(x.why)) && rejected.some(x => /profile_url/.test(x.why)), 'invalid lines rejected with reasons: ' + JSON.stringify(rejected.map(x => x.why)));
ok(SOURCE_TYPES.includes('collab_partner') && !SOURCE_TYPES.includes('dm_contact'), 'no private-contact source type exists');
ok(!JSON.stringify(rows).match(/phone|whatsapp|@gmail|\+963/i), 'no contact data in rows');

// report: dedup attribution, source split, clear Syria evidence, 500-2.5K, nothing qualified
const T = ['username,profile_url,platform,display_name,followers,city,source_type,source_note,observed_at',
  'removed_one,,instagram,,1000,,tagged_us,,', 'pilot_one,,instagram,,1000,,tagged_us,,', 'b001_one,,instagram,,1000,,commented,,', 'seed_one,,instagram,,1000,,mentioned_us,,', 'pool_one,,instagram,,1000,,collab_partner,,',
  'new_a,,instagram,,1200,damascus,tagged_us,,', 'new_b,,instagram,,3000,,commented,"lives in Aleppo, Syria",', 'new_c,,instagram,,,,mentioned_us,,', 'NEW_A,,instagram,,1200,damascus,tagged_us,,', ',https://www.instagram.com/new_d/,,,800,,collab_partner,,', 'bad,,instagram,,,,zzz,,'].join(String.fromCharCode(10));
const K = a => new Set(a.map(u => 'instagram:' + u));
const rep = analyze(parseCsv(T), { poolKeys: K(['pool_one']), seedKeys: K(['seed_one']), queueKeys: { removed: K(['removed_one']), pilot: K(['pilot_one']), discovery: K(['b001_one']) } });
ok(rep.rejected.length === 1 && rep.accepted === 10, 'one rejected line, ten accepted: ' + rep.accepted);
const d = rep.duplicates_by_reason;
ok(d.removed_creator === 1 && d.pilot_or_manual_queue === 1 && d.discovery_review_queue === 1 && d.research_seed === 1 && d.discovery_pool === 1 && d.repeated_in_csv === 1 && rep.duplicates_total === 6, 'each duplicate attributed to its universe: ' + JSON.stringify(d));
ok(rep.new_entered === 4 && rep.new_by_source.tagged_us === 1 && rep.new_by_source.commented === 1 && rep.new_by_source.mentioned_us === 1 && rep.new_by_source.collab_partner === 1, 'new split by source: ' + JSON.stringify(rep.new_by_source));
ok(rep.new_with_clear_syria_evidence === 2, 'clear Syria evidence = city stated or Syria in the note: ' + rep.new_with_clear_syria_evidence);
ok(rep.new_in_500_2500 === 2 && rep.new_followers_unknown === 1, 'band count + unknown followers reported separately: ' + rep.new_in_500_2500);
ok(/none/.test(rep.qualification) && rep.fresh_rows.every(r => r[6] === 'owned_audience'), 'nobody is qualified automatically');

// owned-audience rows are a separate trial path, never mixed into the regular batches
const pr = { platform: 'instagram', username: 'o1', followers: 1000, provider_topics: [], category: null, city: null, syria_signal: 'weak', needs_verification: true, discovery: { type: 'owned_audience', url: 'u', evidence: 'e', searched_at: 'x' } };
const reg = { ...pr, username: 'r1', discovery: { type: 'directory_page', url: 'u', evidence: 'e', searched_at: 'x' }, syria_signal: 'medium' };
const pl = planBatches([pr, reg], { size: 50, startAt: 3 });
ok(pl.totals.owned_trial === 1 && pl.batches.flatMap(b => b.rows).every(r => r.username !== 'o1') && pl.batches[0].id === 'B003', 'owned rows kept out of regular batches');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
