// Builds UAE stores batch 2 (import-ready for b2b-leads, NOT imported) + full verification table + intel list.
// Facts come from: verified1.json / verified2.json (own-website checks) and cited public pages. Unknown = null. Nothing guessed.
const fs = require('fs');
const path = require('path');
const v1 = require('./verified1.json'); const v2 = require('./verified2.json');
const V = new Map([...v1, ...v2].map((x) => [x.name, x]));
const batch1 = JSON.parse(fs.readFileSync('C:/Users/LOQ/Desktop/lowes-uae-b2b/data/b2b/uae/uae_batch1_2026-10-08.json', 'utf8')).rows;
const DATE = '2026-10-08';
const HARPERS = 'https://www.harpersbazaararabia.com/beauty/skin-care/where-to-buy-korean-skincare-beauty-kbeauty-uae';
const NATIONAL = 'https://thenationalnews.com/lifestyle/fashion-beauty/2023/11/05/korean-beauty-products-uae';

// key = name used in verified*.json ; site = verified own-site entry (or null) ; extra = cited secondary URLs
const E = [
  { key: '800 Pharmacy', name: '800 Pharmacy', cat: 'صيدلية', lead_type: 'physical', channel: 'website', province: 'Dubai', extra: ['https://www.talabat.com/uae/pharmacy/696395/800-pharmacy-al-dhait/skincare/sun-care?aid=3926'], beauty: true,
    note: 'سلسلة صيدليات بتوصيل 24/7 (الموقع يذكر دبي وأبوظبي) ومعها قسم عناية بالبشرة على talabat. الرقم المنشور خط خدمة العملاء وليس قناة موردين.' },
  { key: "Bloomingdale's UAE", name: "Bloomingdale's UAE", cat: 'متجر أونلاين — عام', lead_type: 'online', channel: 'website', province: 'Nationwide', extra: [], beauty: true,
    note: 'متجر متعدد الأقسام (أزياء وجمال) أونلاين. قناة الدخول كبراند عناية غير منشورة بالصفحة الرئيسية.' },
  { key: 'Comptoir 102', name: 'Comptoir 102', cat: 'متجر/مورد مستحضرات', lead_type: 'physical', channel: 'website', province: 'Dubai', extra: ['https://buro247.me/?p=21671'], beauty: true,
    note: 'متجر مفاهيمي بدبي فيه ركن جمال طبيعي/عضوي (حسب خبر 2020 — يحتاج تأكيد أن الركن ما زال قائماً وبراندات الحالية).' },
  { key: 'K-Beauty Arabia', name: 'K-Beauty Arabia', cat: 'متجر أونلاين — تجميل', lead_type: 'online', channel: 'website', province: 'Dubai', extra: ['https://sortlist.co.uk/agency/k-beauty-arabia'], beauty: true,
    note: 'متجر عناية كورية أونلاين بدبي. على صفحته رابط «Wholesale Queries» (kbeauty-wholesale.com) — لم تُقرأ شروطه (الموقع رد 429). يحتاج تحقق: هل يقبل براندات غير كورية.' },
  { key: 'Lamise Beauty', name: 'Lamise Beauty', cat: 'متجر أونلاين — تجميل', lead_type: 'online', channel: 'website', province: 'Nationwide', extra: [NATIONAL], beauty: true,
    note: 'متجر K-beauty أونلاين مع محلين داخل 1004 Gourmet بأبوظبي ودبي (حسب The National 2023). يحتاج تحقق: قبول براندات غير كورية.' },
  { key: 'MissPalettable', name: 'MissPalettable', cat: 'متجر أونلاين — تجميل', lead_type: 'online', channel: 'website', province: 'Dubai', extra: ['https://yourstory.com/ys-gulf/dubai-bootstrapped-d2c-startup-miss-palettable-clean-conscious-beauty-brands'], beauty: true, sellers: null,
    note: 'منصة جمال «نظيف/واعٍ» مقرها دبي، تعرض صفحات براندات (vendors). يحتاج تحقق: آلية إدراج براند جديد.' },
  { key: 'Paris Gallery', name: 'Paris Gallery', cat: 'سلسلة تجميل/صيدليات', lead_type: 'online', channel: 'website', province: 'Nationwide', extra: [], beauty: true,
    note: 'تركيزه عطور وبرفانات «Niche» أكثر من العناية بالبشرة — ملاءمة منخفضة محتملة. البريد المنشور عام (info).' },
  { key: 'Union Coop', name: 'Union Coop', cat: 'متجر أونلاين — عام', lead_type: 'online', channel: 'website', province: 'Nationwide', extra: [], beauty: null,
    note: 'جمعية تعاونية/سوبرماركت (دبي وأبوظبي) وعلى موقعها «Supplier Portal» (supplierportal.unioncoop.ae) — بوابة موردين رسمية لم تُقرأ شروطها. وجود قسم عناية بالبشرة غير مثبت.' },
  { key: 'Xpressions', name: 'Xpressions Style', cat: 'متجر أونلاين — تجميل', lead_type: 'online', channel: 'website', province: 'Nationwide', extra: ['https://xpressions.ae/blogs/news/your-ultimate-guide-to-the-top-30-cosmetic-shops-in-dubai-2025-edition'], beauty: true, sellers: true,
    note: 'متجر عطور ومكياج وعناية. على موقعه صفحة «Sell on Xpressions» (xpressions.ae/pages/welcome-to-the-xpressions-style-partner-program) — شروطها لم تُقرأ (429). الفروع بالشارقة من دليل غير موثّق.' },
  { key: 'JamaliBox', name: 'JamaliBox', cat: 'متجر أونلاين — تجميل', lead_type: 'online', channel: 'website', province: 'Dubai', extra: ['https://www.cbinsights.com/compare/birchbox-vs-jamalibox'], beauty: true,
    note: 'صندوق اشتراك جمال شهري بدبي (تأسس 2023 حسب CB Insights). قناة عيّنات/اكتشاف مناسبة لبراند جديد. يحتاج تحقق: شروط الشراكة مع البراندات.' },
  { key: 'Fakhree Al Hindi Group', name: 'Fakhree Al Hindi Group', cat: 'موزّع', lead_type: 'physical', channel: 'website', province: 'Dubai', extra: ['https://signemagazine.com/femme/maruderm-turkeys-leading-clean-beauty-brand-launches-in-the-uae-with-watsons'], beauty: true,
    note: 'سابقة قريبة: براند العناية التركي Maruderm دخل الإمارات (أيلول 2025) حصرياً عبر هذه المجموعة وصار بـ17 متجر Watsons (مقال ترويجي — يحتاج تأكيد من مصدر مستقل). موقع المجموعة يعرض نشاط جملة؛ نطاق توزيع العناية غير موثّق.' },
  { key: 'Najafi Cosmetics', name: 'Najafi (Najafi International / Najafi Cosmetics)', cat: 'موزّع', lead_type: 'physical', channel: 'website', province: 'Dubai', extra: ['https://oncosmetics.com/company/najafi-international', 'https://exhibitor.beautyworldksa.com/exhibitor-search-en/exhibitor-search.detail.html/najafi-cosmetics-co-llc.html'], beauty: true,
    note: 'موزّع/تجزئة مستحضرات عناية: ستة متاجر جملة بدبي حسب ملف العارض (Beautyworld KSA). موقع Najafi Companies وصل لكنه لا يذكر الإمارات بنصه — الربط بالدليل يحتاج تأكيد.' },
  { key: 'Thumbay Pharmacy', name: 'Thumbay Pharmacy', cat: 'صيدلية', lead_type: 'physical', channel: null, province: 'Nationwide', extra: ['https://gmu.ac.ae/health-care/thumbay-pharmcay/'], beauty: null, noSite: true,
    note: 'سلسلة صيدليات بفروع بدبي وعجمان والفجيرة والشارقة ورأس الخيمة وأم القيوين (صفحة جامعة الخليج الطبية). الموقع الرسمي لم يُتحقق منه (فشل الجلب). قسم العناية غير مثبت.' },
  { key: 'Medicina Pharmacy', name: 'Medicina Pharmacy', cat: 'صيدلية', lead_type: 'physical', channel: null, province: 'Sharjah', extra: ['https://www.bayut.com/mybayut/online-pharmacies-sharjah/'], beauty: null, noSite: true,
    note: 'صيدلية بالشارقة (تأسست 1996 حسب نتائج البحث) مع تسوق أونلاين. الموقع الرسمي لم يُتحقق منه. قسم العناية غير مثبت.' },
  { key: 'Kaya Skin Clinic', name: 'Kaya Skin Clinic', cat: 'عيادة جلدية', lead_type: 'physical', channel: null, province: 'Nationwide', extra: ['https://dhr.gov.ae/en/waffer/participantsdetails/health/kaya-skin-care-clinic1'], beauty: true, noSite: true,
    note: 'سلسلة عيادات جلدية/تجميل (صفحة سجل حكومي دبي). تذكر برنامج عناية شخصي ومنتجات بتركيبات خاصة — البيع بالتجزئة غير مثبت. الموقع الرسمي رد 405.' },
  { key: 'Chicsta', name: 'Chicsta', cat: 'متجر أونلاين — تجميل', lead_type: 'online', channel: 'website', province: 'Nationwide', extra: [HARPERS], beauty: true, noSite: true,
    note: 'متجر K-beauty أونلاين (Harper\'s Bazaar Arabia، 2020). الموقع لم يتطابق عند الفحص — قد يكون تغيّر أو توقف. يحتاج تحقق من أنه ما زال يعمل.' },
  { key: 'Shofon', name: 'Shofon', cat: 'متجر أونلاين — تجميل', lead_type: 'online', channel: 'website', province: 'Nationwide', extra: [HARPERS, 'https://www.shofon.com/'], beauty: true, noSite: true,
    note: '«K-beauty hub» أونلاين (Harper\'s Bazaar Arabia، 2020). الموقع لم يتطابق عند الفحص. يحتاج تحقق من أنه ما زال يعمل.' },
  { key: 'Nessa Beauty', name: 'Nessa Beauty', cat: 'متجر أونلاين — تجميل', lead_type: 'online', channel: 'website', province: 'Nationwide', extra: [NATIONAL], beauty: true,
    note: 'متجر جمال أونلاين تأسس 2020 (The National)، فيه قسم كوري (112 منتجاً وقت المقال) وتوصيل مجاني فوق 99 درهم. الموقع وصل لكن بلا ذكر للإمارات بنصه — يحتاج تأكيد.' },
  { key: 'Powder', name: 'Powder', cat: 'متجر أونلاين — تجميل', lead_type: 'online', channel: 'website', province: 'Nationwide', extra: [HARPERS, 'https://gulfbusiness.com/en/2020/saudi-arabia/uae-based-clean-beauty-retailer-powder-launches-in-saudi-arabia'], beauty: true, noSite: true,
    note: 'بائع تجزئة جمال «نظيف» أونلاين تأسس 2018 (Gulf Business 2020). الموقع فشل جلبه — قد يكون متوقفاً. يحتاج تحقق.' },
  { key: 'Aspire Beauty Co', name: 'Aspire Beauty Co', cat: 'متجر أونلاين — تجميل', lead_type: 'online', channel: 'website', province: 'Nationwide', extra: ['https://aeworld.com/?p=89987'], beauty: true, noSite: true,
    note: 'متجر جمال «نظيف» فقط، مزيج براندات (نباتي/عضوي/راقٍ/اقتصادي). الموقع محمي (Cloudflare) فلم يُتحقق. يحتاج تحقق.' },
];

