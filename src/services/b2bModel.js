// نموذج «دخول الأسواق وتوسيع القنوات» لليدز B2B — منطق نقي مشتقّ من الأعمدة الموجودة (بلا migration).
//   • نوع الجهة ≠ طريقة التعامل: Amazon/noon (فتح حساب) ≠ صيدلية/مركز تجميل (تواصل مباشر) ≠ موزّع (توزيع).
//   • مسار القنوات (channel) مقابل الجهات المحلية (local).
//   • Pipeline فتح الحساب (تطابق مع الحالات القديمة الخمس، والمراحل التي لا يمكن اشتقاقها تُعلَّم «غير مُتتبَّعة»).
//   • خمسة تقييمات منفصلة (جودة المصدر · الفرصة · سهولة الدخول · جاهزية Lowe's · أولوية التنفيذ) — كل واحد معه أسبابه، لا رقم غامض واحد.
//   • تغطية الإمارات/المحافظات (Nationwide لا يُحسب لأي إمارة/محافظة) + لوحة السوق + عروض جاهزة.
// القاعدة: غياب الدليل ≠ دليل على الغياب؛ المجهول يبقى «غير معروف» ولا يُفترض.
import { NATIONWIDE } from '../../supabase/functions/_shared/countries.js';

const DAY = 86400000;

// ───────────────────────────── نوع الجهة / المسار ─────────────────────────────
export const ORG_TYPES = {
  marketplace:   { ar: 'منصة متعددة البائعين', track: 'channel', approach: 'account_opening', icon: '🏬' },
  quick_commerce:{ ar: 'منصة توصيل سريع',     track: 'channel', approach: 'account_opening', icon: '🛵' },
  chain:         { ar: 'سلسلة (صيدليات/تجميل)', track: 'channel', approach: 'account_opening', icon: '⛓️' },
  online_store:  { ar: 'متجر أونلاين',         track: 'channel', approach: 'direct_outreach', icon: '🛒' },
  distributor:   { ar: 'موزّع',                track: 'local',   approach: 'distribution',    icon: '🚚' },
  pharmacy:      { ar: 'صيدلية',               track: 'local',   approach: 'direct_outreach', icon: '💊' },
  beauty_center: { ar: 'مركز تجميل / عيادة',   track: 'local',   approach: 'direct_outreach', icon: '💆' },
  retail_store:  { ar: 'متجر / تاجر تجزئة',    track: 'local',   approach: 'direct_outreach', icon: '🏪' },
  other:         { ar: 'جهة أخرى',             track: 'local',   approach: 'direct_outreach', icon: '📍' },
};
export const APPROACH_AR = {
  account_opening: 'فتح حساب بائع/مورّد',
  direct_outreach: 'تواصل مباشر',
  distribution: 'اتفاق توزيع',
};

export function orgTypeOf(lead) {
  const cat = String(lead?.category || '');
  const ch = String(lead?.channel || '');
  if (/سريع|توصيل/.test(cat)) return 'quick_commerce';
  // An app is only a delivery surface, not proof of a multi-seller marketplace.
  // Require an explicit marketplace channel/category; otherwise online apps remain direct stores.
  if (/منصة/.test(cat) || ch === 'marketplace') return 'marketplace';
  if (/سلسلة/.test(cat)) return 'chain';
  if (lead?.lead_type === 'online') return 'online_store';
  if (/موزّع|موزع|مورد/.test(cat) && !/مستحضرات/.test(cat)) return 'distributor';
  if (/صيدل/.test(cat)) return 'pharmacy';
  if (/مركز|عيادة|تجميل|صالون/.test(cat) && !/متجر|مورد/.test(cat)) return 'beauty_center';
  if (/متجر|مستحضرات|تجزئة|تاجر/.test(cat)) return 'retail_store';
  return 'other';
}
export const trackOf = (lead) => ORG_TYPES[orgTypeOf(lead)].track;
// «تقبل بائعين» قرار حاسم للمنصات فقط (Amazon/noon…). متجر أونلاين لا يقبل بائعين ≠ مغلق: نقدر نوردّ له كتاجر جملة.
export const isSellerGate = (lead) => ['marketplace', 'quick_commerce'].includes(orgTypeOf(lead));
export const approachOf = (lead) => ORG_TYPES[orgTypeOf(lead)].approach;

