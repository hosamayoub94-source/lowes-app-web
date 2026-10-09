// One-off (9 Oct 2026, phase 3): merges the manual review of the 93 unconfirmed entities, the A-tier deep check and the Top-20 start ranking
// into platform_annotations_2026-10-09.json. Every decision carries its reason and a source URL actually opened (page fetch or search result).
const fs = require('fs');
const f = __dirname + '/platform_annotations_2026-10-09.json';
const a = JSON.parse(fs.readFileSync(f, 'utf8'));
const S = {
  talabat: 'https://www.talabat.com/uae/pharmacies', ha: 'https://focus.hidubai.com/best-korean-beauty-stores-in-dubai/', bw: 'https://exhibitor.beautyworldksa.com/exhibitor-search-en/exhibitor-search.detail.html/najafi-cosmetics-co-llc.html',
};
const R = (tier, reason, source, extra = {}) => ({ tier, review_reason: reason, review_source: source, ...extra });
const upd = (name, obj) => { a.byName[name] = { ...(a.byName[name] || {}), ...obj }; };
const exclude = (name, kind, reason) => { a.exclude[name] = { kind, reason }; };

// ---- duplicates / folded records from the phase-3 search batch (exp8) ----
exclude('Sephora Middle East (sephora.me)', 'duplicate', 'نفس جهة Sephora UAE (نطاق sephora.me/sephora.ae لشركة واحدة)');
a.exclude['Sephora Middle East (sephora.me)'].duplicate_of = 'Sephora UAE';
exclude('Union Coop — Supplier Registration (corporate)', 'duplicate', 'مكرر: صفحة تسجيل الموردين الرسمية أُضيفت إلى سجل Union Coop');
exclude('Union Coop Marketplace (vendor sign-up)', 'duplicate', 'مكرر: اتفاقية سوق Union Coop (PDF) أُضيفت إلى سجل Union Coop');
exclude('Carrefour UAE Marketplace (seller register)', 'duplicate', 'مكرر: رابط تسجيل Carrefour Marketplace أُضيف لسجل Carrefour UAE (غير متحقق المحتوى)');
exclude('Sharaf DG Business (DG Business)', 'duplicate', 'مكرر: بوابة DG Business تابعة لـSharaf DG');
exclude('Lulu Retail — Sourcing', 'duplicate', 'مكرر: صفحة Sourcing تابعة لـLulu Hypermarket');
exclude('Choithrams GCC contact', 'duplicate', 'مكرر: صفحة تواصل Choithrams');
exclude('Spinneys Local Business Incubator', 'duplicate', 'مكرر: برنامج تابع لـSpinneys (E)');
exclude('Hala Al Jamal Cosmetics', 'lead_source', 'صفحة دليل أعمال فقط (oncosmetics) — ليست موقع الشركة');
exclude('Najafi', 'wrong_entity', 'najafi.com هو موقع The Najafi Companies (شركة استثمار أمريكية) وليس شركة مستحضرات التجميل Najafi Cosmetics/International بدبي؛ موقع الأخيرة غير معروف');

// ---- A-tier deep check (official pages read 9 Oct 2026) ----
upd('Amazon UAE', { priority: 'A', start_rank: 1,
  start_reason: 'أكبر سوق مفتوح للبائعين وبرسوم معلنة رسمياً. تنبيه: العناية الموضعية (Topicals) تتطلب موافقة فئة، والصفحة تقول «Dubai Trade Licence» ولا تذكر قبول رخصة المنطقة الحرة — يُتحقق من أهلية رخصة LOWE\'S قبل إعلان الجاهزية.',
  notes: 'مسار التسجيل: sellercentral.amazon.ae (زر Create your Amazon seller account). المستندات الرسمية: بريد/حساب أمازون، هاتف، هوية وطنية (مثل الهوية الإماراتية)، كشف حساب بنكي/بطاقة/فاتورة خدمات حديثة، السجل التجاري (أو توكيل للممثل)، وحساب بنكي. الفئات: «Beauty» ضمن الفئات بلا قيود مع ملاحظة «topicals require approval»؛ و«Beauty Topicals» و«Health & Personal Care» و«Cosmetics & Skin/Hair Care» مقيّدة وتحيل لصفحات قيود منفصلة لم تُقرأ. أهلية رخصة المنطقة الحرة: غير منصوص. شروط الإدراج (GTIN/موافقات المنتج): غير منصوصة بالصفحة التي قُرئت.' });
upd('Begad', { priority: 'A', start_rank: 3,
  start_reason: 'تسجيل بائع مجاني ومراجعة سريعة حسب موقعهم، لكن حجم المنصة غير معروف، وعمولة الفئة غير معلنة. «الجمال» مذكور كفئة شائعة؛ العناية بالبشرة تحديداً غير منصوص.',
  notes: 'رخصة تجارية + إثبات حساب بنكي + هوية حكومية (PDF/JPG/PNG حتى 20MB). أهلية المنطقة الحرة وشروط الإدراج وتسجيل المنتج: غير منصوصة. التواصل: sellers@begad.ae.' });
