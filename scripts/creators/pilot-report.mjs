// Builds the pilot DECISION REPORT from the reviewers' workbench exports (merge + metrics). Reads only local files.
// usage: node scripts/creators/pilot-report.mjs <workbench_queue.json> <export1.json> [export2.json ...] [--out dir] [--tier 1|all]
// Output: <out>/PILOT_DECISION_REPORT.md + pilot_report.json  (default out: data/creators/syria/reviews)
// The report is descriptive: groups under 10 contacted creators are labelled "descriptive only"; follower count is never a decision input.
import fs from 'node:fs';
import path from 'node:path';
import { mergeExports } from '../../src/services/creatorReviewStore.js';
import { pilotReport, pilotReportMarkdown } from '../../src/services/creatorPilot.js';

const args = process.argv.slice(2);
const take = flag => { const i = args.indexOf(flag); return i >= 0 ? args.splice(i, 2)[1] : null; };
const outDir = path.resolve(take('--out') || 'data/creators/syria/reviews');
const tier = take('--tier') || '1';
const [queueFile, ...exportFiles] = args;
if (!queueFile || !exportFiles.length) { console.error('usage: pilot-report.mjs <queue.json> <export.json>... [--out dir] [--tier 1|all]'); process.exit(1); }
const all = JSON.parse(fs.readFileSync(queueFile, 'utf8')).records;
const queue = tier === 'all' ? all : all.filter(q => String(q.queue_tier) === tier);
const merged = mergeExports(exportFiles.map(f => JSON.parse(fs.readFileSync(f, 'utf8'))));
const rep = pilotReport({ queue, reviews: merged.reviews, members: merged.members, issues: merged.issues, mergeRejected: merged.rejected.length, strict: true });
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'PILOT_DECISION_REPORT.md'), pilotReportMarkdown(rep));
fs.writeFileSync(path.join(outDir, 'pilot_report.json'), JSON.stringify({ report: rep, merge_rejected: merged.rejected }, null, 1));
console.log(JSON.stringify({ scope: queue.length, reviewed: rep.data.reviewed, qualified: rep.data.qualified, contacted: rep.outreach.contacted, gate_ready: rep.gate.ready, merge_rejected: merged.rejected.length, out: outDir }));
