// creatorWorkqueue — طابور عمل «صناع المحتوى»: منطق نقي (بلا supabase وبلا DOM، يُختبر بـ node test-creator-workqueue.mjs).
// يربط الأسئلة الثمانية للـWorkbench القديم (src/services/creatorReview.js — نفس deriveVerdict المختبَر) بأعمدة creator_prospects الحالية،
// بلا migration (قرار حسام 10 أكتوبر 2026): كل إجابة = tag محجوز "r:<key>=<value>"، نوع التعاون = "collab:<verdict>"،
// روابط الأدلة داخل evidence ("video:URL contact:URL pr:URL" بعد أي نص قديم). «غير متأكد» لا يُكتب أبداً — يبقى مجهولاً.
import { deriveVerdict, reviewCompleteness } from './creatorReview.js';
import {
  statusOf, freeTags, reviewTags, collabOf, isGarbled, missingEssentials, scoreCreator, govOf, countryOf,
  STATUS_AR, TYPE_AR, CONTENT_AR, FOCUS_AR, COLLAB_AR, VERIFICATION_AR,
} from '../../supabase/functions/_shared/creatorMatch.js';

export const TRI_AR = { yes: 'نعم', no: 'لا', unsure: 'غير متأكد' };
export const FIT_AR = { yes: 'نعم', partial: 'جزئياً', no: 'لا', unsure: 'غير متأكد' };
export const SKIN_AR = { yes: 'نعم', maybe: 'ربما', no: 'لا', unsure: 'غير متأكد' };
export const UGCQ_AR = { high: 'عالية', medium: 'متوسطة', low: 'ضعيفة', unsure: 'غير متأكد' };
export const PR_AR = { none: 'لا يوجد', open_to_collab: 'منفتح على التعاون', gifted_seen: 'شفت هدايا/تعاون سابق', unsure: 'غير متأكد' };
export const ACTION_AR = { gift: 'هدية PR', ugc: 'UGC', paid: 'مدفوع', none: 'لا تعاون', unsure: 'لم أقرر' };
export const REJECT_AR = { inactive: 'غير نشط', private: 'خاص / مقفول', not_fit: 'غير مناسب للبراند' };

// answer key in the form -> short key in the reserved tag
const TAG_KEYS = { active: 'active', fit: 'fit', face: 'face', talks: 'talks', review: 'review', unbox: 'unbox', ugc_quality: 'ugcq', pr: 'pr', skin: 'skin', action: 'action' };
const ALLOWED = {
  active: ['yes', 'no'], fit: ['yes', 'partial', 'no'], face: ['yes', 'no'], talks: ['yes', 'no'], review: ['yes', 'no'], unbox: ['yes', 'no'],
  ugc_quality: ['high', 'medium', 'low'], pr: ['none', 'open_to_collab', 'gifted_seen'], skin: ['yes', 'maybe', 'no'], action: ['gift', 'ugc', 'paid', 'none'],
};
const MAX_VIDEOS = 3;
const EVIDENCE_MAX = 500; // = cleanText limit for text fields in creator-prospects
const isUrl = (u) => { try { const x = new URL(u); return x.protocol === 'http:' || x.protocol === 'https:'; } catch { return false; } };
const arr = (v) => (Array.isArray(v) ? v : []);
const isPendingRow = (r) => String(r?.handle || '').startsWith('pending_');

function evidenceParts(row) {
  const toks = String(row.evidence || '').split(/\s+/).filter(Boolean);
  const out = { legacy: [], video: [], contact: null, pr: null };
  for (const t of toks) {
    if (t.startsWith('video:')) out.video.push(t.slice(6));
    else if (t.startsWith('contact:')) out.contact = t.slice(8);
    else if (t.startsWith('pr:')) out.pr = t.slice(3);
    else out.legacy.push(t);
  }
  return out;
}

export function igProfile(row) {
  if (isPendingRow(row)) return '';
  const h = row.platform === 'instagram' ? row.handle : row.other_platforms?.instagram;
  return h ? `https://www.instagram.com/${encodeURIComponent(String(h).replace(/^@+/, ''))}/` : '';
}

