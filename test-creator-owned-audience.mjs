// Owned-audience CSV intake: parsing, validation, normalisation, honest signal, no contact data. Run: node test-creator-owned-audience.mjs
import { parseCsv, toDiscoveryRows, SOURCE_TYPES } from './scripts/creators/import-owned-audience.mjs';

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

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
