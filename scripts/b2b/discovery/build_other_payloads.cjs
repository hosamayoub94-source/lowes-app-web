// Payload drafts (content only, nothing uploaded) for CONTENT_READY products other than Vitamin C. null = unknown. Held until external blockers are cleared.
const fs = require('fs'); const path = require('path');
const dir = process.argv[2]; const J = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const kit = J('LOWES_UAE_Product_Sheet_DRAFT.json').products; const pack = J('listings/pack_data_2026-10-10.json'); const gaps = J('listings/product_data_gaps_2026-10-10.json');
const idx = fs.readFileSync(path.join(dir, 'listings/final/_index.csv'), 'utf8').split(/\r?\n/).slice(1).filter(Boolean).map((l) => l.match(/^"([^"]*)","[^"]*","([^"]*)"/)).filter(Boolean);
const ready = idx.filter((m) => m[2] === 'CONTENT_READY').map((m) => m[1]);
const out = path.join(dir, 'submission_packages/other_products'); fs.mkdirSync(out, { recursive: true });
const sum = [];
for (const sku of ready) {
  const p = kit.find((x) => x.internal_sku === sku); const k = pack.find((x) => x.sku === sku); const g = gaps.find((x) => x.sku === sku) || {};
  const payload = { _note: 'Internal draft. Not uploaded. null = unknown. HOLD until blockers cleared.', sku, brand: "LOWE'S profesyonel", title_en: `LOWE'S Profesyonel ${p.product_name_en} ${p.pack_size.split(' (')[0]}`, size: p.pack_size, country_of_origin: 'Türkiye',
    ingredients_inci: k.inci, directions: k.how_to_use_en, purpose_from_pack: k.purpose_en, warnings: k.warnings_en, batch_on_artwork: k.batch || null, expiry_on_artwork: k.expiry || null, label_company_on_pack: k.label_company,
    ean13: null, price_aed: null, registration_proof: null, weight_kg: null, dimensions_cm: null, regulatory_flags: (g.regulatory_flags || '').split(' || ').filter(Boolean),
    blockers: ['سعر', 'إثبات تسجيل مطابق للاسم', 'دور جهة الملصق', 'EAN/GS1 (غير مقروء من العبوة)', ...(g.regulatory_flags ? ['مراجعة الأعلام التنظيمية'] : [])] };
  if (sku === 'LW-CR-302') { payload.name_conflict = 'العبوة: SKIN WHITENING CREAM؛ الكتالوج: ' + p.product_name_en + ' (C-21)'; payload.title_en = null; }
  fs.writeFileSync(path.join(out, `${sku}_payload.json`), JSON.stringify(payload, null, 1));
  sum.push(`| ${sku} | ${p.product_name_en} | ${payload.regulatory_flags.length ? payload.regulatory_flags.length + ' علم' : '—'} | ${sku === 'LW-CR-302' ? 'اسم متعارض' : ''} |`);
}
fs.writeFileSync(path.join(out, 'README.md'), `# حزم المحتوى — منتجات أخرى (كلها HOLD، لا شيء مرفوع)\nمحتواها من العبوة فقط. تبقى معلّقة حتى: سعر، إثبات تسجيل بالاسم الصحيح، دور جهة الملصق، EAN/GS1، ومراجعة الأعلام. لا تُنشر قبل ذلك.\n\n| SKU | المنتج | أعلام تنظيمية | ملاحظة |\n|---|---|---|---|\n${sum.join('\n')}\n`);
console.log(ready.length, 'payloads:', ready.join(','));