// ───────────────────────────── مصدر + حداثة ─────────────────────────────
export function sourcesOf(lead) {
  return String(lead?.source_urls || '').split('|').map((s) => s.trim()).filter(Boolean);
}
function hostOf(u) {
  try { return new URL(/^https?:/i.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
}
export const daysSince = (iso, now = Date.now()) => (iso ? Math.floor((now - new Date(iso).getTime()) / DAY) : null);

/** fresh ≤30 يوم · aging ≤90 · stale >90 · unknown = لا تاريخ تحقق (لا نفترض الحداثة). */
export function freshnessOf(lead, now = Date.now()) {
  const d = daysSince(lead?.last_verified_at, now);
  if (d == null) return { level: 'unknown', days: null, ar: 'لم يُتحقق منه' };
  if (d <= 30) return { level: 'fresh', days: d, ar: `متحقَّق منذ ${d} يوم` };
  if (d <= 90) return { level: 'aging', days: d, ar: `متحقَّق منذ ${d} يوم` };
  return { level: 'stale', days: d, ar: `قديم: ${d} يوم بلا تحقق` };
}

/** جودة المصدر: strong | medium | weak | unknown — مع الأسباب. تُفصل عن «الفرصة». */
export function sourceQualityOf(lead, now = Date.now()) {
  const srcs = sourcesOf(lead);
  const hosts = [...new Set(srcs.map(hostOf).filter(Boolean))];
  const siteHost = hostOf(lead?.website || '');
  const official = !!siteHost && hosts.includes(siteHost);
  const v = lead?.verified || null;
  const reasons = [];
  let level = 'unknown';
  if (v === 'verified_multi_source') { level = 'strong'; reasons.push('مصدران مستقلان أو أكثر'); }
  else if (v === 'verified_single_source') { level = 'medium'; reasons.push('مصدر واحد متحقَّق'); }
  else if (v === 'manual_team_entry') { level = 'medium'; reasons.push('إدخال يدوي من الفريق (معرفة شخصية، بلا مصدر عام)'); }
  else if (v === 'discovered_unconfirmed') { level = 'weak'; reasons.push('اكتشاف غير مؤكَّد'); }
  else if (v === 'closed_or_uncertain') { level = 'weak'; reasons.push('قد تكون الجهة مغلقة أو غير مؤكدة'); }
  if (hosts.length >= 2 && level !== 'strong' && v !== 'closed_or_uncertain') { level = 'strong'; reasons.push(`${hosts.length} مواقع مصدر مختلفة`); }
  if (official && level === 'weak') { level = 'medium'; reasons.push('موقع الجهة نفسه ضمن المصادر'); }
  if (!srcs.length && v !== 'manual_team_entry') { level = level === 'unknown' ? 'unknown' : 'weak'; reasons.push('لا مصدر مسجّل'); }
  const fr = freshnessOf(lead, now);
  if (fr.level === 'stale' && level === 'strong') { level = 'medium'; reasons.push('المصدر قديم (>90 يوم)'); }
  if (!reasons.length) reasons.push('لا معلومات كافية عن المصدر');
  return { level, official, sources: srcs.length, hosts: hosts.length, freshness: fr, reasons };
}
export const SOURCE_QUALITY_AR = { strong: 'مصدر قوي', medium: 'مصدر متوسط', weak: 'مصدر ضعيف', unknown: 'مصدر غير معروف' };

// ───────────────────────────── اتصال ─────────────────────────────
export const hasDirect = (l) => !!(l?.phone || l?.whatsapp || l?.email);
export const hasAnyContactPath = (l) => !!(l?.phone || l?.whatsapp || l?.email || l?.instagram || l?.facebook || l?.telegram || l?.website);
export const needsFollowUp = (l, now = Date.now(), days = 3) => {
  if ((l?.status || 'not_contacted') !== 'contacted') return false;
  const d = daysSince(l?.status_updated_at, now);
  return d != null && d >= days;
};
export const ownerOf = (l) => l?.assigned_to || l?.status_updated_by || '';

// ───────────────────────────── Pipeline ─────────────────────────────
export const PIPELINE = [
  'discovered', 'qualified', 'contact_needed', 'contacted', 'replied', 'documents_requested', 'application_started',
  'submitted', 'pending_approval', 'approved', 'live', 'first_order', 'rejected', 'paused',
];
export const STAGE_AR = {
  discovered: 'مُكتشَفة', qualified: 'مؤهَّلة', contact_needed: 'جاهزة للتواصل', contacted: 'تم التواصل', replied: 'ردّت',
  documents_requested: 'طُلبت مستندات', application_started: 'بدأ التقديم', submitted: 'قُدّم الطلب', pending_approval: 'بانتظار الموافقة',
  approved: 'حساب موافَق عليه', live: 'حساب مفتوح/نشط', first_order: 'أول طلب', rejected: 'مرفوضة / غير مهتمة', paused: 'موقوفة',
};
// All pipeline stages are persistable through update_market_entry once migration 20261025140000 is applied.
export const UNTRACKED_STAGES = [];

/**
 * طبقة التوافق: المرحلة المشتقّة من (status القديم + lowes_presence + جودة المصدر + الاتصال).
 * لا تُكتب للقاعدة — القراءة فقط. التحويل العكسي toLegacyStatus يضمن أن أي حفظ يبقى ضمن القيم الخمس المقبولة بالدالة.
 */
export function stageOf(lead, now = Date.now()) {
  if (PIPELINE.includes(lead?.account_status)) return lead.account_status;
  const status = lead?.status || 'not_contacted';
  const presence = lead?.lowes_presence || null;
  if (presence === 'listed') return 'live';
  if (status === 'customer') return 'first_order';
  if (presence === 'rejected' || status === 'not_interested') return 'rejected';
  if (status === 'interested' || presence === 'in_talks') return 'replied';
  if (status === 'contacted' || presence === 'contacted') return 'contacted';
  const q = sourceQualityOf(lead, now).level;
  if (q === 'weak' || q === 'unknown') return 'discovered';
  return hasAnyContactPath(lead) ? 'contact_needed' : 'qualified';
}
const STAGE_TO_LEGACY = {
  discovered: 'not_contacted', qualified: 'not_contacted', contact_needed: 'not_contacted', contacted: 'contacted', replied: 'interested',
  live: 'customer', first_order: 'customer', rejected: 'not_interested',
};
/** القيمة المسموحة بالدالة/الجدول لمرحلة معيّنة، أو null إن كانت المرحلة تحتاج migration (لا تُكتب). */
export const toLegacyStatus = (stage) => STAGE_TO_LEGACY[stage] ?? null;
export const isPersistableStage = (stage) => PIPELINE.includes(stage);

// ───────────────────────────── التقييمات الخمسة ─────────────────────────────
const OPP_BASE = { marketplace: 30, chain: 30, quick_commerce: 25, distributor: 25, online_store: 20, pharmacy: 20, beauty_center: 20, retail_store: 20, other: 5 };
// حدّ «يستحق عملاً الآن»: جهة محلية لا تصل له إلا إذا عُرف أنها تبيع تجميل/عناية؛ المنصة الكبيرة تصله بقبول البائعين.
export const ACT_THRESHOLD = 35;

/** الفرصة التجارية 0–100 + أسبابها + ما هو مجهول (المجهول لا يُحتسب لا لصالح ولا ضد). */
export function opportunityOf(lead) {
  const type = orgTypeOf(lead);
  const reasons = []; const unknowns = [];
  if (lead?.lowes_presence === 'listed') return { value: 0, reasons: ['موجودون فعلاً على هذه الجهة'], unknowns, blocked: false };
  let v = OPP_BASE[type];
  reasons.push(`${ORG_TYPES[type].ar} (+${OPP_BASE[type]})`);
  let blocked = false;
  if (isSellerGate(lead)) {
    if (lead?.accepts_sellers === true) { v += 20; reasons.push('تقبل بائعين (+20)'); }
    else if (lead?.accepts_sellers === false) { v -= 30; blocked = true; reasons.push('لا تقبل بائعين (−30)'); }
    else unknowns.push('قبول البائعين غير معروف');
  } else if (lead?.accepts_sellers === false && (type === 'online_store' || type === 'chain')) {
    reasons.push('لا تعمل كسوق بائعين — المدخل: توريد كتاجر جملة (بلا أثر على الدرجة)');
  }
  if (lead?.sells_beauty === true) { v += 15; reasons.push('تبيع تجميل/عناية (+15)'); }
  else if (lead?.sells_beauty === false) { v -= 25; reasons.push('لا تبيع تجميل/عناية حالياً (−25) — فرصة أضعف لا مغلقة'); }
  else unknowns.push('بيع التجميل غير معروف');
  if (lead?.province === NATIONWIDE || /nationwide|كل|على مستوى/i.test(String(lead?.delivery_coverage || ''))) { v += 10; reasons.push('تغطية على مستوى البلد (+10)'); }
  return { value: Math.max(0, Math.min(100, v)), reasons, unknowns, blocked };
}

/** سهولة الدخول: high | medium | low | unknown — من الإشارات الموجودة فقط (شروط التسجيل/المستندات غير مسجّلة بالنظام). */
export function easeOf(lead) {
  const reasons = [];
  const gate = isSellerGate(lead);
  if (gate && lead?.accepts_sellers === false) return { level: 'low', reasons: ['لا تقبل بائعين'] };
  const direct = hasDirect(lead);
  if (gate && lead?.accepts_sellers === true && direct) return { level: 'high', reasons: ['تقبل بائعين', 'قناة اتصال مباشرة'] };
  if (gate && lead?.accepts_sellers === true) return { level: 'medium', reasons: ['تقبل بائعين', 'بلا قناة اتصال مباشرة'] };
  if (!hasAnyContactPath(lead)) return { level: 'low', reasons: ['لا وسيلة اتصال ولا موقع'] };
  reasons.push(direct ? 'قناة اتصال مباشرة' : 'اتصال عبر الموقع/السوشال فقط');
  reasons.push('شروط التسجيل غير مسجّلة بعد');
  const t = orgTypeOf(lead);
  return { level: ['pharmacy', 'beauty_center', 'retail_store', 'online_store', 'distributor'].includes(t) ? (direct ? 'medium' : 'low') : 'unknown', reasons };
}

/** جاهزية Lowe's للقناة: ready فقط إن كنا موجودين؛ غير ذلك unknown صراحةً (المستندات/تسجيل المنتجات غير مسجّلة بالنظام). */
export function readinessOf(lead) {
  if (lead?.lowes_presence === 'listed') return { level: 'ready', reasons: ['صفحتنا موجودة على الجهة'] };
  if (lead?.lowes_presence === 'rejected') return { level: 'blocked', reasons: ['طلبنا رُفض'] };
  const t = orgTypeOf(lead);
  const needsDocs = ORG_TYPES[t].approach === 'account_opening';
  return { level: 'unknown', reasons: [needsDocs ? 'المستندات المطلوبة وتسجيل المنتجات لهذه القناة غير مسجّلة بالنظام بعد' : 'لا شروط تسجيل مسجّلة'] };
}

export const EXEC_RANK = { follow_up: 0, today: 1, find_contact: 2, verify_first: 3, later: 4, waiting: 5, done: 6, blocked: 7 };
export const EXEC_AR = {
  follow_up: 'تابع الرد', today: 'ابدأ اليوم', find_contact: 'ابحث عن وسيلة تواصل', verify_first: 'تحقق من البيانات أولاً',
  later: 'لاحقاً', waiting: 'بانتظار الرد', done: 'منجَز', blocked: 'متوقف',
};

/** أولوية التنفيذ — قواعد صريحة مع سبب مكتوب (لا يعتمد على Score القديم الغامض). */
export function executionPriorityOf(lead, now = Date.now()) {
  const status = lead?.status || 'not_contacted';
  const opp = opportunityOf(lead);
  const sq = sourceQualityOf(lead, now);
  const ease = easeOf(lead);
  const why = [];
  if (lead?.lowes_presence === 'listed' || status === 'customer') return { key: 'done', rank: EXEC_RANK.done, ar: EXEC_AR.done, why: ['موجودون/عميل فعلاً'] };
  if (opp.blocked || lead?.lowes_presence === 'rejected' || status === 'not_interested' || lead?.verified === 'closed_or_uncertain') {
    if (opp.blocked) why.push(...opp.reasons.filter((r) => /−/.test(r)));
    if (lead?.lowes_presence === 'rejected') why.push('طلبنا رُفض');
    if (status === 'not_interested') why.push('غير مهتمة');
    if (lead?.verified === 'closed_or_uncertain') why.push('قد تكون مغلقة/غير مؤكدة');
    return { key: 'blocked', rank: EXEC_RANK.blocked, ar: EXEC_AR.blocked, why };
  }
  if (needsFollowUp(lead, now)) return { key: 'follow_up', rank: EXEC_RANK.follow_up, ar: EXEC_AR.follow_up, why: [`مرّ ${daysSince(lead.status_updated_at, now)} أيام بلا تحديث`] };
  if (status === 'contacted' || status === 'interested' || lead?.lowes_presence === 'in_talks' || lead?.lowes_presence === 'contacted') {
    return { key: 'waiting', rank: EXEC_RANK.waiting, ar: EXEC_AR.waiting, why: ['تم التواصل — بانتظار الرد'] };
  }
  if (!hasAnyContactPath(lead)) return { key: 'find_contact', rank: EXEC_RANK.find_contact, ar: EXEC_AR.find_contact, why: ['لا وسيلة تواصل مسجّلة'] };
  if (sq.level === 'weak' || sq.level === 'unknown') {
    if (opp.value >= ACT_THRESHOLD) return { key: 'verify_first', rank: EXEC_RANK.verify_first, ar: EXEC_AR.verify_first, why: [`فرصة ${opp.value}/100 لكن ${SOURCE_QUALITY_AR[sq.level]}`, ...sq.reasons] };
    return { key: 'later', rank: EXEC_RANK.later, ar: EXEC_AR.later, why: [`فرصة منخفضة (${opp.value}/100) ومصدر غير مؤكد`] };
  }
  if (opp.value >= ACT_THRESHOLD && ease.level !== 'low') {
    why.push(`فرصة ${opp.value}/100`, SOURCE_QUALITY_AR[sq.level]);
    if (hasDirect(lead)) why.push('قناة اتصال مباشرة');
    return { key: 'today', rank: EXEC_RANK.today, ar: EXEC_AR.today, why };
  }
  return { key: 'later', rank: EXEC_RANK.later, ar: EXEC_AR.later, why: [`فرصة ${opp.value}/100${ease.level === 'low' ? ' وسهولة الدخول منخفضة' : ''}`] };
}

/** كل ما تحتاجه البطاقة/التفاصيل لجهة واحدة (يُحسب مرة). */
export function assess(lead, now = Date.now()) {
  const orgType = orgTypeOf(lead);
  return {
    orgType, org: ORG_TYPES[orgType], track: ORG_TYPES[orgType].track, approach: ORG_TYPES[orgType].approach,
    stage: stageOf(lead, now), source: sourceQualityOf(lead, now), opportunity: opportunityOf(lead), ease: easeOf(lead),
    readiness: readinessOf(lead), exec: executionPriorityOf(lead, now), owner: ownerOf(lead), followUp: needsFollowUp(lead, now),
  };
}

// ───────────────────────────── سلسلة أم / فروع (مشتقّة — حتى تُضاف الأعمدة) ─────────────────────────────
const SOCIAL_OR_MARKET_HOSTS = /(^|\.)(instagram|facebook|tiktok|snapchat|linkedin|x|twitter|youtube|wa|t|talabat|noon|amazon|carrefouruae|trendyol|google|maps|linktr)\./i;
/**
 * مفتاح سلسلة مشتق: اسم الأساس قبل « - » أو «(» أو «|» (فرع/منطقة)، أو مضيف الموقع الخاص بالجهة (ليس سوشال/منصة).
 * مشتق وغير مؤكَّد: يظهر بالواجهة «سلسلة محتملة» حتى يُضاف parent_organization_id فعلياً.
 */
export function chainKeyOf(lead) {
  const name = String(lead?.name || '').trim();
  const m = name.match(/^(.{3,}?)\s*[-–—|(]\s*\S/);
  if (m) return `name:${m[1].toLowerCase().replace(/\s+/g, ' ').trim()}`;
  const h = hostOf(lead?.website || '');
  if (h && !SOCIAL_OR_MARKET_HOSTS.test(`${h}.`)) return `host:${h}`;
  return null;
}
/** اسم السلسلة للعرض: اسم الأساس بدون اسم الفرع. */
function chainDisplayName(lead) {
  const name = String(lead?.name || '').trim();
  const m = name.match(/^(.{3,}?)\s*[-–—|(]\s*\S/);
  return m ? m[1].trim() : (hostOf(lead?.website || '') || name);
}
/** مجموعات ≥2 جهة بنفس المفتاح داخل نفس الدولة. */
export function chainGroups(leads) {
  const by = new Map();
  for (const l of leads) {
    const k = chainKeyOf(l); if (!k) continue;
    const key = `${l.country || ''}|${k}`;
    (by.get(key) || by.set(key, []).get(key)).push(l);
  }
  return [...by.entries()].filter(([, v]) => v.length >= 2).map(([key, members]) => ({ key, name: chainDisplayName(members[0]), members, regions: [...new Set(members.map((m) => m.province).filter(Boolean))] }));
}

// ───────────────────────────── التغطية ─────────────────────────────
/** تغطية المناطق: Nationwide عدّاد منفصل — لا يدخل في أي إمارة/محافظة. cities/districts للمناطق التي فيها جهات. */
export function regionCoverage(leads, regions) {
  const byRegion = Object.fromEntries(regions.map((r) => [r, { total: 0, channel: 0, local: 0, contacted: 0, live: 0, cities: new Set(), districts: new Set() }]));
  let nationwide = 0; const unknownRegion = [];
  for (const l of leads) {
    if (l.province === NATIONWIDE) { nationwide++; continue; }
    const r = byRegion[l.province];
    if (!r) { unknownRegion.push(l.id); continue; }
    r.total++;
    if (trackOf(l) === 'channel') r.channel++; else r.local++;
    if ((l.status || 'not_contacted') !== 'not_contacted') r.contacted++;
    if (l.lowes_presence === 'listed' || l.status === 'customer') r.live++;
    if (l.city) r.cities.add(l.city);
    if (l.district) r.districts.add(l.district);
  }
  const rows = regions.map((region) => ({ region, ...byRegion[region], cities: [...byRegion[region].cities], districts: [...byRegion[region].districts] }));
  const covered = rows.filter((r) => r.total > 0);
  return { rows, covered: covered.length, total: regions.length, uncovered: rows.filter((r) => r.total === 0).map((r) => r.region), nationwide, unknownRegion };
}

// القنوات المستهدفة لكل سوق (لمعرفة «القنوات غير المغطاة») — إعداد، لا بيانات.
export const TARGET_CHANNELS = {
  AE: ['marketplace', 'quick_commerce', 'chain', 'online_store', 'pharmacy', 'beauty_center', 'retail_store', 'distributor'],
  SY: ['online_store', 'pharmacy', 'beauty_center', 'retail_store', 'distributor'],
};
export function channelCoverage(leads, country) {
  const targets = TARGET_CHANNELS[country] || [];
  return targets.map((type) => {
    const mine = leads.filter((l) => orgTypeOf(l) === type);
    const live = mine.filter((l) => l.lowes_presence === 'listed' || l.status === 'customer').length;
    return { type, ar: ORG_TYPES[type].ar, discovered: mine.length, live, state: mine.length === 0 ? 'no_leads' : live === 0 ? 'not_present' : 'present' };
  });
}

// ───────────────────────────── لوحة السوق ─────────────────────────────
export function marketDashboard(leads, country, regions, now = Date.now()) {
  const stages = Object.fromEntries(PIPELINE.map((s) => [s, 0]));
  let accountOpening = 0, noOwner = 0, noSource = 0, stale = 0, unverified = 0, noContact = 0, followUp = 0, weakSource = 0;
  const qualified = [];
  for (const l of leads) {
    const a = assess(l, now);
    stages[a.stage]++;
    if (a.approach === 'account_opening') accountOpening++;
    if (a.stage === 'contacted' || a.stage === 'replied') { if (!a.owner) noOwner++; }
    if (!sourcesOf(l).length && l.verified !== 'manual_team_entry') noSource++;
    if (a.source.freshness.level === 'stale') stale++;
    if (a.source.level === 'weak' || a.source.level === 'unknown') weakSource++;
    if (['discovered_unconfirmed', 'closed_or_uncertain', null, undefined].includes(l.verified)) unverified++;
    if (!hasAnyContactPath(l)) noContact++;
    if (a.followUp) followUp++;
    if (['qualified', 'contact_needed'].includes(a.stage)) qualified.push(l.id);
  }
  const unownedTotal = leads.filter((l) => !ownerOf(l)).length;
  return {
    country, total: leads.length, accountOpening, stages,
    qualified: stages.qualified + stages.contact_needed,
    inContact: stages.contacted + stages.replied,
    live: stages.live, firstOrder: stages.first_order, rejected: stages.rejected,
    untrackedStages: UNTRACKED_STAGES,
    followUp, noOwner, unownedTotal, noSource, stale, unverified, weakSource, noContact,
    stalePct: leads.length ? Math.round((stale / leads.length) * 100) : 0,
    regions: regionCoverage(leads, regions), channels: channelCoverage(leads, country),
    chains: chainGroups(leads),
    sellerPlatformsGap: leads.filter((l) => l.accepts_sellers === true && !['listed', 'rejected', 'not_applicable'].includes(l.lowes_presence || 'not_listed')),
    directContact: leads.filter(hasDirect).length,
  };
}

// ───────────────────────────── عروض جاهزة ─────────────────────────────
// needsFields = العرض يحتاج حقولاً غير موجودة اليوم (migration مقترحة) فيظهر معطّلاً بدل أن يعرض أرقاماً مخترعة.
export const READY_VIEWS = [
  { key: 'today', ar: 'ابدأ اليوم', test: (l, now) => ['today', 'follow_up'].includes(executionPriorityOf(l, now).key) },
  { key: 'platforms_to_open', ar: 'منصات نريد فتح حساب عليها', test: (l, now) => approachOf(l) === 'account_opening' && !['listed', 'rejected'].includes(l.lowes_presence || 'not_listed') && executionPriorityOf(l, now).key !== 'blocked' },
  { key: 'accepts_sellers', ar: 'تقبل بائعين', test: (l) => l.accepts_sellers === true },
  { key: 'accepts_beauty', ar: 'تقبل/تبيع منتجات تجميل', test: (l) => l.sells_beauty === true },
  { key: 'in_registration', ar: 'قيد التسجيل', needsFields: ['account_status'], test: () => false },
  { key: 'missing_docs', ar: 'ناقصها مستندات', needsFields: ['missing_documents'], test: () => false },
  { key: 'follow_up', ar: 'تحتاج متابعة', test: (l, now) => needsFollowUp(l, now) },
  { key: 'no_contact', ar: 'بلا جهة اتصال', test: (l) => !hasAnyContactPath(l) },
  { key: 'unverified', ar: 'غير متحققة', test: (l, now) => ['weak', 'unknown'].includes(sourceQualityOf(l, now).level) },
  { key: 'not_present', ar: 'غير موجودين عليها بعد', test: (l) => !['listed'].includes(l.lowes_presence || 'not_listed') && trackOf(l) === 'channel' },
  { key: 'no_owner', ar: 'بلا مسؤول', test: (l) => !ownerOf(l) },
  { key: 'stale', ar: 'بيانات قديمة', test: (l, now) => freshnessOf(l, now).level === 'stale' },
];
export const viewByKey = (k) => READY_VIEWS.find((v) => v.key === k) || null;
