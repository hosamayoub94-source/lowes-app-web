// Workbench storage — LOCAL first (browser storage / file export), because the creator_* tables are not applied to any database yet.
// The adapter takes a Storage-like object so it is node-testable. Nothing here touches Supabase.
// Data lives only in the reviewer's browser until exported; the team merges exports (importReviews / importAll).
import { mergeReviewSets, validateReview } from './creatorReview.js';
import { validateIssue } from './creatorPilot.js';

const V = 1;
export const KEYS = { queue: 'cw_queue', reviews: 'cw_reviews', waves: 'cw_waves', members: 'cw_members', assign: 'cw_assign', meta: 'cw_meta', issues: 'cw_issues' };

export function createLocalStore(storage, prefix = 'lowes:creators:v' + V + ':') {
  const get = (k, d) => { try { const s = storage.getItem(prefix + k); return s ? JSON.parse(s) : d; } catch { return d; } };
  const set = (k, v) => { try { storage.setItem(prefix + k, JSON.stringify(v)); return true; } catch { return false; } };
  return {
    kind: 'local',
    loadQueue: () => get(KEYS.queue, []),
    saveQueue: q => set(KEYS.queue, q),
    loadReviews: () => get(KEYS.reviews, []),
    saveReview(review) {
      const v = validateReview(review);
      if (!v.ok) return { ok: false, errors: v.errors };
      const all = mergeReviewSets(get(KEYS.reviews, []), [review]);
      return { ok: set(KEYS.reviews, all), errors: [] };
    },
    replaceReviews: list => set(KEYS.reviews, list),
    loadWaves: () => get(KEYS.waves, []),
    saveWaves: w => set(KEYS.waves, w),
    loadMembers: () => get(KEYS.members, []),
    saveMembers: m => set(KEYS.members, m),
    loadIssues: () => get(KEYS.issues, []),
    saveIssue(issue) {
      const v = validateIssue(issue); if (!v.ok) return { ok: false, errors: v.errors };
      const all = get(KEYS.issues, []); if (!all.some(i => i.id === issue.id)) all.push(issue);
      return { ok: set(KEYS.issues, all), errors: [] };
    },
    loadMeta: () => get(KEYS.meta, {}),
    saveMeta: m => set(KEYS.meta, { ...get(KEYS.meta, {}), ...m }),
    loadAssign: () => get(KEYS.assign, {}),
    saveAssign: a => set(KEYS.assign, a),
    exportAll: () => ({ version: V, exported_at: new Date().toISOString(), queue_count: get(KEYS.queue, []).length, reviews: get(KEYS.reviews, []), waves: get(KEYS.waves, []), members: get(KEYS.members, []), assign: get(KEYS.assign, {}), issues: get(KEYS.issues, []), meta: get(KEYS.meta, {}) }),
    importAll(json) {
      let d; try { d = typeof json === 'string' ? JSON.parse(json) : json; } catch { return { ok: false, error: 'invalid json' }; }
      if (!d || d.version !== V) return { ok: false, error: 'unsupported export version' };
      const good = (d.reviews || []).filter(r => validateReview(r).ok);
      set(KEYS.reviews, mergeReviewSets(get(KEYS.reviews, []), good));
      const wm = new Map(get(KEYS.waves, []).map(w => [w.id, w])); (d.waves || []).forEach(w => { if (!wm.has(w.id)) wm.set(w.id, w); }); set(KEYS.waves, [...wm.values()]);
      const mm = new Map(get(KEYS.members, []).map(m => [`${m.wave_id}|${m.creator_id}`, m]));
      (d.members || []).forEach(m => { const k = `${m.wave_id}|${m.creator_id}`; const cur = mm.get(k); if (!cur || (m.history?.length || 0) >= (cur.history?.length || 0)) mm.set(k, m); }); // longer history wins
      set(KEYS.members, [...mm.values()]);
      set(KEYS.assign, { ...get(KEYS.assign, {}), ...(d.assign || {}) });
      const im = new Map(get(KEYS.issues, []).map(i => [i.id, i])); (d.issues || []).filter(i => validateIssue(i).ok).forEach(i => { if (!im.has(i.id)) im.set(i.id, i); }); set(KEYS.issues, [...im.values()]);
      return { ok: true, reviews_added: good.length, reviews_rejected: (d.reviews || []).length - good.length };
    },
    clearAll() { Object.values(KEYS).forEach(k => { try { storage.removeItem(prefix + k); } catch { /* ignore */ } }); },
  };
}

/** Admin-side merge of several exportAll() files (one per reviewer/browser). Invalid reviews are reported, never merged.
 *  Members: for the same (wave, creator) the record with the longer history wins. */
export function mergeExports(exports = []) {
  let reviews = []; const rejected = []; const waves = new Map(); const members = new Map(); const issues = new Map(); let assign = {};
  exports.forEach((d, xi) => {
    if (!d || d.version !== V) { rejected.push({ export: xi, error: 'unsupported version' }); return; }
    (d.reviews || []).forEach((r, i) => { const v = validateReview(r); if (v.ok) reviews = mergeReviewSets(reviews, [r]); else rejected.push({ export: xi, index: i, errors: v.errors }); });
    (d.waves || []).forEach(w => { if (!waves.has(w.id)) waves.set(w.id, w); });
    (d.members || []).forEach(m => { const k = `${m.wave_id}|${m.creator_id}`; const c = members.get(k); if (!c || (m.history?.length || 0) > (c.history?.length || 0)) members.set(k, m); });
    (d.issues || []).forEach((i, k) => { if (validateIssue(i).ok) { if (!issues.has(i.id)) issues.set(i.id, i); } else rejected.push({ export: xi, issue_index: k, errors: validateIssue(i).errors }); });
    assign = { ...assign, ...(d.assign || {}) };
  });
  return { reviews, waves: [...waves.values()], members: [...members.values()], issues: [...issues.values()], assign, rejected };
}
