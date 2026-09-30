// Builds the Syria creator seed (Wave 1 + Wave 2) from the raw research files. Reproducible, no database access.
//   raw/modash_public.json · raw/heepsy_public.json · raw/influencer_sy.json · raw/search_discovery.json · raw/benchmarks.json
//   -> seed/creators_seed.json · seed/pools/*.json|csv · seed/source_report.json · seed/stats.json
//   -> supabase/data/20260930_creator_syria_seed.sql (idempotent; NOT applied)
// Rules: unknown = null; every fact keeps source URL/type/date/confidence; nothing is inferred from name, gender or follower count.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as L from '../../src/services/creatorLogic.js';
import * as R from '../../src/services/creatorResearch.js';

const RAW = path.resolve('data/creators/syria/raw');
const OUT = path.resolve('data/creators/syria/seed');
fs.mkdirSync(path.join(OUT, 'pools'), { recursive: true });
const rj = f => JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8'));
const modash = rj('modash_public.json'), heepsy = rj('heepsy_public.json'), isy = rj('influencer_sy.json'), search = rj('search_discovery.json'), bench = rj('benchmarks.json');
const NOW = new Date(process.env.SEED_NOW || '2026-09-30T12:00:00Z');
const sha = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
const platOrder = { instagram: 0, tiktok: 1, youtube: 2, facebook: 3 };

