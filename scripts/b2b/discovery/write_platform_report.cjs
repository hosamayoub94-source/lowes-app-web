// Writes the Markdown report for the sales-platform research (all numbers computed from the data files, none typed by hand).
// usage: node write_platform_report.cjs <platformsDir> [baseCommit]
const fs = require('fs');
const { execSync } = require('child_process');
const dir = process.argv[2];
const BASE = process.argv[3] || '4b20b1d';
const rd = (f) => JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8'));
const j = rd('uae_sales_platforms_2026-10-09.json');
const s = j.stats, rows = j.rows;
const ov = rd('overlap_map_with_leads_batches_2026-10-09.json').matches;
const dossier = rd('direct_registration_dossier_2026-10-09.json');
const chans = rd('supplier_contact_channels_2026-10-09.json');
const nameOnly = rd('discovered_name_only_2026-10-09.json');
let base = { rows: [], stats: {} };
try {
  const rel = 'data/b2b/uae/platforms_2026-10-09/uae_sales_platforms_2026-10-09.json';
  base = JSON.parse(execSync(`git show ${BASE}:${rel}`, { cwd: dir, maxBuffer: 1 << 28 }).toString('utf8'));
} catch (e) { console.log('base commit not readable:', String(e.message).slice(0, 80)); }
const baseNames = new Set(base.rows.map((r) => r.name.toLowerCase()));
const newRows = rows.filter((r) => !baseNames.has(r.name.toLowerCase()));
const bs = base.stats || {};
const esc = (x) => String(x ?? '').replace(/\|/g, ';').replace(/\n/g, ' ');
const L = [];
L.push('# منصات وقنوات بيع LOWE\'S بالإمارات — تقرير التنفيذ المُسرَّع (9 تشرين الأول 2026)', '');
L.push("> مصادر عامة فقط. لا Import، لا قاعدة بيانات، لا Merge، لا Deploy، ولا رسائل أُرسلت نيابة عن الشركة. المجهول = «غير معروف». **لا منصة موصوفة جاهزة للبيع**، و**أهلية LOWE'S لم تُؤكَّد لدى أي جهة**. البحث مستمر وغير مكتمل.", '');

L.push('## 1. السابق مقابل الجديد', '', `| البند | عند \`${BASE}\` | الآن |`, '|---|---|---|');
const row = (label, a, b) => L.push(`| ${label} | ${a ?? '—'} | **${b}** |`);
row('جهات فُحصت', bs.input_records, s.input_records);
row('بعد التنظيف', bs.kept, s.kept);
row('متحقق منها فعلياً', bs.verified_actually, s.verified_actually);
row('تسجيل بائع مباشر موثّق من صفحة رسمية (A)', bs.tiers?.A, s.tiers.A);
row('جملة/توزيع/B2B (B)', bs.tiers?.B, s.tiers.B);
row('اتفاق مورد (C)', bs.tiers?.C, s.tiers.C);
row('لم يتحدد وضعها (D)', bs.tiers?.D, s.tiers.D);
row('رسوم من مصدر رسمي', bs.with_official_fee_source, s.with_official_fee_source);
const promoted = new Set((nameOnly._promoted_to_audited || []).map((x) => x.toLowerCase()));
const trulyNew = newRows.filter((r) => !promoted.has(r.name.toLowerCase()));
const newNameOnly = nameOnly.entities.filter((e) => e.added);
L.push('', `**جهات جديدة فعلياً بعد إزالة التكرار في هذه الدفعة:** ${trulyNew.length} بموقع رسمي فُحص آلياً + ${newNameOnly.length} بالاسم فقط (اكتُشفت ولم تُتحقق) = **${trulyNew.length + newNameOnly.length}**. (إضافةً: ${newRows.length - trulyNew.length} جهات كانت بالاسم فقط بالدفعة السابقة وفُحصت مواقعها الآن — لا تُحتسب جديدة.)`);
L.push(`الجديدة بموقع: ${newRows.map((r) => `${r.name} (${r.tier})`).join('، ')}.`, '');

L.push('## 2. مستويات التحقق (منفصلة، لا تُدمج)', '', '| المستوى | العدد |', '|---|---|');
L.push(`| اكتُشفت (كل السجلات) | ${s.levels.discovered} (+ ${nameOnly.entities.length} بالاسم فقط) |`);
L.push(`| ثبت نشاطها بالإمارات | ${s.levels.active_in_uae} |`);
L.push(`| ثبت بيعها لمنتجات الجمال | ${s.levels.sells_beauty} |`);
L.push(`| لديها مسار رسمي لاستقبال البائعين أو الموردين | ${s.levels.official_seller_or_supplier_path} |`);
L.push(`| تأكدت أهليتها لقبول منتجات LOWE'S | ${s.levels.lowes_eligibility_confirmed} |`, '');

