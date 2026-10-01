// Quick-reject reviews (ReviewCard one-tap buttons): must validate and derive Not Relevant even in strict pilot mode,
// without the 8 answers, and must never produce a qualifying label. Run: node test-creator-quickreject.mjs
import { emptyReview, validateReview, deriveVerdict, reviewCompleteness, queueProgress, latestReviews } from './src/services/creatorReview.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('FAIL:', m); } };
const item = { id: 'c1', display_name: 'X', platforms: [{ platform: 'instagram', handle: 'x' }], queue_tier: 1, follower_count: 3000 };
const QUICK = { inactive: { active: 'no', slow_reason: 'no_recent_posts' }, private: { active: 'no', slow_reason: 'private_or_locked' }, unfit: { fit_lowes: 'no' } };

for (const [k, patch] of Object.entries(QUICK)) {
  const r = { ...emptyReview('c1', 'claudine karam'), ...patch, seconds: 7, notes: `رفض سريع: ${k}` };
  ok(validateReview(r).ok, `${k}: validates (${validateReview(r).errors})`);
  ok(!reviewCompleteness(r).complete, `${k}: the 8 answers are NOT complete (that is the point)`);
  const strict = deriveVerdict(r, item, { strict: true });
  ok(strict.primary === 'not_relevant' && strict.labels.length === 1, `${k}: strict verdict = not_relevant only`);
  ok(!strict.labels.some(l => ['pr_ready', 'ugc_ready', 'expert', 'paid_inquiry'].includes(l)), `${k}: no qualifying label`);
}

// it counts as reviewed in progress, and a later full review replaces it (latest wins)
const rej = { ...emptyReview('c1', 'A', new Date('2026-10-01T10:00:00Z')), ...QUICK.inactive };
const progress = queueProgress([item], latestReviews([rej]), (r, q) => deriveVerdict(r, q, { strict: true }));
ok(progress.reviewed === 1 && progress.verdicts.not_relevant === 1, 'quick reject counts as reviewed / not_relevant');
const redo = { ...emptyReview('c1', 'A', new Date('2026-10-01T11:00:00Z')), active: 'yes', fit_lowes: 'yes', skincare_fit: 'yes', action: 'gift' };
ok(latestReviews([rej, redo]).get('c1').active === 'yes', 'a later review overrides the quick reject');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