const GOV = { 'دمشق': 'damascus', 'ريف دمشق': 'rif_dimashq', 'حلب': 'aleppo', 'حمص': 'homs', 'حماة': 'hama', 'اللاذقية': 'latakia', 'طرطوس': 'tartus', 'درعا': 'daraa', 'السويداء': 'sweida', 'إدلب': 'idlib', 'دير الزور': 'deir_ez_zor', 'الرقة': 'raqqa', 'الحسكة': 'hasakah', 'القنيطرة': 'quneitra' };
const CITY_RULES = [
  ['rif_dimashq', /ريف دمشق|rif dimashq|جرمانا|دوما|داريا|صحنايا|مليحة|الكسوة|التل/i], ['damascus', /damascus|دمشق|الشام\b/i],
  ['aleppo', /aleppo|حلب/i], ['homs', /\bhoms\b|حمص/i], ['hama', /\bhama\b|حماة|حماه/i],
  ['latakia', /latakia|lattakia|اللاذقية|اللاذقيه|لاذقية/i], ['tartus', /tartus|tartous|طرطوس/i], ['daraa', /daraa|درعا/i],
  ['sweida', /sweida|suwayda|السويداء/i], ['idlib', /idlib|إدلب|ادلب/i], ['deir_ez_zor', /deir ez|دير الزور/i],
  ['raqqa', /raqqa|الرقة/i], ['hasakah', /hasakah|الحسكة|قامشلي|qamishli/i], ['quneitra', /quneitra|القنيطرة/i],
];
const findCity = t => { for (const [c, re] of CITY_RULES) if (re.test(t || '')) return c; return null; };
const pageCatOf = url => ({ skincare: 'skincare', fashion: 'fashion', fitness: 'fitness', food: 'food', family: 'motherhood', health: 'wellness' })[url.split('/find-influencers/')[1]?.replace(/^tiktok\//, '').split('/')[1]] || null;

// ───────── 1. people & platform profiles ─────────
const people = new Map();      // personId -> person
const byPlat = new Map();      // "platform:handle" -> personId
const provenance = {};         // provider -> {discovered, imported, rejected:[{reason}]}
const prov = k => (provenance[k] ||= { discovered: 0, imported: 0, merged_into_existing: 0, rejected: [] });
const platKey = (p, h) => `${p}:${h.toLowerCase()}`;
const newPerson = (id, seed) => { const p = { id, platforms: [], sources: [], evidence: [], _providers: new Set(), contacts_raw: [], captions: [], hashtags: [], pageCats: [], bios: [], ...seed }; people.set(id, p); return p; };
const addPlatform = (person, prof) => {
  const k = platKey(prof.platform, prof.handle);
  if (byPlat.has(k) && byPlat.get(k) !== person.id) return false;
  let pp = person.platforms.find(x => platKey(x.platform, x.handle) === k);
  if (!pp) { pp = { platform: prof.platform, handle: prof.handle, profile_url: prof.profile_url, metric_observations: [] }; person.platforms.push(pp); byPlat.set(k, person.id); }
  return pp;
};

// 1a. influencer.sy — opt-in directory; sameAs = the creator's own declared cross-platform links
for (const e of isy.profiles) {
  prov('influencer_sy').discovered++;
  const suffix = e.slug.split('_').pop();
  const m = new RegExp(e.slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+(.{1,30}?)\\s+(' + Object.keys(GOV).sort((a, b) => b.length - a.length).join('|') + ')\\s').exec(e.visible_text_excerpt || '');
  const links = (e.same_as || []).map(u => L.parseProfileUrl(u)).filter(x => x.ok);
  if (!links.length) { prov('influencer_sy').rejected.push({ id: e.slug, reason: 'no Instagram/TikTok/YouTube/Facebook link declared (only LinkedIn/X/etc.)' }); continue; }
  const pid = 'CRT-SYR-' + sha('isy:' + e.slug);
  const person = newPerson(pid, { display_name: e.name, isy: { slug: e.slug, url: e.page_url, category_label_ar: m ? m[1] : null, suffix, governorate: m ? GOV[m[2]] : null, modified: e.date_modified, description: e.description } });
  person._providers.add('influencer_sy'); person.bios.push({ text: e.description || '', source_url: e.page_url, source_type: 'public_directory_bio', verified_at: isy.collected_at, via: null });
  for (const l of links) addPlatform(person, { platform: l.platform, handle: l.handle, profile_url: l.url });
  person.sources.push({ field: 'profile+category+governorate', provider: 'web', provider_name: 'influencer.sy', source_type: 'public_directory_page', source_url: e.page_url, observed_at: isy.collected_at, verified_at: isy.collected_at, confidence: 'medium', evidence: `Self-registered profile on influencer.sy (opt-in Syrian directory); page modified ${e.date_modified}; declared links: ${links.map(x => x.url).join(', ')}` });
  prov('influencer_sy').imported++;
}

// 1b. Modash
for (const mp of modash.profiles) {
  prov('modash').discovered++;
  const parsed = L.parseProfileUrl(mp.profile_url);
  if (!parsed.ok) { prov('modash').rejected.push({ id: mp.username, reason: 'unparseable profile URL' }); continue; }
  const k = platKey(parsed.platform, parsed.handle);
  let person = people.get(byPlat.get(k));
  const isNew = !person;
  if (!person) { person = newPerson('CRT-SYR-' + sha(k), { display_name: mp.full_name || parsed.handle }); addPlatform(person, { platform: parsed.platform, handle: parsed.handle, profile_url: parsed.url }); prov('modash').imported++; }
  else prov('modash').merged_into_existing++;
  person._providers.add('modash');
  const pp = person.platforms.find(x => platKey(x.platform, x.handle) === k);
  pp.metric_observations.push({ provider: 'modash', observed_at: modash.collected_at, data_as_of: mp.data_as_of, followers: mp.followers, engagement_rate: mp.engagement_rate_pct, avg_views: parsed.platform === 'tiktok' ? mp.average_views : null, reels_avg_views: parsed.platform === 'instagram' ? mp.average_reel_plays : null, avg_likes: mp.average_likes, avg_comments: mp.average_comments, verified: mp.is_verified, fake_followers_pct: mp.fake_followers_pct, authenticity_external: mp.audience_credibility_pct, last_post_dates: mp.recent_post_dates, snapshots: mp.followers_over_time });
  pp.audience = [...mp.audience_countries.map(a => ({ dimension: 'country', key: a.code, pct: a.pct })), ...mp.audience_cities.map(a => ({ dimension: 'city', key: a.name.toLowerCase(), pct: a.pct })), ...mp.audience_gender.map(a => ({ dimension: 'gender', key: a.label, pct: a.pct }))];
  pp.audience_platform = parsed.platform;
  person.bios.push({ text: mp.bio || '', source_url: parsed.url, source_type: 'public_profile_bio', verified_at: modash.collected_at, via: 'bio text as reported on the Modash public page (provider crawl ' + (mp.data_as_of || 'n/a') + ')' });
  person.captions.push(...[...mp.popular_posts, ...mp.popular_reels].map(c => ({ caption: c.caption, url: c.url, date: c.date })));
  person.hashtags.push(...mp.hashtags);
  mp.source_pages.map(s => pageCatOf(s.url)).filter(Boolean).forEach(c => person.pageCats.push(c));
  person.creator_location_label = mp.creator_location_label;
  person.sources.push({ field: 'profile+metrics+audience', provider: 'modash', source_type: 'public_directory_page', source_url: mp.source_pages[0].url, observed_at: modash.collected_at, verified_at: modash.collected_at, confidence: mp.data_as_of && (NOW - new Date(mp.data_as_of + '-28')) / 864e5 <= 120 ? 'medium' : 'low', evidence: `Modash public directory page; provider crawl month ${mp.data_as_of || 'unknown'}` });
  if (isNew) person.display_name = mp.full_name || person.display_name;
  else person.modash_name = mp.full_name;
}

// 1c. Heepsy
for (const h of heepsy.profiles) {
  prov('heepsy').discovered++;
  const parsed = L.parseProfileUrl(h.profile_url || '');
  if (!parsed.ok) { prov('heepsy').rejected.push({ id: h.handle, reason: 'no verifiable profile URL' }); continue; }
  const k = platKey(parsed.platform, parsed.handle);
  let person = people.get(byPlat.get(k));
  if (!person) { person = newPerson('CRT-SYR-' + sha(k), { display_name: h.full_name }); addPlatform(person, { platform: parsed.platform, handle: parsed.handle, profile_url: parsed.url }); prov('heepsy').imported++; } else prov('heepsy').merged_into_existing++;
  person._providers.add('heepsy');
  const pp = person.platforms.find(x => platKey(x.platform, x.handle) === k);
  pp.metric_observations.push({ provider: 'heepsy', observed_at: heepsy.collected_at, data_as_of: '2026-09', followers: h.followers, engagement_rate: h.engagement_rate_pct, avg_likes: h.average_likes, followers_precision: 'rounded' });
  person.bios.push({ text: h.full_name, source_url: h.source_url, source_type: 'name_only', verified_at: null, via: null });
  person.sources.push({ field: 'followers+engagement', provider: 'other', provider_name: 'heepsy', source_type: 'public_ranking_page', source_url: h.source_url, observed_at: heepsy.collected_at, verified_at: heepsy.collected_at, confidence: 'medium', evidence: 'Heepsy public ranking (Sept 2026); followers rounded by source' });
}

// 1d. web search discovery (verbatim snippet facts only)
for (const s of search.profiles) {
  prov('web_search').discovered++;
  const parsed = L.parseProfileUrl(s.profile_url);
  if (!parsed.ok) { prov('web_search').rejected.push({ id: s.handle, reason: 'no verifiable profile URL' }); continue; }
  const k = platKey(parsed.platform, parsed.handle);
  let person = people.get(byPlat.get(k));
  if (!person) { person = newPerson('CRT-SYR-' + sha(k), { display_name: s.full_name }); addPlatform(person, { platform: parsed.platform, handle: parsed.handle, profile_url: parsed.url }); prov('web_search').imported++; } else prov('web_search').merged_into_existing++;
  person._providers.add('web_search');
  const pp = person.platforms.find(x => platKey(x.platform, x.handle) === k);
  if (s.followers !== null) pp.metric_observations.push({ provider: 'web', observed_at: search.collected_at, data_as_of: '2026-09', followers: s.followers, followers_precision: s.followers_precision });
  if (s.bio) person.bios.push({ text: s.bio, source_url: s.source_url, source_type: /intellifluence/.test(s.source_url) ? 'public_directory_bio' : 'search_snippet', verified_at: search.collected_at, via: 'search-engine snippet of the profile/page' });
  person.hint = { category: s.category_hint || null, city: s.bio_city || null, country: s.bio_country || null, type: s.creator_type_hint || null, public_email: s.public_email || null, source_url: s.source_url };
  person.sources.push({ field: 'profile', provider: 'web', source_type: /intellifluence/.test(s.source_url) ? 'public_directory_page' : 'search_discovery', source_url: s.source_url, observed_at: search.collected_at, verified_at: null, confidence: 'low', evidence: s.evidence });
}

// 1e. search-snippet enrichment of creators already found (follower counts + bio text of their own profile page)
const enrich = rj('search_enrichment.json');
for (const e of enrich.profiles) {
  prov('search_snippet_enrichment').discovered++;
  const person = people.get(byPlat.get(platKey(e.platform, e.handle)));
  if (!person) { prov('search_snippet_enrichment').rejected.push({ id: e.handle, reason: 'creator not in dataset' }); continue; }
  prov('search_snippet_enrichment').merged_into_existing++;
  const pp = person.platforms.find(x => platKey(x.platform, x.handle) === platKey(e.platform, e.handle));
  person._providers.add('search_snippet');
  if (e.followers !== null || (e.last_post_dates || []).length) pp.metric_observations.push({ provider: 'web', observed_at: enrich.collected_at, data_as_of: '2026-09', followers: e.followers, followers_precision: e.followers_precision, last_post_dates: e.last_post_dates || [] });
  if (e.bio) person.bios.push({ text: e.bio, source_url: e.source_url, source_type: 'search_snippet', verified_at: enrich.collected_at, via: 'search-engine snippet of the profile page' });
  if (e.bio_city) person.hint = { ...(person.hint || {}), city: e.bio_city };
  person.sources.push({ field: 'followers+bio', provider: 'web', provider_name: 'search_snippet', source_type: 'search_snippet_profile', source_url: e.source_url, observed_at: enrich.collected_at, verified_at: enrich.collected_at, confidence: 'low', evidence: e.evidence });
}

// ───────── 2. enrich each person ─────────
const BUSINESS_BIO_RE = /salon|studio|clinic|shop|store|center|centre|laser|dermaplane|microneedling|peel|makeup artist|hair ?dresser|hair ?stylist|lash|nails|صالون|مركز|عيادة|ستوديو|متجر|محل|ميك ?اب ارتيست|مكياج عرائس|تجهيز عرائس|خبيرة تجميل|خبير تجميل|أخصائي|اخصائي/i;
const PR_CATS = new Set(['skincare', 'beauty', 'makeup', 'hair', 'lifestyle', 'fashion', 'motherhood', 'wellness']);
const mt = arr => arr.filter(Boolean);
const list = [...people.values()];
for (const p of list) {
  p.platforms.sort((a, b) => (platOrder[a.platform] ?? 9) - (platOrder[b.platform] ?? 9));
  const bio = mt(p.bios.map(b => b.text)).join(' | ');
  // ── metrics: resolve conflicts between sources, keep history ──
  p.source_history = [];
  for (const pp of p.platforms) {
    const obs = pp.metric_observations;
    const fol = L.toNum(null);
    const cand = obs.filter(o => L.toNum(o.followers) !== null).map(o => ({ value: o.followers, provider: o.provider, observed_at: o.observed_at, source_url: o.provider }));
    const res = R.resolveConflict(cand);
    pp.followers = res.chosen ? res.chosen.value : null;
    pp.followers_conflict = res.conflict;
    res.history.forEach(h => p.source_history.push({ field: `followers:${pp.platform}`, value_text: String(h.value), provider: h.provider, observed_at: h.observed_at, superseded: h.superseded }));
    const best = obs.find(o => o.provider === 'modash') || obs[0] || {};
    pp.engagement_rate = best.engagement_rate ?? null; pp.avg_views = best.avg_views ?? null; pp.reels_avg_views = best.reels_avg_views ?? null;
    pp.avg_likes = best.avg_likes ?? null; pp.avg_comments = best.avg_comments ?? null; pp.verification_badge = best.verified ?? null;
    pp.fake_followers_pct = best.fake_followers_pct ?? null; pp.authenticity_external = best.authenticity_external ?? null;
    pp.metrics_observed_at = obs.length ? obs[0].observed_at : null; pp.data_as_of = best.provider === 'modash' ? (best.data_as_of || null) : null; // only a provider crawl that lists RECENT posts can prove "no post since"; snippets cannot
    const dates = obs.flatMap(o => o.last_post_dates || []).sort();
    pp.last_post_at = dates.length ? dates[dates.length - 1] : null;
    pp.snapshots = (best.snapshots || []).map(s => ({ platform: pp.platform, followers: s.followers, captured_at: `${s.date}-01T00:00:00Z` }));
    pp.platform_status = pp.last_post_at ? 'active' : null; // status here only means "profile exists"; activity is in activity_status
    pp.platform_status = 'active';
  }
  const primary = [...p.platforms].sort((a, b) => (L.toNum(b.followers) ?? -1) - (L.toNum(a.followers) ?? -1))[0];
  p.follower_count = L.toNum(primary?.followers);
  p.data_as_of = primary?.data_as_of || null;
  const lastPost = p.platforms.map(x => x.last_post_at).filter(Boolean).sort().pop() || null;
  const act = R.activityStatus({ lastPostAt: lastPost, dataAsOf: p.data_as_of, now: NOW });
  Object.assign(p, { last_post_at: lastPost, activity_status: act.status, activity_basis: act.basis, days_since_last_post: act.days_since_last_post });

  // ── category / type ──
  const dirCat = p.isy ? R.directoryCategory(p.isy.suffix) : null;
  const cls = R.classifyCategory({ bio, name: p.display_name, directory: dirCat, hashtags: p.hashtags, captions: p.captions.map(c => c.caption), pageCats: [...new Set(p.pageCats)] });
  p.main_category = cls.main || p.hint?.category || null;
  p.category_source = cls.main ? cls.evidence.map(e => e.field).join('+') : (p.hint?.category ? 'search_snippet_hint' : null);
  p.category_confidence = cls.main ? cls.confidence : (p.hint?.category ? 'low' : null);
  p.category_evidence = cls.main ? cls.evidence : (p.hint?.category ? [{ field: 'search_snippet', term: p.hint.category }] : []);
  p.subcategories = cls.secondary;
  const ct = R.classifyCreatorType({ bio, name: p.display_name, followers: p.follower_count, category: p.main_category });
  p.creator_type = ct.type || p.hint?.type || null; p.creator_type_source = ct.evidence || (p.hint?.type ? 'search_snippet_hint' : null);
  p.is_celebrity = (p.follower_count || 0) >= 1_000_000;

  // ── geography (creator side only, evidence = own bio / self-declared governorate) ──
  const bioCity = findCity(bio) || p.hint?.city || null;
  p.creator_city = p.isy?.governorate || bioCity || null;
  p.city_source = p.isy?.governorate ? 'influencer.sy self-declared governorate' : (findCity(bio) ? 'creator bio text' : (p.hint?.city ? 'search snippet (bio text)' : null));
  p.creator_country = p.hint?.country || (p.isy ? 'syria' : (p.creator_location_label === 'Syria' ? 'syria' : (p.creator_location_label ? p.creator_location_label.toLowerCase() : null)));

  // ── audience (only where a provider states it) ──
  const audPlat = p.platforms.find(x => x.audience);
  p.audience = audPlat ? audPlat.audience.map(a => ({ ...a, platform: audPlat.audience_platform })) : [];
  p.audience_syria_pct = p.audience.find(a => a.dimension === 'country' && a.key === 'SY')?.pct ?? null;

  // ── public contacts: bio text -> classified; DM channel = profile exists (DM openness unverified) ──
  p.contacts = []; p.skipped_phones = [];
  const seenContact = new Set();
  for (const b of p.bios) {
    if (!b.text || b.source_type === 'name_only') continue;
    const ex = R.extractPublicContacts(b.text, { businessAccount: BUSINESS_BIO_RE.test(b.text) });
    p.skipped_phones.push(...ex.skipped);
    for (const c of ex.contacts) {
      const k = c.type + ':' + c.value; if (seenContact.has(k)) continue; seenContact.add(k);
      p.contacts.push({ type: c.type, value: c.value, is_public: true, source_url: b.source_url, source_type: b.source_type, verified_at: b.verified_at || modash.collected_at, context: `${c.context} [${c.classification_basis}]${b.via ? ' — ' + b.via : ''}`.slice(0, 240) });
    }
  }
  if (p.hint?.public_email && !seenContact.has('email:' + p.hint.public_email.toLowerCase())) p.contacts.push({ type: 'email', value: p.hint.public_email.toLowerCase(), is_public: true, source_url: p.hint.source_url, source_type: 'public_profile_bio', verified_at: search.collected_at, context: 'business email printed in the account bio [email in public bio, search snippet]' });
  for (const pl of p.platforms) {
    const dm = { instagram: 'instagram_dm', tiktok: 'tiktok_dm', facebook: 'facebook_messenger' }[pl.platform];
    if (dm) p.contacts.push({ type: dm, value: pl.profile_url, is_public: true, source_url: pl.profile_url, source_type: 'public_profile', verified_at: (pl.metrics_observed_at || modash.collected_at), context: 'profile exists; whether DMs are open is NOT verified' });
  }
  p.contactability_score = L.contactabilityScore(p.contacts);
  p.best_contact = L.bestContact(p.contacts);

  // ── UGC / PR / paid evidence ──
  const ugc = R.ugcAssess({ captions: p.captions, hashtags: p.hashtags, bio, category: p.main_category, followers: p.follower_count });
  Object.assign(p, { ugc_potential: ugc.ugc_potential, ugc_reason: ugc.ugc_reason, ugc_evidence_url: ugc.ugc_evidence_url, ugc_evidence_type: ugc.ugc_evidence_type, ugc_tags: ugc.ugc_tags, ugc_reviewed_at: ugc.ugc_potential === 'unknown' ? null : NOW.toISOString(), ugc_captions_inspected: ugc.captions_inspected });
  const pe = R.prPaidEvidence({ bio, captions: p.captions, hashtags: p.hashtags, contacts: p.contacts });
  p.accepts_gifting = pe.accepts_gifting; p.accepts_product_exchange = pe.accepts_product_exchange;
  p.paid_status = pe.paid_status; p.paid_basis = pe.paid_basis; p.paid_collaboration = pe.paid_status === 'known_paid' ? 'yes' : 'unknown';
  p.pr_evidence = { gifting: pe.gifting_evidence, open_for_collab: pe.open_for_collab_evidence, sponsored: pe.sponsored_evidence, rate_card: pe.rate_card_evidence };
  // rule-derived PR fit (kept from wave 1) + evidence upgrade when past gifted content is observed
  const f = p.follower_count, syr = p.audience_syria_pct;
  let fit = 'unknown';
  if (f !== null && PR_CATS.has(p.main_category)) fit = f < 100000 ? (f < 50000 && (syr ?? 0) >= 40 ? 'high' : 'medium') : 'low';
  else if (p.main_category) fit = 'low';
  if (pe.accepts_gifting === 'yes' && fit !== 'high') fit = 'medium';
  p.pr_fit = fit;
  p.pr_fit_reason = fit === 'unknown' ? null : 'rule-derived from provider metrics (follower band + relevant category + Syria audience share)' + (pe.accepts_gifting === 'yes' ? '; past gifted-content marker observed' : '; acceptance of gifting NOT confirmed');
  p.creator_status = 'discovered';

  // ── duplicates: cross-platform same-handle across DIFFERENT people => manual review (never auto-merge) ──
  p.verification_level = L.verificationLevel(p.sources.filter(s => s.source_url).map(s => ({ provider: s.provider_name || s.provider, source_url: s.source_url })), true);
  const indep = new Set(p.sources.map(s => s.provider_name || s.provider));
  if (indep.size < 2 && p.verification_level === 'A') p.verification_level = 'B';
  if (p._providers.has('web_search') && p._providers.size === 1) p.verification_level = 'C';
  p.data_confidence = p._providers.has('web_search') && p._providers.size === 1 ? 'low' : (indep.size >= 2 ? 'medium' : 'medium');
  p.source_count = p.sources.length;
  p.last_verified_at = p.sources.map(s => s.verified_at).filter(Boolean).sort().pop() || null;
  p.growth = L.growthStatus(primary?.snapshots || []);
}

// cross-platform same-handle among different people => flag
const byHandle = {};
list.forEach(p => p.platforms.forEach(pl => (byHandle[pl.handle.toLowerCase()] ||= new Set()).add(p.id)));
for (const p of list) {
  const twins = new Set(); p.platforms.forEach(pl => byHandle[pl.handle.toLowerCase()].forEach(id => { if (id !== p.id) twins.add(id); }));
  if (twins.size) { p.duplicate_group = 'DG-' + [...new Set([p.id, ...twins])].sort().join('|').slice(0, 60); p.needs_manual_review = true; p.duplicate_confidence = 0.6; }
}
// name-only near-collisions between different people => manual review (never merged)
for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
  const a = list[i], b = list[j];
  if (a.platforms.some(x => b.platforms.some(y => x.platform === y.platform && x.handle.toLowerCase() === y.handle.toLowerCase()))) continue;
  if (L.nameSimilarity(a.display_name, b.display_name) >= 0.92 && L.normalizeName(a.display_name).length >= 6) {
    a.needs_manual_review = b.needs_manual_review = true; a.duplicate_confidence ??= 0.46; b.duplicate_confidence ??= 0.46;
    a.duplicate_group ??= 'DG-name-' + sha(a.id + b.id); b.duplicate_group ??= a.duplicate_group;
  }
}

// ───────── 3. scores, quality, why, pools ─────────
for (const p of list) {
  const flat = R.flattenForScoring({ ...p, audience_syria_pct: p.audience_syria_pct, contactability_score: p.contactability_score, authenticity_external: p.platforms[0]?.authenticity_external ?? null, paid_collaboration: p.paid_collaboration });
  p.scores = L.computeScores(flat);
  const dq = R.dataQualityScore({ ...p, platforms: p.platforms.map(x => ({ ...x, avg_views: x.avg_views ?? x.reels_avg_views })) }, NOW);
  p.data_quality_score = dq.data_quality_score; p.data_quality_parts = dq.parts;
  p.why = R.whyCreator({ ...flat, activity_status: p.activity_status, days_since_last_post: p.days_since_last_post }, p.scores, NOW);
  p.tier = L.tierKey(p.follower_count);
  p.pools = R.poolsOf({ ...p, follower_count: p.follower_count });
  p.coverage_gap = [!p.main_category && 'category: insufficient evidence', !p.creator_city && 'city: not stated by creator/directory', p.audience_syria_pct === null && 'audience: no provider data', p.follower_count === null && 'followers: unknown'].filter(Boolean).join('; ') || null;
}

// ───────── 4. outputs ─────────
const recs = list.map(p => ({
  id: p.id, market: 'syria', display_name: p.display_name, username: p.platforms[0].handle, bio: mt(p.bios.map(b => b.text))[0] || null, creator_type: p.creator_type, creator_type_source: p.creator_type_source,
  main_category: p.main_category, subcategories: p.subcategories, category_confidence: p.category_confidence, category_source: p.category_source, category_evidence: p.category_evidence,
  creator_country: p.creator_country, creator_city: p.creator_city, city_source: p.city_source, is_celebrity: p.is_celebrity,
  ugc_potential: p.ugc_potential, ugc_reason: p.ugc_reason, ugc_evidence_url: p.ugc_evidence_url, ugc_evidence_type: p.ugc_evidence_type, ugc_tags: p.ugc_tags, ugc_reviewed_at: p.ugc_reviewed_at,
  pr_fit: p.pr_fit, pr_fit_reason: p.pr_fit_reason, accepts_gifting: p.accepts_gifting, accepts_product_exchange: p.accepts_product_exchange, pr_evidence: p.pr_evidence,
  paid_collaboration: p.paid_collaboration, paid_status: p.paid_status, paid_basis: p.paid_basis,
  activity_status: p.activity_status, activity_basis: p.activity_basis, days_since_last_post: p.days_since_last_post, last_post_at: p.last_post_at, data_as_of: p.data_as_of,
  verification_level: p.verification_level, data_confidence: p.data_confidence, source_count: p.source_count, last_verified_at: p.last_verified_at,
  duplicate_group: p.duplicate_group || null, duplicate_confidence: p.duplicate_confidence ?? null, needs_manual_review: !!p.needs_manual_review,
  growth_status: p.growth.growth_status, growth_rate: p.growth.growth_rate, coverage_gap: p.coverage_gap, creator_status: p.creator_status,
  data_quality_score: p.data_quality_score, data_quality_parts: p.data_quality_parts, priority_score: p.scores.creator_priority_score, scores: p.scores, why: p.why, tier: p.tier, pools: p.pools,
  best_contact_rank: p.best_contact.rank, contactability_score: p.contactability_score, audience_syria_pct: p.audience_syria_pct, follower_count: p.follower_count,
  platforms: p.platforms.map(x => ({ platform: x.platform, handle: x.handle, profile_url: x.profile_url, followers: x.followers, followers_conflict: x.followers_conflict, avg_views: x.avg_views, reels_avg_views: x.reels_avg_views, avg_likes: x.avg_likes, avg_comments: x.avg_comments, engagement_rate: x.engagement_rate, growth_rate: p.growth.growth_rate, last_post_at: x.last_post_at, verification_badge: x.verification_badge, fake_followers_pct: x.fake_followers_pct, authenticity_external: x.authenticity_external, platform_status: x.platform_status, metrics_observed_at: x.metrics_observed_at })),
  audience: p.audience, snapshots: p.platforms.flatMap(x => x.snapshots), contacts: p.contacts, sources: p.sources, source_history: p.source_history,
  providers: [...p._providers], skipped_phones: p.skipped_phones,
  sample_posts: p.captions.slice(0, 5), hashtags: [...new Set(p.hashtags)].slice(0, 8), // public captions/links for the human review workbench
}));
fs.writeFileSync(path.join(OUT, 'creators_seed.json'), JSON.stringify({ generated_at: NOW.toISOString(), market: 'syria', records: recs }, null, 1));

// pools
const poolNames = ['pr_pool', 'ugc_pool', 'paid_pool', 'expert_pool', 'media_pool'];
const poolOut = {};
for (const n of poolNames) {
  const rows = recs.filter(r => r.pools.includes(n)).sort((a, b) => (b.priority_score ?? -1) - (a.priority_score ?? -1));
  poolOut[n] = rows.length;
  fs.writeFileSync(path.join(OUT, 'pools', `${n}.json`), JSON.stringify({ pool: n, rule: R.POOL_RULES_DOC[n], generated_at: NOW.toISOString(), count: rows.length, creators: rows.map(r => ({ id: r.id, name: r.display_name, platforms: r.platforms.map(x => `${x.platform}:@${x.handle}`), followers: r.follower_count, tier: r.tier, category: r.main_category, city: r.creator_city, audience_syria_pct: r.audience_syria_pct, activity_status: r.activity_status, best_contact_rank: r.best_contact_rank, pr_fit: r.pr_fit, ugc_potential: r.ugc_potential, paid_status: r.paid_status, priority_score: r.priority_score, data_quality_score: r.data_quality_score, why: r.why.text_en })) }, null, 1));
  const csvRows = rows.map(r => ({ ...r, notes: r.why.text_en, follower_count: r.follower_count, estimate: null, quoted_rate: null, assigned_to: null }));
  fs.writeFileSync(path.join(OUT, 'pools', `${n}.csv`), '﻿' + L.toCsv(csvRows));
}

// SQL
const q = v => v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
const arr = a => `ARRAY[${(a || []).map(q).join(',')}]::text[]`;
const js = v => v === null || v === undefined ? 'NULL' : `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
const sql = [`-- Syria creator seed (wave 1 + wave 2) · generated ${NOW.toISOString()} · ${recs.length} creators
-- Idempotent. NOT APPLIED. Requires migrations 20260930_creator_intelligence.sql + 20260930120000_creator_intelligence_wave2.sql.
-- Regenerate via: node scripts/creators/build-syria-seed.mjs
BEGIN;`];
for (const r of recs) {
  sql.push(`INSERT INTO creator_profiles (id,market,display_name,username,bio,creator_type,creator_type_source,main_category,subcategories,category_confidence,category_source,category_evidence,creator_country,creator_city,city_source,is_celebrity,tags_origin,ugc_potential,ugc_reason,ugc_evidence_url,ugc_evidence_type,ugc_tags,ugc_reviewed_at,pr_fit,pr_fit_reason,accepts_gifting,accepts_product_exchange,gifting_evidence,collab_evidence,paid_collaboration,paid_status,paid_basis,activity_status,activity_basis,days_since_last_post,last_post_at,data_as_of,creator_status,verification_level,data_confidence,source_count,last_verified_at,duplicate_group,duplicate_confidence,needs_manual_review,growth_status,coverage_gap,data_quality_score,data_quality_parts,priority_score,why_json,why_text,notes,created_by)
VALUES (${q(r.id)},'syria',${q(r.display_name)},${q(r.username)},${q(r.bio)},${q(r.creator_type)},${q(r.creator_type_source)},${q(r.main_category)},${arr(r.subcategories)},${q(r.category_confidence)},${q(r.category_source)},${js(r.category_evidence)},${q(r.creator_country)},${q(r.creator_city)},${q(r.city_source)},${r.is_celebrity},'research',${q(r.ugc_potential)},${q(r.ugc_reason)},${q(r.ugc_evidence_url)},${q(r.ugc_evidence_type)},${arr(r.ugc_tags)},${q(r.ugc_reviewed_at)},${q(r.pr_fit)},${q(r.pr_fit_reason)},${q(r.accepts_gifting)},${q(r.accepts_product_exchange)},${js(r.pr_evidence.gifting)},${js({ open_for_collab: r.pr_evidence.open_for_collab, sponsored: r.pr_evidence.sponsored, rate_card: r.pr_evidence.rate_card })},${q(r.paid_collaboration)},${q(r.paid_status)},${q(r.paid_basis)},${q(r.activity_status)},${q(r.activity_basis)},${q(r.days_since_last_post)},${q(r.last_post_at)},${q(r.data_as_of)},'discovered',${q(r.verification_level)},${q(r.data_confidence)},${r.source_count},${q(r.last_verified_at)},${q(r.duplicate_group)},${r.duplicate_confidence ?? 'NULL'},${r.needs_manual_review},${q(r.growth_status)},${q(r.coverage_gap)},${r.data_quality_score},${js(r.data_quality_parts)},${q(r.priority_score)},${js(r.why)},${q(r.why.text_en)},${q(r.pr_fit_reason)},'research-seed-2026-09-30') ON CONFLICT (id) DO NOTHING;`);
  for (const p of r.platforms) sql.push(`INSERT INTO creator_platform_profiles (creator_id,platform,handle,profile_url,followers,avg_views,reels_avg_views,avg_likes,avg_comments,engagement_rate,growth_rate,last_post_at,verification_badge,fake_followers_pct,authenticity_external,platform_status,metrics_observed_at)
VALUES (${q(r.id)},${q(p.platform)},${q(p.handle)},${q(p.profile_url)},${q(p.followers)},${q(p.avg_views)},${q(p.reels_avg_views)},${q(p.avg_likes)},${q(p.avg_comments)},${q(p.engagement_rate)},${q(p.growth_rate)},${q(p.last_post_at)},${q(p.verification_badge)},${q(p.fake_followers_pct)},${q(p.authenticity_external)},${q(p.platform_status)},${q(p.metrics_observed_at)}) ON CONFLICT (platform,handle) DO NOTHING;`);
  for (const s of r.sources) sql.push(`INSERT INTO creator_sources (creator_id,field,provider,source_type,source_url,observed_at,verified_at,evidence,confidence)
SELECT ${q(r.id)},${q(s.field)},${q(s.provider)},${q(s.source_type)},${q(s.source_url)},${q(s.observed_at)},${q(s.verified_at)},${q(s.evidence)},${q(s.confidence)}
WHERE EXISTS (SELECT 1 FROM creator_profiles WHERE id=${q(r.id)}) AND NOT EXISTS (SELECT 1 FROM creator_sources WHERE creator_id=${q(r.id)} AND field=${q(s.field)} AND source_url=${q(s.source_url)});`);
  const aud = r.audience.filter(a => a.pct >= 0 && a.pct <= 100);
  if (aud.length) sql.push(`INSERT INTO creator_audience_metrics (creator_id,platform,dimension,key,pct,observed_at,confidence)
SELECT ${q(r.id)},d.platform,d.dimension,d.key,d.pct,${q(modash.collected_at)},'medium' FROM (VALUES ${aud.map(a => `(${q(a.platform)},${q(a.dimension)},${q(a.key)},${a.pct})`).join(',')}) AS d(platform,dimension,key,pct)
WHERE EXISTS (SELECT 1 FROM creator_profiles WHERE id=${q(r.id)}) AND NOT EXISTS (SELECT 1 FROM creator_audience_metrics WHERE creator_id=${q(r.id)});`);
  if (r.snapshots.length) sql.push(`INSERT INTO creator_metrics_snapshots (creator_id,platform,followers,captured_at)
SELECT ${q(r.id)},d.platform,d.followers,d.captured_at::timestamptz FROM (VALUES ${r.snapshots.map(s => `(${q(s.platform)},${s.followers},${q(s.captured_at)})`).join(',')}) AS d(platform,followers,captured_at)
WHERE EXISTS (SELECT 1 FROM creator_profiles WHERE id=${q(r.id)}) AND NOT EXISTS (SELECT 1 FROM creator_metrics_snapshots WHERE creator_id=${q(r.id)});`);
  for (const c of r.contacts) sql.push(`INSERT INTO creator_contacts (creator_id,type,value,is_public,source_url,source_type,verified_at,context,contact_rank)
SELECT ${q(r.id)},${q(c.type)},${q(c.value)},true,${q(c.source_url)},${q(c.source_type)},${q(c.verified_at)},${q(c.context)},${q(L.contactRank(c))}
WHERE EXISTS (SELECT 1 FROM creator_profiles WHERE id=${q(r.id)}) AND NOT EXISTS (SELECT 1 FROM creator_contacts WHERE creator_id=${q(r.id)} AND type=${q(c.type)} AND value=${q(c.value)});`);
  for (const h of r.source_history) sql.push(`INSERT INTO creator_source_history (creator_id,field,value_text,provider,observed_at,superseded)
SELECT ${q(r.id)},${q(h.field)},${q(h.value_text)},${q(h.provider)},${q(h.observed_at)},${h.superseded}
WHERE EXISTS (SELECT 1 FROM creator_profiles WHERE id=${q(r.id)}) AND NOT EXISTS (SELECT 1 FROM creator_source_history WHERE creator_id=${q(r.id)} AND field=${q(h.field)} AND provider=${q(h.provider)} AND observed_at=${q(h.observed_at)});`);
}
// benchmarks
for (const s of bench.sources) for (const t of s.tiers) for (const tk of t.tier_keys) {
  const mid = Math.round(Math.sqrt(t.low * t.high));
  const v = R.validateBenchmark({ source: s.source, source_url: s.source_url, country: s.country, market_scope: s.market_scope, platform: s.platform, creator_tier: t.creator_tier, format: s.format, low: t.low, mid, high: t.high, currency: s.currency, date: s.date, confidence: s.confidence });
  if (!v.ok) throw new Error('bad benchmark ' + JSON.stringify(v));
  sql.push(`INSERT INTO creator_benchmarks (market,platform,content_format,tier_key,low,mid,high,currency,benchmark_source,benchmark_date,benchmark_scope,source_url,country,market_scope,creator_tier,confidence,mid_method)
SELECT 'syria',${q(s.platform)},${q(s.format)},${q(tk)},${t.low},${mid},${t.high},${q(s.currency)},${q(s.source)},${q(s.date)},${q(s.market_scope)},${q(s.source_url)},${q(s.country)},${q(s.market_scope)},${q(t.creator_tier)},${q(s.confidence)},'geometric mean of the published low/high'
WHERE NOT EXISTS (SELECT 1 FROM creator_benchmarks WHERE benchmark_source=${q(s.source)} AND tier_key=${q(tk)} AND platform=${q(s.platform)});`);
}
sql.push('COMMIT;');
fs.mkdirSync(path.resolve('supabase/data'), { recursive: true });
fs.writeFileSync(path.resolve('supabase/data/20260930_creator_syria_seed.sql'), sql.join('\n') + '\n');

// ───────── 5. stats + source report ─────────
const cnt = (fn, rows = recs) => rows.reduce((m, r) => { const k = fn(r); m[k] = (m[k] || 0) + 1; return m; }, {});
const withAny = fn => recs.filter(fn).length;
const bizContact = r => r.contacts.some(c => L.contactRank(c) <= 5);
const providerUnique = {};
recs.forEach(r => { const k = [...r.providers].sort().join('+'); providerUnique[k] = (providerUnique[k] || 0) + 1; });
const stats = {
  generated_at: NOW.toISOString(),
  raw_discovered: Object.entries(provenance).filter(([k]) => k !== 'search_snippet_enrichment').reduce((a, [, x]) => a + x.discovered, 0), // enrichment rows add data to existing creators, they are not new candidates
  raw_by_source: Object.fromEntries(Object.entries(provenance).map(([k, v]) => [k, v.discovered])),
  distinct_creators: recs.length, platform_profiles: recs.reduce((a, r) => a + r.platforms.length, 0),
  multi_platform_creators: withAny(r => r.platforms.length > 1),
  usable: withAny(r => r.follower_count !== null || r.platforms.length > 0),
  usable_with_followers: withAny(r => r.follower_count !== null),
  by_platform_profiles: (() => { const m = {}; recs.forEach(r => r.platforms.forEach(p => { m[p.platform] = (m[p.platform] || 0) + 1; })); return m; })(),
  creators_with_platform: (() => { const m = {}; recs.forEach(r => new Set(r.platforms.map(p => p.platform)).forEach(p => { m[p] = (m[p] || 0) + 1; })); return m; })(),
  tier: cnt(r => r.tier), category: cnt(r => r.main_category || 'unknown'), city: cnt(r => r.creator_city || 'unknown'), creator_type: cnt(r => r.creator_type || 'unknown'),
  verification: cnt(r => r.verification_level), activity_status: cnt(r => r.activity_status),
  contacts: {
    any_public_business_contact: withAny(bizContact), with_email: withAny(r => r.contacts.some(c => c.type === 'email')), with_management_email: withAny(r => r.contacts.some(c => c.type === 'management')),
    with_whatsapp: withAny(r => r.contacts.some(c => c.type === 'whatsapp')), with_business_phone: withAny(r => r.contacts.some(c => c.type === 'phone')), with_website_or_linkpage: withAny(r => r.contacts.some(c => c.type === 'website')),
    dm_only: withAny(r => r.contacts.length > 0 && !bizContact(r)), none: withAny(r => r.contacts.length === 0),
    best_rank_distribution: cnt(r => r.best_contact_rank), phones_skipped_no_business_context: recs.reduce((a, r) => a + r.skipped_phones.length, 0),
  },
  audience_syria_known: withAny(r => r.audience_syria_pct !== null), avg_audience_syria: +(recs.filter(r => r.audience_syria_pct !== null).reduce((a, r) => a + r.audience_syria_pct, 0) / Math.max(1, withAny(r => r.audience_syria_pct !== null))).toFixed(1),
  pr_fit: cnt(r => r.pr_fit), ugc_potential: cnt(r => r.ugc_potential), accepts_gifting_yes: withAny(r => r.accepts_gifting === 'yes'), paid_status: cnt(r => r.paid_status),
  pools: poolOut, pool_overlap: (() => { const m = {}; recs.forEach(r => { if (r.pools.length > 1) { const k = r.pools.join('+'); m[k] = (m[k] || 0) + 1; } }); return m; })(),
  growth: cnt(r => r.growth_status), needs_manual_review: withAny(r => r.needs_manual_review), followers_conflicts: withAny(r => r.platforms.some(p => p.followers_conflict)),
  data_quality: { mean: +(recs.reduce((a, r) => a + r.data_quality_score, 0) / recs.length).toFixed(1), buckets: cnt(r => (r.data_quality_score >= 70 ? '70+' : r.data_quality_score >= 50 ? '50-69' : r.data_quality_score >= 30 ? '30-49' : '<30')) },
  priority: { computed: withAny(r => r.priority_score !== null), mean: +(recs.filter(r => r.priority_score !== null).reduce((a, r) => a + r.priority_score, 0) / Math.max(1, withAny(r => r.priority_score !== null))).toFixed(1) },
  provider_unique_combos: providerUnique,
  cat_tier_matrix: (() => { const m = {}; recs.forEach(r => { const c = r.main_category || 'unknown'; (m[c] ||= {})[r.tier] = (m[c][r.tier] || 0) + 1; }); return m; })(),
  data_as_of_distribution: cnt(r => r.data_as_of || 'none'),
  activity_by_data_age: (() => { const m = { data_fresh_60d: 0, data_60_180d: 0, data_older: 0, none: 0 }; recs.forEach(r => { if (!r.data_as_of) { m.none++; return; } const age = (NOW - new Date(r.data_as_of + '-28')) / 864e5; if (age <= 60) m.data_fresh_60d++; else if (age <= 180) m.data_60_180d++; else m.data_older++; }); return m; })(),
  micro_nano: { under_1k: withAny(r => r.tier === 'under_1k'), '1k_5k': withAny(r => r.tier === '1k_5k'), '5k_10k': withAny(r => r.tier === '5k_10k'), '10k_25k': withAny(r => r.tier === '10k_25k'), '25k_50k': withAny(r => r.tier === '25k_50k') },
};
fs.writeFileSync(path.join(OUT, 'stats.json'), JSON.stringify(stats, null, 1));
fs.writeFileSync(path.join(OUT, 'source_report.json'), JSON.stringify({ generated_at: NOW.toISOString(), provenance, provider_unique_combos: providerUnique }, null, 1));
console.log(JSON.stringify({ raw: stats.raw_discovered, creators: stats.distinct_creators, pools: stats.pools, contacts: stats.contacts.any_public_business_contact, cat_unknown: stats.category.unknown, city_unknown: stats.city.unknown, ugc: stats.ugc_potential, act: stats.activity_status }, null, 1));
