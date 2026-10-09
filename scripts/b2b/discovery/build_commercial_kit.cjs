// Builds the UAE commercial-kit product sheet from the company's own Brand Kit files (no invented data).
// Sources: LOWES Brand Kit/LOWES Catalog - PRINT.html (catalog code, names, pack size, compliance mentions)
//          LOWES Brand Kit/system/src/db/database.js (internal SKU + image file name only — prices/costs are deliberately NOT exported)
// usage: node build_commercial_kit.cjs <brandKitDir> <outDir>
const fs = require('fs');
const path = require('path');
const [kit, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const cat = fs.readFileSync(path.join(kit, 'LOWES Catalog - PRINT.html'), 'utf8')
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' | ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').replace(/( \| )+/g, ' | ');
const items = [];
const toks = cat.split("|").map((t) => t.trim()).filter(Boolean);
for (let i = 0; i < toks.length; i++) {
  const code = toks[i];
  if (!/^L[A-Z]{2}-[A-Z]{3}-\d{2}$/.test(code)) continue;
  const line = toks[i - 1] || "", nameAr = toks[i + 1] || "", nameEn = toks[i + 2] || "", size = toks[i + 3] || "";
  const sm = size.match(/(?:(.*?IU) · )?([\d.]+ fl\.oz) · (\d{2,3}) ml/);
  if (!sm) continue;
  const [lineEn, lineAr] = line.split(" · ");
  items.push({ catalog_code: code, line_en: (lineEn || "").trim(), line_ar: (lineAr || "").trim(), name_ar: nameAr, name_en: nameEn, strength: sm[1] || "", size_ml: +sm[3], size_floz: sm[2] });
}
const db = fs.readFileSync(path.join(kit, 'system/src/db/database.js'), 'utf8');
const skus = [...db.matchAll(/\{ barcode:'(LW-[A-Z]{2}-\d{3})', name:'([^']+)',\s+nameEn:'([^']+)',\s+category:'(\w+)'[^}]*image:'([^']+)'/g)].map((x) => ({ sku: x[1], name_ar: x[2], name_en: x[3], category: x[4], image: x[5] }));
const norm = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').replace(/\b(gel|cream|serum|spf50|1)\b/g, '').trim();
// explicit pairs where catalog and DB names differ (checked by hand: same Arabic product name)
const MANUAL = { 'LSK-TNR-01': 'LW-FC-203', 'LSK-TNR-02': 'LW-TN-601' };
const pick = (it) => (MANUAL[it.catalog_code] && skus.find((s) => s.sku === MANUAL[it.catalog_code])) || skus.find((s) => norm(s.name_en) === norm(it.name_en)) || skus.find((s) => norm(it.name_en).includes(norm(s.name_en)) || norm(s.name_en).includes(norm(it.name_en)))
  || skus.find((s) => s.name_ar.replace(/\s+/g, '') === it.name_ar.replace(/[ّ\s]+/g, ''));
// EAN-13 printed on packaging artwork found in company files (check digit validated); not created here
const EAN_FROM_ARTWORK = { 'LW-SR-101': '8684272100419 (Vitamin C Serum - Box.pdf)', 'LW-HR-803': '8684272100471 (Rosemary Hair Oil - Box (1).pdf)', 'LW-FC-203': '8684149133717 (Pore Tightening Toner تفاصيل المنتج.pdf)' };
const rows = items.map((it) => {
  const s = pick(it);
  const img = s ? s.image.replace(/^products\//, '') : '';
  return {
    catalog_code: it.catalog_code, internal_sku: s ? s.sku : 'غير مطابق', product_name_en: it.name_en, product_name_ar: it.name_ar, line: `${it.line_en} · ${it.line_ar}`,
    category: s ? s.category : '', pack_size: `${it.size_ml} ml (${it.size_floz})${it.strength ? ' · ' + it.strength : ''}`,
    image_file: img && fs.existsSync(path.join(kit, 'assets/products_web', img)) ? `LOWES Brand Kit/assets/products_web/${img}` : 'غير موجود بالملفات',
    ean_gtin_barcode: (s && EAN_FROM_ARTWORK[s.sku]) ? `${EAN_FROM_ARTWORK[s.sku]} — من تصميم العبوة؛ ترخيص GS1 والطباعة الحالية يُتحقق منهما` : 'غير موجود في ملفات المشروع (التصميم غير قابل للقراءة آلياً أو غير موجود) — يُتحقق من العبوة',
    origin_and_compliance_on_catalog: 'Made in Türkiye · EU 1223/2009 (مذكوران بالكتالوج)',
    uae_product_registration: 'أكدت الإدارة أن التسجيل مكتمل؛ إثبات التسجيل لم يُعثر عليه في ملفات المشروع',
    wholesale_price_uae: 'غير معتمد للإمارات — لا يُدرج', retail_price_uae: 'غير معتمد للإمارات — لا يُدرج',
  };
});
const cols = Object.keys(rows[0] || {});
fs.writeFileSync(path.join(outDir, 'LOWES_UAE_Product_Sheet_DRAFT.csv'), '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => `"${String(r[c]).replace(/"/g, '""')}"`).join(','))].join('\n'));
fs.writeFileSync(path.join(outDir, 'LOWES_UAE_Product_Sheet_DRAFT.json'), JSON.stringify({ _about: 'Draft product sheet for UAE buyers (updated 2026-10-09: registration status per management confirmation). Built only from the company Brand Kit (catalog + product DB). Prices and costs intentionally excluded (not approved for UAE). EAN/GTIN not found.', products: rows }, null, 1));
console.log('catalog items', items.length, '| matched SKUs', rows.filter((r) => r.internal_sku.startsWith('LW-')).length, '| images found', rows.filter((r) => r.image_file.startsWith('LOWES')).length);
rows.filter((r) => !r.internal_sku.startsWith('LW-')).forEach((r) => console.log('unmatched:', r.catalog_code, r.product_name_en));
