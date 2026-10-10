// Builds per-SKU listing drafts (internal, not uploaded) for products whose pack artwork exists. Read-only on company files.
// Facts are taken only from: catalog text (EN), pack artwork text (pdftotext raw order), the kit sheet and the registration-match table.
// Nothing is invented: price / registration number / claims beyond sources are left as explicit gaps.
// usage: node build_listing_drafts.cjs <productFolderRoot> <kitDir> <catalogEnTxt>
const fs = require('fs'); const os = require('os'); const path = require('path');
const { execFileSync } = require('child_process');
const [root, kitDir, catTxt] = process.argv.slice(2);
const kit = JSON.parse(fs.readFileSync(path.join(kitDir, 'LOWES_UAE_Product_Sheet_DRAFT.json'), 'utf8')).products;
const reg = JSON.parse(fs.readFileSync(path.join(kitDir, 'registration/registration_match_26_2026-10-10.json'), 'utf8')).rows;
const readiness = JSON.parse(fs.readFileSync(path.join(kitDir, 'listings/listing_readiness_26_2026-10-10.json'), 'utf8'));
let n = 0;
const txt = (f) => { const t = path.join(os.tmpdir(), `lw_ld_${process.pid}_${n++}.pdf`); try { fs.copyFileSync(f, t); return execFileSync('pdftotext', [t, '-'], { encoding: 'utf8', maxBuffer: 1 << 26 }); } catch { return ''; } finally { try { fs.unlinkSync(t); } catch { /* */ } } };
const walk = (d) => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]) : [];
const FOLD = JSON.parse(fs.readFileSync(path.join(__dirname, 'folders_map.json'), 'utf8'));
const CAT = { 'LW-FC-201': 'Cleanser for Oily and Sensitive Skin', 'LW-FC-202': 'Cleanser for Normal and Dry Skin', 'LW-FC-203': 'Skin Purifying and Pore-Tightening Toner', 'LW-FC-204': 'Facial peeling Gel', 'LW-SR-102': 'Retinol Serum', 'LW-SR-103': 'Dark Spot & Hyperpigmentation Serum', 'LW-SR-104': 'Intensive Hydrating Serum', 'LW-SR-105': 'Collagen Serum', 'LW-SR-106': 'Under Eye Serum', 'LW-CR-301': 'Moisturizing Cream', 'LW-SR-107': 'Anti-Acne Serum', 'LW-SP-401': 'Pink Sunscreen with Calamine', 'LW-SP-402': 'Anti-Pigmentation Sunscreen', 'LW-MK-501': 'Hydrolyzed collagen Mask', 'LW-TN-601': 'Rice milk tonic', 'LW-SR-108': 'Rice milk serum', 'LW-CR-303': 'Rice milk spot cream', 'LW-CR-304': 'Retinal Shot Cream', 'LW-CR-302': 'Skin Lightening Cream', 'LW-BD-701': 'Body Firming and Cellulite Gel', 'LW-BD-703': 'Foot Care Cream', 'LW-HR-801': 'Rosemary Shampoo', 'LW-HR-802': 'Rosemary Toner', 'LW-MN-901': 'Beard Serum', 'LW-SR-101': 'Vitamin C Serum' };
// catalog blocks
const lines = fs.readFileSync(catTxt, 'utf8').split(/\r?\n/); const blocks = {};
const starts = []; lines.forEach((l, i) => { if (/^Active Ingredients/i.test(l)) starts.push(i - 2); });
starts.forEach((s, k) => { const e = k + 1 < starts.length ? starts[k + 1] : lines.length; blocks[lines[s].trim()] = lines.slice(s, e).join('\n'); });
const sect = (b, a, z) => { const m = b.match(new RegExp(a + '\\s*([\\s\\S]*?)' + (z ? '(?=' + z + ')' : '$'), 'i')); return m ? m[1].replace(/\s+/g, ' ').trim() : ''; };
const inciFrom = (all) => {
  const m = all.match(/INGREDIENTS[^\n]*\n+([\s\S]{20,900}?)(?=\n\s*\n\s*(?:MADE IN|BATCH|EXPIRATION|WARNINGS|HOW TO USE|PURPOSE|UYARI|KULLANIM|L B|SON KULLANMA)|$)/i);
  if (!m) return '';
  const t = m[1].replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').replace(/\s*(?:L B|THE CEEL) .*$/, '').trim();
  return (t.match(/,/g) || []).length >= 4 && /^[A-Za-z]/.test(t) ? t : '';
};
const out = []; const md = ['# Listing drafts — products with pack artwork (internal · NOT uploaded · NOT ready to publish)', '', 'Evidence: **[كتالوج]** company catalog (a company statement, not a substantiation) · **[عبوة]** read from pack artwork text · **[فجوة]** not found in files. No price, registration number, or claim beyond these sources is given. INCI shown only if machine-read cleanly from the pack; otherwise it must be copied by eye from the pack (never from the catalog).', ''];
for (const p of kit) {
  const sku = p.internal_sku; const rd = readiness.find((x) => x.sku === sku); const rg = reg.find((x) => x.sku === sku) || {};
  if (!rd || !/^جاهز للإعداد/.test(rd.listing_status) || sku === 'LW-SR-101') continue;
  const dir = path.join(root, FOLD[sku] || ''); const pdfs = walk(dir).filter((f) => /\.pdf$/i.test(f) && /box|print|تفاصيل|ML/i.test(path.basename(f)));
  let all = ''; for (const f of pdfs) all += '\n' + txt(f);
  const inci = inciFrom(all);
  const b = blocks[CAT[sku]] || '';
  const actives = sect(b, 'Active Ingredients:', 'Benefits:'); const benefits = sect(b, 'Benefits:', 'How to Use:'); const use = sect(b, 'How to Use:', '');
  const hair = /HR-80/.test(sku);
  const gaps = ['سعر الإمارات (AED)', 'إثبات التسجيل', 'دور جهة الملصق'];
  if (!rg.ean13_on_pack_artwork) gaps.push('EAN: يُقرأ من العبوة الحالية');
  if (!inci) gaps.push('INCI: يُنسخ من العبوة يدوياً');
  if (hair) gaps.push('ادعاءات نمو الشعر/الكثافة: ممنوعة حتى إقرار CEELLO');
  const rec = {
    sku, catalog_code: p.catalog_code, title_en: `LOWE'S Profesyonel ${p.product_name_en} — ${p.pack_size}`, title_ar: p.product_name_ar, brand: "LOWE'S Profesyonel", size: p.pack_size,
    ean13_on_pack: rg.ean13_on_pack_artwork || null, batch_on_artwork: rg.batch_on_artwork || null, expiry_on_artwork: rg.expiry_on_artwork || null,
    inci_from_pack: inci || null, actives_catalog: actives || null, usage_catalog: use || null, benefits_catalog_unverified: hair ? '[محجوب — ادعاءات شعر]' : (benefits || null),
    images: p.image_file, made_in: 'Made in Türkiye (catalog)', registration: 'التسجيل مؤكد من الإدارة؛ إثبات التسجيل لم يُعثر عليه ضمن الملفات المتاحة', price_aed: null, status: 'جاهز للإعداد، غير جاهز للنشر', gaps,
  };
  out.push(rec);
  md.push(`## ${sku} · ${rec.title_en}`, `- **EAN:** ${rec.ean13_on_pack || '[فجوة]'} · **Batch/Exp (artwork):** ${rec.batch_on_artwork || '—'} / ${rec.expiry_on_artwork || '—'}`, `- **Actives [كتالوج]:** ${actives || '[فجوة]'}`, `- **INCI [عبوة]:** ${inci || '[فجوة — يُنسخ من العبوة]'}`, `- **Usage [كتالوج]:** ${use || '[فجوة]'}`, `- **Benefits [كتالوج، غير مثبتة على العبوة]:** ${rec.benefits_catalog_unverified || '[فجوة]'}`, `- **النواقص قبل النشر:** ${gaps.join(' · ')}`, '');
}
const o = path.join(kitDir, 'listings');
fs.writeFileSync(path.join(o, 'listing_drafts_22_2026-10-10.json'), JSON.stringify({ _about: 'Internal drafts; nothing uploaded. See header of .md for evidence rules.', products: out }, null, 1));
fs.writeFileSync(path.join(o, 'Listing_Drafts_22_2026-10-10.md'), md.join('\n'));
console.log('drafts', out.length, '| with INCI', out.filter((r) => r.inci_from_pack).length, '| with catalog block', out.filter((r) => r.actives_catalog).length, '| with EAN', out.filter((r) => r.ean13_on_pack).length);
