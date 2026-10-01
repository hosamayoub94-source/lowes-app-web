// Builds the smart review batches from the Discovery Pool. LOCAL FILES ONLY — nothing is written to any database or to the review queue.
// usage: node scripts/creators/discovery-batches.mjs [--size 50]
// in : data/creators/syria/discovery/discovery_pool.json     out: data/creators/syria/discovery/batches/{BATCH_PLAN.md, batch_plan.json, needs_review.csv, B001.csv ...}
import fs from 'node:fs';
import path from 'node:path';
import { planBatches, bucketOf } from '../../src/services/creatorDiscoveryBatches.js';

const args = process.argv.slice(2);
const si = args.indexOf('--size'); const size = si >= 0 ? Number(args[si + 1]) : 50;
const DIR = path.resolve('data/creators/syria/discovery'); const OUT = path.join(DIR, 'batches');
const pool = JSON.parse(fs.readFileSync(path.join(DIR, 'discovery_pool.json'), 'utf8')).rows;
// continue numbering after the batches already placed in the review queue (B001 ...), so ids never collide
const placedNums = pool.filter(r => r.status === 'queued' && /^B\d{3}$/.test(r.queued_batch || '')).map(r => Number(r.queued_batch.slice(1)));
const startAt = (placedNums.length ? Math.max(...placedNums) : 0) + 1;
const plan = planBatches(pool, { size, startAt });
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });

const esc = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const COLS = ['platform', 'username', 'display_name', 'profile_url', 'followers', 'bucket', 'provider_topics', 'city', 'syria_signal', 'needs_verification', 'review_reasons', 'discovery_url', 'evidence', 'searched_at'];
const line = r => [r.platform, r.username, r.display_name, r.profile_url, r.followers, bucketOf(r), (r.provider_topics || []).join('|'), r.city, r.syria_signal, r.needs_verification, (r.review_reasons || []).join('|'), r.discovery.url, r.discovery.evidence, r.discovery.searched_at].map(esc).join(',');
const csv = rows => '﻿' + [COLS.join(',')].concat(rows.map(line)).join('\n');
plan.batches.forEach(b => fs.writeFileSync(path.join(OUT, `${b.id}.csv`), csv(b.rows)));
fs.writeFileSync(path.join(OUT, 'needs_review.csv'), csv(plan.needsReview));
fs.writeFileSync(path.join(OUT, 'batch_plan.json'), JSON.stringify({ generated_at: new Date().toISOString(), size, totals: plan.totals, tiers: plan.tierSummary, notes: plan.notes, batches: plan.batches.map(({ rows, ...b }) => ({ ...b, accounts: rows.map(r => `${r.platform}:${r.username}`) })) }, null, 1));

const md = [`# Discovery batches — plan`, `Generated ${new Date().toISOString().slice(0, 10)} · batch size ${size} · local only (nothing entered the review queue)`, '',
  `Pool ${plan.totals.pool} · already in review queue ${plan.totals.already_queued} · owned-audience trial (separate path, not batched) ${plan.totals.owned_trial} · eligible ${plan.totals.eligible} · **needs review (kept apart): ${plan.totals.needs_review}** · batches ${plan.totals.batches}`, '',
  '| Tier | Priority | Accounts | Batches | Content buckets (balancing only) |', '|---|---|---:|---:|---|'];
for (const t of plan.tierSummary) md.push(`| ${t.label} | ${t.priority} | ${t.accounts} | ${plan.batches.filter(b => b.tier === t.tier).length} | ${Object.entries(t.buckets).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'} |`);
md.push('', '## Needs Review (never auto-queued, never deleted)');
const rc = {}; plan.needsReview.forEach(r => r.review_reasons.forEach(x => { rc[x] = (rc[x] || 0) + 1; })); Object.entries(rc).forEach(([k, v]) => md.push(`- ${k}: ${v}`));
md.push('', '## Notes / shortages', ...(plan.notes.length ? plan.notes.map(n => `- ${n}`) : ['- none']), '', '## First batches', ...plan.batches.slice(0, 6).map(b => `- ${b.id} · ${b.tier_label} · ${b.size} accounts · ${Object.entries(b.buckets).map(([k, v]) => `${k} ${v}`).join(' · ')}`));
fs.writeFileSync(path.join(OUT, 'BATCH_PLAN.md'), md.join('\n'));
console.log(md.join('\n'));
