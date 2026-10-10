// One standalone listing file per SKU (+ index) from listing_drafts_22 + first_two (Vitamin C) + kit image check. Read-only on sources.
const fs = require('fs'); const path = require('path');
const [kitDir, imgRoot] = process.argv.slice(2);
const drafts = JSON.parse(fs.readFileSync(path.join(kitDir, 'listings/listing_drafts_22_2026-10-10.json'), 'utf8')).products;
const first2 = JSON.parse(fs.readFileSync(path.join(kitDir, 'listings/first_two_listings_DRAFT.json'), 'utf8')).products.find((p) => /Vitamin C/.test(p.product));
const out = path.join(kitDir, 'listings/products'); fs.mkdirSync(out, { recursive: true });
const png = (f) => { try { const b = fs.readFileSync(f); return b.readUInt32BE(16) + '×' + b.readUInt32BE(20); } catch { return null; } };
const img = (rel) => { const f = path.join(imgRoot, path.basename(rel || '')); return fs.existsSync(f) ? `${path.basename(f)} (${png(f) || '?'} px)` : 'غير موجودة محلياً'; };
const index = [];
const vc = first2 ? {
  sku: 'LW-SR-101', catalog_code: 'LSK-SER-01', title_en: "LOWE'S Profesyonel Vitamin C Serum — 30 ml (1.00 fl.oz)", title_ar: 'سيروم فيتامين سي', size: '30 ml (1.00 fl.oz)',
  ean13_on_pack: first2.identifiers.ean13_on_packaging_artwork.value, batch_on_artwork: 'LWC 004', expiry_on_artwork: '30.06.2028', inci_from_pack: first2.inci_from_box.value,
  actives_catalog: 'Ascorbic Acid (Vitamin C) 20%, Ferulic Acid 2%, Vitamin B5', usage_catalog: first2.how_to_use_from_box.value + ' [عبوة]', benefits_catalog_unverified: first2.purpose_claims_from_box.value + ' [عبوة]', images: 'LOWES Brand Kit/assets/products_web/ser01.png',
  gaps: ['سعر الإمارات (AED)', 'إثبات التسجيل', 'دور جهة الملصق (L B İÇ…)', 'مرجع GS1 لـ8684272'],
} : null;
const all = [vc, ...drafts].filter(Boolean);
for (const p of all) {
  const hair = /HR-80/.test(p.sku);
  const p0 = ['سعر الإمارات (AED) معتمد', 'إثبات التسجيل (نسخة/رقم) مرتبط بالمنتج', 'توضيح دور شركة الملصق على هذه العبوة', 'تأكيد رسم/ترخيص الباركود (GS1) وأنه على العبوة الحالية']; if (!p.ean13_on_pack) p0[3] = 'قراءة EAN من العبوة الحالية + تأكيد GS1';
  const p1 = []; if (!p.inci_from_pack) p1.push('نسخ INCI من العبوة يدوياً (لم يُقرأ آلياً)'); else p1.push('تدقيق بصري لـINCI المقروء آلياً مقابل العبوة'); p1.push('ملصق عربي إن اشترطته الجهة المنظِّمة (C-15)');
  if (hair) p1.push('ادعاءات الشعر محجوبة حتى إقرار CEELLO (C-03/C-05)');
  const t = `# ${p.sku} · ${p.title_en}\n\n**الحالة:** جاهز للإعداد، **غير جاهز للنشر** · الكتالوج: ${p.catalog_code} · الحجم: ${p.size}\n\n## الحقول (المصدر بين أقواس)\n| الحقل | القيمة |\n|---|---|\n| العنوان EN [عبوة/كتالوج] | ${p.title_en} |\n| العنوان AR [كتالوج] | ${p.title_ar} |\n| العلامة | LOWE'S Profesyonel |\n| EAN-13 [عبوة] | ${p.ean13_on_pack || '[فجوة]'} |\n| Batch / Exp [تصميم العبوة] | ${p.batch_on_artwork || '—'} / ${p.expiry_on_artwork || '—'} |\n| INCI [عبوة] | ${p.inci_from_pack || '[فجوة — يُنسخ من العبوة]'} |\n| المواد الفعالة [كتالوج] | ${p.actives_catalog || '[فجوة]'} |\n| طريقة الاستخدام | ${p.usage_catalog || '[فجوة]'} |\n| الفوائد [كتالوج — غير مثبتة على العبوة ما لم يُذكر] | ${p.benefits_catalog_unverified || '[فجوة]'} |\n| الصورة | ${img(p.images)} |\n| المنشأ [كتالوج] | Made in Türkiye |\n| التسجيل | التسجيل مؤكد من الإدارة؛ إثبات التسجيل لم يُعثر عليه ضمن الملفات المتاحة |\n| السعر | [فجوة — غير معتمد] |\n\n## يمنع النشر (من الإدارة)\n${p0.map((x) => '- ' + x).join('\n')}\n\n## يُستكمل بلا انتظار\n${p1.map((x) => '- ' + x).join('\n')}\n`;
  fs.writeFileSync(path.join(out, `${p.sku}.md`), t);
  index.push({ sku: p.sku, product: p.title_en.replace("LOWE'S Profesyonel ", ''), ean: p.ean13_on_pack || '', inci_machine_read: p.inci_from_pack ? 'yes' : 'no', image: img(p.images), blocking_items: p0.length, other_items: p1.length });
}
const cols = Object.keys(index[0]);
fs.writeFileSync(path.join(out, '_index.csv'), '﻿' + [cols.join(','), ...index.map((r) => cols.map((c) => `"${String(r[c]).replace(/"/g, '""')}"`).join(','))].join('\n'));
console.log('files', all.length, '| with EAN', index.filter((r) => r.ean).length, '| with machine-read INCI', index.filter((r) => r.inci_machine_read === 'yes').length, '| images found', index.filter((r) => !/غير موجودة/.test(r.image)).length);
