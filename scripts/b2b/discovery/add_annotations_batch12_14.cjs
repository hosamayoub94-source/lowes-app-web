// One-off (phase "sales opportunities", 9 Oct 2026): annotations for batches 12-14 + name-only list update.
const fs = require('fs');
const path = require('path');
const f = __dirname + '/platform_annotations_2026-10-09.json';
const a = JSON.parse(fs.readFileSync(f, 'utf8'));
const R = (tier, reason, source, extra = {}) => ({ tier, review_reason: reason, review_source: source, ...extra });
const upd = (name, obj) => { a.byName[name] = { ...(a.byName[name] || {}), ...obj }; };
const exclude = (name, kind, reason, dup) => { a.exclude[name] = { kind, reason, ...(dup ? { duplicate_of: dup } : {}) }; };

// batch 12
upd('Beauty On Wheels', R('C', 'متجر جمال أونلاين (عناية بشرة وجسم وشعر ومكياج) بتوصيل دبي وأبوظبي والعين والشارقة بحسب نتيجة البحث؛ الموقع يعمل. لا صفحة موردين.', 'https://beautyonwheels.ae/', { priority: 'C' }));
upd('BMG Pharmacy', R('C', 'صيدلية أونلاين (Bait Al Maqdes، الخان — الشارقة) تبيع العناية بالبشرة والشعر؛ لا صفحة موردين.', 'https://bmgpharmacy.com/', { priority: 'C', emirate: 'الشارقة' }));
upd('Oriana Pharmacy', R('C', 'صيدلية أونلاين بالشارقة تبيع علامات ديرما (ISDIN، Eucerin…) وتوصل للإمارات الشمالية؛ لا صفحة موردين.', 'https://orianaonline.com/', { priority: 'C', emirate: 'الشارقة' }));
upd('Vivandi Distribution', R('B', 'موزع «لعلامات دولية متميزة بالإمارات والخليج» مع خدمة «Brand Management» وشركاء بيع (Amazon، noon). زر «Become A Partner» يشير لنطاق خارجي (قالب) — لا مسار رسمي صالح؛ التواصل العام منشور.', 'https://vivandidistribution.com/', { classification: 'اتفاق توزيع محتمل', priority: 'B', contact: 'info@vivandidistribution.com | +971 4 335 3839' }));
upd('Mirae Beauty Hub', R('C', 'متجر K-beauty وعناية شعر يابانية بالإمارات — تخصص آسيوي؛ لا صفحة موردين.', 'https://miraebeautyhub.com/', { priority: 'D' }));
upd('K-Beauty Bliss UAE', R('C', 'متجر K-beauty أونلاين بالإمارات؛ تخصص كوري؛ لا صفحة موردين.', 'https://kbeautybliss.com/', { priority: 'D' }));
upd('K-City', R('C', 'متجر K-beauty بدبي وموزع رسمي لعلامة USOLAB بحسب موقعه — تخصص كوري.', 'https://k-city.com/', { priority: 'D' }));
upd('LETOILE UAE', R('C', 'متجر جمال أونلاين بالإمارات (توصيل باليوم التالي بحسب موقعه)؛ لا صفحة موردين.', 'https://letoile.ae/', { priority: 'C' }));
upd('MAKEUP.ae', R('C', 'متجر مستحضرات وعطور أونلاين بالإمارات؛ لا صفحة موردين.', 'https://makeup.ae/en/', { priority: 'C' }));
upd('Beauty Solutions ME', R('D', 'الموقع يحمّل بعنوان «Beauty Solutions» بلا وصف؛ نتيجة البحث تصفه متجر مكياج وعناية — نشاطه غير مؤكد.', 'https://www.beautysolutions-me.com/', { priority: 'D' }));
upd('Turkish Souq', R('D', 'متجر منتجات تركية بقسم تجميل، لكن لا مؤشر إماراتي بالصفحة ونتيجة البحث تذكر شراكة مع بريد قطر — السوق المستهدف غير مؤكد.', 'https://turkishsouq.com/collections/cosmetics-selfcare', { priority: 'D' }));
upd('Centrepoint (Landmark) — Beauty', R('D', 'متجر Landmark بقسم K-beauty والعناية؛ الموقع يحجب الفحص؛ مسار الموردين عبر المجموعة غير منشور.', 'https://www.centrepointstores.com/ae/en/c/beautyandpersonalcare-kbeauty', { priority: 'D' }));
upd('Nesto Group', R('D', 'سلسلة هايبرماركت مقرها الشارقة؛ الموقع لم يستجب؛ لا مسار موردين منشور.', 'https://en.wikipedia.org/wiki/Nesto_Group', { priority: 'D' }));
// batch 13
upd('EBEAUTYTRADE', R('D', 'منصة B2B متعددة البائعين للتجميل المهني والجملة بالشرق الأوسط بحسب صفحتها المفهرسة (قديمة ~3 سنوات)؛ الموقع لم يستجب — نشاطها الحالي ومسار البائعين غير مؤكدين. مهمة للمراجعة اليدوية.', 'https://www.ebeautytrade.com/', { priority: 'B', classification: 'غير مؤكدة (منصة B2B محتملة)' }));
upd('Dubai Beauty Wholesale', R('B', 'جملة مستحضرات كورية ويابانية ودولية — موجّه للمشترين.', 'https://dubaibeautywholesale.com/', { classification: 'اتفاق توزيع محتمل', priority: 'D' }));
upd('THAT Concept Store', R('D', 'متجر مفاهيمي بقسم عناية بالشعر (Dubai) بحسب نتيجة البحث؛ الموقع لم يستجب.', 'https://www.thatconceptstore.com/en-ae/c/women/women-beauty/women-beauty-hair-care', { priority: 'D' }));
exclude('Glambox (glambox.me)', 'duplicate', 'نفس Glambox (النطاق .me لم يستجب أيضاً)', 'Glambox');
upd('Jaleel Cash and Carry', R('E', 'تاجر جملة FMCG بتركيز غذائي («Wholesale Food Suppliers»)؛ روابط «register distributor/be partner» أعادت 404.', 'https://www.jaleelcashandcarry.com/', { priority: 'D' }));
upd('Al Maya Distribution', R('E', 'موزع أغذية («Food Distribution Companies in UAE») — خارج فئة العناية.', 'https://www.almayadistribution.ae/', { priority: 'D' }));
upd('SAFCO International', R('D', 'موزع FMCG (مقال ثانوي)؛ الموقع أعاد توجيهاً (307) دون محتوى.', 'https://www.safcointl.com/', { priority: 'D' }));
upd('Fakhruddin Trading', R('B', 'موزع عام (عناية شخصية ومنزلية بحسب مقال ثانوي)؛ صفحة «Become our distributor» موجهة لمن يريد توزيع منتجاتهم لا للموردين.', 'https://www.fakhruddintrading.com/become-our-distributor/', { classification: 'اتفاق توزيع محتمل', priority: 'D' }));
upd('Hamna General Trading', R('B', 'موزع جملة عام بالإمارات بحسب موقعه؛ فئة العناية غير مؤكدة.', 'https://hgt.ae/', { classification: 'اتفاق توزيع محتمل', priority: 'D' }));
upd('Modern General Trading (MGT)', R('D', 'موزع (مقال ثانوي)؛ الموقع لم يستجب.', 'https://www.mgtuae.com/', { priority: 'D' }));
exclude('Deira Wholesale', 'wrong_entity', 'deirawholesale.com يعرض موقع بث أفلام (نطاق مُختطَف) — الموقع الرسمي غير معروف');
// batch 14
upd('Bupa Pharmacy Abu Dhabi', R('C', 'صيدلية أونلاين بأبوظبي بأقسام جمال وعناية بالبشرة (علامات ديرما)؛ لا صفحة موردين.', 'https://bupapharmacy.ae/', { priority: 'C', emirate: 'أبوظبي' }));
upd('Med7 Online', R('C', 'متجر صيدليات Med7 الأونلاين (Bioderma، Cetaphil، ISDIN…) بتوصيل دبي والشارقة وأبوظبي؛ السلسلة موجودة بدفعة talabat 3. لا صفحة موردين.', 'https://www.med7online.com/', { priority: 'C' }));
upd('Gorgeous Shop', R('D', 'متجر متعدد العلامات للعناية الطبيعية بحسب نتيجة البحث؛ الموقع يحجب الفحص (403).', 'https://www.gorgeousshop.ae/', { priority: 'C' }));
upd('i-health.ae', R('C', 'متجر صحة يبيع مكملات وعناية بالبشرة والشعر (دبي وأبوظبي)؛ لا صفحة موردين.', 'https://www.i-health.ae/', { priority: 'D' }));
upd('Shift Eco', R('E', 'الموقع يقدّم حلول استدامة للشركات (عنوانه «Sustainable Solutions & Products for UAE Businesses») — ليس متجر تجميل متعدد العلامات.', 'https://shifteco.ae/', { priority: 'D' }));
upd('BNB Store (bodynbodystore)', R('E', 'متجر علامة واحدة (منتجات BNB الخاصة) — لا يُدرج علامات أخرى.', 'https://bodynbodystore.com/', { priority: 'D' }));

