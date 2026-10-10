// Per-SKU data-gap queue (what needs a visual read vs manufacturer confirmation) + regulatory flags from the official Dubai Municipality guideline
// (DM-HSD-GU116-CPCP2 V2.1, 15 Sep 2025): out-of-scope claims (acne/hair-loss/regrowth/microcirculation) and AHA special case. Read-only on sources.
const fs = require('fs'); const path = require('path');
const dir = process.argv[2]; const J = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const kit = J('LOWES_UAE_Product_Sheet_DRAFT.json').products; const pack = J('listings/pack_data_2026-10-10.json'); const drafts = J('listings/listing_drafts_22_2026-10-10.json').products; const first2 = J('listings/first_two_listings_DRAFT.json').products;
const rows = kit.map((p) => {
  const k = pack.find((x) => x.sku === p.internal_sku) || {}; const d = drafts.find((x) => x.sku === p.internal_sku) || {};
  const hair = /HR-80/.test(p.internal_sku); const v = p.internal_sku === 'LW-SR-101'; const oil = p.internal_sku === 'LW-HR-803';
  const inci = v ? first2[0].inci_from_box.value : (k.inci || d.inci_from_pack || (oil ? first2[1].inci_from_box.value : ''));
  const textAll = [k.purpose_en, k.how_to_use_en, d.benefits_catalog_unverified, d.actives_catalog, p.product_name_en].join(' ');
  const flags = [];
  if (/\bacne\b/i.test(p.product_name_en + ' ' + (k.purpose_en || '') + ' ' + (k.how_to_use_en || ''))) flags.push('acne: القسم 5.2 من دليل بلدية دبي يضع «منتجات حب الشباب» خارج نطاق مستحضرات التجميل (ادعاء مرضي)');
  if (hair) /* catalog (EN) claims growth/loss/density/circulation for all three rosemary hair SKUs */ flags.push('شعر: ادعاءات النمو/التساقط/الدوران خارج نطاق التجميل (5.2) — محجوبة');
  if (oil || /(benzyl nicotinate)/i.test(inci)) flags.push('Benzyl Nicotinate: مادة تحسّن الدورة الدموية → خارج النطاق (5.2: «مواد تحسّن microcirculation») — يتطلب إقرار المصنّع/البلدية');
  if (/(glycolic|lactic|citric|mandelic|tartaric|malic) acid/i.test(inci + ' ' + (d.actives_catalog || ''))) flags.push('AHA: pH ≥ 3.5 للتجزئة وتحذيرات ملصق إلزامية (9.6)');
  if (/kojic|hydroquinone|arbutin|tranexamic/i.test(inci + ' ' + p.product_name_en) || /whiten|brighten/i.test(p.product_name_en)) flags.push('تفتيح: اختبار Hydroquinone (يجب غيابه) ضمن تحاليل التسجيل (الملحق 1)');
  if (/SP-40/.test(p.internal_sku)) flags.push('واقي شمس: يدخل نطاق التجميل؛ ادعاء SPF يحتاج تقرير اختبار (غير موجود بالملفات)');
  const needVisual = []; if (!(k.text_layer || v || oil)) needVisual.push('كل بيانات العبوة (النص محوّل لمنحنيات)'); if (!inci) needVisual.push('INCI'); if (!(k.batch || v || oil)) needVisual.push('Batch/Exp'); needVisual.push('EAN (باركود غير مقروء آلياً)');
  const needMfr = ['إقرار/تأكيد INCI النهائي مطابقاً للعبوة', 'ورقة المكوّنات الموقعة (CAS + أوزان) من R&D لملف التسجيل', 'تقارير الاختبار (الملحق 1) وFree Sale Certificate']; if (flags.length) needMfr.push('مراجعة الادعاءات/المكوّنات المُعلَّمة');
  return { sku: p.internal_sku, product: p.product_name_en, pack_text_layer: !!(k.text_layer || v || oil), label_company: v || oil ? 'L B İÇ VE DIŞ TİCARET KOZMETİK A.Ş.' : (k.label_company || ''), needs_visual_read: needVisual.join(' · '), needs_manufacturer: needMfr.join(' · '), regulatory_flags: flags.join(' || ') };
});
const cols = Object.keys(rows[0]); const esc = (x) => `"${String(x).replace(/"/g, '""')}"`;
fs.writeFileSync(path.join(dir, 'listings/product_data_gaps_2026-10-10.csv'), '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n'));
fs.writeFileSync(path.join(dir, 'listings/product_data_gaps_2026-10-10.json'), JSON.stringify(rows, null, 1));
console.log(rows.length, 'rows | with regulatory flags', rows.filter((r) => r.regulatory_flags).length, '|', rows.filter((r) => r.regulatory_flags).map((r) => r.sku).join(','));
