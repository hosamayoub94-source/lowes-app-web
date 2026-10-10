// Inventory of original product images (path + pixel size + kind) mapped to SKU by folder keyword. Read-only; no files copied.
const fs = require('fs'); const path = require('path');
const [root, outCsv] = process.argv.slice(2);
const KEY = { 'LW-FC-201': 'غسول البشرة الدهنية', 'LW-FC-202': 'غسول الوجه', 'LW-FC-203': 'تونر الوجه', 'LW-FC-204': 'جل مقشر', 'LW-SR-101': 'فيتامين سي', 'LW-SR-102': 'ريتينول', 'LW-SR-103': 'سيروم البقع', 'LW-SR-104': 'سيروم المرطب', 'LW-SR-105': 'الكولاجين', 'LW-SR-106': 'الهالات', 'LW-SR-107': 'الحبوب', 'LW-SR-108': 'سيروم الرز', 'LW-CR-301': 'كريم المرطب', 'LW-CR-302': 'التبييض', 'LW-CR-303': 'كريم الرز', 'LW-CR-304': 'الريتينال', 'LW-SP-401': 'واقي الشمس زهري', 'LW-SP-402': 'واقي الشمس اورانج', 'LW-MK-501': 'ماسك', 'LW-TN-601': 'تونر الرز', 'LW-BD-701': 'التشققات', 'LW-BD-703': 'القدمين', 'LW-HR-801': 'شامبو', 'LW-HR-802': 'تونر الشعر', 'LW-HR-803': 'سيروم الشعر', 'LW-MN-901': 'اللحية' };
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const dims = (f) => { try { const b = fs.readFileSync(f); if (b.slice(1, 4).toString() === 'PNG') return [b.readUInt32BE(16), b.readUInt32BE(20)]; if (b[0] === 0xff && b[1] === 0xd8) { let i = 2; while (i < b.length) { if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1]; if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)]; i += 2 + b.readUInt16BE(i + 2); } } } catch { /* */ } return [0, 0]; };
const rows = [];
for (const f of walk(root).filter((x) => /\.(png|jpe?g)$/i.test(x))) {
  const rel = path.relative(root, f).split(path.sep).join('/');
  const sku = Object.keys(KEY).find((k) => rel.includes(KEY[k]) && !(k === 'LW-FC-202' && rel.includes('الدهنية')) && !(k === 'LW-SR-104' && rel.includes('الرز')) && !(k === 'LW-CR-301' && rel.includes('الرز')) && !(k === 'LW-FC-203' && rel.includes('الرز')) && !(k === 'LW-SR-101' && false)) || '';
  const [w, h] = dims(f); const kind = (path.basename(f).match(/Photo|Tube|Box|Print|Front|Back/i) || ['other'])[0];
  rows.push({ sku, kind, width: w, height: h, longest_px: Math.max(w, h), path: rel });
}
rows.sort((a, b) => a.sku.localeCompare(b.sku) || b.longest_px - a.longest_px);
const cols = Object.keys(rows[0]);
fs.writeFileSync(outCsv, '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => `"${String(r[c]).replace(/"/g, '""')}"`).join(','))].join('\n'));
const by = {}; rows.forEach((r) => { if (r.sku) by[r.sku] = Math.max(by[r.sku] || 0, r.longest_px); });
console.log('images', rows.length, '| unmatched', rows.filter((r) => !r.sku).length, '| SKUs with image ≥1000px', Object.values(by).filter((v) => v >= 1000).length, '| SKUs with image', Object.keys(by).length);
