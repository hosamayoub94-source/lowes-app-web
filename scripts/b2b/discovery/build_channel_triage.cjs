// Triage of the existing 226-channel DB into 3 buckets using ONLY already-recorded fields (no new claims).
const fs = require('fs'); const path = require('path');
const dir = process.argv[2];
const a = JSON.parse(fs.readFileSync(path.join(dir, 'uae_sales_platforms_2026-10-09.json'), 'utf8')); const r = Array.isArray(a) ? a : (a.rows || Object.values(a)[0]);
const OFFICIAL = new Set(['official_page_fetched', 'parent_group_page_fetched']);
// Official pages fetched on 2026-10-10 (this round) override earlier unreachable/search-index status
const OVR = {
  'noon UAE': { url: 'https://sell.noon.com/uae-en', note: 'صفحة رسمية جُلبت 10/10: متطلبات التسجيل = بريد + هاتف + سجل تجاري/رخصة + هوية (جواز/هوية إماراتية)؛ نموذجا الشحن FBN/FBP؛ الرسوم «شفافة» بصفحة منفصلة (لم تُجلب)؛ برنامج Dubai Traders' },
  'Trendyol (Gulf marketplace)': { url: 'https://partner.trendyol.com/ae/onboarding/registration?lang=en-US', note: 'صفحة رسمية جُلبت 10/10: نموذج تسجيل بائع محلي بالإمارات (اسم+هاتف+بريد) ثم رفع مستندات الشركة؛ فئة الجمال مذكورة؛ خصم عمولة 30% لشهرين لمن يرفع منتجاته خلال 7 أيام + 25$ إعلانات؛ نسبة العمولة الأساسية والمستندات غير منشورة بالصفحة' },
};
const NOTE = {
  'noon UAE': 'عمولة Hair, Skin & Personal Care 8% (≤50 د) / 15% (>50)، حد أدنى 1 د؛ تخزين FBN 1.75 د/قدم³/شهر من 1/10/2026 — Official_Terms_Fees_2026-10-10.md',
  'LOOKFANTASTIC UAE': 'صفحة رسمية: المراسلة عبر partnerships@thehutgroup.com؛ لا شروط ولا رسوم منشورة',
  'Union Coop': 'نماذج PDF رسمية لتسجيل مورد؛ المستندات غير مقروءة؛ بقالة — ملاءمة منخفضة',
};
const DEMOTE = new Set(['Majid Al Futtaim', 'Carrefour UAE']);
const rows = r.map((x) => {
  const o = OVR[x.name];
  if (o) { x = { ...x, seller_registration_url: o.url, evidence_level: 'official_page_fetched', verification_status: 'verified_active_uae', verified_at: '2026-10-10', fees_commissions: o.note, tier: x.tier === 'D' ? 'A' : x.tier, classification: 'تسجيل مباشر' }; }
  const path_url = x.seller_registration_url || x.supplier_or_partnership_url || '';
  let bucket, reason;
  if (x.tier === 'E' || /غير مناسبة/.test(x.classification)) { bucket = '3-غير مناسبة'; reason = x.unsuitable_reason || x.tier_reason || 'مصنّفة غير مناسبة سابقاً'; }
  else if (path_url && OFFICIAL.has(x.evidence_level) && /تسجيل مباشر|تقديم مورد|اتفاق توزيع/.test(x.classification) && x.verification_status !== 'unreachable') { bucket = '1-قابلة للتقديم'; reason = 'مسار تسجيل/مورد رسمي موثّق من صفحة رسمية (قبول LOWE\'S غير مؤكد)'; }
  else { bucket = '2-تحتاج تأكيداً'; reason = x.verification_status === 'unreachable' ? 'الموقع غير قابل للوصول آلياً' : x.verification_status === 'protected_not_verified' ? 'محمي ضد الفحص الآلي — يُتحقق يدوياً' : /search_index/.test(x.evidence_level) ? 'مسار رسمي عبر فهرس البحث فقط، لم تُجلب صفحته' : 'لا صفحة مسار رسمية مؤكدة'; }
  if (DEMOTE.has(x.name)) { bucket = '2-تحتاج تأكيداً'; reason = 'الصفحة الرسمية عامة (Contact Us) بلا مسار مورّدين للتجميل — جُلبت 10/10'; }
  if (NOTE[x.name]) reason += ' | ' + NOTE[x.name];
  return { bucket, name: x.name, tier: x.tier, channel_type: x.channel_type, classification: x.classification, official_path_url: path_url, evidence_level: x.evidence_level, verified_at: x.verified_at || '', fees: (x.fees_commissions || '').slice(0, 160), reason, direct_registration_confirmed: x.direct_registration_confirmed };
}).sort((p, q) => p.bucket.localeCompare(q.bucket) || p.tier.localeCompare(q.tier));
const cols = Object.keys(rows[0]); const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
fs.writeFileSync(path.join(dir, 'channel_triage_2026-10-10.csv'), '﻿' + [cols.join(','), ...rows.map((x) => cols.map((c) => esc(x[c])).join(','))].join('\n'));
const c = {}; rows.forEach((x) => (c[x.bucket] = (c[x.bucket] || 0) + 1)); console.log(c);
console.log(rows.filter((x) => x.bucket.startsWith('1')).map((x) => x.name).join(' | '));
