// creatorWorkqueue — طابور عمل «صناع المحتوى»: منطق نقي (بلا supabase وبلا DOM، يُختبر بـ node test-creator-workqueue.mjs).
// مراجعة الحساب = 5 أسئلة فقط (ملاحظات فريق العمل 18 أكتوبر 2026): نوع الحساب، كيف يصوّر (الوجه/فويس أوفر/الجودة)، المدينة، تواصل عام، القرار. تُربط بأعمدة creator_prospects الحالية،
// بلا migration (قرار حسام 10 أكتوبر 2026): كل إجابة = tag محجوز "r:<key>=<value>"، نوع التعاون = "collab:<verdict>"،
// روابط الأدلة داخل evidence ("video:URL contact:URL pr:URL" بعد أي نص قديم). «غير متأكد» لا يُكتب أبداً — يبقى مجهولاً.
import { outreachMessage } from './creatorReview.js';
import {
  statusOf, freeTags, reviewTags, collabOf, isGarbled, missingEssentials, scoreCreator, govOf, countryOf,
  STATUS_AR, TYPE_AR, CONTENT_AR, FOCUS_AR, COLLAB_AR, VERIFICATION_AR,
} from '../../supabase/functions/_shared/creatorMatch.js';

export const TRI_AR = { yes: 'نعم', no: 'لا', unsure: 'غير متأكد' };
export const UGCQ_AR = { high: 'عالية', medium: 'متوسطة', low: 'ضعيفة', unsure: 'غير متأكد' };
export const ACTION_AR = { gift: 'هدية PR', ugc: 'UGC', paid: 'مدفوع', none: 'لا تعاون', unsure: 'لم أقرر' };
export const REJECT_AR = { inactive: 'غير نشط', private: 'خاص / مقفول', not_fit: 'غير مناسب للبراند' };

// answer key in the form -> short key in the reserved tag
const TAG_KEYS = { face: 'face', voice: 'voice', ugc_quality: 'ugcq', action: 'action' };
const ALLOWED = {
  face: ['yes', 'no'], voice: ['yes', 'no'], ugc_quality: ['high', 'medium', 'low'], action: ['gift', 'ugc', 'paid', 'none'],
};
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
    creator_type: row.creator_type || '',
    face: pick('face'), voice: pick('voice'), ugc_quality: pick('ugc_quality'),
    governorate: row.governorate || '', city: row.city || '',
    email: row.email || '', phone: row.phone || '', preferred_contact: row.preferred_contact || '', contact_src: ev.contact || '',
    no_contact: t.nocontact === 'yes',
    action: pick('action'),
    notes: row.notes || '',
  };
}

/** Progress over the 5 questions ("unsure" and blanks are NOT answers). */
export function reviewProgress(a, row = {}) {
  void row;
  const answered = {
    q1: !!a.creator_type,
    q2: a.face !== 'unsure' && a.voice !== 'unsure' && a.ugc_quality !== 'unsure',
    q3: !!(a.city || a.governorate),
    q4: !!(a.email || a.phone) || a.no_contact === true,
    q5: a.action !== 'unsure',
  };
  const missing = Object.keys(answered).filter((k) => !answered[k]);
  return { answered, missing, complete: missing.length === 0, done: 5 - missing.length, total: 5 };
}

const VERDICT_ORDER = ['ugc_ready', 'pr_ready', 'expert', 'paid_inquiry', 'needs_review', 'not_relevant'];
// A route the team can really use: the account's own Instagram, or a public email/phone the reviewer recorded.
const reachable = (a, row) => !!(igProfile(row) || a.email || a.phone);

