// One-off (accelerated phase, 9 Oct 2026): annotations for batch 11 + Track A/B evidence carried into the main DB.
const fs = require('fs');
const f = __dirname + '/platform_annotations_2026-10-09.json';
const a = JSON.parse(fs.readFileSync(f, 'utf8'));
const R = (tier, reason, source, extra = {}) => ({ tier, review_reason: reason, review_source: source, ...extra });
const upd = (name, obj) => { a.byName[name] = { ...(a.byName[name] || {}), ...obj }; };
const exclude = (name, kind, reason, dup) => { a.exclude[name] = { kind, reason, ...(dup ? { duplicate_of: dup } : {}) }; };

exclude('Looks Like Love', 'wrong_entity', 'النطاق lookslikelove.ae يعرض محتوى مقامرة (نطاق مُختطَف) — الرابط الرسمي الحالي غير معروف');
exclude('Cosmetica Beauty Trading', 'duplicate', 'نفس جهة Cosmetica (cosmeticatrading.com/about أعاد 404)', 'Cosmetica Beauty and Personal Care Trading');
exclude('QH Distribution', 'wrong_market', 'QH Distribution Inc. شركة أمريكية (تأسست 1984) — ليست موزعاً إماراتياً');
exclude('Pharmacy Directory UAE', 'lead_source', 'دليل صيدليات (مصدر بحث) وليس قناة بيع');

upd('Dayjour', R('A', 'صفحة «Seller Registration» رسمية تطلب: رخصة تجارية، رقم VAT، رقم تواصل، عنوان، اسم العلامة، اسم الحساب البنكي وشهادة IBAN؛ الحساب يُفعَّل بعد المراجعة. الفئات والعمولة غير منصوصة. المتجر يبيع منتجات تجميل وعناية بالشعر وأثاث صالونات.', 'https://dayjour.net/sub-sellers/registration', { method: 'direct_seller_registration', seller_registration_url: 'https://dayjour.net/sub-sellers/registration', evidence_level: 'official_page_fetched', classification: 'تسجيل مباشر', emirate: 'الإمارات (عنوان بالشارقة بحسب مصدر ثانوي)', license: 'رخصة تجارية + VAT + IBAN (حقول نموذج التسجيل الرسمي)', license_source: 'https://dayjour.net/sub-sellers/registration', fees: 'غير معلن', priority: 'B', start_rank: 0 }));
upd('TB East', R('B', 'متجر/موزع مهني (Timeless Beauty East) لعلامات يمثلها (Tokio Inkarami وغيرها) يخدم الصالونات والعيادات؛ صفحة «partnership» للاهتمام بالعلامات التي يمثلها — قبول علامات جديدة غير منصوص.', 'https://tb-east.com/partnership', { classification: 'اتفاق توزيع محتمل', priority: 'C', contact: '+971 55 402 1707 (صفحة الشراكة)' }));
upd('CHS Community Pharmacy (online)', R('D', 'متجر الصيدلية الأونلاين يطلب مصادقة (401) فلم يُفحص؛ السلسلة نفسها موجودة بدفعة talabat 3.', 'https://chspharmacy.ae/', { priority: 'D' }));
upd('Ahaliamed Online Pharmacy', R('C', 'صيدلية أونلاين بأبوظبي (توصيل 30 دقيقة بحسب موقعها) — لا صفحة موردين.', 'https://www.ahaliamed.com/', { priority: 'C' }));
upd('Soukare', R('D', 'متجر صحة/صيدلية يحجب الفحص (Cloudflare).', 'https://www.soukare.com/', { priority: 'D' }));
upd('Valeo (Feelvaleo)', R('D', 'منصة عناية/عافية تطلب تحققاً بشرياً (405) — لم يُتجاوز.', 'https://feelvaleo.com/en-ae/skin-care', { priority: 'D' }));
upd('Care to Beauty UAE', R('E', 'متجر دولي يحجب الفحص ويشحن إلى الإمارات؛ لا دليل على كيان إماراتي.', 'https://www.caretobeauty.com/ae/', { priority: 'D' }));
upd('The Skincare Edit', R('C', 'متجر عناية منتقاة بدبي (يديره أخصائي عناية) — لا صفحة موردين.', 'https://www.theskincareedit.ae/', { priority: 'C' }));
upd('IBS Beauty', R('B', 'موزع/تاجر جملة لمستحضرات وعناية بالشعر والبشرة ومستلزمات صالونات بدبي مع دعم B2B (موقعه) — موجّه للمشترين؛ قبول موردين غير منصوص.', 'https://www.ibsbeauty.ae/', { classification: 'اتفاق توزيع محتمل', priority: 'C' }));
upd('B-connected', R('B', 'تاجر جملة عناية بالشعر والبشرة ومستلزمات صالونات بدبي — موجّه للمشترين.', 'https://www.b-connected.com/', { classification: 'اتفاق توزيع محتمل', priority: 'C' }));
upd('MLC Dubai Cosmetic Wholesale', R('B', 'جملة عناية بالبشرة والشعر للتجار والصالونات والموزعين بالإمارات — موجّه للمشترين.', 'https://mlcdubai.com/', { classification: 'اتفاق توزيع محتمل', priority: 'C' }));
upd('AlbastakiOnline', R('B', 'تاجر جملة بديرة (أدوات وعناية شخصية) — ملاءمة متوسطة.', 'https://albastakionline.com/', { classification: 'اتفاق توزيع محتمل', priority: 'D' }));
upd('Al Basel Cosmetics', R('B', 'جملة وتجزئة مستحضرات وعناية بالشعر والبشرة ومستلزمات صالونات (موقعه: توصيل للإمارات والخليج).', 'https://albaselco.com/', { classification: 'اتفاق توزيع محتمل', priority: 'C' }));
upd('Doyen Wellness', R('B', 'مورّد منتجات صالونات وسبا بالإمارات والخليج.', 'https://doyenwellness.com/salon-products/', { classification: 'اتفاق توزيع محتمل', priority: 'D' }));
upd('SpaWorld UAE', R('B', 'مورّد منتجات سبا وصالونات وفنادق — ملاءمة ضعيفة لعلامة عناية استهلاكية.', 'https://spaworlduae.com/', { classification: 'اتفاق توزيع محتمل', priority: 'D' }));
upd('Abraa', R('D', 'سوق B2B للجملة بدبي يحجب الفحص (Cloudflare) — مسار البائعين غير متحقق.', 'https://www.abraa.com/', { priority: 'C', classification: 'غير مؤكدة (سوق B2B محتمل)' }));
upd('Dubai Wholesale Store', R('B', 'تاجر جملة B2B لمستحضرات كورية (حد أدنى 20 قطعة بحسب مصدر ثانوي) — تخصص كوري.', 'https://www.dubaiwholesalestore.com/', { classification: 'اتفاق توزيع محتمل', priority: 'D' }));
upd('I Serena Trading', R('B', 'جملة عناية بالبشرة والشعر (علامات كورية) — موجّه للمشترين.', 'https://i-serena.com/wholesale/', { classification: 'اتفاق توزيع محتمل', priority: 'D' }));
upd('HMSN Boutique Trading', R('B', 'شركة تجارة جملة مستحضرات بالإمارات بحسب موقعها.', 'https://hmsnboutiquetrading.com/service-detail/wholesale-of-cosmetics-and-trading', { classification: 'اتفاق توزيع محتمل', priority: 'D' }));

