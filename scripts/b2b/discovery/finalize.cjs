// Writes the final deliverables into ./out: creators CSV/JSON, stores CSV, and the Arabic discovery report.
const fs = require('fs');
const path = require('path');
const out = path.join(__dirname, 'out');
const creators = require('./creators_final.json');
const stores = require('./out/uae_stores_verification_table.json');
const batch2 = JSON.parse(fs.readFileSync(path.join(out, 'uae_stores_batch2_2026-10-08.json'), 'utf8')).rows;
const targets = creators.filter((c) => c.target_nano_micro_beauty);

const csvCell = (v) => { const s = v == null ? '' : Array.isArray(v) ? v.join(' | ') : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCsv = (rows, cols) => '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(typeof c === 'function' ? c(r) : r[c])).join(','))].join('\n') + '\n';

fs.writeFileSync(path.join(out, 'uae_creators_all_2026-10-08.json'), JSON.stringify({ _about: 'D-119 Mass Discovery — UAE creators (public directory pages: Modash top-20 lists, Elev8or public profiles, Collabstr public lists/profiles). Public handle + public stats only; no personal emails/phones. fit_score is a transparent heuristic (see fit_components). Gifted/barter acceptance is NOT stated by any source — must be asked directly. NOT IMPORTED anywhere.', creators }, null, 1));
const creatorCols = ['id', 'fit_score', 'ig_handle', 'ig_url', 'display_name', 'tier', (r) => r.followers_ig ?? (r.followers_listed_collabstr || []).join(' / '), 'tier_basis', 'engagement_rate', 'fake_followers_pct', 'location', 'skincare_signal', 'ugc_signal', 'uae_ad_permit_in_bio', (r) => r.collab_model_evidence.low_cost, (r) => r.collab_model_evidence.marketplace_listed, (r) => r.collab_model_evidence.gifted_barter, 'niche_text', 'bio_excerpt', 'sources', 'source_urls', 'marketplace_profile_urls', 'verified_at'];
const creatorHdr = ['id', 'fit_score', 'ig_handle', 'ig_url', 'display_name', 'tier', 'followers_shown', 'tier_basis', 'engagement_rate', 'fake_followers_pct', 'location', 'skincare_signal', 'ugc_signal', 'uae_ad_permit_in_bio', 'low_cost_evidence', 'marketplace_listed', 'gifted_barter_text_evidence', 'niche_text', 'bio_excerpt', 'sources', 'source_urls', 'marketplace_profile_urls', 'verified_at'];
fs.writeFileSync(path.join(out, 'uae_creators_nano_micro_targets_2026-10-08.csv'), '﻿' + creatorHdr.join(',') + '\n' + targets.map((r) => creatorCols.map((c) => csvCell(typeof c === 'function' ? c(r) : r[c])).join(',')).join('\n') + '\n');
fs.writeFileSync(path.join(out, 'uae_stores_all_verification_2026-10-08.csv'), toCsv(stores.entities, ['name', 'emirate', 'type', 'website', 'website_check', 'seller_or_supplier_route', 'published_contact', 'sources', 'verified_at', 'lowes_presence']));

// ── report ──
const n = (a, f) => a.filter(f).length;
const tierCnt = { nano: n(targets, (c) => c.tier === 'nano'), micro: n(targets, (c) => c.tier === 'micro') };
const priced = targets.filter((c) => c.fit_components.low_cost_price === 15);
const withIg = targets.filter((c) => c.ig_handle);
const skinExplicit = targets.filter((c) => c.skincare_signal);
const permit = targets.filter((c) => c.uae_ad_permit_in_bio);
const fol = (c) => (c.followers_ig != null ? c.followers_ig.toLocaleString('en') : (c.followers_listed_collabstr || []).join(' / ') || '—');
const top = targets.slice(0, 25);
const topRows = top.map((c, i) => `| ${i + 1} | ${c.ig_handle ? '@' + c.ig_handle : c.display_name + ' (بلا IG مثبت)'} | ${c.tier === 'nano' ? 'Nano' : 'Micro'} | ${fol(c)} | ${c.engagement_rate || '—'} | ${c.skincare_signal ? 'عناية بالبشرة' : 'جمال'} | ${c.collab_model_evidence.low_cost ? c.collab_model_evidence.low_cost.replace('self-listed on Collabstr: packages from ', 'من ').replace(/ \(.*$/, '') + ' (مُعلَن ذاتياً)' : '—'} | ${c.fit_score} |`).join('\n');
const storeRows = stores.entities.map((e) => `| ${e.name} | ${e.emirate} | ${e.type} | ${e.website || '—'} | ${e.website_check.startsWith('verified') ? '✅' : '⚠️ لم يُتحقق'} | ${e.seller_or_supplier_route.length ? e.seller_or_supplier_route.map((s) => s.split(' → ')[0]).join('، ') : '—'} | ${e.published_contact.join(' · ') || '—'} |`).join('\n');
const intelRows = stores.intel.map((i) => `- **${i.name}** (${{ precedent: 'سابقة', route: 'مسار', 'supplier-entry': 'نقطة دخول موردين', excluded: 'مستبعد', gap: 'فجوة' }[i.kind]}): ${i.fact}${i.url ? ` [المصدر](${i.url})` : ''}`).join('\n');

const md = `# تقرير Mass Discovery — الإمارات (متاجر + Creators)

**التاريخ:** 8 تشرين الأول 2026 · **النطاق:** بحث وتحقق من مصادر عامة فقط · **لا استيراد، لا كتابة بأي قاعدة بيانات، لا نشر**

## 0) الخلاصة بسطر
جمعنا **210 creator فريد** (منهم **${targets.length} ضمن الهدف** Nano/Micro بمحتوى عناية/جمال) و**${batch2.length} جهة جديدة** للمتاجر (${n(batch2, (r) => r.priority === 'C')} بموقع رسمي تحقّقنا منه، و${n(batch2, (r) => r.priority === 'D')} بلا تحقق)، إضافة لنقاط دخول موردين رسمية وسابقة مهمة (Maruderm). **كل البيانات غير مستوردة**، والمتطلبات غير المثبتة (Montaji، شروط المنصات، قبول Gifted/Barter) تبقى بنود تحقق منفصلة. الرخصة الإماراتية جاهزة (تأكيد المالك) ولا تُعاد.

## 1) المنهجية (ما التزمنا به)
- مصادر عامة فقط: بلا Firecrawl، بلا تسجيل دخول، بلا تجاوز حماية. المواقع المحمية (Cloudflare/403) **لم نتجاوزها** وعُلّمت «لم يُتحقق».
- كل رقم منقول كما يظهر بالمصدر. المجهول = فارغ/«غير معروف». لا استنتاج لنية Gifted/Barter أو الأسعار.
- **تحقق المتاجر:** فتحنا موقع كل جهة بنفسه (HTTP + عنوان الصفحة + ذكر الإمارات + جهات التواصل وروابط الموردين المنشورة). **كشف هذا الفحص 4 نطاقات خاطئة** كانت ستدخل من المقالات: \`nokbeauty.com\` صار صفحة مقامرة، \`ixora.ae\` نطاق محجوز، \`theskinstory.com\` موقع غير إماراتي، \`haul-in-one.com\` بوابة شحن. استُبعدت كلها.
- **خصوصية Creators:** نخزّن الـhandle العام والأرقام العامة فقط. حُذفت الإيميلات والأرقام الشخصية التي تعرضها بعض الصفحات.
- الدفعات الجاهزة مرّت بمحقق دالة \`b2b-leads\` الحقيقية (وضع معاينة، قاعدة وهمية): **20 جديد، 0 مكرر، 0 غير صالح**، بما فيها فحص تفرّد الموقع مقابل 105 موقع سوري.

## 2) Creators — الهدف: Nano/Micro + Gifted/Barter/Low-cost
**المصادر:** 11 صفحة Modash (Top 20 بكل صفحة، حتى 25 أيلول 2026)، 21 بروفايل Elev8or عام، و9 قوائم + 49 بروفايل Collabstr عام. **النتيجة:** 210 فريد، ${targets.length} على الهدف: **${tierCnt.nano} Nano** و**${tierCnt.micro} Micro**.

| المقياس | العدد (من ${targets.length}) |
|---|---|
| إشارة عناية بالبشرة صريحة بالـbio/العنوان | ${skinExplicit.length} |
| لديهم handle إنستغرام مثبت | ${withIg.length} |
| لديهم أسعار مُعلَنة ذاتياً ≤ 100$ (دليل Low-cost) | ${priced.length} |
| رقم تصريح معلن إماراتي بالـbio | ${permit.length} |
| نص صريح عن Gifted/Barter | **0** |

**الخلاصة الصريحة:** لا مصدر عام يثبت قبول أحد منهم Gifted/Barter. الدليل الوحيد المتاح هو «مُدرَج بمنصة تعاقد» أو «أسعار منخفضة مُعلنة»، وهذا لا يساوي موافقة على مقايضة. **قبول Gifted لازم يُسأل مباشرة.**

### أفضل 25 (حسب fit_score — معادلة شفافة: الفئة 25 + عناية بالبشرة 25 + سعر ≤100$ 15 + تصريح 10 + تفاعل جيد 10 + جاهزية تعاون 10 + مصدرين 5)
| # | الحساب | الفئة | المتابعون | التفاعل | المحتوى | سعر معلن | النتيجة |
|---|---|---|---|---|---|---|---|
${topRows}

**تنبيهات جودة Creators:**
- متابعو Collabstr مكتوبون بلا تحديد المنصة (قد يكون أحدهم TikTok)، فالتصنيف تقريبي. متابعو Modash/Elev8or لإنستغرام.
- التفاعل ونسبة المتابعين الوهميين متوفران لحسابات Modash فقط.
- «إشارة عناية بالبشرة» = كلمة في الـbio أو عنوان القائمة، وليست تحققاً من جودة المحتوى. تحتاج مراجعة بشرية (عينة من آخر المنشورات).
- بعض أقسام Modash العامة (مثل Dubai general) فيها حسابات بلا علاقة (دراجات، مال) فلُتّرت.

## 3) المتاجر والجهات
**دفعة 2 جاهزة:** ${batch2.length} جهة جديدة بصيغة \`b2b-leads\` (ملف JSON)، كلها \`غير متحقق\` من وجود Lowe's، أولوية C/D فقط. إضافةً لدفعة 1 (25 جهة) المعاينة سابقاً.

| الجهة | الإمارة | النوع | الموقع | تحقق الموقع | مسار موردين/شراكة منشور | تواصل منشور |
|---|---|---|---|---|---|---|
${storeRows}

### نقاط دخول وسوابق ومستبعدات
${intelRows}

## 4) المتطلبات — ثلاثة مواضيع منفصلة (بلا تغيير)
1. **رخصة الشركة الإماراتية:** ✅ جاهزة 100%.
2. **تسجيل المنتجات (Montaji وغيره):** ⏳ غير مثبت من نص رسمي (مصادر ثانوية فقط). ملف البلدية الرسمي لم يُقرأ بعد.
3. **شروط كل جهة:** ⏳ منشور فعلياً فقط عند noon وAmazon.ae (المقتطف)، وصفحات موردين لم تُقرأ شروطها عند Xpressions وK-Beauty Arabia (429) وtalabat (تطبيق JS) وUnion Coop (تسجيل دخول).

## 5) الفجوات والمخاطر
- **Instagram غير قابل للجلب العام:** لا يمكن التحقق من آخر منشورات أو نشاط الـcreators. مطلوب مراجعة يدوية.
- **Gifted/Barter/Low-cost:** غير مثبت لأي creator. الأسعار المعلنة ذاتية وبالدولار، وتخص منصة Collabstr فقط.
- **UAE ad permit:** بعض الـbios تذكر «Advertiser Permit». يبدو أن المؤثرين المقيمين بالإمارات يحتاجون تصريحاً إعلانياً (نتيجة بحث غير موثّقة رسمياً) — **تحقق من جهة الإعلام الرسمية قبل أي تعاقد**.
- 7 من جهات دفعة 2 بلا موقع متحقَّق (محمي/فشل/لا يطابق): لا تُستورد قبل التحقق.
- Beautyworld Dubai 6–8 تشرين الأول 2026 (اليوم الثالث الأخير): التسجيل أونلاين أُغلق، لكن **قائمة العارضين 2026 علنية** وتصلح كمصدر موزعين.
- مواقع كثيرة محمية أو بطيئة؛ ما لم يُفتح ليس دليلاً على عدم وجوده.

## 6) KPI مقترح (قابل للقياس)
- **جودة قبل الكمية:** ≥ 80% من الجهات المستوردة بموقع متحقَّق ومصدر وتاريخ.
- **Creators:** مراجعة بشرية لـ30 حساباً من الـ${targets.length} (فتح الحساب، نشاط آخر 30 يوماً، موقع، صلة بالعناية)، ثم تواصل مع 10 بسؤال Gifted صريح. المقياس: عدد من وافق على Gifted مقابل غير مهتم.
- **متاجر:** تواصل فعلي مع 10 جهات، وتحويل 3 منها لحالة «قيد الاتفاق» خلال 30 يوماً.
- **صفر مفاجآت:** صفر استيراد قبل معاينة ومراجعة واختيار صريح (الزر الجديد يفرض هذا).

## 7) الملفات المرفقة
- \`uae_creators_nano_micro_targets_2026-10-08.csv\` — ${targets.length} على الهدف (افتحه بـExcel).
- \`uae_creators_all_2026-10-08.json\` — الـ210 كاملة مع مكونات النتيجة والمصادر.
- \`uae_stores_batch2_2026-10-08.json\` — جاهز لزر الاستيراد (معاينة أولاً).
- \`uae_stores_all_verification_2026-10-08.csv\` — جدول التحقق الكامل (الموقع، المسارات، التواصل، المصادر).

**NO IMPORT · NO DATABASE WRITES · NO DEPLOY** — والخطوة التالية بقرارك: مراجعة العينة ثم اختيار ما يدخل.
`;
fs.writeFileSync(path.join(out, 'UAE_Mass_Discovery_Report_2026-10-08.md'), md);
console.log('targets', targets.length, tierCnt, '| priced', priced.length, '| withIg', withIg.length, '| permit', permit.length, '| skinExplicit', skinExplicit.length);
console.log('files:', fs.readdirSync(out).map((f) => `${f} (${fs.statSync(path.join(out, f)).size}b)`).join('\n       '));
