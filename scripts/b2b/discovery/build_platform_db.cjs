// Builds the UAE sales-platform database (Excel + JSON + CSV + report) from audit results + reviewed annotations.
// Nothing here invents data: every URL / fee / requirement is either copied from an audited official page (audit JSON)
// or from annotations.json (each annotation carries its own source URL). Unknown stays empty / «غير معروف».
// usage: node build_platform_db.cjs <outDir> <annotations.json> <audit1.json> [audit2.json ...]
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const [outDir, annFile, ...auditFiles] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const ann = JSON.parse(fs.readFileSync(annFile, 'utf8'));          // { byName: {name:{...}}, exclude: {name:{reason,duplicate_of?}}, aliases: {name:canonicalName} }
const TODAY = '2026-10-09';
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
const UNK = 'غير معروف';

const METHOD_AR = {
  direct_seller_registration: 'تسجيل مباشر كبائع Marketplace',
  supplier_or_brand_application: 'تقديم كمورد / علامة تجارية',
  wholesale_distribution: 'بيع بالجملة / توزيع',
  independent_multibrand_store: 'متجر مستقل متعدد العلامات (اتفاق مورد غير مؤكد)',
  social_commerce: 'قناة تجارة اجتماعية',
  own_store_platform: 'منصة إنشاء متجر خاص بالعلامة',
  not_a_sales_channel: 'ليست قناة بيع',
};

// ── load + merge audits (first file wins for the same host → dedupe across batches) ──
const records = [];
for (const f of auditFiles) for (const r of JSON.parse(fs.readFileSync(f, 'utf8'))) records.push({ ...r, _file: path.basename(f) });
const canonical = (n) => ann.aliases?.[n] || n;
const seenHost = new Map(), seenName = new Map();
const kept = [], excluded = [];
for (const r of records) {
  const name = canonical(r.name);
  const h = host(r.audit?.final_url || r.url) || host(r.url);
  const ex = ann.exclude?.[r.name];
  if (ex) { excluded.push({ name: r.name, url: r.url, reason: ex.reason, kind: ex.kind || 'excluded', duplicate_of: ex.duplicate_of || '' }); continue; }
  const dupKey = seenName.get(name.toLowerCase()) || (h && seenHost.get(h));
  if (dupKey) { excluded.push({ name: r.name, url: r.url, reason: `مكرر — نفس الجهة/الموقع مسجّل كـ«${dupKey}»`, kind: 'duplicate', duplicate_of: dupKey }); continue; }
  seenName.set(name.toLowerCase(), name); if (h) seenHost.set(h, name);
  kept.push({ ...r, name });
}

// ── classify ──
const SELLERISH = /(sell\.|seller|vendor|supplier|partners?\.|\/sell|become-a-|register)/i;
function evidence(r) {
  const a = r.audit || {};
  const ok = (l) => l.http_status >= 200 && l.http_status < 400 && !l.blocked;
  const followed = (r.followed || []).filter(ok);
  const sellerLink = followed.find((l) => SELLERISH.test(l.url) && /seller|vendor|sell on|become|register/i.test(`${l.url} ${l.link_text} ${l.title} ${l.seller_signal_text || ''}`));
  const supplierLink = followed.find((l) => /supplier|suppliers|partnership|partner|brands?|wholesale|b2b|vendor/i.test(`${l.url} ${l.link_text} ${l.title}`));
  /* auto-detected links/fees are NOT trusted (affiliate/brand/product pages match too) — only reviewed annotations may set them */ return { sellerLink: null, supplierLink: null, autoSellerCandidate: sellerLink, autoSupplierCandidate: supplierLink, feeSnippets: [], _unused: followed.flatMap((l) => (l.fee_snippets || []).map((s) => ({ text: s, source: l.url }))).slice(0, 2), followedOk: followed };
}
function verification(r) {
  const a = r.audit || {};
  if (a.fetch_error === 'invalid_url' || (!a.http_status && a.fetch_error)) return ['unreachable', 'الموقع لم يستجب عند الفحص (قد يكون متوقفاً أو يحجب الطلبات الآلية)'];
  if (a.blocked) return ['protected_not_verified', 'الموقع يحجب الفحص الآلي (403/429/تحقق أمني) — لم يُتجاوز. الحالة غير مؤكدة'];
  if (a.http_status >= 200 && a.http_status < 400) return a.uae_signal ? ['verified_active_uae', 'الموقع يعمل ويظهر فيه ما يدل على الإمارات'] : ['active_uae_unconfirmed', 'الموقع يعمل لكن لم يظهر ما يدل على الإمارات بالصفحة الرئيسية'];
  return ['unreachable', `HTTP ${a.http_status}`];
}
const rows = kept.map((r) => {
  const a = r.audit || {}, ev = evidence(r), an = ann.byName?.[r.name] || {};
  const [vstat, vnote] = verification(r);
  const method = an.method || (ev.sellerLink ? 'direct_seller_registration' : ev.supplierLink ? 'supplier_or_brand_application' : 'independent_multibrand_store');
  const methodConfirmed = !!an.method_source || !!ev.sellerLink || !!ev.supplierLink;
  const sellerUrl = an.seller_registration_url || (method === 'direct_seller_registration' ? ev.sellerLink?.url : '') || '';
  const supplierUrl = an.supplier_url || (ev.supplierLink && !sellerUrl ? ev.supplierLink.url : '') || '';
  const fees = an.fees ? { text: an.fees, source: an.fees_source } : ev.feeSnippets[0] ? { text: ev.feeSnippets[0].text, source: ev.feeSnippets[0].source } : null;
  const emirates = an.emirate || 'الإمارات (على مستوى الدولة)';
  const evLevel = an.evidence_level || ((r.audit?.http_status>=200 && r.audit?.http_status<400 && !r.audit?.blocked) ? 'site_active_no_program_page_confirmed' : 'file_claim_only');
  const confirmedDirect = method === 'direct_seller_registration' && !!sellerUrl && evLevel === 'official_page_fetched';
  const status = vstat === 'verified_active_uae' && methodConfirmed ? 'verified' : vstat === 'unreachable' ? 'unreachable' : 'needs_review';
  return {
    name: r.name, country: 'AE', emirate: emirates, city: an.city || '', channel_type: r.channel_type, official_website: a.final_url || r.url, url_in_source_file: r.url,
    sale_method: method, sale_method_ar: METHOD_AR[method], sale_method_confirmed: methodConfirmed,
    seller_registration_url: sellerUrl, supplier_or_partnership_url: supplierUrl,
    accepted_categories: an.categories || UNK, license_requirements: an.license || UNK, license_source: an.license_source || '',
    product_registration_requirements: an.product_reg || UNK, product_reg_source: an.product_reg_source || '',
    fees_commissions: fees ? fees.text : UNK, fees_source: fees ? fees.source : '',
    shipping_fulfilment: an.shipping || UNK, shipping_source: an.shipping_source || '',
    public_business_contact: [...new Set([...(an.contact ? [an.contact] : []), ...((r.followed || []).flatMap((l) => l.emails || [])), ...((a.emails || []))])].slice(0, 4).join(' | ') || UNK,
    site_title: a.title || '', http_status: a.http_status ?? '', uae_signal_on_site: a.uae_signal ?? '', verification_status: vstat, verification_note: vnote,
    evidence_level: evLevel, record_status: status, direct_registration_confirmed: confirmedDirect,
    priority: an.priority || (confirmedDirect ? 'A' : status === 'verified' ? 'B' : status === 'needs_review' ? 'C' : 'D'),
    notes: an.notes || '', claim_from_source_file: r.notes_claim ? `ملاحظة ملف حسام: ${r.notes_claim}` : '',
    sources: [...new Set([a.final_url || r.url, ...(r.followed || []).filter((l) => l.http_status >= 200 && l.http_status < 400).map((l) => l.url), ...(an.sources || [])])].filter(Boolean).join(' | '),
    origin: r.origin || (r.n && r.n < 100 ? 'ملف حسام (51)' : ''), verified_at: TODAY,
  };
});