// Track A: carry the official-via-search-index facts into noon / Trendyol rows
upd('noon UAE', { evidence_level: 'official_page_via_search_index', seller_registration_url: 'https://sell.noon.com/uae-en',
  license: 'Local Seller: رخصة سارية 15 يوماً+ تغطي التجارة/البيع/التصنيع أو رخصة تجارة إلكترونية؛ هوية إماراتية/جواز لصاحب الرخصة؛ VAT اختياري؛ بيانات بنك (متعارض) — نص رسمي عبر فهرس البحث', license_source: 'https://support.noon.partners/portal/en/kb/articles/documents-required-to-sell-on-noon',
  fees: 'FBP الإمارات: عناية بالشعر والعناية الشخصية ومكياج 8% حتى 50 درهم و15% فوق 50؛ عطور 14%؛ حد أدنى 1 درهم — نص رسمي عبر فهرس البحث، يُؤكَّد بحساب البائع', fees_source: 'https://support.noon.partners/portal/en/kb/articles/fulfilled-by-partner-fbp-fees-in-uae',
  categories: 'عناية بالشعر والعناية الشخصية، مكياج، عطور؛ العلامات المحمية تتطلب تفويض علامة + فاتورة موزع معتمد', product_reg: 'تفويض علامة/Whitelisting للعلامات المحمية؛ تسجيل المنتج التنظيمي غير منصوص للإمارات', product_reg_source: 'https://helpcenter.noon.partners/en/category/product-listing/product-listing-policy' });
upd('Trendyol (Gulf marketplace)', { evidence_level: 'official_page_via_search_index', seller_registration_url: 'https://partner.trendyol.com/ae/onboarding/registration?lang=en-US',
  license: 'بائع محلي (نشاط/مخزون بالبر الرئيسي): رخصة تجارية سارية + رقم VAT إماراتي مقيم — نص رسمي عبر فهرس البحث', license_source: 'https://academy.trendyol.com/seller-information-center/ae/content/trendyols-policy-for-non-local-sellers-uae?lang=en',
  categories: 'متعارض: صفحة التسجيل تذكر beauty، وسياسة البائع غير المحلي تضع مستحضرات التجميل والعناية الشخصية ضمن المنتجات المنظمة', fees: 'العمولة القياسية غير منشورة؛ خصم 30% على العمولة لشهرين لمن يرفع منتجات خلال 7 أيام (صفحة التسجيل عبر فهرس البحث)', fees_source: 'https://partner.trendyol.com/ae/onboarding/registration?lang=en-US' });
upd('Faces UAE', { supplier_url: 'https://www.faces.ae/en/partnerwithfaces.html', contact: 'support@faces.com | 800 965 664', notes: 'رابط «Partner with Faces» رسمي بالتذييل («Join us as a partner and showcase your products in our curated assortment»)؛ محتوى الصفحة لم يُقرأ آلياً — يُفتح يدوياً.' });
upd('Pharmalink (Medicina operator)', { supplier_url: 'https://pharmalink.ae/contact/', contact: '+971 4 371 3777 | +971 2 304 2000 | نموذج Alliance & Partnership بصفحة التواصل' });
upd('Life Pharmacy', { contact: '043441122 | care@lifepharmacy.com (خدمة عملاء)', notes: 'لا صفحة موردين منشورة — تحتاج تواصلاً تجارياً.' });

fs.writeFileSync(f, JSON.stringify(a, null, 1));
console.log('ok', Object.keys(a.byName).length, Object.keys(a.exclude).length);
