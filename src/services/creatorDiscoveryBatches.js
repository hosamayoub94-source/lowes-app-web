// Discovery Pool -> review batches. Pure logic (node-testable); the pool itself never enters the review queue automatically.
// Rules (owner decision 2026-10-01):
//   * smaller accounts first: 500–2.5K → 2.5–5K → 5–10K → 10–25K → 25K+ ; then <500 and unknown-followers last
//   * inside a tier every content bucket is served in turn (round-robin), so the batch is never "300 Beauty + 10 Food"
//   * "possible non-creator" rows and same-username cross-platform pairs are NOT dropped: they are listed separately as Needs Review
//   * each batch holds one tier; the plan reports shortages per bucket instead of padding
// Buckets are for balancing only — they are NOT a confirmed category and are never written back as `category`.

export const TIERS = [
  { key: 't1_500_2500', label: '500–2.5K', min: 500, max: 2500, priority: 'very_high' },
  { key: 't2_2500_5000', label: '2.5–5K', min: 2500, max: 5000, priority: 'high' },
  { key: 't3_5000_10000', label: '5–10K', min: 5000, max: 10000, priority: 'normal' },
  { key: 't4_10000_25000', label: '10–25K', min: 10000, max: 25000, priority: 'normal' },
  { key: 't5_25000_plus', label: '25K+', min: 25000, max: Infinity, priority: 'selective' },
  { key: 't6_under_500', label: '<500', min: 0, max: 500, priority: 'low' },
  { key: 't7_unknown', label: 'followers unknown', min: null, max: null, priority: 'verify_first' },
];

export const BUCKETS = ['beauty', 'fashion', 'fitness_wellness', 'food', 'home', 'education_experts', 'art_photography', 'entertainment_music', 'travel_lifestyle', 'family_wedding', 'ugc', 'other', 'unclassified'];

const TOPIC_BUCKET = {
  'Beauty and Self Care': 'beauty', 'Fashion and Accessories': 'fashion', 'Fitness and Health': 'fitness_wellness', Sports: 'fitness_wellness', Food: 'food', 'Home and Garden': 'home',
  Education: 'education_experts', Upskilling: 'education_experts', 'Product Education': 'education_experts', Photography: 'art_photography', 'Arts and Crafts': 'art_photography',
  'Entertainment and Music': 'entertainment_music', 'Acting and Drama': 'entertainment_music', Funny: 'entertainment_music', 'Animation and Cosplay': 'entertainment_music',
  Travel: 'travel_lifestyle', Nature: 'travel_lifestyle', 'Outdoor Activity': 'travel_lifestyle', 'Life and Society': 'travel_lifestyle', Family: 'family_wedding', 'Romance and Wedding': 'family_wedding',
  Games: 'other', 'Auto and Vehicles': 'other', Finance: 'other', Pets: 'other', Animals: 'other', 'Product Showcase': 'other',
};
const OWN_BUCKET = {
  makeup: 'beauty', skincare: 'beauty', beauty: 'beauty', hair: 'beauty', fashion: 'fashion', fitness: 'fitness_wellness', wellness: 'fitness_wellness', food: 'food', home: 'home', design: 'home',
  education: 'education_experts', experts: 'education_experts', doctors: 'education_experts', pharmacists: 'education_experts', photography: 'art_photography', art: 'art_photography',
  music: 'entertainment_music', entertainment: 'entertainment_music', lifestyle: 'travel_lifestyle', travel: 'travel_lifestyle', motherhood: 'family_wedding', ugc: 'ugc',
};
const SIGNAL_RANK = { strong: 0, medium: 1, weak: 2, query_only: 3 };

export const tierOf = followers => {
  if (followers === null || followers === undefined) return TIERS[6];
  return TIERS.slice(0, 6).find(t => followers >= t.min && followers < t.max) || TIERS[6];
};

/** Balancing bucket: our own confirmed category first, otherwise the first mappable provider topic, otherwise "unclassified". */
export function bucketOf(row) {
  if (row.category && OWN_BUCKET[row.category]) return OWN_BUCKET[row.category];
  for (const t of row.provider_topics || []) if (TOPIC_BUCKET[t]) return TOPIC_BUCKET[t];
  return 'unclassified';
}

