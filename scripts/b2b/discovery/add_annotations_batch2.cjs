// one-off: merges reviewed annotations for batches 4-6 (K-beauty stores, small marketplaces, distributors) into platform_annotations_2026-10-09.json
const fs = require('fs');
const f = __dirname + '/platform_annotations_2026-10-09.json';
const a = JSON.parse(fs.readFileSync(f, 'utf8'));
const ex = (n, kind, reason) => { a.exclude[n] = { kind, reason }; };
ex('NOK Beauty', 'wrong_entity', 'النطاق nokbeauty.ae يعرض محتوى مقامرة (نطاق مُختطَف/قديم) — الرابط الرسمي الحالي غير معروف');
ex('Ourlex', 'url_not_verified', 'النطاق الذي جرّبته غير مربوط بالموقع (Wix 404) — الرابط الرسمي غير معروف');
ex('Beauty Nation (Chalhoub)', 'url_not_verified', 'النطاق الذي جرّبته غير مربوط (Wix 404) والمنصة ذُكرت بمصدر 2022 — نشاطها غير متحقق');
ex('WESAM Beauty', 'url_not_verified', 'النطاق غير موجود (ENOTFOUND) — الرابط الرسمي غير معروف');
ex('DubaiStore', 'url_not_verified', 'النطاق غير موجود (ENOTFOUND)، والمنصة مذكورة بمصادر 2018-2020 — حالتها غير معروفة');
ex('Skin Solutions UAE (alt domain)', 'wrong_entity', 'النطاق يعرض عيادة جلدية بأمريكا — ليس المتجر المقصود');
ex('Mirai Skin', 'wrong_market', 'متجر مقره الولايات المتحدة، ليس جهة إماراتية');
ex('Tints of Nature', 'not_a_sales_channel', 'موقع علامة (شعر طبيعي) لا قناة بيع/متجر متعدد العلامات');
Object.assign(a.byName, {
  'K Beauty Souq': { method: 'direct_seller_registration', method_source: 'kbeautysouq.com/sell-with-us', seller_registration_url: 'https://kbeautysouq.com/sell-with-us/', evidence_level: 'official_page_fetched', emirate: 'الإمارات (توصيل وطني)', categories: 'K-beauty: عناية بشرة ومكياج', license: 'النموذج الرسمي: الرخصة التجارية ورقم VAT حقول اختيارية؛ الإلزامي: اسم النشاط وجهة اتصال وبريد وجوال', license_source: 'https://kbeautysouq.com/sell-with-us/', fees: 'غير معلن', contact: 'support@kbeautysouq.com', priority: 'A', notes: "نموذج تقديم تاجر «UAE marketplace merchant» للمراجعة. تخصص K-beauty — ملاءمة LOWE'S (تركية) تحتاج تحققاً." },
  'Lets Tango': { method: 'direct_seller_registration', method_source: 'sellers.letstango.com', seller_registration_url: 'https://sellers.letstango.com/newmarketplace', evidence_level: 'official_page_fetched', emirate: 'الإمارات', categories: 'الصفحة تعرض علامات إلكترونيات؛ فئة التجميل غير منصوصة', license: 'غير منصوص', fees: 'غير معلن بالصفحة (نسبة 10% وردت بملخص طرف ثالث — غير معتمدة)', contact: 'seller@letstango.com | +971 4 4034888', priority: 'C', notes: 'زر Start Selling رسمي. فئة العناية غير مؤكدة.' },
  'LSM Trading': { method: 'wholesale_distribution', method_source: 'lsmtrading.com/wholesale', supplier_url: 'https://lsmtrading.com/wholesale/', evidence_level: 'official_page_fetched', emirate: 'دبي (أم رمول) — توزيع بالإمارات', categories: 'مشروبات، فيتامينات، صيدلية، صحة وجمال، عناية بالشعر', contact: 'sales@lsmtrading.com | +971 4 339 2157', priority: 'B', notes: 'الصفحة موجهة للشركات التي تشتري منهم (نموذج لفريق المبيعات). قبولهم موردين جدد غير منصوص.' },
  'Multiplex International': { method: 'wholesale_distribution', evidence_level: 'site_active_no_program_page_confirmed', categories: 'FMCG ومستحضرات تجميل (حسب عنوان الموقع)', priority: 'B', notes: 'موزع FMCG وتجميل؛ لا صفحة موردين ظهرت. يلزم تواصل مباشر.' },
  'Beautetrade': { method: 'wholesale_distribution', evidence_level: 'site_active_no_program_page_confirmed', emirate: 'عالمي (ليس إماراتياً حصراً)', priority: 'C', notes: 'سوق B2B عالمي للتجميل (موردون ومشترون). رابط تسجيل مورد محدد لم يُوثَّق. حضوره الإماراتي غير مؤكد.' },
  'Dana Al Emarat Pharmacy': { method: 'independent_multibrand_store', priority: 'C', notes: 'صيدلية مستشفى بأبوظبي؛ صفحة الشراكات سريرية فقط، لا مسار موردين.' },
  'Cosmetica Beauty and Personal Care Trading': { tier: 'D', priority: 'D', notes: 'الصفحة الرئيسية قالب فارغ («homepage of the website») — لا دليل كافٍ على النشاط الحالي.' },
  'Apotheca Beauty': { tier: 'D', priority: 'D', notes: 'النطاق الذي فُحص متجر Shopify بلا مؤشر إماراتي؛ مصدر ثانوي يذكر موزعاً بهذا الاسم (دبي/الكويت) — قد يكون كياناً آخر. غير متحقق.' },
  'Fragrancia': { unsuitable: 'متجر عطور فقط — خارج نطاق العناية بالبشرة والشعر', priority: 'D' },
  'Lattafa Perfumes UAE': { unsuitable: 'متجر علامة عطور واحدة — خارج النطاق', priority: 'D' },
  'Dermazone Store': { tier: 'D', priority: 'D', emirate: 'غير مؤكد (متجر سعودي النطاق)', notes: 'الموقع عربي بنطاق سعودي بحسب مصدر ثانوي؛ تغطيته للإمارات غير مؤكدة.' },
  'Gulf Pharmacy': { priority: 'C', notes: 'صيدلية أونلاين؛ لا صفحة موردين ظهرت.' },
  'SahaJamal Pharmacy': { priority: 'C', notes: 'سلسلة صيدليات أونلاين؛ لا صفحة موردين ظهرت.' }
});
fs.writeFileSync(f, JSON.stringify(a, null, 1));
console.log('annotations updated: byName', Object.keys(a.byName).length, 'exclude', Object.keys(a.exclude).length);