const intel = [
  { name: 'Maruderm (Turkish skincare) via Fakhree Al Hindi → Watsons', kind: 'precedent', fact: 'UAE debut Sept 2025, exclusively through Fakhree Al Hindi Group; 17 Watsons stores (brand-promotional article).', url: 'https://signemagazine.com/femme/maruderm-turkeys-leading-clean-beauty-brand-launches-in-the-uae-with-watsons' },
  { name: 'Beautyworld Dubai 2026', kind: 'route', fact: '6–8 Oct 2026, Dubai World Trade Centre; trade visitors 18+ only; online registration closed (day 3 of 3 today). 2026 exhibitor list is public on the fair site — mine it for distributors.', url: 'https://beautyworld-middle-east.ae.messefrankfurt.com/dubai/en.html' },
  { name: 'Chalhoub Greenhouse × Instagram Beauty Lab', kind: 'route', fact: 'Programme supporting early-stage beauty/skincare startups in the region (2023 second edition; current status unknown).', url: 'https://www.chalhoubgroup.com/en/media/59/female-entrepreneurs-to-be-offered-full-support-to-grow-their-beauty-startups-in-the-region' },
  { name: 'Al-Futtaim Procurement (Suppliers page)', kind: 'supplier-entry', fact: 'Official corporate "Our Suppliers" procurement page (group-wide, not beauty-specific).', url: 'https://www.alfuttaim.com/en/suppliers/' },
  { name: 'Majid Al Futtaim "Partner with us"', kind: 'supplier-entry', fact: 'Official "Become a Partner — contact us" page (group-wide, franchise-oriented examples).', url: 'https://www.majidalfuttaim.com/en/what-we-do/partner-with-us' },
  { name: 'talabat "Become a partner"', kind: 'supplier-entry', fact: 'Partner portal link on talabat UAE homepage; terms not read (JS app).', url: 'https://ae.partner.talabat.com/s/?language=en_US' },
  { name: 'Union Coop Supplier Portal', kind: 'supplier-entry', fact: 'Supplier portal link on unioncoop.ae; login portal.', url: 'https://supplierportal.unioncoop.ae/' },
  { name: 'Xpressions "Sell on Xpressions"', kind: 'supplier-entry', fact: 'Partner-program page linked from the site (429, terms not read).', url: 'https://xpressions.ae/pages/welcome-to-the-xpressions-style-partner-program' },
  { name: 'K-Beauty Arabia wholesale', kind: 'supplier-entry', fact: '"Wholesale Queries" link on the site (429, terms not read).', url: 'https://kbeauty-wholesale.com/' },
  { name: 'Single-brand chains (not retailer targets)', kind: 'excluded', fact: 'The Body Shop UAE, L\'Occitane UAE, Bath & Body Works UAE, Lush UAE, Eqqualberry UAE (official Korean-brand store): own-brand shops — not channels for a third-party brand.', url: null },
  { name: 'Domains excluded after verification', kind: 'excluded', fact: 'nokbeauty.com now serves a gambling-spam page; ixora.ae is a parked domain; theskinstory.com is an unrelated non-UAE site; haul-in-one.com is a freight quote portal. None used.', url: null },
  { name: 'Names with no source gathered yet (not researched)', kind: 'gap', fact: 'Ounass, Sivvi, Lulu Hypermarket, Spinneys, Alshaya Group, Landmark Group, Rituals, Boots UAE site, Al Manara site, BinSina site (blocked/failed fetch).', url: null },
];

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
const b1keys = new Set(batch1.map((r) => norm(r.name)));
const rows = []; const table = [];
for (const e of E) {
  const s = V.get(e.key);
  const ok = !e.noSite && s && s.http_status >= 200 && s.http_status < 400 && s.brandMatch;
  const site = ok ? (s.final_url || s.tried).replace(/\/$/, '') : null;
  const contacts = ok ? { email: s.emails?.[0] || null, phone: s.tels?.[0] || null } : { email: null, phone: null };
  const seller = ok && s.seller_or_supplier_links ? s.seller_or_supplier_links.filter((l) => /(sell on|partner|supplier|wholesale)/i.test(l.text)).map((l) => `${l.text} → ${l.href}`) : [];
  const urls = [...new Set([...(ok ? [site] : []), ...e.extra])];
  const hasRoute = seller.length > 0 || e.key === 'Xpressions' || e.key === 'Union Coop' || e.key === 'K-Beauty Arabia';
  const priority = ok ? 'C' : 'D';
  const score = ok ? (hasRoute ? 45 : contacts.email || contacts.phone ? 38 : 30) : 15;
  const reason = `${e.note}${seller.length ? ` مسارات منشورة بالموقع: ${seller.join(' ؛ ')}.` : ''}${contacts.email || contacts.phone ? ` جهات تواصل منشورة بالموقع (عامة/خدمة عملاء وليست قناة موردين): ${[contacts.email, contacts.phone].filter(Boolean).join(' · ')}.` : ''} تواجد Lowe's: غير متحقق. موقع الجهة: ${ok ? 'تحقّق منه بالفحص المباشر (يعمل، ويطابق الاسم والإمارات).' : 'لم يُتحقق منه (محمي/فشل الجلب/لم يتطابق) — لا يُعتمد قبل التحقق.'}`;
  const row = {
    name: e.name, province: e.province, lead_type: e.lead_type, channel: e.channel, category: e.cat, website: site, email: contacts.email, phone: contacts.phone,
    accepts_sellers: e.sellers ?? null, sells_beauty: e.beauty ?? null, source_urls: urls.join(' | '), priority, score, verified: ok ? 'verified_single_source' : 'discovered_unconfirmed', last_verified_at: DATE,
    lowes_presence: 'unverified', reason, discovery_source: `research:${DATE}:batch2`,
  };
  Object.keys(row).forEach((k) => { if (row[k] === null || row[k] === undefined || row[k] === '') delete row[k]; });
  rows.push(row);
  table.push({ name: e.name, emirate: e.province, type: e.cat, website: site || null, website_check: ok ? 'verified (own site: 200 + name + UAE)' : e.noSite ? 'not verified (blocked / failed / mismatch)' : 'not verified', seller_or_supplier_route: seller, published_contact: [contacts.email, contacts.phone].filter(Boolean), sources: urls, verified_at: DATE, lowes_presence: 'غير متحقق', overlap_with_batch1: b1keys.has(norm(e.name)) });
}
const dupWithB1 = rows.filter((r) => b1keys.has(norm(r.name)));
const out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'uae_stores_batch2_2026-10-08.json'), JSON.stringify({ _about: 'D-119 — UAE B2B research batch 2 (8 Oct 2026). Import-ready for b2b-leads (country=AE). NOT IMPORTED. Only new entities vs batch 1. Own-website verification: priority C; unverified/secondary-only: priority D. lowes_presence = unverified for all. Single-brand chains and excluded domains are in the report, not here.', country: 'AE', rows }, null, 1));
fs.writeFileSync(path.join(out, 'uae_stores_verification_table.json'), JSON.stringify({ entities: table, intel }, null, 1));
console.log('batch2 rows:', rows.length, '| own-site verified:', rows.filter((r) => r.priority === 'C').length, '| unverified (D):', rows.filter((r) => r.priority === 'D').length, '| overlap with batch1:', dupWithB1.map((r) => r.name));
