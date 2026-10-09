// One-off (phase 3, part 2): annotations for batches 9-10 (marketplaces / wholesalers found by seller-guide articles) + final Top-20 ordering.
const fs = require('fs');
const f = __dirname + '/platform_annotations_2026-10-09.json';
const a = JSON.parse(fs.readFileSync(f, 'utf8'));
const R = (tier, reason, source, extra = {}) => ({ tier, review_reason: reason, review_source: source, ...extra });
const upd = (name, obj) => { a.byName[name] = { ...(a.byName[name] || {}), ...obj }; };
const exclude = (name, kind, reason, dup) => { a.exclude[name] = { kind, reason, ...(dup ? { duplicate_of: dup } : {}) }; };

// Mumzworld: the annotation must live under the canonical row name
a.byName['Mumzworld'] = { ...(a.byName['Mumzworld Seller Registration'] || {}), ...(a.byName['Mumzworld'] || {}) };

upd('Trendyol (Gulf marketplace)', R('D', 'سوق تركي المنشأ يعمل بالخليج (Gulf Business 2025) — مناسب جداً لعلامة تركية، لكن موقعه وبوابة البائع (partner.trendyol.com) يحجبان الفحص الآلي (403/Cloudflare). مصدر ثانوي (Fynd) يقول إن التسجيل يتم بحساب مستخدم ثم اختيار منطقة «Gulf» ومراجعة 3-7 أيام — غير موثّق رسمياً، وشروط الإمارات ومستندات فئة التجميل غير معروفة.', 'https://gulfbusiness.com/en/2025/tech/how-trendyol-is-redefining-ecommerce-in-the-gulf/', { classification: 'تسجيل مباشر محتمل — غير موثّق رسمياً', priority: 'A', sale_method_hint: 'direct', start_rank: 3, start_reason: 'علامة LOWE\'S تركية، والمنصة تركية المنشأ وتعمل بالخليج (مصدر ثانوي) — احتمال ملاءمة عالٍ. لم أستطع قراءة صفحة التسجيل الرسمية (حجب آلي): افتح partner.trendyol.com يدوياً وتحقق من منطقة الإمارات والمستندات وفئة التجميل.' }));
a.exclude['Trendyol Seller Portal'] = { kind: 'duplicate', reason: 'بوابة البائع لمنصة Trendyol — تُسجَّل ضمن سجل Trendyol', duplicate_of: 'Trendyol (Gulf marketplace)' };
upd('DeliverIt Marketplace', R('D', 'عنوان موقعه «Best Pick and Delivery Service in Dubai» أي خدمة التقاط وتوصيل؛ وصفه كسوق بائعين ورد في مدونتهم الخاصة فقط. لا صفحة تسجيل بائع ظاهرة.', 'https://deliverit.ae/', { priority: 'D' }));
upd('Groupon UAE', R('D', 'سوق عروض يحجب الفحص (Cloudflare)؛ نموذج الخصومات قد لا يناسب علامة.', 'https://www.groupon.ae/', { priority: 'D' }));
upd('Crafty UAE', R('E', 'سوق مصنوعات يدوية وهدايا محلية (صفحة onboarding موجودة لكن للحرفيين) — لا يناسب علامة عناية صناعية.', 'https://www.crafty.ae/onboarding', { priority: 'D' }));
upd('FirstCry UAE', R('E', 'منصة أطفال وأمومة؛ لا تناسب خط العناية العام.', GEN_NONE()));
function GEN_NONE() { return 'https://uae.firstcry.com/'; }
upd('Basharacare', R('D', 'متجر عناية ببشرة بدبي ذُكر بمقال قديم (2011-2013)؛ الصفحة الرئيسية تحمّل بلا عنوان — نشاطه الحالي غير مؤكد (موجود أيضاً بدفعة ليدز 1).', 'https://www.thenationalnews.com/business/brushing-up-on-skincare-1.341865', { priority: 'D' }));
upd('Mestore (Al Jamal Enterprises) — Wholesale', R('B', 'صفحة جملة رسمية: «Beauty Essentials — number 1 wholesaler in the Middle East» لمستحضرات العناية بالبشرة والجسم، ولها فروع (دبي والشارقة-المويلح). الصفحة لمن يشتري منهم؛ قبول موردين جدد غير منصوص.', 'https://www.mestore.ae/pages/wholesale', { classification: 'اتفاق توزيع محتمل', priority: 'C' }));
exclude('Nazih.ae (online store)', 'duplicate', 'نفس مجموعة Nazih (متجر nazih.ae الأونلاين يحجب الفحص 403)', 'Nazih');
upd('Glamour Faces Perfumes & Cosmetics Trading', R('B', 'موزع جملة بدبي يعلن «cosmetics, skincare, haircare and perfumes from 100+ authentic brands» لأنشطة تجارية. موجه للمشترين؛ قبول موردين جدد غير منصوص.', 'https://www.theglamourfaces.com/', { classification: 'اتفاق توزيع محتمل', priority: 'C' }));
upd('CarasaLab', R('D', 'يعرض جملة مستحضرات «للإمارات ودبي» لكن مواد الصفحات عن موردين من ألمانيا وآسيا وأوقيانوسيا — يبدو مورّداً دولياً لا كياناً إماراتياً؛ الكيان القانوني بالإمارات غير مؤكد.', 'https://carasalab.com/en/uae-dubai-cosmetics-wholesale/', { priority: 'D' }));
upd('Cobone', R('D', 'سوق عروض يحجب الفحص؛ مصدر ثانوي يذكر تسجيلاً مجانياً وعمولة إحالة 15% (غير معتمد).', 'https://www.cobone.com/', { priority: 'D' }));
upd('OurShoppee', R('D', 'منصة تذكرها قوائم ثانوية؛ موقعها لم يستجب.', 'https://www.ourshoppee.com/', { priority: 'D' }));
upd('M7L', R('D', 'منصة بائعين باشتراك شهري بحسب ترويجها؛ موقعها لم يستجب.', 'https://www.adsmehub.ae/en/explore/post-details/m7l-interview', { priority: 'D' }));

// ---- final Top-20 order ----
const order = ['Amazon UAE', 'noon UAE', 'Trendyol (Gulf marketplace)', 'Begad', 'K Beauty Souq', 'LOOKFANTASTIC UAE', 'Xpressions Style', 'Madi International', 'Pharmalink (Medicina operator)', 'Union Coop', 'Life Pharmacy', 'Faces UAE', 'myAster', 'Watsons UAE', 'Sephora UAE', 'Boots UAE', 'Gomi Mall', 'LSM Trading', 'Tradeling', 'Powder.ae'];
for (const n of Object.keys(a.byName)) if (a.byName[n].start_rank) a.byName[n].start_rank = 0;
order.forEach((n, i) => { a.byName[n] = { ...(a.byName[n] || {}), start_rank: i + 1 }; });
fs.writeFileSync(f, JSON.stringify(a, null, 1));
console.log('ok; ranked:', order.filter((n) => a.byName[n].start_rank).length);