const rowKey = r => `${r.platform}:${String(r.username).toLowerCase()}`;

/** Rows that must be reviewed by a human before anything else (kept in the pool, never auto-queued). */
export function splitReviewFlags(rows) {
  const byUser = {};
  rows.forEach(r => { (byUser[String(r.username).toLowerCase()] ||= []).push(r); });
  const crossUsers = new Set(Object.entries(byUser).filter(([, v]) => new Set(v.map(x => x.platform)).size > 1).map(([u]) => u));
  const needsReview = []; const eligible = [];
  rows.forEach(r => {
    const reasons = [];
    if (r.possible_non_creator) reasons.push('possible_non_creator');
    if (crossUsers.has(String(r.username).toLowerCase())) reasons.push('same_username_on_another_platform');
    (reasons.length ? needsReview : eligible).push(reasons.length ? { ...r, review_reasons: reasons } : r);
  });
  return { eligible, needsReview };
}

const priority = r => [SIGNAL_RANK[r.syria_signal] ?? 4, r.city ? 0 : 1, String(r.username).toLowerCase()];
const cmp = (a, b) => { const x = priority(a), y = priority(b); for (let i = 0; i < x.length; i++) { if (x[i] < y[i]) return -1; if (x[i] > y[i]) return 1; } return 0; };

/** Round-robin across buckets inside one tier. Deterministic. Returns the rows in serving order. */
export function balanceTier(rows) {
  const lists = new Map(BUCKETS.map(b => [b, []]));
  rows.forEach(r => lists.get(bucketOf(r)).push(r));
  lists.forEach(l => l.sort(cmp));
  const order = [...lists.entries()].filter(([, l]) => l.length).sort((a, b) => b[1].length - a[1].length || BUCKETS.indexOf(a[0]) - BUCKETS.indexOf(b[0])); // biggest bucket first only for tie-breaking the turn order
  const out = []; let left = rows.length;
  for (let i = 0; left > 0; i++) for (const [, l] of order) if (i < l.length) { out.push(l[i]); left--; }
  return out;
}

/** Builds the plan: batches of `size` per tier (never mixing tiers), plus the review list and honest shortages. */
export function planBatches(rows, { size = 50 } = {}) {
  const { eligible, needsReview } = splitReviewFlags(rows);
  const byTier = new Map(TIERS.map(t => [t.key, []]));
  eligible.forEach(r => byTier.get(tierOf(r.followers ?? null).key).push(r));
  const batches = []; const tierSummary = [];
  for (const t of TIERS) {
    const list = balanceTier(byTier.get(t.key));
    const buckets = {}; list.forEach(r => { const b = bucketOf(r); buckets[b] = (buckets[b] || 0) + 1; });
    tierSummary.push({ tier: t.key, label: t.label, priority: t.priority, accounts: list.length, buckets });
    for (let i = 0; i < list.length; i += size) {
      const rowsOf = list.slice(i, i + size);
      const bc = {}; rowsOf.forEach(r => { const b = bucketOf(r); bc[b] = (bc[b] || 0) + 1; });
      batches.push({ id: `B${String(batches.length + 1).padStart(3, '0')}`, tier: t.key, tier_label: t.label, priority: t.priority, size: rowsOf.length, buckets: bc, rows: rowsOf });
    }
  }
  const notes = [];
  tierSummary.forEach(t => { if (t.priority !== 'low' && t.accounts && Object.keys(t.buckets).length < 4) notes.push(`${t.label}: only ${Object.keys(t.buckets).length} content bucket(s) available — batches there cannot be balanced`); });
  const t1 = tierSummary[0]; if (t1.accounts < size * 3) notes.push(`500–2.5K: only ${t1.accounts} eligible accounts in the pool (public directories rank by size) — this tier needs another source`);
  const dup = new Set(); batches.forEach(b => b.rows.forEach(r => { const k = rowKey(r); if (dup.has(k)) throw new Error('duplicate across batches: ' + k); dup.add(k); }));
  return { size, tierSummary, batches, needsReview, notes, totals: { pool: rows.length, eligible: eligible.length, needs_review: needsReview.length, batches: batches.length } };
}