fs.writeFileSync(f, JSON.stringify(a, null, 1));

// name-only list: entities that now have an audited site leave the list; new name-only finds are added
const nf = path.join(__dirname, '../../../data/b2b/uae/platforms_2026-10-09/discovered_name_only_2026-10-09.json');
const no = JSON.parse(fs.readFileSync(nf, 'utf8'));
const promoted = ['Fakhruddin Trading', 'Al Maya Distribution', 'Jaleel Cash and Carry'];
no.entities = no.entities.filter((e) => !promoted.includes(e.name));
const dw = no.entities.find((e) => e.name === 'Deira Wholesale'); if (dw) dw.note = 'النطاق deirawholesale.com يعرض محتوى غير مرتبط — الموقع الرسمي غير معروف';
no.entities.push(
  { name: 'Ruby Cosmetics & Cleaning Industry LLC', type: 'Cosmetics manufacturer/trader (Sharjah)', source: 'WebSearch 9/10/2026 (UAE cosmetics distributors query)', added: '2026-10-09 phase 4' },
  { name: 'Lebanon Beauty Equipment Trading', type: 'Salon equipment/supplies (Ajman)', source: 'https://www.yellowpages-uae.com/uae/beauty-salons-equipment', added: '2026-10-09 phase 4' },
  { name: 'The Grooming Lab', type: "Men's grooming distributor (Dubai) — 50+ barbershops", source: 'https://gulfbusiness.com/the-sme-story-zein-arbeed-founder-of-the-grooming-lab/', added: '2026-10-09 phase 4' },
  { name: 'Monster Middle East', type: 'Exclusive GCC distributor (MANSCAPED) — Dubai', source: 'https://gulfnews.com/business/corporate-news/manscaped-partners-with-monster-middle-east-to-launch-retail-in-the-gcc-1.500389616', added: '2026-10-09 phase 4' },
);
no._promoted_to_audited = promoted;
fs.writeFileSync(nf, JSON.stringify(no, null, 1));
console.log('annotations', Object.keys(a.byName).length, '| exclude', Object.keys(a.exclude).length, '| name-only', no.entities.length);