upd('K Beauty Souq', { priority: 'A', start_rank: 4,
  start_reason: 'نموذج «تاجر سوق» رسمي بلا اشتراط رخصة بالنموذج. المتجر يعرض «100% Authentic Korean beauty» (28 علامة كورية) ولم يُنصّ على قبول علامات غير كورية — قد يرفض LOWE\'S (علامة تركية).',
  notes: 'الشركة المشغّلة FEXINVA LLC (الإمارات) بحسب التذييل. السياسة العامة تقول «Products may be sold by different merchants and brands». العمولة وشروط التاجر والفئات المقبولة: غير منصوصة. التواصل العام: support@kbeautysouq.com.' });
upd('Tradeling', { priority: 'B', start_rank: 18,
  start_reason: 'تسجيل بائع رسمي ومنصة B2B كبيرة (شراكة DET وغرف دبي 2026 بحسب مصدر ثانوي)، لكن فئات الصفحة الرسمية لا تشمل التجميل/العناية — يُسأل الدعم قبل الاستثمار بالتسجيل.',
  notes: 'الفئات الظاهرة: هواتف، لابتوب، مياه، مشروبات، وجبات خفيفة، مستلزمات أطفال، طعام حيوانات. العمولة: عنوان بلا أرقام. شروط التوثيق (Verified Seller): السؤال بلا إجابة بالصفحة. اللوجستيات: Tradeling Logistics + Exporter of Record.' });
upd('Lets Tango', { priority: 'D', classification: 'تسجيل مباشر (أولوية منخفضة)',
  notes: 'زر Start Selling رسمي، لكن الصفحة تعرض علامات إلكترونيات ولا تذكر فئة التجميل. التواصل: seller@letstango.com. أولوية منخفضة بطلبك حتى تثبت الملاءمة. نسبة العمولة 10% وردت بملخص طرف ثالث — غير معتمدة.' });

