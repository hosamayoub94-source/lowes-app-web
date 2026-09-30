// Admin tool: merge the workbench exports of all reviewers into one dataset + a verified-leads CSV.
// usage: node scripts/creators/merge-workbench-exports.mjs <queue.json> <export1.json> [export2.json ...] [--out dir]
// Output (default data/creators/syria/reviews/): merged_exports.json · verified_leads.csv · summary.json
// Only human-reviewed creators with a commercial label appear in verified_leads.csv. Invalid reviews are listed in summary.rejected.
import fs from 'node:fs';
import path from 'node:path';
import { mergeExports } from '../../src/services/creatorReviewStore.js';
import { verifiedLeads, leadsToCsv, queueProgress, latestReviews, deriveVerdict } from '../../src/services/creatorReview.js';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outDir = path.resolve(outIdx >= 0 ? args.splice(outIdx, 2)[1] : 'data/creators/syria/reviews');
const [queueFile, ...exportFiles] = args;
if (!queueFile || !exportFiles.length) { console.error('usage: merge-workbench-exports.mjs <queue.json> <export.json>... [--out dir]'); process.exit(1); }
const queue = JSON.parse(fs.readFileSync(queueFile, 'utf8')).records;
const merged = mergeExports(exportFiles.map(f => JSON.parse(fs.readFileSync(f, 'utf8'))));
const leads = verifiedLeads(queue, merged.reviews);
const latest = latestReviews(merged.reviews);
const progress = queueProgress(queue, latest, (r, q) => deriveVerdict(r, q));
const summary = {
  merged_at: new Date().toISOString(), exports: exportFiles.length, reviews_total: merged.reviews.length, creators_reviewed: latest.size,
  progress, verified_leads: leads.length, by_primary: leads.reduce((m, x) => { m[x.verdict.primary] = (m[x.verdict.primary] || 0) + 1; return m; }, {}),
  rejected: merged.rejected, waves: merged.waves.length, wave_members: merged.members.length,
};
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'merged_exports.json'), JSON.stringify({ version: 1, ...merged }, null, 1));
fs.writeFileSync(path.join(outDir, 'verified_leads.csv'), '﻿' + leadsToCsv(leads));
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 1));
console.log(JSON.stringify({ reviewed: summary.creators_reviewed, verified_leads: summary.verified_leads, by_primary: summary.by_primary, rejected: summary.rejected.length }));
