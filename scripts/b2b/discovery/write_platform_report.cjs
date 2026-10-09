// Writes the Markdown report for the sales-platform research from the data (numbers are computed, not typed by hand).
const fs = require('fs');
const dir = process.argv[2];
const j = JSON.parse(fs.readFileSync(dir + '/uae_sales_platforms_2026-10-09.json', 'utf8'));
const s = j.stats, rows = j.rows;
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
// overlap with the leads discovery batches (batch1-3 websites)
const leadHosts = new Set();
for (const f of ['../uae_batch1_2026-10-08.json', '../discovery_2026-10-08/uae_stores_batch2_2026-10-08.json', '../discovery_2026-10-08/uae_stores_batch3_2026-10-08.json']) {
  try { JSON.parse(fs.readFileSync(dir + '/' + f, 'utf8')).rows.forEach((r) => r.website && leadHosts.add(host(r.website))); } catch { /* ignore */ }
}
const overlap = rows.filter((r) => host(r.official_website) && leadHosts.has(host(r.official_website))).length;
const PREV_KEPT = 110; // state at commit a00e672
const dups = j.excluded.filter((e) => e.kind === 'duplicate').length;
const fileEntries = rows.filter((r) => r._batch === '51').length;
const L = [];
L.push('# تقرير بحث منصات البيع بالإمارات — المرحلة 2 (9 تشرين الأول 2026)', '');
L.push('> مصادر عامة فقط (صفحات رسمية، محركات بحث، أدلة منشورة). لا Import، لا قاعدة بيانات، لا Merge، لا Deploy. المجهول = «غير معروف». لا عمولات ولا شروط إلا من صفحة رسمية قُرئت مع رابطها. **البحث غير مكتمل** (انظر «ما تبقى»).', '');
L.push('## الأعداد الفعلية', '', '| البند | العدد |', '|---|---|');
L.push(`| جهات فُحصت (51 من ملف حسام + ${s.input_records - 51} مكتشفة) | ${s.input_records} |`);
L.push(`| المتبقي بعد التنظيف | ${s.kept} (كان ${PREV_KEPT} عند commit a00e672 → +${s.kept - PREV_KEPT} جديدة) |`);
L.push(`| من ملف حسام (بعد التنظيف) | ${fileEntries} |`);
L.push(`| مكررات | ${dups} |`);
L.push(`| مستبعدة (ليست قناة / مصدر بحث / رابط خاطئ أو غير متحقق / سوق آخر) | ${s.excluded_total - dups} |`);
L.push(`| متداخلة مع دفعات ليدز المتاجر (1-3) بنفس الموقع | ${overlap} |`);
L.push(`| **A** تسجيل بائع مباشر موثّق | ${s.tiers.A} |`);
L.push(`| **B** B2B / جملة / توزيع | ${s.tiers.B} |`);
L.push(`| **C** تتطلب اتفاق مورد (القبول غير مؤكد) | ${s.tiers.C} |`);
L.push(`| **D** تحتاج تحققاً إضافياً / مراجعة يدوية | ${s.tiers.D} |`);
L.push(`| **E** غير مناسبة (ضمن السجلات) + المستبعدة | ${s.tiers.E_in_rows} + ${s.tiers.E_excluded_list} |`);
L.push(`| تحجب الفحص الآلي (لم يُتجاوز) | ${s.protected_not_verified} |`);
L.push(`| لم تستجب عند الفحص (لا يعني أنها غير موجودة) | ${s.unreachable} |`);
L.push(`| رسوم/عمولات من مصدر رسمي | ${s.with_official_fee_source} |`);
L.push(`| شروط ترخيص من مصدر رسمي | ${s.with_license_req_source} |`);
L.push(`| شروط تسجيل منتج من مصدر رسمي | ${s.with_product_reg_source} (موضوع Montaji منفصل) |`, '');
L.push('## أين نبدأ — قائمة البدء (A ثم B ثم C الموثّقة)', '');
const start = j.start_list.map((n) => rows.find((r) => r.name === n)).filter(Boolean);
L.push('| # | الجهة | الفئة | السبب | الرابط | تواصل منشور |', '|---|---|---|---|---|---|');
start.forEach((r, i) => L.push(`| ${i + 1} | ${r.name} | ${r.tier} | ${String(r.tier_reason).replace(/\|/g, '/')} | ${r.seller_registration_url || r.supplier_or_partnership_url || r.official_website} | ${String(r.public_business_contact).replace(/|/g, ';')} |`));
L.push('', '**حقائق رسمية مثبتة:**');
L.push('- Amazon.ae (sell.amazon.ae/pricing): عمولة الجمال 8% للمنتج ≤ 50 درهم و15% للأعلى، حد أدنى 1 درهم؛ حساب Professional بلا اشتراك شهري «لفترة محدودة»؛ الأسعار بدون VAT.');
L.push('- Begad (begad.ae/ar/sell): رخصة تجارية + إثبات بنك + هوية؛ تسجيل مجاني؛ العمولة «نسبة ثابتة لكل فئة» بلا أرقام.');
L.push('- K Beauty Souq (kbeautysouq.com/sell-with-us): نموذج تاجر للمراجعة؛ الرخصة اختيارية بالنموذج؛ الرسوم غير معلنة.');
L.push('- Tradeling وLets Tango: رابط تسجيل بائع رسمي؛ الفئات والرسوم غير معلنة (فئة التجميل غير مؤكدة).', '');
L.push('## المنهجية', '');
L.push('1. فحص آلي لكل رابط: حالة HTTP، عنوان الصفحة، وجود إشارات إماراتية، وروابط البائع/المورد داخل الموقع (أُتبعت حتى 4 روابط لكل جهة).');
L.push('2. الروابط والرسوم **لا تُعتمد آلياً** (صفحات الأفلييت والمنتجات تطابق الكلمات): كل تصنيف مسار بيع أو رسم مرّ بمراجعة يدوية لنص الصفحة الرسمية (WebFetch) ويحمل رابطه.');
L.push('3. التوسّع: بحث ويب عام بالعربية والإنجليزية، مقالات/أدلة منشورة، روابط خارجية من مقالات، وصفحات رسمية. DuckDuckGo أعاد تحدّياً أمنياً بعد استعلامين فتوقفتُ فوراً دون تجاوز.');
L.push('4. إزالة التكرار: بالاسم والنطاق ضمن الدفعات، ومع كل دفعات الليدز السابقة (نطاقات DDG).');
L.push('5. الروابط التي خمّنتُ نطاقها ولم تستجب: **لا تُنشر كروابط رسمية** — تُحفظ كـ«رابط مخمَّن غير متحقق».', '');
L.push('## القيود', '');
L.push('- مواقع كثيرة تحجب الفحص الآلي (Cloudflare/403/401) ولم تُتجاوز؛ صُنفت D للمراجعة اليدوية، وليس غير نشطة.');
L.push('- عمولات المدونات (مثل نطاق noon 4–27% أو 10% لـLets Tango) **غير معتمدة**.');
L.push('- لا يوجد أي دليل رسمي على شروط تسجيل المنتجات (Montaji / وزارة الصحة) لأي منصة.');
L.push("- تسجيل الشركة (جاهز 100%) ≠ تسجيل المنتجات ≠ شروط كل منصة. لا شيء هنا يضمن قبول LOWE'S.");
L.push('- متاجر إنستغرام التجارية لا يمكن التحقق منها عاماً. TikTok Shop: صفحة البائع المفحوصة أمريكية.', '');
L.push('## ما تبقى (البحث غير مكتمل)', '');
L.push('- فتح الروابط في `uae_sales_platforms_manual_review_2026-10-09.csv` يدوياً (الجهات المحجوبة والتي لم تستجب).');
L.push('- مزيد من الاكتشاف: متاجر مستقلة بالإمارات الشمالية، موزعون وصالونات، ومنصات B2B محلية — محركات البحث المتاحة آلياً أعطت نتائج محدودة.');
L.push('- التأكد من مسارات الموردين لسلاسل الصيدليات والمتاجر الكبرى (Watsons/Al-Futtaim، Faces، Boots، Life، Aster…) بالتواصل المباشر.', '');
L.push('## الملفات', '');
L.push('- `LOWES_UAE_Sales_Platforms_Verified_2026-10-09.xlsx` (كل الجهات + A/B/C/D/E + قائمة البدء + مراجعة يدوية)');
L.push('- `uae_sales_platforms_2026-10-09.json` و`.csv`');
L.push('- `uae_sales_platforms_excluded_2026-10-09.csv` (المستبعد وأسبابه)');
L.push('- `uae_sales_platforms_manual_review_2026-10-09.csv` (روابط تحتاج تحققاً يدوياً)');
L.push('- `uae_sales_platforms_start_list_2026-10-09.csv`');
L.push('- `audit_raw/` (نتائج الفحص الخام) والسكربتات بـ`scripts/b2b/discovery/`');
fs.writeFileSync(dir + '/UAE_Sales_Platforms_Report_2026-10-09.md', L.join('\n'));
console.log('report written; overlap with leads batches:', overlap, '| start list', start.length);