/** Form state rebuilt from a stored row (so a half-done review re-opens where it stopped). */
export function answersFromRow(row = {}) {
  const t = reviewTags(row);
  const ev = evidenceParts(row);
  const pick = (k) => (ALLOWED[k].includes(t[TAG_KEYS[k]]) ? t[TAG_KEYS[k]] : 'unsure');
  return {
    active: pick('active'), last_post: row.last_active_at ? String(row.last_active_at).slice(0, 10) : '',
    fit: pick('fit'), creator_type: row.creator_type || '',
    face: pick('face'), talks: pick('talks'), review: pick('review'), unbox: pick('unbox'), ugc_quality: pick('ugc_quality'),
    videos: ev.video.slice(0, MAX_VIDEOS),
    governorate: row.governorate || '', city: row.city || '',
    email: row.email || '', phone: row.phone || '', preferred_contact: row.preferred_contact || '', contact_src: ev.contact || '',
    no_contact: t.nocontact === 'yes',
    pr: pick('pr'), pr_url: ev.pr || '',
    skin: pick('skin'), skincare_focus: arr(row.skincare_focus),
    action: pick('action'),
    notes: row.notes || '',
  };
}

const segmentOf = (type) => (!type ? null : type === 'expert' ? 'expert' : type === 'general' ? 'lifestyle_women' : 'skincare_beauty');

/** The legacy review record, built from the form, so deriveVerdict / reviewCompleteness run unchanged. */
export function toLegacyReview(a, row = {}) {
  const ig = igProfile(row);
  const src = isUrl(a.contact_src) ? a.contact_src : ig || (isUrl(row.profile_url) ? row.profile_url : null);
  const contacts = [];
  if (a.email && src) contacts.push({ type: 'email', value: a.email, source_url: src, is_public: true });
  if (a.phone && src) contacts.push({ type: a.preferred_contact === 'whatsapp' ? 'whatsapp' : 'phone', value: a.phone, source_url: src, is_public: true });
  if (ig) contacts.push({ type: 'instagram_dm', value: row.platform === 'instagram' ? row.handle : row.other_platforms?.instagram, source_url: ig, is_public: true });
  const gov = govOf(row.country || 'SY', a.governorate);
  return {
    active: a.active, last_post_seen: a.last_post || null,
    fit_lowes: a.fit, segment: segmentOf(a.creator_type || row.creator_type), skincare_fit: a.skin,
    face_on_camera: a.face, talks_to_camera: a.talks, does_review: a.review, does_unboxing: a.unbox,
    ugc_quality: a.ugc_quality, video_urls: arr(a.videos).filter(isUrl),
    city: a.city || gov?.ar || null,
    contacts: a.no_contact ? [] : contacts, no_public_contact: !!a.no_contact, contact_confirmed: false,
    pr_signal: a.pr, pr_evidence_url: isUrl(a.pr_url) ? a.pr_url : null,
    action: a.action, notes: a.notes || '',
  };
}

/** Verdict + completeness for the panel (same rules as the old Workbench, non-strict). */
export function verdictFor(a, row = {}) {
  const legacy = toLegacyReview(a, row);
  const v = deriveVerdict(legacy, { creator_type: a.creator_type || row.creator_type });
  return { ...v, completeness: reviewCompleteness(legacy) };
}

// Plain-Arabic reasons for missing answers (deriveVerdict speaks English keys).
const MISSING_AR = {
  active: 'هل الحساب نشط؟', fit_lowes: 'هل المحتوى مناسب لـLOWE\'S؟', action: 'القرار (هدية/UGC/مدفوع/لا)', skincare_fit: 'مناسب للسكين كير؟', contact: 'طريقة تواصل عامة',
};
export const missingAr = (m) => (m.startsWith('ugc_evidence') ? 'دليل UGC: وجه + كلام/ريفيو/أنبوكسنغ + جودة + رابط فيديو' : MISSING_AR[m] || m);

const KEEP_STATUSES = ['contacted', 'interested', 'collaborating'];

