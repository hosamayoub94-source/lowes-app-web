// Builds (1) conflicts_and_gaps_register and (2) listing_readiness_26 from the committed kit + registration-match files. Read-only on sources.
const fs = require('fs'); const path = require('path');
const dir = process.argv[2];
const kit = JSON.parse(fs.readFileSync(path.join(dir, 'LOWES_UAE_Product_Sheet_DRAFT.json'), 'utf8')).products;
const reg = JSON.parse(fs.readFileSync(path.join(dir, 'registration/registration_match_26_2026-10-10.json'), 'utf8')).rows;
const R = (id, product, item, sources, status, step, owner, blocking) => ({ id, product, item, sources, status, step, owner, blocking });
const register = [
  R('C-01', 'LW-HR-803 Rosemary Hair Oil', 'INCI differs: box 30 items (LBH 004) vs details file 26 items (LRO 001); 17 common, 22 differ', 'Box PDF; details PDF; conflicts/hair_oil_inci_comparison_2026-10-10.csv', 'مفتوح — حقيقي', 'Written final INCI + batch version from CEELLO', 'CEELLO (draft letter, not sent)', 'يمنع الإعداد والنشر'),
  R('C-02', 'LW-HR-803 Rosemary Hair Oil', 'Biotin claimed on pack front, absent from both INCI lists', 'Box PDF front; both INCI lists', 'مفتوح', 'CEELLO confirms Biotin presence or box wording correction', 'CEELLO', 'يمنع النشر'),
  R('C-03', 'LW-HR-803 Rosemary Hair Oil', 'Hair-growth / loss / density / circulation claims in catalog; no test on the oil', 'Catalog EN; SKINLAB report (water only)', 'غير مدعوم', 'Do not use; CEELLO states supported claims', 'CEELLO', 'يمنع الادعاءات'),
  R('C-04', 'LW-HR-803 Rosemary Hair Oil', 'Benzyl Nicotinate and Ascorbic Acid in box INCI — intended presence / UAE acceptability', 'Box PDF', 'يحتاج تأكيداً', 'CEELLO regulatory confirmation', 'CEELLO', 'يمنع النشر'),
  R('C-05', 'LW-HR-802 Pure Rosemary Water', 'SKINLAB +15.53% belongs to "The CEEL Pure Rosemary Water"; formula identity stated only by the company', 'AplAppRep/SKINLAB report; partnership statement', 'مفتوح', 'CEELLO written identity declaration', 'CEELLO (draft not sent)', 'يمنع الادعاء العلمي فقط'),
  R('C-06', 'LW-SR-101 Vitamin C Serum', 'Front "Ferulic Acid 2% · Vitamin B5" vs details file attaches 2% to B5', 'Box PDF; details PDF', 'مفتوح — منخفض', 'Use box text; confirm with CEELLO', 'CEELLO', 'لا يمنع'),
  R('C-07', 'LW-SR-101 Vitamin C Serum', 'Catalog "enhances sunscreen effectiveness" not on box', 'Catalog EN; box PDF', 'مُعالج', 'Excluded from listing; use box claims', 'Claude', 'لا يمنع'),
  R('C-08', 'ALL', 'Label company differs by pack: CEELLO KOZMETİK (Afyonkarahisar) on 8 SKUs, THE CEEL KOZMETİK İÇ VE DIŞ TİCARET (Ataşehir) on 3, L B İÇ VE DIŞ TİCARET KOZMETİK (Kadıköy) on 2 (incl. Vitamin C, Hair Oil, Skin Brightening Cream) among 13 packs with a text layer. None of the latter two is an ABOS entity', 'Pack PDFs text (listings/pack_data_2026-10-10.json); ABOS 02', 'مفتوح', 'Management explains each company role and which is the responsible party in UAE', 'الإدارة', 'يمنع النشر'),
  R('C-09', 'ALL', 'UAE registration proof not found in files (management confirms registration)', 'Management; document review', 'التسجيل مؤكد من الإدارة؛ الإثبات لم يُعثر عليه ضمن الملفات المتاحة', 'Management supplies copy/number per SKU', 'الإدارة', 'يمنع النشر'),
  R('C-10', 'ALL', 'No approved UAE price (Syria prices not used)', 'Kit; ABOS', 'مفقود', 'Management approves AED wholesale/retail', 'الإدارة', 'يمنع النشر'),
  R('C-11', 'ALL', 'Trademark: application 2024/085278 by a natural person; ownership/authority undocumented', 'AplAppRep.pdf; correspondence/Trademark_Authority_Review.md', 'مفتوح', 'Authority documents list (7 items)', 'الإدارة / مالك العلامة', 'يمنع تفويض العلامة'),
  R('C-12', 'ALL', 'EAN readable on 3 packs only; GS1 licensee unknown', 'Registration match table; pack artwork', 'مفتوح', 'Read EAN from current packs; confirm GS1 licence', 'الإدارة', 'يمنع الإدراج بمنصات تشترط GTIN'),
  R('C-13', 'ALL', 'Test reports local for 9 SKUs; others indexed to Drive', '00_فهرس الشهادات.pdf; product folders', 'جزئي', 'Management shares Drive folder on request', 'الإدارة', 'لا يمنع'),
  R('C-14', 'LW-SP-401, LW-MN-901, LW-BD-703', 'No pack/print artwork in folder', 'Registration match table', 'مفقود', 'Provide pack files', 'الإدارة', 'يمنع إعداد هذه الثلاثة'),
  R('C-15', 'ALL', 'UAE regulatory path: Dubai = Montaji (Dubai Municipality guideline V2.1, official). Federal MOIAT/ECAS and Abu Dhabi/other emirates NOT established officially', 'dmpmedia.dm.gov.ae DM-HSD-GU116-CPCP2 V2.1; moiat.gov.ae service page; trade.gov (secondary)', 'مُحسم لدبي — غير محسوم لغيرها', 'Ask management which route/company registered the products; ask DM/MOIAT in writing before shipping outside Dubai (not sent)', 'الإدارة', 'لا يمنع دبي؛ يمنع إمارات أخرى'),
  R('C-16', 'LW-SR-107 Anti-Acne Serum', 'Pack headings swapped: text under PURPOSE OF USAGE is the usage instructions and text under HOW TO USE is the purpose', 'Anti Acne Serum Box/Print PDF text', 'مفتوح — خطأ تصميم', 'Fix artwork before any print/listing copy; do not publish the text as printed', 'الإدارة / CEELLO', 'يمنع نسخ نص العلبة بالإدراج'),
  R('C-17', 'Amazon.ae', 'Amazon pricing page shows FBA fees effective 1 Aug 2025 (page footer 2025) — may be outdated', 'sell.amazon.ae/pricing fetched 2026-10-10 (cached 8 Oct)', 'يحتاج تحققاً', 'Confirm current fees inside Seller Central / FBA calculator', 'حسام (بعد فتح الحساب)', 'لا يمنع'),
  R('C-18', 'LW-SR-107 Anti-Acne Serum', 'Acne products are listed OUT of cosmetics scope (DM guideline 5.2); pack says helps prevent acne formation', 'DM guideline V2.1 §5.2; Anti Acne Serum Box PDF', 'مفتوح — خطر نطاق', 'Management: was it registered under this name? Consider renaming/claim change with DM before listing', 'الإدارة', 'يمنع النشر'),
  R('C-19', 'LW-HR-801/802/803 Rosemary hair line', 'Hair growth/loss claims and microcirculation substances (Benzyl Nicotinate in Hair Oil INCI) are out of cosmetics scope (5.2)', 'DM guideline V2.1 §5.2; catalog EN; Hair Oil box INCI', 'مفتوح', 'Drop growth/loss claims; CEELLO confirms Benzyl Nicotinate purpose; confirm registration status per SKU', 'الإدارة / CEELLO', 'يمنع نشر الشعر'),
  R('C-20', 'LW-FC-203 Pore Toner', 'Contains Glycolic Acid: AHA rules (pH ≥3.5 retail; mandatory label precautions) §9.6', 'DM guideline V2.1 §9.6; catalog actives', 'يحتاج تحققاً', 'Check pack precautions + final pH with CEELLO', 'CEELLO', 'قد يمنع'),
  R('C-21', 'LW-CR-302 Skin Brightening Cream', 'Name mismatch: box prints SKIN WHITENING CREAM (CILT BEYAZLATICI KREM); catalog says Skin Lightening Cream; kit says Skin Brightening Cream', 'Skin Whitening Cream Box PDF; catalog EN; kit sheet', 'مفتوح', 'Match box name to the registered name before listing; do not rename on our own', 'الإدارة', 'يمنع نشر 302'),
];
const rows = kit.map((p, i) => {
  const r = reg.find((x) => x.sku === p.internal_sku) || {};
  const noPack = /لا ملف عبوة/.test(r.match_status || '');
  let status = 'جاهز للإعداد، غير جاهز للنشر'; const holds = ['سعر الإمارات', 'إثبات التسجيل', 'دور جهة الملصق'];
  if (p.internal_sku === 'LW-HR-803') { status = 'معلّق — تعارض INCI/Biotin (C-01..C-04)'; holds.push('إقرار CEELLO'); }
  else if (p.internal_sku === 'LW-SR-107') { status = 'معلّق — خطر نطاق التجميل: حب الشباب (C-18)'; holds.push('قرار الاسم/الادعاء'); }
  else if (/HR-80[12]/.test(p.internal_sku)) { status = 'معلّق — ادعاءات الشعر خارج نطاق التجميل (C-19)'; holds.push('سحب ادعاءات النمو/التساقط'); }
  else if (noPack) { status = 'غير جاهز للإعداد — ملف العبوة غير موجود'; holds.push('ملف العبوة'); }
  if (!r.ean13_on_pack_artwork) holds.push('EAN من العبوة');
  if (/HR-80[12]|HR-801/.test(p.internal_sku)) holds.push('ادعاءات نمو الشعر ممنوعة قبل إقرار CEELLO');
  return { sku: p.internal_sku, catalog_code: p.catalog_code, product: p.product_name_en, pack_size: p.pack_size, ean_on_pack: r.ean13_on_pack_artwork || '', registration: 'التسجيل مؤكد من الإدارة؛ إثبات التسجيل لم يُعثر عليه ضمن الملفات المتاحة', listing_status: status, holds_before_publish: holds.join(' · ') };
});
const csv = (a) => '﻿' + [Object.keys(a[0]).join(','), ...a.map((r) => Object.keys(a[0]).map((c) => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
fs.mkdirSync(path.join(dir, 'conflicts'), { recursive: true });
fs.writeFileSync(path.join(dir, 'conflicts/conflicts_and_gaps_register_2026-10-10.csv'), csv(register));
fs.writeFileSync(path.join(dir, 'conflicts/conflicts_and_gaps_register_2026-10-10.json'), JSON.stringify(register, null, 1));
fs.writeFileSync(path.join(dir, 'listings/listing_readiness_26_2026-10-10.csv'), csv(rows));
fs.writeFileSync(path.join(dir, 'listings/listing_readiness_26_2026-10-10.json'), JSON.stringify(rows, null, 1));
const c = {}; rows.forEach((r) => (c[r.listing_status] = (c[r.listing_status] || 0) + 1)); console.log(register.length, 'register rows', c);
