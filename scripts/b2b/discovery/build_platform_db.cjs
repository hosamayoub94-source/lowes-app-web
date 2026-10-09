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

// Only generic business-role mailboxes are auto-kept (never named staff, never media/press); curated annotation contacts are kept as written.
const ROLE_MAIL = /^(info|sales|support|contact|sellers?|partnerships?|partners?|business\.?development|bd|team|suppliers?|vendors?|procurement|buying|wholesale|b2b|hello|enquiries|inquiries|trade|merchant|care|customercare)@/i;
function bizContacts(an, r, a) {
  const auto = [...((r.followed || []).flatMap((l) => l.emails || [])), ...((a.emails || []))].filter((e) => ROLE_MAIL.test(e) && !/^(media|press|careers|hr|jobs)@/i.test(e));
  const parts = [...(an.contact ? String(an.contact).split(/\s*\|\s*/) : []), ...auto];
  const seen = new Set(), out = [];
  for (const p of parts) { const k = p.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(p); } }
  return out.slice(0, 4).join(' | ') || UNK;
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
    public_business_contact: bizContacts(an, r, a),
    site_title: a.title || '', http_status: a.http_status ?? '', uae_signal_on_site: a.uae_signal ?? '', verification_status: vstat, verification_note: vnote,
    evidence_level: evLevel, beauty_signal: /(skin|beauty|cosmetic|pharmac|derma|hair|makeup|make-up|k-?beauty|perfume|fragrance|عناية|تجميل|صيدلية|بشرة)/i.test(`${a.title || ''} ${a.desc || ''} ${r.name}`), unsuitable_reason: an.unsuitable || '', tier_override: an.tier || '', _batch: r._file ? r._file.replace(/^audit_?|\.json$/g, '') : '', record_status: status, direct_registration_confirmed: confirmedDirect,
    priority: an.priority || (confirmedDirect ? 'A' : status === 'verified' ? 'B' : status === 'needs_review' ? 'C' : 'D'),
    notes: an.notes || '', claim_from_source_file: r.notes_claim ? `ملاحظة ملف حسام: ${r.notes_claim}` : '',
    sources: [...new Set([a.final_url || r.url, ...(r.followed || []).filter((l) => l.http_status >= 200 && l.http_status < 400).map((l) => l.url), ...(an.sources || [])])].filter(Boolean).join(' | '),
    _guessed: !!(r.n && r.n >= 100), origin: r.origin || (r.n && r.n < 100 ? 'ملف حسام (51)' : ''), verified_at: TODAY,
  };
});

// ── tiers ──
const ACTIVE = (r) => r.http_status >= 200 && r.http_status < 400 && r.verification_status !== 'protected_not_verified';
function tierOf(r) {
  if (r.tier_override) return [r.tier_override, 'تصنيف بعد مراجعة يدوية للصفحات: ' + (r.notes || '')];
  if (r.unsuitable_reason) return ['E', r.unsuitable_reason];
  if (r.direct_registration_confirmed) return ['A', 'تسجيل بائع مباشر موثّق من صفحة رسمية'];
  if (r.sale_method === 'wholesale_distribution' && r.record_status === 'verified') return ['B', 'قناة جملة/توزيع/B2B بمسار رسمي موثّق'];
  if (['wholesale_distribution'].includes(r.sale_method) && ACTIVE(r)) return ['B', 'جملة/توزيع — الموقع يعمل، المسار الرسمي يحتاج تأكيداً'];
  if (['supplier_or_brand_application', 'independent_multibrand_store'].includes(r.sale_method) && ACTIVE(r) && (r.beauty_signal || r.record_status === 'verified')) return ['C', r.sale_method === 'supplier_or_brand_application' ? 'مسار مورد/علامة رسمي أو شراكة — القبول غير مؤكد' : 'متجر/صيدلية فعّال — يحتاج اتفاق مورد (غير مؤكد)'];
  if (r.sale_method === 'social_commerce' || r.sale_method === 'own_store_platform') return ['D', 'قناة مملوكة/اجتماعية — إتاحتها للإمارات تحتاج تأكيداً'];
  return ['D', ACTIVE(r) ? 'الموقع يعمل لكن لا دليل على بيع تجميل/عناية — يحتاج تحققاً' : r.verification_status === 'protected_not_verified' ? 'الموقع يحجب الفحص الآلي — يحتاج مراجعة يدوية (لا يعني أنه غير نشط)' : 'لم يستجب الموقع آلياً — لا يعني أنه غير موجود، يحتاج مراجعة يدوية'];
}
rows.forEach((r) => { if (r.verification_status === 'unreachable' && r._guessed) { r.url_guess_not_verified = r.official_website; r.official_website = ''; r.url_in_source_file = ''; } const [t, why] = tierOf(r); r.tier = t; r.tier_reason = why; r.manual_review_needed = r.tier === 'D' || r.evidence_level === 'official_page_blocked_secondary_sources'; });
const TIER_AR = { A: 'A — تسجيل بائع مباشر', B: 'B — B2B / جملة / توزيع', C: 'C — يتطلب اتفاق مورد', D: 'D — يحتاج تحققاً إضافياً', E: 'E — غير مناسب / مستبعد' };
const prioScore = (r) => ({ A: 0, B: 1, C: 2, D: 3, E: 4 }[r.tier]) * 10 + ({ A: 0, B: 1, C: 2, D: 3 }[r.priority] ?? 3);
const startList = rows.filter((r) => ['A', 'B', 'C'].includes(r.tier) && r.record_status === 'verified' || r.tier === 'A').sort((a, b) => prioScore(a) - prioScore(b));
const manual = rows.filter((r) => r.manual_review_needed).map((r) => ({ name: r.name, tier: r.tier, url_to_open_manually: r.seller_registration_url || r.supplier_or_partnership_url || r.url_in_source_file || r.official_website, why_manual: r.tier_reason, http_status: r.http_status, verification_status: r.verification_status, claim_from_source_file: r.claim_from_source_file, notes: r.notes }));

