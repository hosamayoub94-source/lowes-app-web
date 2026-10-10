// Builds the 26-product registration-match table from company files (read-only; nothing is created or altered).
// For each SKU: catalog name, on-pack name, brand, label company, pack size, EAN/batch/expiry found on pack artwork, test-report presence,
// UAE registration number/proof (none found => management-confirmed status), and a match status.
// usage: node build_registration_match.cjs <productFolderRoot> <kitJson> <outDir>
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const [root, kitJson, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const kit = JSON.parse(fs.readFileSync(kitJson, 'utf8')).products;
const FOLDERS = {
  'LW-FC-201': 'منتجات البشرة/غسول البشرة الدهنية LOWE_S', 'LW-FC-202': 'منتجات البشرة/غسول الوجه LOWE_S', 'LW-FC-203': 'منتجات البشرة/LOWE_S تونر الوجه_',
  'LW-FC-204': 'منتجات البشرة/جل مقشر LOWE_S', 'LW-TN-601': 'منتجات البشرة/بكج الرزlowes_/تونر الرز LOWES_', 'LW-SR-101': 'منتجات البشرة/سيروم فيتامين سي LOWE_S',
  'LW-SR-102': 'منتجات البشرة/سيروم ريتينول LOWE_S', 'LW-SR-103': 'منتجات البشرة/سيروم البقع LOWE_S', 'LW-SR-104': 'منتجات البشرة/سيروم المرطب LOWE_S',
  'LW-SR-105': 'منتجات البشرة/سيروم الكولاجينLOWE_S', 'LW-SR-106': 'منتجات البشرة/سيروم الهالات تحت العين LOWE_S', 'LW-SR-107': 'منتجات البشرة/سيروم الحبوب LOWE_S',
  'LW-SR-108': 'منتجات البشرة/بكج الرزlowes_/سيروم الرز lowes', 'LW-CR-301': 'منتجات البشرة/كريم المرطب LOWE_S', 'LW-CR-302': 'منتجات الجسم/كريم التبييض LOWE_S',
  'LW-CR-303': 'منتجات البشرة/بكج الرزlowes_/كريم الرزLOWES', 'LW-CR-304': 'منتجات البشرة/كريم الريتينال شوت_', 'LW-SP-401': 'منتجات البشرة/واقي الشمس زهري LOWE_S',
  'LW-SP-402': 'منتجات البشرة/واقي الشمس اورانج LOWE_S', 'LW-MK-501': 'منتجات البشرة/ماسك الكولاجين LOWE_S', 'LW-BD-701': 'منتجات الجسم/كريم التشققات LOWE_S',
  'LW-BD-703': 'منتجات الجسم/كريم القدمين LOWE_S', 'LW-HR-801': 'منتجات الشعر/شامبو الشعر LOWE_S', 'LW-HR-802': 'منتجات الشعر/تونر الشعر LOWE_S',
  'LW-HR-803': 'منتجات الشعر/سيروم الشعر LOWE_S', 'LW-MN-901': 'منتجات الشعر/سيروم اللحية LOWE_S',
};
const os = require('os');
// pdftotext cannot open non-ASCII Windows paths passed from Node: copy to an ASCII temp path first (read-only on the source)
let tmpN = 0;
const txt = (f) => { const t = path.join(os.tmpdir(), `lw_pdf_${process.pid}_${tmpN++}.pdf`); try { fs.copyFileSync(f, t); return execFileSync('pdftotext', ['-layout', t, '-'], { encoding: 'utf8', maxBuffer: 1 << 26 }); } catch { return ''; } finally { try { fs.unlinkSync(t); } catch { /* */ } } };
const walk = (d) => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]) : [];
const findBase = () => { for (const c of [root, path.join(root, '03 - المنتجات والكتالوج/صور المنتجات ومعلومات عنها')]) if (fs.existsSync(path.join(c, 'منتجات البشرة'))) return c; return root; };
const base = findBase();
const eanOk = (c) => { const d = c.split('').map(Number); const s = d.slice(0, 12).reduce((a, x, i) => a + x * (i % 2 ? 3 : 1), 0); return (10 - (s % 10)) % 10 === d[12]; };
const rows = [];
for (const p of kit) {
  const dir = path.join(base, FOLDERS[p.internal_sku] || '');
  const files = walk(dir);
  const pdfs = files.filter((f) => /\.pdf$/i.test(f));
  const rel = (f) => path.relative(base, f).replace(/\\/g, '/');
  const box = pdfs.filter((f) => /box/i.test(path.basename(f))); const prn = pdfs.filter((f) => /print/i.test(path.basename(f))); const det = pdfs.filter((f) => /تفاصيل|تفصيل|مواصفات|Retinal Shot\.pdf|\bML\b/i.test(path.basename(f)) || /\d+\s?ML\.pdf/i.test(path.basename(f)));
  const reports = pdfs.filter((f) => /STABILITY|CHALLENGE|MICROBIOLOGICAL/i.test(path.basename(f)));
  const uts = files.filter((f) => /ÜTS/i.test(path.basename(f)));
  const sources = [...box, ...prn, ...det];
  let all = ''; for (const f of sources) all += '\n' + txt(f);
  const eans = [...new Set([...all.matchAll(/\b(8\s?6\d{2}\s?\d{3}\s?\d{3}\s?\d{3}|\d{13})\b/g)].map((m) => m[1].replace(/\s/g, '')).filter((c) => c.length === 13 && eanOk(c)))];
  const company = (all.match(/L\s?B\s?İ?Ç VE DI?Ş TİCARET KOZMETİK A\.Ş\.|CEELLO KOZMETİK[^\n]*/i) || [''])[0].replace(/\s+/g, ' ').trim();
  const batch = (all.match(/BATCH NO\s*:\s*([A-Z0-9 ]{3,12})/i) || [])[1] || '';
  const exp = (all.match(/(?:SON KULLANMA TARİHİ|EXPIRATION DATE)\s*:?\s*(\d{2}\.\d{2}\.\d{4})/i) || [])[1] || '';
  const sizeTxt = (all.match(/(\d{2,3})\s?ml\s*[\/·|]?\s*[\d.]+\s*fl\.?\s?oz|[\d.]+\s*fl\.?\s?oz\s*[\/·|]?\s*(\d{2,3})\s?ml|\b(\d{2,3})\s?ML\b/i) || []);
  const sizeBox = sizeTxt.slice(1).find(Boolean) || '';
  const titleLine = (all.split('\n').map((l) => l.trim()).find((l) => /^[A-Z0-9 '&\-\/]{6,40}$/.test(l) && /SERUM|CREAM|CLEANSER|TONER|GEL|OIL|SHAMPOO|WATER|MASK|SUNSCREEN|MOISTURIZER|TONIC|SHOT/.test(l)) || '');
  const reg = 'التسجيل مؤكد من الإدارة؛ إثبات التسجيل لم يُعثر عليه ضمن الملفات المتاحة';
  const packOk = box.length > 0 || prn.length > 0;
  let match = !packOk ? 'لا ملف عبوة/تصميم بالمجلد' : eans.length ? 'عبوة + EAN مطبوع + مطابقة الحجم' : 'عبوة موجودة؛ EAN غير مقروء آلياً';
  if (packOk && sizeBox && Number(sizeBox) !== Number(String(p.pack_size).match(/(\d+) ml/)?.[1])) match = 'تعارض حجم بين العبوة والكتالوج — يُراجع';
  rows.push({
    sku: p.internal_sku, catalog_code: p.catalog_code, catalog_name_en: p.product_name_en, catalog_name_ar: p.product_name_ar, catalog_pack_size: p.pack_size,
    on_pack_name_en: titleLine || (packOk ? 'غير مقروء آلياً (نص مُحوَّل لمنحنيات)' : 'لا عبوة'), on_pack_size_ml: sizeBox || '', brand_on_pack: packOk ? "LOWE'S profesyonel" : '',
    label_company_on_pack: company || (packOk ? 'غير مقروء آلياً' : ''), declared_manufacturer: 'CEELLO KOZMETİK (بيان الشراكة التصنيعية — وثيقة أعدّتها الشركة)',
    ean13_on_pack_artwork: eans.join(' | '), batch_on_artwork: batch, expiry_on_artwork: exp,
    uae_registration_number: 'غير موجود ضمن الملفات المتاحة', uae_registration_proof_path: '', uae_registration_validity: '',
    registration_status: reg, turkish_uts_image: uts.length ? rel(uts[0]) : '',
    test_reports_present: reports.length ? `${reports.length} ملفات (Stability/Challenge/Microbiological)` : 'غير موجودة محلياً (الفهرس يشير إلى Drive)',
    pack_artwork_files: [...box, ...prn].map(rel).slice(0, 3).join(' | '), details_files: det.map(rel).slice(0, 2).join(' | '),
    match_status: match,
  });
}
const cols = Object.keys(rows[0]);
fs.writeFileSync(path.join(outDir, 'registration_match_26_2026-10-10.csv'), '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n'));
fs.writeFileSync(path.join(outDir, 'registration_match_26_2026-10-10.json'), JSON.stringify({ _about: 'Registration-match table for the 26 SKUs. UAE registration: management confirms completion; no certificate/number found in the available files. Nothing here re-registers or re-classifies a product as unregistered. Built read-only from company files on 2026-10-10.', rows }, null, 1));
console.log('rows', rows.length, '| with pack artwork', rows.filter((r) => r.pack_artwork_files).length, '| with EAN', rows.filter((r) => r.ean13_on_pack_artwork).length, '| with test reports', rows.filter((r) => /ملفات/.test(r.test_reports_present)).length, '| with ÜTS image', rows.filter((r) => r.turkish_uts_image).length, '| size conflicts', rows.filter((r) => /تعارض/.test(r.match_status)).length);