/** Collaboration verdict from the human's answers. Nothing is guessed: a missing answer means "needs review". */
export function verdictFor(a, row = {}) {
  const completeness = reviewProgress(a, row);
  const reasons = [], missing = [];
  if (a.action === 'none') return { labels: ['not_relevant'], primary: 'not_relevant', reasons: ['reviewer: no collaboration'], missing: [], completeness };
  if (a.action === 'unsure') missing.push('action');
  const labels = [];
  const type = a.creator_type || row.creator_type;
  const ugcOk = (a.face === 'yes' || a.voice === 'yes') && ['high', 'medium'].includes(a.ugc_quality);
  if (a.action === 'ugc') { if (ugcOk) { labels.push('ugc_ready'); reasons.push('face or voice-over, ' + a.ugc_quality + ' quality'); } else missing.push('ugc_evidence'); }
  if (['gift', 'ugc'].includes(a.action)) { if (reachable(a, row)) { labels.push('pr_ready'); reasons.push('gifting recommended, reachable'); } else missing.push('contact'); }
  if (a.action === 'paid') { if (reachable(a, row)) { labels.push('paid_inquiry'); reasons.push('paid inquiry recommended'); } else missing.push('contact'); }
  if (type === 'expert' && a.action !== 'unsure') { labels.push('expert'); reasons.push('expert profile'); }
  if (!labels.length) labels.push('needs_review');
  const primary = VERDICT_ORDER.find((v) => labels.includes(v));
  return { labels, primary, reasons, missing, completeness };
}

// Plain-Arabic reasons for missing answers.
const MISSING_AR = { action: 'القرار (هدية / UGC / مدفوع / لا)', contact: 'طريقة تواصل عامة' };
export const missingAr = (m) => (m === 'ugc_evidence' ? 'للـUGC: يظهر الوجه أو فويس أوفر + جودة التصوير' : MISSING_AR[m] || m);

const KEEP_STATUSES = ['contacted', 'interested', 'collaborating'];

/** Turns a finished (or partial) review into ONE update patch for the existing `update` action. Pure. */
export function reviewToPatch(a, row = {}, now = new Date()) {
  const v = verdictFor(a, row);
  const tags = freeTags(row);
  for (const [k, short] of Object.entries(TAG_KEYS)) if (ALLOWED[k].includes(a[k])) tags.push(`r:${short}=${a[k]}`);
  if (a.no_contact) tags.push('r:nocontact=yes');
  tags.push(`collab:${v.primary}`);

  const ct = new Set(arr(row.content_types));
  if (v.labels.includes('ugc_ready')) ct.add('ugc');

  // evidence: legacy text and any existing video:/pr: links stay untouched; only the contact source link is (re)written
  const ev = evidenceParts(row);
  const build = (withLinks) => [
    ...ev.legacy,
    ...(withLinks ? ev.video.map((u) => `video:${u}`) : []),
    ...(isUrl(a.contact_src) ? [`contact:${a.contact_src}`] : []),
    ...(withLinks && ev.pr ? [`pr:${ev.pr}`] : []),
  ].join(' ');
  let evidence = build(true);
  if (evidence.length > EVIDENCE_MAX) evidence = build(false); // the server keeps 500 chars: never cut a URL in half

  const cur = statusOf(row.status);
  const status = KEEP_STATUSES.includes(cur) ? cur
    : v.primary === 'not_relevant' ? 'rejected'
      : v.primary === 'needs_review' ? 'needs_review' : 'verified';

  const patch = {
    tags, content_types: [...ct], status,
    verification_status: row.verification_status === 'verified' ? 'verified' : 'partial',
    last_verified_at: new Date(now).toISOString(),
  };
  if (evidence !== String(row.evidence || '').split(/\s+/).filter(Boolean).join(' ')) patch.evidence = evidence || null;
  if (a.creator_type) patch.creator_type = a.creator_type;
  if (a.governorate) patch.governorate = a.governorate;
  if (a.city) patch.city = a.city;
  if (a.governorate || a.city) patch.location_confidence = 'high';
  if (a.email) patch.email = a.email;
  if (a.phone) patch.phone = a.phone;
  if (a.preferred_contact) patch.preferred_contact = a.preferred_contact;
  if ((a.notes || '') !== (row.notes || '')) patch.notes = a.notes || null;
  // send only what really changes (keeps the audit trail readable); the check date is always a new observation
  const same = (x, y) => JSON.stringify(Array.isArray(x) ? [...x].sort() : x ?? null) === JSON.stringify(Array.isArray(y) ? [...y].sort() : y ?? null);
  for (const k of Object.keys(patch)) {
    if (k === 'last_verified_at') continue;
    const curVal = k === 'content_types' || k === 'tags' ? arr(row[k]) : row[k];
    if (same(patch[k], curVal)) delete patch[k];
  }
  return { patch, verdict: v };
}