L.push('## 2ب. ملفات إجراءات التسجيل والملف التجاري', '', '- **إجراءات التسجيل (6 منصات):** `registration_playbooks_2026-10-09.md` — لكل منصة: الرابط، مفتوح/بموافقة، أهلية الشركة مقابل الرخصة الفعلية، المستندات، شروط الفئة، الرسوم الرسمية، ما يحتاج تأكيداً، والخطوة اليدوية التالية.', '- **الملف التجاري (مسودة):** `../commercial_kit_2026-10-09/` — نبذة الشركة والكيان الإماراتي من الرخصة الفعلية، 26 منتجاً بأحجامها وصورها، قائمة النواقص (`Missing_Items_To_Provide.md`)، ومسودة رسالة إنجليزية غير مُرسلة.', '- **مراجعة المستندات (9/10):** `../commercial_kit_2026-10-09/Document_Review_2026-10-09.md` — تسجيل المنتجات: الإدارة تؤكد اكتمال التسجيل، لكن إثبات التسجيل لم يُعثر عليه في الملفات المتاحة؛ EAN مطبوع على تصاميم علب Vitamin C (8684272100419) وRosemary Hair Oil (8684272100471)؛ SKINLAB يخص «The CEEL Pure Rosemary Water» (يقابل Pure Rosemary Water فقط وبشرط إقرار CEELLO)؛ العلامة: طلب تسجيل 2024/085278 باسم شخص طبيعي — مسودة تفويض غير موقّعة.', '- **أول منتجين:** `../commercial_kit_2026-10-09/listings/First_Two_Listings_DRAFT.md` — Vitamin C جاهز للإعداد (ينتظر السعر وإثبات التسجيل)؛ Rosemary Hair Oil ينتظر حسم INCI وادعاء Biotin.', '- **قوائم التسجيل (فتح الحساب ≠ قبول المنتجات):** `onboarding_checklists_4_platforms_2026-10-09.md`.', '- **ما ينتظر الإدارة فعلاً:** خطاب IBAN، هوية المفوَّض، نسخ/أرقام تسجيل المنتجات، وضع VAT، صفة جهة الملصق، التفويض، الأسعار، شروط التوريد، جهة التواصل، تجديد الرخصة.', '');
L.push('## 3. أفضل فرص التسجيل المباشر — الأسئلة الستة من مصادر رسمية', '');
L.push('| المنصة | شركة إماراتية؟ | العناية بالبشرة والشعر؟ | المستندات | موافقات الفئة | الرسوم المعلنة | الخطوة التالية | مستوى الدليل |', '|---|---|---|---|---|---|---|---|');
for (const p of dossier.platforms) L.push(`| ${esc(p.platform)} | ${esc(p.q1_uae_company_can_register.answer)} | ${esc(p.q2_skin_hair_care_allowed.answer)} | ${esc(p.q3_documents.answer)} | ${esc(p.q4_category_approvals.answer)} | ${esc(p.q5_fees.answer)} | ${esc(p.q6_next_step)} | ${esc([...new Set([p.q1_uae_company_can_register.evidence, p.q5_fees.evidence])].join(' / '))} |`);
const dj = rows.find((r) => r.name === 'Dayjour');
if (dj) L.push('', `**جديد بهذه الدفعة:** Dayjour — نموذج «Seller Registration» رسمي يطلب رخصة تجارية وVAT واسم العلامة وIBAN؛ الفئات والعمولة غير منصوصة (${dj.seller_registration_url}).`);
L.push('', '**شروط غير محسومة (تحتاج حساب بائع أو متصفح):**');
for (const p of dossier.platforms) L.push(`- ${p.platform}: ${p.human_review_needed.join('؛ ')}`);
L.push('');

L.push('## 4. أفضل الجهات للتواصل كمورد', '', '| الجهة | الحالة | المسار الرسمي | قناة التواصل العامة | مستوى الدليل |', '|---|---|---|---|---|');
const ST = { published_path: 'مسار موردين رسمي منشور', published_path_unread: 'رابط رسمي — محتواه لم يُقرأ', published_path_buyers: 'نموذج منشور للمشترين', needs_commercial_outreach: 'تحتاج إلى تواصل تجاري' };
for (const c of chans.channels) L.push(`| ${esc(c.name)} | ${ST[c.status] || c.status} | ${esc(c.path || '—')} | ${esc(c.contact)} | ${esc(c.evidence)} |`);
L.push('');

L.push('## 5. أفضل 20 جهة للبدء (مرتبة حسب الأثر التجاري)', '', '| # | الجهة | التصنيف | السبب | الرابط |', '|---|---|---|---|---|');
j.start_list.map((n) => rows.find((r) => r.name === n)).filter(Boolean).forEach((r, i) => L.push(`| ${i + 1} | ${esc(r.name)} | ${esc(r.classification)} | ${esc(r.start_reason || r.tier_reason)} | ${esc(r.seller_registration_url || r.supplier_or_partnership_url || r.official_website)} |`));
L.push('');