/** Turns a finished (or partial) review into ONE update patch for the existing `update` action. Pure. */
export function reviewToPatch(a, row = {}, now = new Date()) {
  const v = verdictFor(a, row);
  const tags = freeTags(row);
  for (const [k, short] of Object.entries(TAG_KEYS)) if (ALLOWED[k].includes(a[k])) tags.push(`r:${short}=${a[k]}`);
  if (a.no_contact) tags.push('r:nocontact=yes');
  tags.push(`collab:${v.primary}`);

  const ct = new Set(arr(row.content_types));
  if (a.review === 'yes') ct.add('review'); else if (a.review === 'no') ct.delete('review');
  if (a.unbox === 'yes') ct.add('unboxing'); else if (a.unbox === 'no') ct.delete('unboxing');
  if (v.labels.includes('ugc_ready')) ct.add('ugc');

  const ev = evidenceParts(row);
  const videos = arr(a.videos).filter(isUrl).slice(0, MAX_VIDEOS);
  const build = () => [
    ...ev.legacy,
    ...videos.map((u) => `video:${u}`),
    ...(isUrl(a.contact_src) ? [`contact:${a.contact_src}`] : []),
    ...(isUrl(a.pr_url) ? [`pr:${a.pr_url}`] : []),
  ].join(' ');
  let evidence = build();
  while (evidence.length > EVIDENCE_MAX && videos.length > 1) { videos.pop(); evidence = build(); } // the server keeps 500 chars: never cut a URL in half

  const cur = statusOf(row.status);
  const status = KEEP_STATUSES.includes(cur) ? cur
    : v.primary === 'not_relevant' ? 'rejected'
      : v.primary === 'needs_review' ? 'needs_review' : 'verified';

  const patch = {
    tags, content_types: [...ct], skincare_focus: arr(a.skincare_focus), status,
    verification_status: row.verification_status === 'verified' ? 'verified' : 'partial',
    last_verified_at: new Date(now).toISOString(),
  };
  if (evidence !== String(row.evidence || '').split(/\s+/).filter(Boolean).join(' ')) patch.evidence = evidence || null;
  if (a.creator_type) patch.creator_type = a.creator_type;
  if (a.last_post) patch.last_active_at = a.last_post;
  if (a.governorate) patch.governorate = a.governorate;
  if (a.city) patch.city = a.city;
  if (a.governorate || a.city) patch.location_confidence = 'high';
  if (a.email) patch.email = a.email;
  if (a.phone) patch.phone = a.phone;
  if (a.preferred_contact) patch.preferred_contact = a.preferred_contact;
  if ((a.notes || '') !== (row.notes || '')) patch.notes = a.notes || null;
  // send only what really changes (keeps the audit trail readable); the check date is always a new observation
  const same = (x, y) => JSON.stringify(Array.isArray(x) ? [...x].sort() : x ?? null) === JSON.stringify(Array.isArray(y) ? [...y].sort() : y ?? null);
  const dateOnly = (d) => (d ? String(d).slice(0, 10) : null);
  for (const k of Object.keys(patch)) {
    if (k === 'last_verified_at') continue;
    const cur = k === 'last_active_at' ? dateOnly(row[k]) : k === 'content_types' || k === 'skincare_focus' || k === 'tags' ? arr(row[k]) : row[k];
    if (same(patch[k], cur)) delete patch[k];
  }
  return { patch, verdict: v };
}

/** One-click exclusion (old Workbench quick reject): records why, never deletes. */
export function quickRejectPatch(row = {}, reason, now = new Date()) {
  if (!REJECT_AR[reason]) throw new Error('unknown reject reason');
  const keep = (row.tags || []).filter((t) => String(t).startsWith('r:') && !/^r:(active|fit)=/.test(String(t)));
  const tags = [...freeTags(row), ...keep, `reject:${reason}`, 'collab:not_relevant'];
  if (reason === 'inactive') tags.push('r:active=no');
  if (reason === 'not_fit') tags.push('r:fit=no');
  return { status: 'rejected', tags, verification_status: row.verification_status === 'verified' ? 'verified' : 'partial', last_verified_at: new Date(now).toISOString() };
}

/** «الخطوة التالية» for one account — the single line that tells the team what to do now. */
export function nextStep(row = {}) {
  if (row.deleted_at) return { key: 'deleted', ar: 'محذوف — استرجعه إذا لزم', tone: 'gray' };
  if (isPendingRow(row)) return { key: 'find_account', ar: 'ابحث عن حسابه الحقيقي وأضفه', tone: 'amber' };
  if (isGarbled(row)) return { key: 'fix_name', ar: 'الاسم غير مقروء — صحّحه من الحساب', tone: 'amber' };
  const st = statusOf(row.status);
  if (['rejected', 'not_interested', 'inactive'].includes(st)) return { key: 'none', ar: 'مستبعد — لا إجراء', tone: 'gray' };
  if (st === 'needs_review' || st === 'discovered') {
    const started = Object.keys(reviewTags(row)).length > 0;
    if (!started) return { key: 'review', ar: 'راجِع الحساب (8 أسئلة)', tone: 'amber' };
    const done = reviewCompleteness(toLegacyReview(answersFromRow(row), row)).done;
    return { key: 'complete_review', ar: `أكمل المراجعة (${done}/8)`, tone: 'amber' };
  }
  if (st === 'verified') {
    const c = collabOf(row);
    if (c === 'paid_inquiry') return { key: 'paid', ar: 'اسأل عن السعر (تعاون مدفوع)', tone: 'blue' };
    if (!row.email && !row.phone && !igProfile(row)) return { key: 'find_contact', ar: 'لاقِ طريقة تواصل عامة', tone: 'amber' };
    return { key: 'contact', ar: `جاهز للتواصل${c && COLLAB_AR[c] ? ` — ${COLLAB_AR[c]}` : ''}`, tone: 'green' };
  }
  if (st === 'contacted') return { key: 'follow_up', ar: 'تابع الرد', tone: 'blue' };
  if (st === 'interested') return { key: 'arrange', ar: 'رتّب الاتفاق/الإرسال', tone: 'blue' };
  if (st === 'collaborating') return { key: 'track', ar: 'تابع النشر والنتيجة', tone: 'green' };
  return { key: 'review', ar: 'راجِع الحساب', tone: 'amber' };
}