// ---- the 93 manual-review entities: decisions with reasons + sources ----
const GEN = 'نتيجة بحث عام 9/10/2026';
upd('noon UAE', R('D', 'أكبر سوق إقليمي، لكن الموقع حجب الفحص الآلي (403/SSL) ولم أتجاوزه؛ مسار sell.noon.com/uae-en/getting-started مأخوذ من ملفك وتؤكده مصادر ثانوية فقط. يلزم فتحه يدوياً.', 'https://sell.noon.com/uae-en/getting-started', { classification: 'تسجيل مباشر محتمل — غير موثّق رسمياً', priority: 'A', start_rank: 2, start_reason: 'أكبر سوق إماراتي مفتوح للبائعين حسب ملفك ومصادر ثانوية، لكن لم أستطع قراءة صفحته الرسمية (حجب آلي). افتح sell.noon.com يدوياً وتأكد من الفئة والعمولة والمستندات.' }));
upd('Carrefour UAE', R('C', 'الموقع يعمل ولا يملك صفحة موردين ظاهرة؛ المجموعة (Majid Al Futtaim) لديها صفحة «Partner with us» عامة. ذُكر رابط marketplace.carrefouruae.com/seller/register بأدلة طرف ثالث وصفحته تحمّل لكن محتواها لم يُتحقق منه.', 'https://www.majidalfuttaim.com/en/what-we-do/partner-with-us', { priority: 'C' }));
upd('Lulu Hypermarket UAE', R('C', 'سلسلة كبرى تبيع العناية الشخصية؛ الموقع يحجب الفحص (403). صفحة Sourcing للمجموعة (luluretail.com/global-operations/sourcing) تظهر بنتائج البحث وتحجب الفحص أيضاً — لا مسار موردين مؤكد.', 'https://www.luluretail.com/global-operations/sourcing/', { priority: 'C' }));
upd('Sharaf DG', R('E', 'متجر إلكترونيات؛ لا دليل على فئة تجميل. بوابة DG Business (business.sharafdg.com) موجهة للمشترين التجاريين وتحجب الفحص.', 'https://business.sharafdg.com/contact-us/', { priority: 'D' }));
upd('Namshi', R('C', 'متجر أزياء وجمال (تابع لـnoon) وصفحة العناية بالبشرة ظاهرة بنتائج البحث (namshi.com/uae-ar/women-beauty-skincare). الموقع لم يستجب آلياً؛ مسار الموردين غير منشور (يُدمج مع البائعين عبر مُكامِلات حسب مصدر ثانوي).', 'https://www.namshi.com/uae-ar/women-beauty-skincare/', { priority: 'C' }));
upd('Ounass', R('D', 'منصة فاخرة (Al Tayer) تحجب الفحص (403)؛ التموضع الفاخر قد لا يناسب LOWE\'S. لا مسار موردين منشور.', GEN, { priority: 'D' }));
upd('Galeries Lafayette Dubai', R('D', 'متجر فاخر يحجب الفحص (403)؛ لا دليل على فئة العناية بالبشرة أو مسار موردين.', GEN, { priority: 'D' }));
upd('Mumzworld Seller Registration', { priority: 'C', tier: 'C', review_reason: 'نموذج تقديم علامات رسمي (مراجعة ~7 أيام)، لكن تخصص المنصة أم/طفل؛ الفئات المقبولة غير مذكورة.', review_source: 'https://landing.seller.mumzworld.com/sell', classification: 'تقديم مورد (ملاءمة ضعيفة)' });
upd('Sephora UAE', R('C', 'متجر تجميل متعدد العلامات؛ الموقع يحجب الفحص (403). صفحة About لا تذكر كيف تتقدم علامة جديدة. لا مسار موردين منشور.', 'https://sephora.ae/en/about-us', { priority: 'B', start_rank: 14, start_reason: 'سلسلة تجميل مرموقة، لكن لا مسار موردين منشور والمعايير على الأغلب عالية؛ تُقاس بعد منصات التسجيل المباشر.' }));
upd('Glowy', R('D', 'عنوان الصفحة الرئيسية «Codazon Home Page» أي قالب تجريبي — لا دليل على متجر فعّال حالياً.', 'https://glowy.ae/', { priority: 'D' }));
upd('BinSina Pharmacy', R('C', 'سلسلة صيدليات كبيرة (90+ فرعاً بحسب موقعها، مصدر ثانوي) تظهر على talabat بأقسام عناية؛ الموقع يرفض الطلبات الآلية (405). لا صفحة موردين.', 'https://www.binsina.ae/en/about-us-mobile', { priority: 'C' }));
upd('Deliveroo UAE', R('E', 'تطبيق توصيل؛ لا دليل على قبول مستحضرات تجميل من علامات جديدة، وأولويته منخفضة بملفك.', 'https://deliveroo.ae/en/', { priority: 'D' }));
upd('iHerb UAE', R('D', 'متجر دولي متخصص بالمكملات يحجب الفحص (403)؛ القبول عبر مسار علامات عالمي لا إماراتي.', GEN, { priority: 'D' }));
upd('Boutiqaat', R('D', 'منصة تجميل إقليمية (كويتية) تحجب الفحص؛ عملها بالإمارات غير مؤكد.', GEN, { priority: 'D' }));
upd('Madi International', R('B', 'موزع مستحضرات صالونات إقليمي (تأسس 1991؛ UAE وSaudi وQatar…) بفئات: شعر، بشرة، أظافر، مكياج (صفحة وظائف Gulftalent). علاقة Wella منذ 2010 وعلامات K18 وKevin Murphy (مقالات ثانوية). الموقع madiint.com لم يستجب — الموقع الرسمي غير معروف.', 'https://www.tradearabia.com/news/RET_175366.html', { classification: 'اتفاق توزيع محتمل', priority: 'B', start_rank: 7, start_reason: 'موزع صالونات كبير بفئة عناية بالشعر (ملائم لخط الشعر/الروزماري). قناة التواصل غير منشورة (الموقع لم يستجب)؛ يُبحث عن قناة تواصل رسمية.' }));
upd('Instagram Shop / Instagram Business', R('D', 'قناة بيع مباشرة ممكنة، لكن الموقع أعاد 400/مهلة، وإتاحة Shops/Checkout لحساب إماراتي غير مؤكدة. الحساب مثبَّت بقرار حسام.', 'https://business.instagram.com/', { priority: 'B' }));
upd('TikTok for Business', R('D', 'صفحة البائع المفحوصة (seller.tiktok.com) هي نسخة TikTok Shop الأمريكية؛ إتاحة المتجر للإمارات غير مؤكدة.', 'https://seller.tiktok.com/', { priority: 'C' }));
upd('WhatsApp Business', R('D', 'قناة كتالوج وتواصل مباشر لا سوق؛ الموقع أعاد 400/مهلة.', 'https://business.whatsapp.com/', { priority: 'B' }));
upd('Shopify Store', R('D', 'منصة لإنشاء متجر خاص بالعلامة (ليست سوقاً)؛ أهلية الدفع والشحن للإمارات غير مؤكدة بالصفحة.', 'https://www.shopify.com/', { priority: 'B' }));
upd('Salla', R('D', 'منصة سعودية تحجب الفحص؛ أهلية شركة إماراتية غير مؤكدة.', GEN, { priority: 'D' }));
upd('Zid', R('D', 'منصة سعودية؛ أهلية شركة إماراتية غير مؤكدة.', 'https://zid.sa/ar/', { priority: 'D' }));
upd('Sivvi', R('D', 'منصة أزياء/جمال لم تستجب آلياً؛ لا مسار موردين معروف.', GEN, { priority: 'D' }));
upd('Styli', R('D', 'منصة أزياء (Landmark) تحجب الفحص؛ فئة العناية غير مؤكدة.', GEN, { priority: 'D' }));
upd('6thStreet', R('D', 'منصة أزياء تحجب الفحص؛ فئة العناية غير مؤكدة.', GEN, { priority: 'D' }));
upd('Dubizzle', R('D', 'منصة إعلانات مبوبة تحجب الفحص؛ البيع فردي لا لعلامة موردة.', GEN, { priority: 'D' }));
upd('OpenSooq UAE', R('E', 'منصة إعلانات مبوبة (صفحة sell-any-thing لبيع الأفراد) — لا تناسب علامة تجارية تبحث عن توزيع منظم.', 'https://ae.opensooq.com/ar/sell-any-thing', { priority: 'D' }));
upd('InstaShop', R('D', 'تطبيق توصيل بقالة وصيدلية (ضمن talabat) يحجب الفحص؛ التجميل تابع لمتاجر شريكة.', GEN, { priority: 'D' }));
upd('Kibsons', R('E', 'متجر خضار وبقالة طازجة؛ لا علاقة بفئة التجميل.', 'https://www.kibsons.com/', { priority: 'D' }));
upd('Spinneys UAE', R('E', 'المسار الوحيد المنشور للموردين برنامج Local Business Incubator لمنتجات غذائية محلية بحصرية 6 أشهر — لا يناسب LOWE\'S.', 'https://www.spinneys.com/en-ae/lifestyle/register-your-business-for-the-2025-edition-of-the-spinneys-local-business-incubator-programme/', { priority: 'D' }));
upd('Choithrams', R('C', 'سوبرماركت فعّال؛ صفحة التوزيع تذكر شراكات مع «مئات علامات FMCG» دون مسار تقديم. لا بريد موردين منشور بالصفحات المقروءة.', 'https://choithramsgcc.com/en/contents/view/distribution', { priority: 'C' }));
upd('Waitrose UAE', R('D', 'سوبرماركت يحجب الفحص (403).', GEN, { priority: 'D' }));
upd('Abu Dhabi Coop', R('D', 'جمعية تعاونية لم يستجب موقعها آلياً.', GEN, { priority: 'D' }));
upd('Sharjah Coop', R('D', 'جمعية تعاونية فعّالة (بقالة ومنزل) بلا دليل على فئة تجميل أو مسار موردين.', 'https://sharjahcoop.ae/', { priority: 'D' }));
upd('Spacenk', R('E', 'متجر بريطاني (نسخة UK)، ليس جهة إماراتية.', 'https://www.spacenk.com/', { priority: 'D' }));
upd('Feelunique', R('E', 'متجر بريطاني دولي يحجب الفحص؛ ليس قناة إماراتية.', GEN, { priority: 'D' }));
upd('Harvey Nichols Dubai', R('D', 'متجر فاخر لم يستجب موقعه؛ لا دليل على مسار موردين.', GEN, { priority: 'D' }));
upd('Thumbay Pharmacy', R('C', 'سلسلة صيدليات بفروع في 6 إمارات (صفحة Gulf Medical University وThumbay Healthcare) وتظهر على talabat بأقسام عناية. النطاق الذي جرّبته (thumbaypharmacy.com) معلّق «Account Suspended» — الموقع الرسمي غير معروف.', 'https://thumbayhospital.com/services/thumbay-pharmacy', { priority: 'C' }));
upd('Al Ain Pharmacy', R('C', 'سلسلة صيدليات تظهر على talabat بأقسام عناية بالبشرة وعدة فروع بالعين؛ لا موقع رسمي متحقق منه.', 'https://www.talabat.com/uae/grocery/43177/al-ain-pharmacy/beauty-cosmetics/fragrance', { priority: 'C' }));
upd('Lana Pharmacy', R('C', 'سلسلة صيدليات (10 فروع بعينة talabat عبر 6 إمارات)؛ لا موقع رسمي متحقق (شهادة SSL خاطئة على النطاق المجرّب).', S.talabat, { priority: 'C' }));
upd('Docib', R('C', 'سلسلة صيدليات (DOCIB Group) بفروع بعدة إمارات على talabat؛ مصدر ثانوي يذكر شراكتها مع علامة عناية محلية. الموقع المجرّب فارغ العنوان.', 'https://www.talabat.com/uae/grocery/43429/docib-pharmacy-khalidiyah-mallal-hosn-kha006', { priority: 'C' }));
upd('K-Secret', R('C', 'أكبر متجر K-beauty متعدد العلامات بحسب مقالات (The National / HiDubai) ويظهر كموزع في دليل أعمال؛ الموقع يحجب الفحص. لا مسار موردين منشور.', S.ha, { priority: 'C' }));
upd('Shofon', R('D', 'مذكور بدليل Harper\'s Bazaar كمتجر K-beauty؛ الموقع لم يستجب آلياً.', 'https://www.harpersbazaararabia.com/beauty/skin-care/where-to-buy-korean-skincare-beauty-kbeauty-uae', { priority: 'D' }));
upd('Chicsta', R('D', 'مذكور كمتجر K-beauty بدليل منشور؛ صفحته الرئيسية تحمّل بلا عنوان أو وصف — نشاطه الحالي غير مؤكد.', 'https://www.harpersbazaararabia.com/beauty/skin-care/where-to-buy-korean-skincare-beauty-kbeauty-uae', { priority: 'D' }));
upd('Blissology Beauty Supply', R('D', 'موزع/مورّد مذكور بدليل أعمال (Investment Park، دبي)؛ الموقع لم يستجب.', GEN, { priority: 'D' }));
upd('Bulandi Distributors', R('B', 'موزع في جبل علي (FZCO) يذكر العناية بالبشرة بين مجموعاته في ملف عارض Beautyworld 2022؛ موقعه يعمل لكن صفحته الرئيسية بلا تفاصيل. لا مسار موردين.', 'https://exhibitor.beautyworldme.com/exhibitor-search-en/exhibitor-search.detail.html/bulandi-distributors-fzco.html', { classification: 'اتفاق توزيع محتمل', priority: 'C' }));
upd('Lacot General Trading', R('D', 'موزع FMCG مستحضرات/مستلزمات شخصية بملف عارض 2022 (بدأ 1992)؛ الموقع لم يستجب — نشاطه الحالي غير مؤكد.', 'https://exhibitor.beautyworldme.com/exhibitor-search-en/exhibitor-search.detail.html/lacot-general-trading-llc.html', { priority: 'C' }));
upd('PerfumeUAE', R('E', 'متجر عطور بالدرجة الأولى؛ خارج نطاق العناية بالبشرة والشعر.', GEN, { priority: 'D' }));
upd('Alshaya Group', R('D', 'مجموعة امتياز (Ulta Beauty UAE وغيرها) تحجب الفحص؛ التوريد يمر عبر العلامات التابعة.', 'https://www.alshaya.com/', { priority: 'D' }));
upd('Landmark Group', R('D', 'مجموعة تجزئة تحجب الفحص؛ لا مسار موردين منشور.', GEN, { priority: 'D' }));
upd('Al Tayer Group', R('D', 'مجموعة (Ounass، Wojooh، Areej…) موقعها عام بلا مسار موردين.', 'https://www.altayer.com/', { priority: 'D' }));
upd('Rivoli Group', R('D', 'مجموعة تجزئة/توزيع لم يستجب موقعها.', GEN, { priority: 'D' }));
upd('Jashanmal', R('D', 'شركة تجزئة/توزيع قديمة (ذُكرت كشريك Coty Distribution Emirates مع Chalhoub، مصدر ثانوي 2014)؛ صفحة «About Us» فقط ظهرت — لا مسار موردين.', 'https://jashanmal.ae/', { priority: 'D' }));
upd('Snapchat Business', R('D', 'منصة إعلانات؛ لا دليل على متجر تجزئة عبر Snapchat للإمارات.', 'https://forbusiness.snapchat.com/', { priority: 'D' }));
upd('Facebook Marketplace / Meta Business', R('D', 'قناة إعلانات/إعلانات مبوبة؛ الموقع لم يستجب.', GEN, { priority: 'D' }));
upd('Ubuy UAE', R('D', 'سوق عابر للحدود يحجب الفحص؛ ليس قناة بيع مباشرة للموردين.', GEN, { priority: 'D' }));
upd('Alibaba.com UAE', R('D', 'سوق B2B عالمي لم يستجب موقعه؛ ليس قناة إماراتية.', GEN, { priority: 'D' }));
upd('Starlink Drug Store', R('D', 'موزع أدوية/ديرما حسب دليل CPHI؛ الصفحة تحجب الفحص ولا موقع رسمي معروف.', 'https://www.cphi-online.com/company/starlink-drug-store-llc/', { priority: 'D' }));
upd('Skin Garden', R('D', 'يُذكر بدليل HiDubai متجراً لـ3 علامات كورية؛ النطاق المجرّب لم يستجب، والنتيجة الوحيدة المطابقة للاسم شركة يابانية (skingarden.jp). كيان إماراتي غير مؤكد.', S.ha, { priority: 'D' }));
upd('1004 Gourmet', R('D', 'سلسلة أغذية كورية تستضيف ركن Lamise Beauty؛ صفحات الجملة فيها لبيع الفنادق لا لتوريد العلامات.', 'https://1004gourmet.com/pages/wholesale-hotels', { priority: 'D' }));
upd('K-Beauty on Dubai', R('D', 'افتتاح متجر مذكور في Gulf News؛ الموقع لم يستجب.', 'https://gulfnews.com/business/corporate-news/dubai-welcomes-the-ultimate-k-beauty-experience-with-the-grand-opening-of-k-beauty-on-dubai-1.1696235183332', { priority: 'D' }));
upd('Dragon Mart online', R('D', 'سوق جملة/تجزئة عبر الإنترنت بحسب مصدر ثانوي (فئات منها الجمال والصحة، يوصل داخل الإمارات)؛ الموقع يعمل لكن لا صفحة تسجيل بائع ظاهرة.', 'https://salaamgateway.com/story/dubais-dragon-mart-goes-online-with-new-e-commerce-platform', { priority: 'D' }));
upd('Brands For Less', R('D', 'متجر تخفيضات يحجب الفحص؛ نموذجه شراء بالجملة من فائض المخزون وليس علامات جديدة.', GEN, { priority: 'D' }));
upd('Beauty Apotheca', R('D', 'بوتيك مرتبط بمنصة Go To Beauty (Emirates Woman)؛ الموقع المجرّب لم يستجب.', GEN, { priority: 'D' }));
upd('SellShip', R('D', 'سوق صغير للبائعين بحسب إعلان بيع شركة (Flippa) دون صفحة تسجيل رسمية؛ الموقع لم يستجب وقد تكون ملكيته تتغير.', 'https://flippa.com/11016820', { priority: 'D' }));
upd('Nativ', R('D', 'منصة علامات محلية «Made in UAE» (بيان صحفي 2025) — LOWE\'S علامة تركية قد لا تناسب شرط «محلي»؛ الموقع لم يستجب.', 'https://gulfnews.com/business/corporate-news/nativ-launches-uaes-first-curated-platform-for-homegrown-brands-1.500134804', { priority: 'D' }));
upd('Dubai Traders (DET programme)', R('E', 'برنامج حكومي (DET) تستضيفه Amazon وnoon لأصحاب رخص دبي — ليس قناة بيع مستقلة، لكنه ذو صلة بأهلية الرخصة عند التسجيل بهما.', 'https://investindubai.gov.ae/en/why-dubai/d33-agenda/dubai-traders', { priority: 'D' }));
upd('SJR Cosmetics', R('D', 'متجر K/J-beauty بدبي بحسب صفحة ثانوية؛ الموقع يحجب الفحص.', GEN, { priority: 'D' }));
upd('Figta Beauty Perfumes & Cosmetics Trading', R('B', 'موزع معتمد لعلامات K-beauty (Cosrx وSome By Mi وBeauty of Joseon…) بحسب ملف عارض Beautyworld (Messe Frankfurt) — القسم الثاني Al Mozna، القصيص 1 دبي، هاتف مدرج +971 4 832 2575. موقعه الرسمي غير معروف. كيان تجاري ملائم لتوزيع العناية لكن تخصصه كوري.', 'https://beautyworld-saudi-arabia.ae.messefrankfurt.com/ksa/en/exhibitor-search.detail.html/figta-beauty-perfumes--cosmetics-trading-co-llc.html', { classification: 'اتفاق توزيع محتمل', priority: 'C', contact: '+971 4 832 2575 (ملف عارض Beautyworld)' }));
upd('Cosmetica Beauty and Personal Care Trading', R('D', 'تصف نفسها موزعاً لمستلزمات صالونات (دبي، الشارقة، أبوظبي) لكن صفحتها الرئيسية قالب فارغ.', 'https://cosmetica1.odoo.com/about', { priority: 'D' }));
upd('Hair Factory Cosmetics (Abu Dhabi)', R('D', 'متجر شعر بأبوظبي بحسب دليل أعمال؛ الموقع المجرّب لم يستجب.', GEN, { priority: 'D' }));
upd('Beauty Pro Distributor', R('D', 'متجر Shopify يعرض «Store unavailable» (402) — غير مفعّل حالياً.', 'https://beautyprodistributor.com/', { priority: 'D' }));
upd('Dermazone Store', R('D', 'متجر عناية بالشعر والبشرة بالعربية، يبدو سعودياً؛ تغطيته للإمارات غير مؤكدة (يظهر بنطاق فرعي إماراتي بحسب مصدر ثانوي).', 'https://ipsnews.net/business/2025/11/04/elevating-trust-in-gcc-wellness-dermazonestore-sets-a-new-standard-for-verified-skincare-and-supplements/', { priority: 'D' }));
upd('YallaHub', R('D', 'منصة aggregator تجارة سريعة (شراكة مع علامة عناية، Arabian Business)؛ الموقع أعاد 521 (الخادم متوقف).', 'https://www.arabianbusiness.com/industries/retail/yallahub-to-accelerate-uae-quick-e-commerce-beauty-market-in-partnership-deal-with-rada-russkikh', { priority: 'D' }));
upd('Supersub', R('D', 'منصة بث تسوق؛ إعلان وظيفة يذكر استقطاب بائعين ضمن الجمال (موزعون ومتاجر ومبدعون). الموقع المجرّب لم يستجب.', 'https://supersub.teamtailor.com/jobs/7757440-senior-category-manager-beauty-english-arabic-preferred-uae', { priority: 'D' }));
upd('Nysaa (Nykaa x Apparel)', R('C', 'منصة تجميل متعددة العلامات (150+ علامة، شراكة Nykaa وApparel Group) تحجب الفحص؛ لا مسار موردين منشور.', 'https://www.personalcareinsights.com/news/nykaa-leverages-apparel-groups-middle-eastern-network-to-expand-beauty-offerings.html', { priority: 'C' }));
upd('Al Anaqa & Al Jamal Cosmetics (Sharjah)', R('D', 'مورد جملة/تجزئة مستحضرات بالشارقة بحسب دليل (Magicpin)؛ موقع غير معروف.', GEN, { priority: 'D' }));
upd('Eva Cosmetics Trading (Abu Dhabi)', R('D', 'متجر مستحضرات بأبوظبي بأسعار جملة/تجزئة بحسب دليل؛ موقع غير معروف.', GEN, { priority: 'D' }));
upd('Cosmovision GT', R('D', 'موزع جمال/طبي مدرج بدليل مورّدين؛ ملف الدليل غير موثّق والموقع لم يستجب.', GEN, { priority: 'D' }));
upd('Ulta Beauty UAE', R('C', 'افتتحت Ulta أول فروعها بالإمارات في Mall of the Emirates (يناير 2026) بشراكة Alshaya؛ الموقع يحجب الفحص. مسار الموردين عبر Alshaya غير منشور.', 'https://www.alshaya.com/jo/en/media-centre/alshaya-news/ulta-beauty-opens-at-mall-of-the-emirates---uae', { priority: 'D' }));
upd('Gomi Mall', R('B', 'GOMI MALL General Trading LLC (دبي وعجمان): موزع K-beauty يجمع الجملة B2B وB2C ويتعامل مع سلاسل صيدليات وتجار (VentureSquare، شارك في Beautyworld ME 2026 6-8 تشرين الأول). الموقع الرسمي غير معروف؛ المصدر مقالات فقط.', 'https://www.venturesquare.net/en/1115158/', { classification: 'اتفاق توزيع محتمل', priority: 'B', start_rank: 16, start_reason: 'موزع K-beauty بقناة جملة وصيدليات وعلامات حصرية؛ تخصص كوري قد لا يناسب خط LOWE\'S، لكنه نموذج توزيع جاهز. المصدر مقالات صحفية ويحتاج تواصلاً مباشراً.' }));
upd('Secret Skin', R('D', 'متجر عناية «نظيفة» بدبي (Beauty Independent)؛ الموقع المجرّب بشهادة SSL خاطئة.', 'https://www.beautyindependent.com/ex-amazon-anisha-oberoi-e-tailer-secret-skin-clean-beauty-middle-east/', { priority: 'D' }));
upd('Glambox', R('D', 'متجر/اشتراك صناديق تجميل (Gulf Business 2012-2014)؛ الموقع لم يستجب — نشاطه الحالي غير مؤكد.', 'https://gulfbusiness.com/?p=34019', { priority: 'D' }));
upd('Skin Solutions UAE (Ideal Beauty Solutions)', R('D', 'متجر K-beauty تحت Ideal Beauty Solutions LLC بحسب Product Hunt؛ النطاق المجرّب لم يستجب.', 'https://www.producthunt.com/products/skin-solutions-uae', { priority: 'D' }));
upd('Beauty Nation', R('D', 'منصة Chalhoub متعددة العلامات (مصدر 2022)؛ الموقع يطلب مصادقة (401) فلم يُفحص ولم يُتجاوز.', 'https://beautynation.me/', { priority: 'C' }));
upd('Privae', R('D', 'ورد كرابط بمقال؛ الموقع لم يستجب.', GEN, { priority: 'D' }));
upd('Nevi By Nature', R('D', 'الصفحة الرئيسية تحمّل بلا عنوان — لا دليل على نشاط.', 'https://nevibynature.com/', { priority: 'D' }));
upd('Brandkyu', R('D', 'موقع نشط بلا دليل على نشاط تجميل.', 'https://brandkyu.com/', { priority: 'D' }));
upd('Omni The Label', R('D', 'موقع نشط بلا دليل على نشاط تجميل.', 'https://omnithelabel.com/', { priority: 'D' }));
upd('Bloomha', R('D', 'متجر K-beauty صغير (قائمة مبيعات 2026 ذاتية)؛ الموقع يحجب الفحص.', GEN, { priority: 'D' }));
upd('Beauty Solutions', R('D', 'عنوان الصفحة «Beauty & More» يوحي بصالون خدمات لا متجر منتجات.', 'https://beautysolutions.ae/', { priority: 'D' }));