// ── outputs ──
const by = (f) => rows.filter(f);
const tierRows = (t) => by((r) => r.tier === t);
const sheets = {
  'كل الجهات': rows,
  'A تسجيل مباشر': tierRows('A'), 'B جملة وB2B': tierRows('B'), 'C اتفاق مورد': tierRows('C'), 'D تحقق إضافي': tierRows('D'),
  'E مستبعد': [...tierRows('E'), ...excluded.map((e) => ({ name: e.name, url: e.url, kind: e.kind, reason: e.reason, duplicate_of: e.duplicate_of }))],
  'قائمة البدء': startList.map((r, i) => ({ rank: i + 1, name: r.name, tier: r.tier, why: r.tier_reason, url: r.seller_registration_url || r.supplier_or_partnership_url || r.official_website, contact: r.public_business_contact, fees: r.fees_commissions, notes: r.notes })),
  'مراجعة يدوية': manual,
};
const wb = XLSX.utils.book_new();
for (const [n, data] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.length ? data : [{ note: 'لا شيء' }]), n.slice(0, 31));
const cnt = (f) => rows.filter(f).length;
const stats = {
  generated_at: TODAY, input_records: records.length, kept: rows.length, excluded_total: excluded.length,
  excluded_duplicates: excluded.filter((e) => e.kind === 'duplicate').length, excluded_not_channel_or_other: excluded.filter((e) => e.kind !== 'duplicate').length,
  tiers: { A: cnt((r) => r.tier === 'A'), B: cnt((r) => r.tier === 'B'), C: cnt((r) => r.tier === 'C'), D: cnt((r) => r.tier === 'D'), E_in_rows: cnt((r) => r.tier === 'E'), E_excluded_list: excluded.length },
  verified: cnt((r) => r.record_status === 'verified'), needs_review: cnt((r) => r.record_status === 'needs_review'), unreachable: cnt((r) => r.record_status === 'unreachable'),
  direct_seller_registration_confirmed: cnt((r) => r.direct_registration_confirmed),
  supplier_agreement_required: cnt((r) => r.tier === 'C'),
  protected_not_verified: cnt((r) => r.verification_status === 'protected_not_verified'),
  manual_review: manual.length,
  with_official_fee_source: cnt((r) => r.fees_source), with_license_req_source: cnt((r) => r.license_source), with_product_reg_source: cnt((r) => r.product_reg_source),
  by_method: Object.fromEntries(Object.entries(rows.reduce((m, r) => ((m[r.sale_method] = (m[r.sale_method] || 0) + 1), m), {}))),
  by_origin_batch: Object.fromEntries(Object.entries(rows.reduce((m, r) => ((m[r._batch || '?'] = (m[r._batch || '?'] || 0) + 1), m), {}))),
};
XLSX.writeFile(wb, path.join(outDir, 'LOWES_UAE_Sales_Platforms_Verified_2026-10-09.xlsx'));
fs.writeFileSync(path.join(outDir, 'uae_sales_platforms_2026-10-09.json'), JSON.stringify({ _about: 'UAE sales platforms/channels (D-119 research). NOT imported. Unknown = «غير معروف». Fees/requirements only where an official page or cited source exists.', tiers_legend: TIER_AR, stats, rows, excluded, start_list: startList.map((r) => r.name), manual_review: manual }, null, 1));
const csv = (data, cols) => '\uFEFF' + [cols.join(','), ...data.map((r) => cols.map((c) => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
const cols = Object.keys(rows[0] || {});
fs.writeFileSync(path.join(outDir, 'uae_sales_platforms_2026-10-09.csv'), csv(rows, cols));
fs.writeFileSync(path.join(outDir, 'uae_sales_platforms_excluded_2026-10-09.csv'), csv(excluded, ['name', 'url', 'kind', 'reason', 'duplicate_of']));
fs.writeFileSync(path.join(outDir, 'uae_sales_platforms_manual_review_2026-10-09.csv'), csv(manual, ['name', 'tier', 'url_to_open_manually', 'why_manual', 'http_status', 'verification_status', 'claim_from_source_file', 'notes']));
fs.writeFileSync(path.join(outDir, 'uae_sales_platforms_start_list_2026-10-09.csv'), csv(sheets['قائمة البدء'], ['rank', 'name', 'tier', 'why', 'url', 'contact', 'fees', 'notes']));
fs.writeFileSync(path.join(outDir, 'stats.json'), JSON.stringify(stats, null, 1));
console.log(JSON.stringify(stats, null, 1));