L.push('## 6. خطوات قابلة للتنفيذ فوراً (حسب الأثر التجاري)', '');
[
  'إنشاء حساب بائع على Amazon.ae، ثم طلب موافقة فئة «Beauty Topicals» وقراءة صفحة قيود «Cosmetics & Skin/Hair Care» من داخل Seller Central — يحدد إن كانت الرخصة الحالية مقبولة.',
  'فتح sell.noon.com/uae-en بالمتصفح والتأكد من قبول رخصة LOWE\'S وجدول رسوم FBP الحالي (8%/15% لفئة العناية بحسب النص المفهرس)، وأن إنشاء علامة LOWE\'S الخاصة متاح.',
  'فتح نموذج Trendyol الإماراتي وسؤال دعم البائعين عن قبول البائع المحلي بفئة العناية بالبشرة والشعر (تعارض بين صفحة التسجيل وسياسة البائع غير المحلي).',
  'مراسلة LOOKFANTASTIC (partnerships@thehutgroup.com) وXpressions (business.development@xpressionsstyle.com) بملف علامة موحد — مساران رسميان منشوران.',
  'تعبئة نموذج Alliance & Partnership لدى Pharmalink (قناة صيدليات Medicina) ونماذج موردي Union Coop.',
  'التسجيل على Begad وDayjour (نموذجا بائع رسميان، تسجيل Begad مجاني) بعد طلب نسبة العمولة كتابياً.',
  'سؤال K Beauty Souq عن قبول علامة غير كورية قبل التقديم؛ وتأجيل Tradeling حتى يتأكد قبول فئة العناية.',
  'تجهيز ملف علامة واحد (رخصة، VAT، شهادات المنتجات، باركود، صور، أسعار جملة) — مطلوب بكل المسارات أعلاه.',
].forEach((x, i) => L.push(`${i + 1}. ${x}`));
L.push('', "> هذه خطوات يقوم بها حسام أو فريقه — لم يُرسَل أي طلب أو رسالة من هنا.", '');

L.push('## 7. التداخل مع دفعات ليدز 1-3', '');
const byRole = ov.reduce((m, o) => ((m[o.platform_role] = (m[o.platform_role] || 0) + 1), m), {});
L.push(`${ov.length} مطابقة بالموقع/الاسم (${Object.entries(byRole).map(([k, v]) => `${k}: ${v}`).join(' · ')}) — مطابقة فقط، بلا حذف أو دمج.`, '');

L.push('## 8. قواعد الفحص المطبقة', '');
['المواقع التي أعادت مهلة/خطأ شهادة/403/تحدياً أمنياً لم يُعَد فحصها آلياً؛ سُجلت للمراجعة البشرية.', 'لا تجاوز لأي حماية ولا تسجيل دخول.', 'الشروط والرسوم من مصادر رسمية فقط؛ المصادر الثانوية للاكتشاف. صفحات noon وTrendyol الرسمية تحجب القراءة، فاستُخدم نصّها كما يظهر بفهرس البحث ووُسم «يُؤكَّد بحساب البائع».', 'عدم التحقق ليس رفضاً؛ لم يُحذف أي سجل سابق بسبب عدم الاستجابة.', 'لا أرقام أو روابط مختلقة؛ الجهات بلا موقع رسمي محفوظة بالاسم فقط.'].forEach((x) => L.push(`- ${x}`));
L.push('');
L.push('## 9. القيود والباقي', '');
['قراءة صفحات قيود Amazon ومستندات موافقة الفئة (تتطلب حساب بائع).', 'تأكيد نصوص noon وTrendyol الرسمية بالمتصفح (محجوبة آلياً).', 'محتوى صفحة «Partner with Faces» ونماذج Union Coop (PDF).', `${s.manual_review} رابطاً بملف المراجعة اليدوية، و${nameOnly.entities.length} جهة بالاسم فقط تحتاج إيجاد مواقعها الرسمية.`, 'مزيد من الاكتشاف في الإمارات الشمالية والعين.'].forEach((x) => L.push(`- ${x}`));
L.push('', '## 10. الملفات', '');
['registration_playbooks_2026-10-09.md', 'onboarding_checklists_4_platforms_2026-10-09.md', '../commercial_kit_2026-10-09/Document_Review_2026-10-09.md', '../commercial_kit_2026-10-09/listings/ (أول منتجين)', '../commercial_kit_2026-10-09/Brand_Authorization_Letter_DRAFT.md (غير موقّعة)', '../commercial_kit_2026-10-09/ (Commercial Profile + Product Sheet + Missing Items + Outreach Email — DRAFT)', 'LOWES_UAE_Sales_Platforms_Verified_2026-10-09.xlsx', 'uae_sales_platforms_2026-10-09.json / .csv', 'direct_registration_dossier_2026-10-09.json (الأسئلة الستة × 6 منصات)', 'supplier_contact_channels_2026-10-09.json (قنوات الموردين)', 'discovered_name_only_2026-10-09.json (اكتُشفت ولم تُتحقق)', 'uae_sales_platforms_start_list_2026-10-09.csv', 'uae_sales_platforms_manual_review_2026-10-09.csv', 'uae_sales_platforms_excluded_2026-10-09.csv', 'overlap_map_with_leads_batches_2026-10-09.csv / .json', 'audit_raw/'].forEach((x) => L.push(`- \`${x}\``));
fs.writeFileSync(`${dir}/UAE_Sales_Platforms_Report_2026-10-09.md`, L.join('\n'));
console.log('report written; new rows', newRows.length, '+ name-only', nameOnly.entities.length);