// ---- Top-20 start list reasons for entities outside the D list ----
upd('LOOKFANTASTIC UAE', { priority: 'B', start_rank: 5, start_reason: 'صفحة موردين رسمية على الموقع الإماراتي (بريد شراكات عام). متجر جمال أونلاين بتغطية إماراتية، لكن لا نموذج ولا شروط منشورة والعلامات المقبولة غير معروفة.' });
upd('Xpressions Style', { priority: 'B', start_rank: 6, start_reason: 'برنامج «Business Network» رسمي للتجزئة والجملة والتوزيع بطلب أولي مباشر. تخصصه العطور والتجميل؛ قبول العناية بالبشرة والشعر غير منصوص.' });
upd('Pharmalink (Medicina operator)', { priority: 'B', start_rank: 8, start_reason: 'موزع أدوية ومنتجات صحية بصفحة «Partner with us» رسمية ويشغّل سلسلة Medicina بحسب مصدر ثانوي — بوابة محتملة لقناة الصيدليات. فئة التجميل غير مؤكدة.' });
upd('Life Pharmacy', { priority: 'B', start_rank: 9, start_reason: 'أكبر شبكة صيدليات (400+ فرع) وشراكة ديرما مع Faces. لا صفحة موردين منشورة؛ التواصل عبر فريق المشتريات.' });
upd('Faces UAE', { priority: 'B', start_rank: 10, start_reason: 'متجر تجميل متعدد العلامات (Chalhoub) بقسم ديرما. لا مسار موردين منشور؛ القبول انتقائي.' });
upd('myAster', { priority: 'B', start_rank: 11, start_reason: 'صيدلية أونلاين بقسم عناية بالبشرة ضخم (آلاف المنتجات) وإضافة K-beauty. لا مسار موردين منشور.' });
upd('Watsons UAE', { priority: 'B', start_rank: 12, start_reason: 'سلسلة تجميل وصحة بقسم ديرما؛ التوريد عبر Al-Futtaim (مصدر ثانوي). لا مسار موردين منشور.' });
upd('Union Coop', { method: 'supplier_or_brand_application', evidence_level: 'official_page_fetched', supplier_url: 'https://corporate.unioncoop.ae/en/business-opportunities/suppliers-registrations/', priority: 'B', start_rank: 13,
  start_reason: 'الوحيدة بين الهايبرماركت التي نشرت نماذج تسجيل موردين رسمية (نموذج إداري ونموذج مشتريات + خطوات وشروط). فئة العناية الشخصية غير منصوصة؛ البريد المعروض يختلف عن رابط mailto فيُتحقق منه.',
  notes: 'نماذج رسمية (PDF) على corporate.unioncoop.ae، وهاتف 800 88 89. اتفاقية سوق Union Coop (PDF) لم تُقرأ (ملف مضغوط). الشروط والمستندات: غير مقروءة.', contact: '800 88 89 | info@unioncoop.ae (غير متطابق مع رابط mailto)' });
upd('Boots UAE', { priority: 'B', start_rank: 15, start_reason: 'صيدلية وجمال دولية. لا مسار موردين منشور.' });
upd('LSM Trading', { start_rank: 17, start_reason: 'موزع مفعّل بفئات صحة وجمال وعناية بالشعر، ونموذج تواصل مبيعات رسمي — لكنه موجّه للمشترين منهم، وقبولهم موردين جدد غير منصوص.' });
upd('Powder.ae', { priority: 'C', start_rank: 19, start_reason: 'متجر تجميل «نظيف» إماراتي متعدد العلامات (تمويل Pre-Series A 2024 بحسب مصدر ثانوي) ولا مسار تقديم منشور. يُتواصل لمعرفة قبول علامة جديدة.' });
upd('Multiplex International', { start_rank: 20, start_reason: 'موزع FMCG وتجميل بمتجر أونلاين وخط علامات؛ لا مسار موردين منشور، يلزم تواصل مباشر.' });

fs.writeFileSync(f, JSON.stringify(a, null, 1));
console.log('review annotations merged:', Object.keys(a.byName).length, 'byName,', Object.keys(a.exclude).length, 'exclude');
