// Shared-storage layer for the Creator Workbench. Wraps the synchronous local store (creatorReviewStore.createLocalStore):
// the UI keeps reading/writing locally (instant, works offline) and this layer mirrors changes to the shared table
// `creator_workbench_items` (one row per item) and merges what the rest of the team wrote.
// Pure logic: the network client is injected ({ fetchAll(), upsert(rows) }) so it is node-testable.
//   merge rules: queue = remote union · reviews append-only (same key = same review) · waves first-wins ·
//   members longer history wins · assign remote wins · issues first-wins.
import { mergeReviewSets, validateReview } from './creatorReview.js';
import { validateIssue } from './creatorPilot.js';

export const reviewKey = r => `${r.creator_id}|${r.reviewer}|${r.reviewed_at}`;
export const memberKey = m => `${m.wave_id}|${m.creator_id}`;

/** Every local item as a shared row. */
export function localRows(local) {
  const rows = [];
  local.loadQueue().forEach(q => rows.push({ kind: 'queue', id: q.id, data: q }));
  local.loadReviews().forEach(r => rows.push({ kind: 'review', id: reviewKey(r), data: r }));
  local.loadWaves().forEach(w => rows.push({ kind: 'wave', id: w.id, data: w }));
  local.loadMembers().forEach(m => rows.push({ kind: 'member', id: memberKey(m), data: m }));
  Object.entries(local.loadAssign()).forEach(([cid, to]) => rows.push({ kind: 'assign', id: cid, data: { to } }));
  local.loadIssues().forEach(i => rows.push({ kind: 'issue', id: i.id, data: i }));
  return rows;
}

/** Merge remote rows into the local store. Returns counts. */
export function applyRemote(local, rows) {
  const by = k => rows.filter(r => r.kind === k).map(r => r.data);
  const queue = new Map(local.loadQueue().map(q => [q.id, q])); by('queue').forEach(q => queue.set(q.id, q));
  if (queue.size) local.saveQueue([...queue.values()]);
  const revs = by('review').filter(r => validateReview(r).ok);
  if (revs.length) local.replaceReviews(mergeReviewSets(local.loadReviews(), revs));
  const waves = new Map(local.loadWaves().map(w => [w.id, w])); by('wave').forEach(w => { if (!waves.has(w.id)) waves.set(w.id, w); });
  local.saveWaves([...waves.values()]);
  const mem = new Map(local.loadMembers().map(m => [memberKey(m), m]));
  by('member').forEach(m => { const c = mem.get(memberKey(m)); if (!c || (m.history?.length || 0) >= (c.history?.length || 0)) mem.set(memberKey(m), m); });
  local.saveMembers([...mem.values()]);
  const asg = { ...local.loadAssign() }; rows.filter(r => r.kind === 'assign').forEach(r => { if (r.data?.to) asg[r.id] = r.data.to; });
  local.saveAssign(asg);
  by('issue').filter(i => validateIssue(i).ok).forEach(i => local.saveIssue(i));
  return { queue: queue.size, reviews: revs.length, members: by('member').length };
}

export function createSyncedStore(local, client, who = '') {
  const pushed = new Map(); // "kind|id" -> JSON of data last known to be in the shared table
  const sig = r => `${r.kind}|${r.id}`;
  let busy = null;

  async function pushDiff() {
    const dirty = localRows(local).filter(r => pushed.get(sig(r)) !== JSON.stringify(r.data));
    if (!dirty.length) return { pushed: 0 };
    const res = await client.upsert(dirty.map(r => ({ kind: r.kind, id: r.id, data: r.data, updated_by: who, updated_at: new Date().toISOString() })));
    if (res && res.error) return { pushed: 0, error: res.error };
    dirty.forEach(r => pushed.set(sig(r), JSON.stringify(r.data)));
    return { pushed: dirty.length };
  }

  /** fetch everything, merge into local, then upload whatever local has that the table lacks. Safe to call repeatedly. */
  async function sync() {
    if (busy) return busy;
    busy = (async () => {
      try {
        const got = await client.fetchAll();
        if (got.error) return { ok: false, error: got.error };
        const rows = got.rows || [];
        rows.forEach(r => pushed.set(sig(r), JSON.stringify(r.data)));
        applyRemote(local, rows);
        // after the merge, rows whose merged value differs from the remote one are pushed too (e.g. longer member history)
        const up = await pushDiff();
        return { ok: !up.error, error: up.error, pulled: rows.length, pushed: up.pushed };
      } catch (e) { return { ok: false, error: String(e.message || e) }; }
      finally { busy = null; }
    })();
    return busy;
  }

  const afterSave = res => { pushDiff().catch(() => { /* retried on next save / sync */ }); return res; };
  return {
    ...local,
    kind: 'shared',
    sync,
    saveQueue: q => afterSave(local.saveQueue(q)),
    saveReview: r => afterSave(local.saveReview(r)),
    replaceReviews: l => afterSave(local.replaceReviews(l)),
    saveWaves: w => afterSave(local.saveWaves(w)),
    saveMembers: m => afterSave(local.saveMembers(m)),
    saveIssue: i => afterSave(local.saveIssue(i)),
    saveAssign: a => afterSave(local.saveAssign(a)),
    importAll(json) { return afterSave(local.importAll(json)); },
  };
}

/** Supabase-backed client for the shared table. */
export function supabaseClient(supabase) {
  const T = 'creator_workbench_items';
  return {
    async fetchAll() {
      const rows = []; const page = 1000;
      for (let from = 0; ; from += page) {
        const { data, error } = await supabase.from(T).select('kind,id,data').order('kind').order('id').range(from, from + page - 1);
        if (error) return { error: error.message };
        rows.push(...data);
        if (data.length < page) break;
      }
      return { rows };
    },
    async upsert(rows) {
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await supabase.from(T).upsert(rows.slice(i, i + 200), { onConflict: 'kind,id' });
        if (error) return { error: error.message };
      }
      return {};
    },
  };
}
