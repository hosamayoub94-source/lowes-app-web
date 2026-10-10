// One matrix of missing fields per SKU (to avoid repeated questions to management). Sources: drafts, registration match, image inventory.
const fs = require('fs'); const path = require('path');
const dir = process.argv[2];
const parse = (t) => { const rows = []; let cur = [], f = '', q = false; t = t.replace(/^﻿/, ''); for (let i = 0; i < t.length; i++) { const c = t[i]; if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; } else if (c === '"') q = true; else if (c === ',') { cur.push(f); f = ''; } else if (c === '\n') { cur.push(f); rows.push(cur); cur = []; f = ''; } else if (c !== '\r') f += c; } if (f || cur.length) { cur.push(f); rows.push(cur); } return rows; };
const im = parse(fs.readFileSync(path.join(dir, 'listings/original_image_inventory_2026-10-10.csv'), 'utf8')); const h = im.shift(); const I = im.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]])));
const best = {}; I.forEach((r) => { if (r.sku && (!best[r.sku] || +r.longest_px > +best[r.sku].longest_px)) best[r.sku] = r; });
const drafts = JSON.parse(fs.readFileSync(path.join(dir, 'listings/listing_drafts_22_2026-10-10.json'), 'utf8')).products;
const reg = JSON.parse(fs.readFileSync(path.join(dir, 'registration/registration_match_26_2026-10-10.json'), 'utf8')).rows;
const vc = { sku: 'LW-SR-101', title_en: 'Vitamin C Serum', ean13_on_pack: '8684272100419', inci_from_pack: 'x', batch_on_artwork: 'LWC 004', expiry_on_artwork: '30.06.2028' };
const OK = 'موجود', NO = 'ناقص';
const rows = [vc, ...drafts].map((p) => {
  const b = best[p.sku]; const r = reg.find((x) => x.sku === p.sku) || {};
  const m = { sku: p.sku, product: (p.title_en || '').replace("LOWE'S Profesyonel ", ''),
    EAN_from_pack: p.ean13_on_pack ? OK : NO, INCI_from_pack: p.inci_from_pack ? 'مقروء آلياً — يُدقَّق بصرياً' : NO, batch_expiry_artwork: p.batch_on_artwork && String(p.batch_on_artwork).trim() ? OK : NO,
    original_image_px: b ? b.longest_px : NO, original_image_path: b ? b.path : '', pack_artwork_file: r.pack_artwork_files ? OK : NO,
    uae_price: NO, registration_proof: NO, label_company_role: NO, gs1_license: NO };
  m.missing_count = Object.values(m).filter((v) => v === NO).length; return m;
}).sort((a, b) => a.missing_count - b.missing_count);
const cols = Object.keys(rows[0]);
fs.writeFileSync(path.join(dir, 'listings/missing_fields_matrix_2026-10-10.csv'), '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => `"${String(r[c]).replace(/"/g, '""')}"`).join(','))].join('\n'));
const c = {}; rows.forEach((r) => ['EAN_from_pack', 'INCI_from_pack', 'batch_expiry_artwork', 'pack_artwork_file'].forEach((k) => { if (r[k] === NO) c[k] = (c[k] || 0) + 1; })); console.log(rows.length, 'rows; missing counts:', c);