/** One-click exclusion: records why, keeps the answers already given, never deletes. */
export function quickRejectPatch(row = {}, reason, now = new Date()) {
  if (!REJECT_AR[reason]) throw new Error('unknown reject reason');
  const keep = arr(row.tags).filter((t) => String(t).startsWith('r:'));
  const tags = [...freeTags(row), ...keep, `reject:${reason}`, 'collab:not_relevant'];
  return { status: 'rejected', tags, verification_status: row.verification_status === 'verified' ? 'verified' : 'partial', last_verified_at: new Date(now).toISOString() };
}

const FOLLOW_UP_DAYS = 3;
const daysSinceUpdate = (row, now = Date.now()) => { const t = Date.parse(row.updated_at || ''); return Number.isFinite(t) ? Math.floor((now - t) / 864e5) : null; };

const KIND_OF = { pr_ready: 'gift', ugc_ready: 'ugc', paid_inquiry: 'paid', expert: 'gift' };
/** Copy-paste message for a HUMAN to send (never sent from here). Only for approved accounts with a collaboration type. */
export function outreachDraft(row = {}) {
  if (statusOf(row.status) !== 'verified') return null;
  const kind = KIND_OF[collabOf(row)];
  if (!kind) return null;
  const name = isGarbled(row) ? '' : row.name || '';
  return { kind, text: outreachMessage({ name, kind }) };
}
/** One click «سجّلت التواصل»: status contacted + an owner (the legacy rule: no contact without an owner). */
export function contactPatch(row = {}, actor = '') {
  const owner = row.owner || String(actor || '').trim();
  if (!owner) return { ok: false, reason: 'owner_required' };
  if (statusOf(row.status) !== 'verified') return { ok: false, reason: 'not_approved' };
  return { ok: true, patch: { status: 'contacted', owner } };
}

// ---------------- import: template sample row ----------------
// The downloadable template ships one example row; it must never become a real account.
export const isTemplateSample = (r = {}) => String(r.handle || '').replace(/^@+/, '').toLowerCase() === 'example_handle';

/** «الخطوة التالية» for one account — the single line that tells the team what to do now. */
export function nextStep(row = {}) {
  if (row.deleted_at) return { key: 'deleted', ar: 'محذوف — استرجعه إذا لزم', tone: 'gray' };
  if (isPendingRow(row)) return { key: 'find_account', ar: 'ابحث عن حسابه الحقيقي وأضفه', tone: 'amber' };
  if (isGarbled(row)) return { key: 'fix_name', ar: 'الاسم غير مقروء — صحّحه من الحساب', tone: 'amber' };
  const st = statusOf(row.status);
  if (['rejected', 'not_interested', 'inactive'].includes(st)) return { key: 'none', ar: 'مستبعد — لا إجراء', tone: 'gray' };
  if (st === 'needs_review' || st === 'discovered') {
    const started = Object.keys(reviewTags(row)).length > 0;
    if (!started) return { key: 'review', ar: 'راجِع الحساب (5 أسئلة)', tone: 'amber' };
    const done = reviewProgress(answersFromRow(row), row).done;
    return { key: 'complete_review', ar: `أكمل المراجعة (${done}/5)`, tone: 'amber' };
  }
  if (st === 'verified') {
    const c = collabOf(row);
    if (c === 'paid_inquiry') return { key: 'paid', ar: 'اسأل عن السعر (تعاون مدفوع)', tone: 'blue' };
    if (!row.email && !row.phone && !igProfile(row)) return { key: 'find_contact', ar: 'لاقِ طريقة تواصل عامة', tone: 'amber' };
    return { key: 'contact', ar: `جاهز للتواصل${c && COLLAB_AR[c] ? ` — ${COLLAB_AR[c]}` : ''}`, tone: 'green' };
  }
  if (st === 'contacted') {
    const days = daysSinceUpdate(row);
    if (days != null && days >= FOLLOW_UP_DAYS) return { key: 'follow_up', ar: `مرّ ${days} يوم على آخر تحديث — تابع الرد`, tone: 'amber' };
    return { key: 'wait_reply', ar: 'بانتظار الرد', tone: 'blue' };
  }
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
