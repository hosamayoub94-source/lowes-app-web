// Owned-audience trial report. Reads the team's CSV (see import-owned-audience.mjs) and answers, with full dedup, how much of it is genuinely new.
// LOCAL + READ-ONLY: it reads the live review queue (kind='queue', every cohort, removed included) and the local pool; it writes only a local report.
// usage: node scripts/creators/owned-audience-report.mjs <file.csv> [--no-live]
//   dedup order of attribution (first match wins): removed creator > pilot/manual queue > discovery review queue (B001...) > research seed > Discovery Pool > repeated inside this CSV.
//   keys: platform + normalised username (a profile_url is parsed to the same key; case, @, www/m., trailing slash are equal). Names are never used.
// Nobody is qualified, contacted or queued by this script.
import fs from 'node:fs';
import path from 'node:path';
import { parseCsv, toDiscoveryRows } from './import-owned-audience.mjs';
import { normalizeHandle } from '../../src/services/creatorLogic.js';

const key = (p, h) => `${p}:${normalizeHandle(h)}`;
const SYRIA_WORDS = /syria|syrian|سوري|سورية|سوريا|damascus|دمشق|aleppo|حلب|homs|حمص|latakia|اللاذقية|tartus|طرطوس|hama|حماة|sweida|السويداء|idlib|إدلب|ادلب|daraa|درعا|🇸🇾/i;

/** Pure: records (parsed CSV) + the known universes -> report object. */
export function analyze(records, { poolKeys = new Set(), seedKeys = new Set(), queueKeys = {}, today } = {}) {
  const { rows, rejected } = toDiscoveryRows(records, { today });
  const seenInCsv = new Set(); const dup = { removed_creator: 0, pilot_or_manual_queue: 0, discovery_review_queue: 0, research_seed: 0, discovery_pool: 0, repeated_in_csv: 0 };
  const fresh = [];
  for (const r of rows) {
    const k = key(r[0], r[1]);
    if (queueKeys.removed?.has(k)) dup.removed_creator++;
    else if (queueKeys.pilot?.has(k)) dup.pilot_or_manual_queue++;
    else if (queueKeys.discovery?.has(k)) dup.discovery_review_queue++;
    else if (seedKeys.has(k)) dup.research_seed++;
    else if (poolKeys.has(k)) dup.discovery_pool++;
    else if (seenInCsv.has(k)) dup.repeated_in_csv++;
    else { seenInCsv.add(k); fresh.push(r); }
  }
  const srcOf = r => (String(r[8]).match(/owned audience \((\w+)\)/) || [])[1] || 'other';
  const by = rowsArr => rowsArr.reduce((m, r) => { const s = srcOf(r); m[s] = (m[s] || 0) + 1; return m; }, {});
  const clearSyria = r => !!r[5] || SYRIA_WORDS.test(String(r[8]).split(': ').slice(1).join(': ')); // team stated a city, or the note itself says Syria
  const inBand = r => r[3] != null && r[3] >= 500 && r[3] < 2500;
  return {
    csv_lines: records.length, rejected, accepted: rows.length,
    duplicates_total: rows.length - fresh.length, duplicates_by_reason: dup,
    new_entered: fresh.length, new_by_source: by(fresh), accepted_by_source: by(rows),
    new_with_clear_syria_evidence: fresh.filter(clearSyria).length,
    new_in_500_2500: fresh.filter(inBand).length, new_followers_unknown: fresh.filter(r => r[3] == null).length,
    qualification: 'none — every new account is Discovery only (needs Verification + human review)', fresh_rows: fresh,
  };
}

if ((process.argv[1] || '').endsWith('owned-audience-report.mjs')) {
  const args = process.argv.slice(2); const live = !args.includes('--no-live'); const file = args.find(a => !a.startsWith('--'));
  if (!file) { console.error('usage: owned-audience-report.mjs <file.csv> [--no-live]'); process.exit(1); }
  const DIR = path.resolve('data/creators/syria/discovery');
  const poolRows = JSON.parse(fs.readFileSync(path.join(DIR, 'discovery_pool.json'), 'utf8')).rows;
  const poolKeys = new Set(poolRows.filter(r => r.status !== 'queued').map(r => key(r.platform, r.username)));
  const seedKeys = new Set(JSON.parse(fs.readFileSync(path.join(DIR, 'known_handles.json'), 'utf8')));
  const queueKeys = { removed: new Set(), pilot: new Set(), discovery: new Set(poolRows.filter(r => r.status === 'queued').map(r => key(r.platform, r.username))) };
  let liveNote = 'live queue NOT checked (--no-live)';
  if (live) {
    const URL_ = 'https://fghdumrgimoeqsafdhhh.supabase.co'; const KEY = 'sb_publishable_iYn5Rc00ZmdLPUBH5_09fg_eLiok3UO'; let n = 0;
    for (let from = 0; ; from += 1000) {
      const res = await fetch(`${URL_}/rest/v1/creator_workbench_items?select=id,data&kind=eq.queue&order=id`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Accept-Profile': 'public', Range: `${from}-${from + 999}` } });
      if (!res.ok) { console.error('live queue read failed', res.status); process.exit(1); }
      const page = await res.json(); n += page.length;
      for (const r of page) for (const p of r.data.platforms || []) { const k = key(p.platform, p.handle); (r.data.removed ? queueKeys.removed : r.data.cohort === 'discovery' ? queueKeys.discovery : queueKeys.pilot).add(k); }
      if (page.length < 1000) break;
    }
    liveNote = `live queue checked (${n} rows, all cohorts, removed included)`;
  }
  const rep = analyze(parseCsv(fs.readFileSync(file, 'utf8')), { poolKeys, seedKeys, queueKeys });
  const { fresh_rows, ...summary } = rep;
  const md = [`# Owned-audience trial — report`, `${new Date().toISOString().slice(0, 10)} · file ${path.basename(file)} · ${liveNote} · pool ${poolKeys.size} · seed ${seedKeys.size}`, '',
    `- CSV lines: ${rep.csv_lines} · rejected (invalid): ${rep.rejected.length} · accepted: ${rep.accepted}`,
    `- **New records entered: ${rep.new_entered}** · duplicates: ${rep.duplicates_total} (${Object.entries(rep.duplicates_by_reason).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'})`,
    `- New by source: ${Object.entries(rep.new_by_source).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'}`,
    `- New with a clear Syria evidence (city stated by the team or Syria stated in the note): **${rep.new_with_clear_syria_evidence}**`,
    `- New inside 500–2.5K: **${rep.new_in_500_2500}** · followers unknown: ${rep.new_followers_unknown}`,
    `- Qualification: ${rep.qualification}`, '', rep.rejected.length ? '## Rejected lines\n' + rep.rejected.map(x => `- line ${x.line}: ${x.why}`).join('\n') : ''].join('\n');
  fs.writeFileSync(path.join(DIR, 'OWNED_TRIAL_REPORT.md'), md);
  fs.writeFileSync(path.join(DIR, 'owned_trial_new.json'), JSON.stringify({ generated_at: new Date().toISOString(), summary, rows: fresh_rows }, null, 1));
  console.log(md);
}
