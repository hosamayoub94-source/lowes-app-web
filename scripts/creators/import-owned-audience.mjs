// Owned-audience discovery intake: accounts the company itself can see from its OWN official channels
// (tagged us / mentioned us / commented on our posts / sent an inquiry / brand-collab partner), typed or exported by the team
// into a CSV. DISCOVERY SOURCE ONLY: nobody here is contacted, messaged or added to any audience automatically; every row goes through
// the same Dedup + Verification as any other discovery row (discovery-merge.mjs, then human review).
// usage: node scripts/creators/import-owned-audience.mjs <file.csv> [--out batch.json]
// CSV columns (header required; extra columns ignored):
//   username | profile_url   (one of them)   platform (default instagram)   display_name   followers   city   source_type   source_note   observed_at (YYYY-MM-DD)
//   source_type: tagged_us | mentioned_us | commented | inquiry | collab_partner | other
// Privacy: do NOT paste private message contents or contact details; only the public account handle + how we know it.
import fs from 'node:fs';
import path from 'node:path';
import { parseProfileUrl, normalizeHandle, toNum, SYRIA_CITIES } from '../../src/services/creatorLogic.js';

export const SOURCE_TYPES = ['tagged_us', 'mentioned_us', 'commented', 'inquiry', 'collab_partner', 'other'];

export function parseCsv(text) {
  const rows = []; let cur = []; let cell = ''; let q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { cur.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; cur.push(cell); cell = ''; if (cur.some(x => x.trim())) rows.push(cur); cur = []; }
    else cell += c;
  }
  if (cell || cur.length) { cur.push(cell); if (cur.some(x => x.trim())) rows.push(cur); }
  const [head, ...body] = rows; const cols = head.map(h => h.trim().toLowerCase());
  return body.map(r => Object.fromEntries(cols.map((c, i) => [c, (r[i] ?? '').trim()])));
}

/** CSV rows -> discovery rows (format of discovery-merge.mjs) + a list of rejected lines with the reason. */
export function toDiscoveryRows(records, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const rows = []; const rejected = [];
  records.forEach((r, i) => {
    const line = i + 2; let platform = (r.platform || 'instagram').toLowerCase(); let handle = null; let url = null;
    if (r.profile_url) { const p = parseProfileUrl(r.profile_url); if (!p.ok) { rejected.push({ line, why: `profile_url: ${p.error}` }); return; } platform = p.platform; handle = p.handle; url = p.url; }
    else if (r.username) handle = normalizeHandle(r.username);
    if (!handle) { rejected.push({ line, why: 'username or profile_url required' }); return; }
    const st = (r.source_type || 'other').toLowerCase();
    if (!SOURCE_TYPES.includes(st)) { rejected.push({ line, why: `source_type must be one of ${SOURCE_TYPES.join('|')}` }); return; }
    const followers = r.followers ? toNum(r.followers) : null;
    if (r.followers && (followers === null || followers < 0)) { rejected.push({ line, why: 'followers not a number' }); return; }
    const city = r.city ? r.city.toLowerCase() : null;
    if (city && !SYRIA_CITIES.includes(city)) { rejected.push({ line, why: `city must be one of ${SYRIA_CITIES.join('|')}` }); return; }
    // our own audience is NOT proof the account is Syrian: strong only when the team states a city, otherwise weak (needs verification)
    const signal = city ? 'medium' : 'weak';
    rows.push([platform, handle, r.display_name || handle, followers, null, city, 'owned_audience',
      url || `owned_audience:${st}`, `owned audience (${st})${r.source_note ? ': ' + r.source_note.slice(0, 160) : ''}; observed ${r.observed_at || today}; discovery only — never auto-contact`, signal]);
  });
  return { rows, rejected };
}

if ((process.argv[1] || '').endsWith('import-owned-audience.mjs')) {
  const args = process.argv.slice(2);
  const oi = args.indexOf('--out'); const out = oi >= 0 ? args.splice(oi, 2)[1] : null;
  const file = args[0];
  if (!file) { console.error('usage: import-owned-audience.mjs <file.csv> [--out batch.json]'); process.exit(1); }
  const { rows, rejected } = toDiscoveryRows(parseCsv(fs.readFileSync(file, 'utf8')));
  const target = path.resolve(out || `data/creators/syria/discovery/batch_owned_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.json`);
  fs.writeFileSync(target, JSON.stringify({ searched_at: new Date().toISOString().slice(0, 10), tool: `owned-audience CSV (${path.basename(file)})`, rows }, null, 0));
  console.log(JSON.stringify({ file: target, accepted: rows.length, rejected }, null, 1));
}
