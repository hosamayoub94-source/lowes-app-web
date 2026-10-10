// Datasheets for the six closest-to-ready SKUs: pack-printed data first, drafts/catalog only as labelled fallback. Read-only.
const fs = require('fs'); const path = require('path');
const dir = process.argv[2];
const J = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const pack = J('listings/pack_data_2026-10-10.json'); const drafts = J('listings/listing_drafts_22_2026-10-10.json').products; const first2 = J('listings/first_two_listings_DRAFT.json').products[0];
const SIX = ['LW-SR-101', 'LW-SR-103', 'LW-SR-104', 'LW-SR-105', 'LW-SR-107', 'LW-CR-302'];
const FRONT = { 'LW-SR-103': 'Reduces the Appearance of Dark Spots and Evens Out Skin Tone (واجهة العلبة؛ فعّالات: Alpha Arbutin · Hyaluronic Acid · Niacinamide)', 'LW-SR-104': 'Intensely Hydrates the Skin (واجهة العبوة؛ Hyaluronic Acid · Vitamin B5) — من صورة العبوة', 'LW-SR-105': 'Revives Dull Skin, Deeply Hydrates & Firms (Hydrolyzed Collagen · Hyaluronic Acid · Glutathione)', 'LW-SR-107': 'Combination and Acne-Prone Skin (Tea Tree · Niacinamide · Panthenol)', 'LW-CR-302': 'Skin Whitening Cream with Alpha-Arbutin, Glutathione, Kojic Acid and Tranexamic Acid; «Dark Spot Corrector Reduces Discoloration»' };
const md = ['# بيانات المنتجات الستة الأقرب للجاهزية — 10 تشرين الأول 2026', '', 'المصدر الأول: نص مطبوع بملفات العبوات الأصلية (Box/Print PDF). الكتالوج لا يُستعمل هنا. **كلها: جاهزة للإعداد، غير جاهزة للنشر** (سعر، إثبات تسجيل، دور شركة الملصق، EAN/GS1).', ''];
const idx = [];
for (const sku of SIX) {
  const pk = pack.find((x) => x.sku === sku) || {}; const d = drafts.find((x) => x.sku === sku) || {};
  const v = sku === 'LW-SR-101';
  const name = v ? "Vitamin C Serum" : (d.title_en || sku).replace("LOWE'S Profesyonel ", '');
  const inci = v ? first2.inci_from_box.value : (pk.inci || d.inci_from_pack || '');
  const inciSrc = v ? 'علبة' : pk.inci ? 'علبة (PDF)' : d.inci_from_pack ? 'مسودة سابقة من ملف العبوة' : '';
  const warnings = v ? first2.warnings_from_box.value : pk.warnings_en; const how = v ? first2.how_to_use_from_box.value : pk.how_to_use_en; const purpose = v ? first2.purpose_claims_from_box.value : pk.purpose_en;
  const batch = v ? 'LWC 004' : (pk.batch || (d.batch_on_artwork || '').replace(/s*PAP.*$/, '').trim()); const exp = v ? '30.06.2028' : (pk.expiry || d.expiry_on_artwork || '');
  const company = v ? 'L B İÇ VE DIŞ TİCARET KOZMETİK A.Ş. (İstanbul, Kadıköy)' : (pk.label_company || '[غير مقروء — العبوة بلا طبقة نص]');
  const ean = v ? '8684272100419' : (d.ean13_on_pack || '');
  const flag = sku === 'LW-SR-107' ? '\n> ⚠️ **تعارض على العبوة:** عنوانا «PURPOSE OF USAGE» و«HOW TO USE» مقلوبان (نص طريقة الاستخدام تحت عنوان الغرض والعكس). يُصحَّح التصميم قبل أي طباعة؛ ولا يُنشر النص كما هو.\n' : '';
  md.push(`## ${sku} · ${name}`, '', `| الحقل | القيمة | المصدر |`, '|---|---|---|', `| EAN-13 | ${ean || '[فجوة]'} | ${ean ? 'تصميم العبوة' : '—'} |`, `| Batch / Exp | ${batch || '—'} / ${exp || '—'} | تصميم العبوة |`, `| INCI | ${inci || '[فجوة — يُنسخ بالعين من العبوة]'} | ${inciSrc || '—'} |`, `| ادعاء الواجهة | ${v ? 'Ascorbic Acid 20% · Ferulic Acid 2% · Vitamin B5' : (FRONT[sku] || '—')} | ${v ? 'علبة' : 'علبة/عبوة'} |`, `| الغرض (Purpose) | ${purpose || '[فجوة]'} | علبة |`, `| طريقة الاستخدام | ${how || '[فجوة]'} | علبة |`, `| التحذيرات | ${warnings || '[فجوة]'} | علبة |`, `| جهة الملصق | ${company} | علبة |`, `| الحجم | ${v ? '30 ml (1.00 fl.oz)' : d.size} | كتالوج (يُقارن بالعبوة) |`, `| التسجيل | التسجيل مؤكد من الإدارة؛ إثبات التسجيل لم يُعثر عليه ضمن الملفات المتاحة | الإدارة |`, '', flag);
  idx.push({ sku, name, ean: ean || '', batch, label_company: company.slice(0, 22), inci_items: inci ? inci.split(',').length : 0 });
}
fs.writeFileSync(path.join(dir, 'listings/Six_Closest_Datasheets_2026-10-10.md'), md.join('\n'));
console.log(idx);