// ── outputs ──
const by = (f) => rows.filter(f);
const sheets = {
  'كل الجهات': rows,
  'تسجيل بائع مباشر': by((r) => r.direct_registration_confirmed),
  'اتفاق مورد أو علامة': by((r) => ['supplier_or_brand_application', 'wholesale_distribution', 'independent_multibrand_store'].includes(r.sale_method) && !r.direct_registration_confirmed),
  'غير مؤكد - مراجعة': by((r) => r.record_status !== 'verified'),
  'المستبعد والمكرر': excluded,
};
const wb = XLSX.utils.book_new();
for (const [n, data] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.length ? data : [{ note: 'لا شيء' }]), n.slice(0, 31));
const stats = {
  generated_at: TODAY, input_records: records.length, kept: rows.length, excluded_total: excluded.length,
  excluded_duplicates: excluded.filter((e) => e.kind === 'duplicate').length, excluded_not_channel_or_other: excluded.filter((e) => e.kind !== 'duplicate').length,
  verified: by((r) => r.record_status === 'verified').length, needs_review: by((r) => r.record_status === 'needs_review').length, unreachable: by((r) => r.record_status === 'unreachable').length,
  direct_seller_registration_confirmed: by((r) => r.direct_registration_confirmed).length,
  supplier_agreement_required: by((r) => r.sale_method !== 'direct_seller_registration' && r.sale_method !== 'social_commerce' && r.sale_method !== 'own_store_platform' && r.sale_method !== 'not_a_sales_channel').length,
  protected_not_verified: by((r) => r.verification_status === 'protected_not_verified').length,
  with_official_fee_source: by((r) => r.fees_source).length, with_license_req_source: by((r) => r.license_source).length, with_product_reg_source: by((r) => r.product_reg_source).length,
  by_method: Object.fromEntries(Object.entries(rows.reduce((m, r) => ((m[r.sale_method] = (m[r.sale_method] || 0) + 1), m), {}))),
};
XLSX.writeFile(wb, path.join(outDir, 'LOWES_UAE_Sales_Platforms_Verified_2026-10-09.xlsx'));
fs.writeFileSync(path.join(outDir, 'uae_sales_platforms_2026-10-09.json'), JSON.stringify({ _about: 'UAE sales platforms/channels (D-119 research). NOT imported. Unknown = «غير معروف». Fees/requirements only where an official page or cited source exists.', stats, rows, excluded }, null, 1));
const csv = (data, cols) => '﻿' + [cols.join(','), ...data.map((r) => cols.map((c) => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
const cols = Object.keys(rows[0] || {});
fs.writeFileSync(path.join(outDir, 'uae_sales_platforms_2026-10-09.csv'), csv(rows, cols));
fs.writeFileSync(path.join(outDir, 'uae_sales_platforms_excluded_2026-10-09.csv'), csv(excluded, ['name', 'url', 'kind', 'reason', 'duplicate_of']));
fs.writeFileSync(path.join(outDir, 'stats.json'), JSON.stringify(stats, null, 1));
console.log(JSON.stringify(stats, null, 1));
