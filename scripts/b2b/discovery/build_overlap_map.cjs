// Builds a non-destructive cross-reference between the sales-platform DB and the leads batches 1-3 (matching by website domain, then by normalised name).
// Nothing in the earlier batches is modified or removed. Output: overlap_map CSV + JSON.
// usage: node build_overlap_map.cjs <uaeDataDir> <platformsDir>
const fs = require('fs');
const path = require('path');
const [uaeDir, platDir] = process.argv.slice(2);
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
const norm = (s) => String(s || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9؀-ۿ]+/g, ' ').replace(/\b(pharmacy|pharmacies|uae|online|store|shop|trading|llc|group|the|ae|international|general)\b/g, '').replace(/\s+/g, ' ').trim();
const batches = [
  ['batch1', path.join(uaeDir, 'uae_batch1_2026-10-08.json')],
  ['batch2', path.join(uaeDir, 'discovery_2026-10-08/uae_stores_batch2_2026-10-08.json')],
  ['batch3', path.join(uaeDir, 'discovery_2026-10-08/uae_stores_batch3_2026-10-08.json')],
];
const leads = [];
for (const [b, f] of batches) JSON.parse(fs.readFileSync(f, 'utf8')).rows.forEach((r, i) => leads.push({ batch: b, row: i + 1, name: r.name, website: r.website || '', host: host(r.website), key: norm(r.name), province: r.province, lead_type: r.lead_type, category: r.category, priority: r.priority }));
const j = JSON.parse(fs.readFileSync(path.join(platDir, 'uae_sales_platforms_2026-10-09.json'), 'utf8'));
const ROLE = (r) => r.sale_method === 'direct_seller_registration' ? 'منصة بائعين (تسجيل مباشر)'
  : r.sale_method === 'wholesale_distribution' ? 'موزع / جملة / B2B'
  : r.sale_method === 'supplier_or_brand_application' ? 'قناة مورد/علامة'
  : r.sale_method === 'social_commerce' || r.sale_method === 'own_store_platform' ? 'قناة اجتماعية / متجر ذاتي'
  : /pharm|صيدل/i.test(`${r.channel_type} ${r.name}`) ? 'صيدلية (متجر تجزئة)' : 'متجر تجزئة متعدد العلامات';
const out = [];
for (const r of j.rows) {
  const h = host(r.official_website) || host(r.url_in_source_file);
  const k = norm(r.name);
  const hits = leads.filter((l) => (h && l.host && l.host === h) || (k && l.key && (l.key === k)));
  for (const l of hits) out.push({ platform_name: r.name, platform_tier: r.tier, platform_role: ROLE(r), platform_website: r.official_website, match_basis: (h && l.host === h) ? 'نفس الموقع' : 'نفس الاسم', lead_batch: l.batch, lead_row: l.row, lead_name: l.name, lead_type: l.lead_type, lead_category: l.category, lead_province: l.province, lead_priority: l.priority, relation: ROLE(r).includes('تجزئة') ? 'نفس الجهة: سجل ليدز (عميل/موزع محتمل) + نقطة بيع محتملة' : 'نفس الجهة: سجل ليدز + قناة بيع/توريد — لا تُدمج السجلات' });
}
fs.writeFileSync(path.join(platDir, 'overlap_map_with_leads_batches_2026-10-09.json'), JSON.stringify({ _about: 'Cross-reference only. Earlier lead batches are untouched.', matches: out }, null, 1));
const cols = Object.keys(out[0] || { x: 1 });
fs.writeFileSync(path.join(platDir, 'overlap_map_with_leads_batches_2026-10-09.csv'), '﻿' + [cols.join(','), ...out.map((r) => cols.map((c) => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n'));
const uniq = new Set(out.map((o) => o.platform_name));
console.log('matches', out.length, '| distinct platform entities', uniq.size, '| by role', JSON.stringify(out.reduce((m, o) => ((m[o.platform_role] = (m[o.platform_role] || 0) + 1), m), {})));