// ---------------- export ----------------
// Whitelisted columns only. Contact columns (email/phone/preferred contact) are added only for admin / manage_creator_data.
export const EXPORT_COLUMNS = [
  ['name', 'الاسم'], ['handle', 'الحساب'], ['platform', 'المنصة'], ['profile', 'رابط الحساب'], ['country', 'الدولة'], ['governorate', 'المحافظة'], ['city', 'المدينة'],
  ['followers', 'المتابعون'], ['engagement_pct', 'التفاعل %'], ['status', 'الحالة'], ['verification', 'التحقق'], ['collab', 'نوع التعاون'], ['creator_type', 'نوع المبدع'],
  ['content_types', 'أنواع المحتوى'], ['skincare_focus', 'تخصص العناية'], ['priority_score', 'أولوية (0-100، ليست تقييم جودة)'], ['next_step', 'الخطوة التالية'],
  ['missing', 'ناقص'], ['source', 'المصدر'], ['source_url', 'رابط المصدر'], ['last_verified_at', 'آخر تحقق'], ['last_active_at', 'آخر نشاط'], ['owner', 'المسؤول'],
];
export const CONTACT_COLUMNS = [['email', 'البريد (عام)'], ['phone', 'الهاتف (عام)'], ['preferred_contact', 'التواصل المفضل']];
const MISSING_COL_AR = { account: 'الحساب', name: 'اسم مقروء', followers: 'المتابعون', place: 'المكان', source: 'المصدر' };

function cell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // spreadsheet formula injection guard
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function exportValue(r, key) {
  switch (key) {
    case 'handle': return isPendingRow(r) ? '' : String(r.handle || '').replace(/^@+/, ''); // no leading "@": spreadsheets treat it as a formula prefix
    case 'profile': return igProfile(r) || (isUrl(r.profile_url) ? r.profile_url : '');
    case 'country': return countryOf(r.country)?.ar || r.country || '';
    case 'governorate': return govOf(r.country || 'SY', r.governorate)?.ar || '';
    case 'status': return STATUS_AR[statusOf(r.status)] || r.status || '';
    case 'verification': return VERIFICATION_AR[r.verification_status || 'unverified'];
    case 'collab': { const c = collabOf(r); return c ? COLLAB_AR[c] : ''; }
    case 'creator_type': return TYPE_AR[r.creator_type] || '';
    case 'content_types': return arr(r.content_types).map((c) => CONTENT_AR[c] || c).join('، ');
    case 'skincare_focus': return arr(r.skincare_focus).map((c) => FOCUS_AR[c] || c).join('، ');
    case 'priority_score': return r.score ?? scoreCreator(r).score;
    case 'next_step': return nextStep(r).ar;
    case 'missing': return missingEssentials(r).map((m) => MISSING_COL_AR[m]).join('، ');
    case 'last_verified_at': case 'last_active_at': return r[key] ? String(r[key]).slice(0, 10) : '';
    case 'name': return isGarbled(r) ? '' : r.name || '';
    default: return r[key] ?? '';
  }
}
/** CSV (UTF-8 BOM, Excel-safe). `withContacts` (admin or manage_creator_data — same rule as the server) decides whether contact columns exist at all. */
export function toExportCsv(rows, { withContacts = false } = {}) {
  const cols = withContacts ? [...EXPORT_COLUMNS, ...CONTACT_COLUMNS] : EXPORT_COLUMNS;
  const lines = [cols.map(([, h]) => cell(h)).join(',')];
  for (const r of rows || []) lines.push(cols.map(([k]) => cell(exportValue(r, k))).join(','));
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

// ---------------- import encoding ----------------
/** Bytes of an uploaded CSV -> text. UTF-8 first (strict); Arabic Excel files saved as Windows-1256 are decoded as such instead of turning into "????". */
export function decodeCsvBytes(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, ''), encoding: 'utf-8' }; }
  catch { /* not valid UTF-8 */ }
  try { return { text: new TextDecoder('windows-1256').decode(bytes), encoding: 'windows-1256' }; }
  catch { return { text: new TextDecoder('utf-8').decode(bytes), encoding: 'utf-8-lossy' }; }
}
