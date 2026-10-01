// Queue editing by the team: add a creator manually, remove (soft) / restore. Pure logic, node-testable.
// Evidence-first: a manual record always carries who added it, when, and the source; unknown values stay null.
// Removing never deletes: the record gets `removed` {at, by, reason} so reviews/outreach already made stay auditable,
// and the creator can be restored. Removed creators are excluded from the working queue and from pilot metrics.
import { parseProfileUrl, toNum, tierKey, SYRIA_CITIES } from './creatorLogic.js';

export const MANUAL_CATEGORIES = ['skincare', 'beauty', 'makeup', 'hair', 'fashion', 'motherhood', 'wellness', 'other'];
export const REMOVE_REASONS = ['غير مناسب للبراند', 'حساب غير نشط', 'حساب خاص / مقفول', 'مكرر', 'طلب صاحب الحساب', 'أخرى'];

const handleKey = (platform, handle) => `${platform}:${String(handle).toLowerCase()}`;

/** The same platform+handle already in the queue (removed ones included, so a removed creator is restored instead of re-added). */
export function findInQueue(queue, platform, handle) {
  const k = handleKey(platform, handle);
  return (queue || []).find(q => (q.platforms || []).some(p => handleKey(p.platform, p.handle) === k)) || null;
}

/** input: { profile_url, display_name, followers?, main_category?, city?, source, note? } -> { ok, record } | { ok:false, errors[] } */
export function buildManualRecord(input = {}, queue = [], by = '', now = new Date()) {
  const errors = [];
  const name = String(input.display_name || '').trim();
  if (!name) errors.push('الاسم مطلوب');
  const p = parseProfileUrl(String(input.profile_url || ''));
  if (!p.ok) errors.push(p.error === 'unsupported_host' ? 'رابط البروفايل يجب أن يكون Instagram/TikTok/Facebook/YouTube/Snapchat' : 'رابط البروفايل غير صالح');
  const source = String(input.source || '').trim();
  if (!source) errors.push('مصدر الاكتشاف مطلوب (رابط أو وصف)');
  const followers = toNum(input.followers);
  if (input.followers !== undefined && input.followers !== null && input.followers !== '' && (followers === null || followers < 0)) errors.push('عدد المتابعين غير صالح');
  const cat = input.main_category || null;
  if (cat && !MANUAL_CATEGORIES.includes(cat)) errors.push('فئة غير معروفة');
  const city = input.city || null;
  if (city && !SYRIA_CITIES.includes(city)) errors.push('مدينة غير معروفة');
  if (errors.length) return { ok: false, errors };
  const dup = findInQueue(queue, p.platform, p.handle);
  if (dup) return { ok: false, errors: [dup.removed ? `هذا الحساب محذوف سابقاً (${dup.display_name}) — استعده من قائمة المحذوفين` : `الحساب موجود أصلاً في الطابور (${dup.display_name})`], duplicate_of: dup.id };
  const at = new Date(now).toISOString();
  const id = `CRT-MAN-${at.slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 8)}`;
  const urlSource = /^https?:\/\//i.test(source);
  return {
    ok: true,
    record: {
      id, queue_tier: 1, display_name: name, bio: input.note ? String(input.note).trim() : null,
      platforms: [{ platform: p.platform, handle: p.handle, profile_url: p.url, followers }],
      follower_count: followers, tier: followers === null ? 'unknown' : tierKey(followers),
      main_category: cat, subcategories: [], creator_type: null, creator_city: city,
      audience_syria_pct: null, activity_status: 'unknown', activity_basis: 'manually added — not verified', last_post_at: null,
      pools: [], pr_fit: 'unknown', ugc_potential: 'unknown', accepts_gifting: 'unknown', paid_status: 'unknown',
      contacts: [], best_contact_rank: null, priority_score: null, data_quality_score: null,
      why_text: `أضافه ${by || 'عضو الفريق'} يدوياً — المصدر: ${source}`, warnings: ['manually added: no research evidence yet'],
      sample_posts: [], hashtags: [], verification_level: 'C', needs_manual_review: true, duplicate_group: null, growth_status: 'unknown',
      is_celebrity: false, creator_status: 'discovered',
      sources: [{ provider: 'manual', source_type: urlSource ? 'manual_url' : 'manual_note', source_url: urlSource ? source : p.url, note: urlSource ? null : source, observed_at: at, added_by: by || null }],
      added_manually: true, added_by: by || null, added_at: at,
    },
  };
}

export function removeFromQueue(record, by, reason, now = new Date()) {
  if (!record) return null;
  return { ...record, removed: { at: new Date(now).toISOString(), by: by || null, reason: String(reason || '').trim() || 'بدون سبب' } };
}

export function restoreToQueue(record) {
  if (!record) return null;
  const { removed, ...rest } = record; // eslint-disable-line no-unused-vars
  return { ...rest, restored_at: new Date().toISOString() };
}

export const isRemoved = q => !!(q && q.removed);

/** Last edit time of a queue record (add / remove / restore) — used to merge concurrent edits: the later one wins. */
export const recordStamp = q => Math.max(0, ...[q?.removed?.at, q?.restored_at, q?.added_at].map(t => (t ? new Date(t).getTime() : 0)));
