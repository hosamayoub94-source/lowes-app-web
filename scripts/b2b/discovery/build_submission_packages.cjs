// Builds separate submission packages (noon, Amazon.ae) for Vitamin C and HELD packages for Dark Spot / Collagen.
// Content only; nothing is uploaded. Values come from the verified Vitamin C record (Box.docx-checked) and pack_data.
// usage: node build_submission_packages.cjs <kitDir>
const fs = require('fs'); const path = require('path');
const dir = process.argv[2]; const J = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const vc = J('listings/first_two_listings_DRAFT.json').products[0]; const pack = J('listings/pack_data_2026-10-10.json');
const imgLines = fs.readFileSync(path.join(dir, 'listings/original_image_inventory_2026-10-10.csv'), 'utf8').split(/\r?\n/).slice(1).filter(Boolean);
const imgs = (sku) => imgLines.map((l) => l.match(/^"([^"]*)","([^"]*)","(\d+)","(\d+)","(\d+)","(.*)"$/)).filter((m) => m && m[1] === sku && m[6].indexOf('تصميم قديم') < 0).map((m) => ({ kind: m[2], width: +m[3], height: +m[4], path: m[6] }));
const out = path.join(dir, 'submission_packages'); fs.mkdirSync(out, { recursive: true });
const V = (x) => x.value;
const base = {
  brand: "LOWE'S profesyonel", size: '30 ml (1.00 fl.oz)', country_of_origin: 'Türkiye', ean13: '8684272100419',
  ean_status: 'مطبوع بتصميم العلبة (Box.docx) ورقم التحقق صحيح؛ ترخيص GS1 غير مؤكد',
  ingredients_inci: V(vc.inci_from_box), directions: V(vc.how_to_use_from_box), warnings: V(vc.warnings_from_box),
  claims_from_box: V(vc.purpose_claims_from_box), front_actives: 'Ascorbic Acid 20% · Ferulic Acid 2% · Vitamin B5',
  batch_on_artwork: 'LWC 004', expiry_on_artwork: '30.06.2028', label_company_on_box: 'L B İÇ VE DIŞ TİCARET KOZMETİK A.Ş.',
  price_aed: null, registration_number: null, registration_proof: null, weight_kg: null, dimensions_cm: null,
};
const images = imgs('LW-SR-101');
const PL = {
  noon: { platform: 'noon', title_en: "LOWE'S Profesyonel Vitamin C Serum 30 ml – Ascorbic Acid 20%, Ferulic Acid 2%, Vitamin B5", title_ar: "LOWE'S Profesyonel سيروم فيتامين سي 30 مل – يفتّح ويوحّد لون البشرة", category_hint: 'Beauty › Skin Care › Face Serums (تُختار من كتالوج noon الفعلي)', ...base },
  amazon: { platform: 'Amazon.ae', title_en: "LOWE'S Profesyonel Vitamin C Serum, 30 ml – Ascorbic Acid 20%, Ferulic Acid 2%, Vitamin B5 – Brightens and Evens Skin Tone", category_hint: 'Beauty › Skin Care › Face › Serums — تتطلب موافقة Beauty topicals', gtin_note: 'EAN إن أُكِّد GS1، وإلا طلب إعفاء GTIN', ...base },
};
const NOW_DONE = ['العنوان EN/AR، النقاط، الوصف، الاستخدام، التحذيرات، INCI، المنشأ، الحجم', 'مطابقة المحتوى حقلاً حقلاً مع Box.docx (EAN، Batch، Exp، الادعاءات، INCI)', 'اختيار الصور الأصلية (دقة ≥ 3000px) واستبعاد التصميم القديم', 'رسوم المنصة المؤكدة ومعادلة الربحية'];
const MGMT = ['سعر الإمارات بالدرهم', 'إثبات تسجيل Montaji (نسخة/رقم) وأن الاسم مطابق', 'دور شركة الملصق L B İÇ VE DIŞ TİCARET على العلبة', 'ترخيص GS1 للبادئة 8684272', 'نموذج التنفيذ + وزن/أبعاد العبوة + COGS + VAT'];
const MFR = ['لا شيء إلزامي لـVitamin C', '(عند الطلب فقط) تقارير الاختبار، وتقرير المكوّنات الموقّع بـCAS وأوزان لدعم ادعاء 20%/2%'];
const PERM = {
  noon: ['فتح حساب البائع (بريد، هاتف، رخصة Meydan 2542259.01، هوية المفوَّض)', 'رفع الرخصة والهوية وربط IBAN', 'إنشاء العلامة/تفويض إن صُنّفت محمية', 'إدخال الإدراج واختيار FBN/FBP وإرساله'],
  amazon: ['فتح حساب Professional (رخصة، هوية، بطاقة، بنك)', 'طلب موافقة Beauty topicals', 'طلب إعفاء GTIN إن لم يثبت GS1', 'إدخال الإدراج وإرساله'],
};
const NOT_VERIFIED = { noon: ['حدود طول الحقول وشجرة التصنيف الدقيقة (داخل Seller Lab)', 'قبول الصورة الرئيسية كـrender 3D', 'مستندات الفئة التفصيلية للتجميل (غير منشورة)'], amazon: ['حدود الحقول وbrowse node الدقيق', 'قبول الصورة الرئيسية كـrender 3D وشروط الصور الرسمية', 'مستندات موافقة Beauty topicals (غير منشورة)', 'رسوم FBA الحالية (الصفحة 2025)'] };
for (const k of ['noon', 'amazon']) {
  const d = path.join(out, `VitaminC_${k}`); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'listing_payload.json'), JSON.stringify({ _note: 'Internal draft. Not uploaded. null = unknown, to be provided; nothing invented.', ...PL[k], images }, null, 1));
  const imgCsv = ['role,kind,width,height,path', ...images.map((m, i) => `${i === 0 && m.kind === 'Photo' ? 'main' : 'secondary'},${m.kind},${m.width},${m.height},"${m.path}"`)].join('\n');
  fs.writeFileSync(path.join(d, 'images_manifest.csv'), '﻿' + imgCsv);
  const readme = `# حزمة تقديم Vitamin C — ${PL[k].platform}\n**الحالة: محتوى جاهز · غير جاهز للنشر · لم يُرفع شيء.** المحتوى ليس دليل اعتماد المنتج.\n\n## الملفات\n- \`listing_payload.json\` (كل الحقول؛ المجهول = null)\n- \`images_manifest.csv\` (مسارات الصور الأصلية؛ الصورة الرئيسية = Photo 4000×4000)\n- المحتوى المقروء: \`../../listings/final/LW-SR-101_VitaminC_${k}_content.md\`\n\n## أُنجز الآن\n${NOW_DONE.map((x) => '- ✅ ' + x).join('\n')}\n\n## يتطلب مستندات/قرارات الإدارة\n${MGMT.map((x) => '- ⛔ ' + x).join('\n')}\n\n## يتطلب المصنّع\n${MFR.map((x) => '- ' + x).join('\n')}\n\n## يتطلب إذنك الصريح (لم يُنفَّذ)\n${PERM[k].map((x) => '- 🔒 ' + x).join('\n')}\n\n## غير متحقق منه (غير منشور علناً)\n${NOT_VERIFIED[k].map((x) => '- ' + x).join('\n')}\n\n## تحذير\n- نص الصندوق مأخوذ من \`Box.docx\`؛ ملفا Box/Print PDF بلا طبقة نص → يلزم تدقيق بصري بشري للمطبوع (C-25).\n- لا يُكتب ادعاء «enhances sunscreen effectiveness».\n`;
  fs.writeFileSync(path.join(d, 'README.md'), readme);
}
// held packages
const held = (sku, title, extra) => {
  const k = pack.find((x) => x.sku === sku); const im = imgs(sku);
  return `# ${sku} · ${title} — حزمة معلّقة (غير جاهزة للتقديم)\n\n## مراجعة المحتوى مقابل العبوة (${k.pack_pdf ? k.source_kinds : 'بلا مصدر نصي'})\n| الحقل | ما على العبوة |\n|---|---|\n| Batch / Exp | ${k.batch || '—'} / ${k.expiry || '—'} |\n| جهة الملصق | ${k.label_company} |\n| الغرض | ${k.purpose_en} |\n| الاستخدام | ${k.how_to_use_en} |\n| التحذيرات | ${k.warnings_en} |\n| INCI (علبة) | ${k.inci} |\n| الصور | ${im.slice(0, 3).map((m) => `${m.kind} ${m.width}×${m.height}`).join('، ') || '—'} |\n\n${extra}`;
};
fs.writeFileSync(path.join(out, 'LW-SR-103_DarkSpot_HELD.md'), held('LW-SR-103', 'Dark Spot Corrector Serum', `## موانع التقديم\n1. **تعارض INCI (C-22):** العلبة وملف التفاصيل العربي (19 عنصراً) مقابل جدول المصنّع \`Dark Spot Corrector Serum 30ML.pdf\` (18 عنصراً، CAS ونطاقات %). مشترك 12. فقط بالعلبة: Sodium Ascorbyl Phosphate، PEG-40 Castor Oil، Dehydroacetic Acid، Benzyl Alcohol، Benzyl Salicylate، Hexyl Cinnamal، Terpineol. فقط بالجدول: Glycerin، 3-O-Ethyl Ascorbic Acid، Phenoxyethanol، EDTA، Ethylhexylglycerin، Benzophenone-4. **لا يُختار أحدهما بلا إقرار CEELLO** وبيان أي دفعة لكل نسخة. تقارير BSN (ثبات/تحدّي/ميكروبيولوجيا، 2025–2026) بلا Batch ولا تاريخ إنتاج فلا تُربط بنسخة.\n2. **Hydroquinone (C-24):** دليل بلدية دبي (الملحق 1) يشترط غياب Hydroquinone في منتجات التفتيح. **لا يوجد بالملفات أي دليل على وجوده أو غيابه:** قوائم INCI لا تذكره لكن القائمة ليست اختباراً، وتقارير BSN لا تتناوله. المطلوب بالضبط:\n   - (أ) تقرير مختبر معتمد (ISO/IEC 17025) يذكر «Hydroquinone: Not detected/Absent» على **نفس الصيغة/الدفعة المسجَّلة**، برقم وتاريخ واسم العينة والـBatch؛ و\n   - (ب) ورقة المكوّنات الموقّعة والمختومة من R&D لدى CEELLO بـCAS وأوزان تؤكد خلو الصيغة منه؛ و\n   - (ج) نسخة تقرير الاختبار المرفق بملف تسجيل Montaji إن وُجد.\n   Alpha-Arbutin موجود بالصيغة؛ هل يخضع لقيد خاص عند البلدية: غير مذكور بالدليل — يُسأل ولا يُفترض.\n3. **ادعاء:** الإنجليزية «Reduces the Appearance of Dark Spots» بينما التركية (حسب قراءتي، تُراجع بشرياً) تقول «helps prevent the formation of dark spots/age spots». يُوحَّد الادعاء على الأضعف المثبت قبل أي نسخ.\n4. **عام:** سعر، إثبات تسجيل، دور جهة الملصق (THE CEEL KOZMETİK على هذه العلبة)، EAN/GS1.\n\n## ادعاءات/مكونات تحتاج تحققاً\n- CI 45430 (ملوّن) ومسببات الحساسية Benzyl Salicylate وHexyl Cinnamal: مذكورة داخل INCI كما يطلب الدليل؛ تُراجع تقارير الملحق 1.\n- لا تُستعمل عبارة «Dermatologically tested» (لا دليل بالملفات).\n\n**الحالة:** غير منشور — HOLD حتى إقرار CEELLO + دليل Hydroquinone.\n`));
fs.writeFileSync(path.join(out, 'LW-SR-105_Collagen_HELD.md'), held('LW-SR-105', 'Collagen Serum', `## موانع التقديم\n1. **تعارض INCI (C-23):** العلبة والتفاصيل العربية (22 عنصراً) مقابل جدول المصنّع \`COLLAGEN SERUM 30 ML.pdf\` (20). فقط بالعلبة: Benzyl Alcohol، Saccharide Isomerate، Dehydroacetic Acid، Benzyl Salicylate، Hexyl Cinnamal، Terpineol. فقط بالجدول: Phenoxyethanol، EDTA، Ethylhexylglycerin، Benzophenone-4. يلزم إقرار CEELLO ببيان الدفعات؛ تقارير BSN بلا Batch.\n2. **ادعاءات تحتاج تحققاً:** واجهة العلبة «Revives Dull Skin, Deeply Hydrates & Firms»، والغرض: يحسّن المرونة ومظهراً أكثر امتلاءً، «suitable for all skin types»، وتفاصيل عربية تذكر «Dermatologically Tested» (لا تقرير جلدي بالملفات → لا تُستعمل). ادعاء «Glutathione» على الواجهة بينما ترتيبه متأخر في INCI → يُطلب تأكيد تركيزه.\n3. **عام:** سعر، إثبات تسجيل، دور جهة الملصق (CEELLO على هذه العلبة)، EAN/GS1.\n4. لا متطلبات تنظيمية خاصة بالدليل (لا AHA/تفتيح/ادعاء مرضي) ظاهرة؛ تُؤكَّد بنسخة التسجيل.\n\n**الحالة:** غير منشور — HOLD حتى إقرار INCI.\n`));
console.log('packages written');
