# Creator Intelligence — Syria Phase 1: Research Validation Report
Date: 2026-09-30 · Status: Wave 1 complete, Wave 2 below (research NOT complete) · **Not deployed. Migration and seed NOT applied to any database.**

Reproduce: `node scripts/creators/collect-modash-public.mjs syria` → `node scripts/creators/collect-heepsy-public.mjs syria` → `node scripts/creators/build-syria-seed.mjs` (writes `data/creators/syria/seed/` and `supabase/data/20260930_creator_syria_seed.sql`).


---
# WAVE 2 (2026-09-30) — public-source expansion, evidence, contactability, activity, UGC/PR/paid evidence, quality

**Status: NOT complete.** Wave 2 improved the data, but Syria Phase 1 research is *not* commercially sufficient yet (see "Verdict"). No migration applied, no seed inserted, no deploy, no paid provider, no login/CAPTCHA/anti-bot bypass.

Reproduce: `collect-modash-public.mjs` → `collect-influencer-sy.mjs` → `collect-heepsy-public.mjs` / `parse-heepsy-html.mjs` → `build-syria-seed.mjs` → `verify-seed-pglite.mjs` (all in `scripts/creators/`). Raw evidence: `data/creators/syria/raw/`; seed + pools: `data/creators/syria/seed/`; SQL: `supabase/data/20260930_creator_syria_seed.sql` (idempotent, **not applied**).

## W2.1 Headline numbers (Wave 1 → Wave 2)
| | Wave 1 | Wave 2 |
|---|---|---|
| Raw candidates discovered (new) | 167 | **261** (Modash 168 · influencer.sy 65 · Heepsy 20 · web search 8) + 9 enrichment observations on existing creators |
| Distinct creators after dedup (platform-profile level) | 167 | **250** (255 platform profiles; 4 multi-platform creators; 0 auto-merges by name) |
| Usable (has a verifiable profile URL + sourced evidence) | 166 | **250** (201 with a known follower count) |
| Followers unknown | 1 | 49 (influencer.sy creators have no public counts; snippet lookups reached 9 creators, 7 of them with a follower count) |
| Verification A / B / C | 0 / 164 / 3 | **20 / 223 / 7** (A = ≥2 independent providers on the same profile) |
| Public business contact (email/WhatsApp/business phone/mgmt) | 1 | **25** |
| Category unknown | 74 | **69** of 250 (27.6 %; wave 1: 44 %) |
| City known (creator side, sourced) | 33 | **103** of 250 (Damascus 23, Aleppo 23, Latakia 15, Homs 7, Tartus 6, Rif Dimashq 5, Hama 5, others ≤3; 147 unknown) |
| Active ≤90 d (dated evidence) | 8 | **16** (8 active_30d + 8 active_90d); 64 inactive_90d; 170 unknown |
| UGC candidates | 0 | **2** medium (text evidence, with evidence URL); 106 assessed low; 142 unknown |
| PR pool | 26 (5K–50K) | **37** (all bands <100K, not celebrity, not confirmed inactive) |
| Target 500 raw / 300 usable | not met | **not met** (261 / 250). The cap is real — see W2.3 |

## W2.2 Root cause of "only 8 active in 90 days"
Not a real scarcity of active creators: the *observation age* is the problem. Modash's page date says "Sep 2026", but each profile carries its own crawl month (`data_as_of`): **33 profiles were last crawled in 2025-04; 103 of the 166 dated profiles were crawled more than 180 days ago**, and only 9 within the last 60 days. Median last-observed post is ~1 year before today. So "last post" mostly proves the state at crawl time.
Wave 2 therefore classifies activity as `active_30d | active_90d | inactive_90d | unknown` and only says *inactive* when (a) the crawl is fresh (≤60 d) and shows no post in 90 d, or (b) the account was already dormant >90 d at crawl time; a stale crawl can never prove present-day activity → `unknown`. Dated public posts seen in search snippets raised 3 creators to `active_30d` (e.g. posts on 13 Sep and 7 Sep 2026).
Fix that needs no paid tool: a 30-minute team pass that opens the top ~100 profiles and records last-post date (human viewing is allowed; automated fetching of Instagram is not).

## W2.3 Source coverage report (is the "public source cap" real? — yes)
| Source | Accessible? | Type | Coverage | Useful fields | Limitations | Discovered | Imported | Rejected / merged | Reason |
|---|---|---|---|---|---|---|---|---|---|
| Modash public directory pages (14 pages: Syria all/skincare/fashion(+affiliates)/fitness/food(+affiliates)/family/health/male/female/micro/damascus + TikTok Syria) | Yes (robots allow, plain GET) | public directory | ≤20 profiles per page (proof of cap: 14 pages → 168 unique) | followers, ER, reel plays, fake %, audience country/city/gender, 6–7 monthly snapshots, popular-post captions, hashtags, bio | top-N only; per-profile crawl age 2023-03 → 2026-09; contact/audience detail paywalled; ~1.9 MB pages | 168 | 160 new | 8 merged into influencer.sy creators | same IG handle |
| **influencer.sy** («مؤثّرو سوريا») | Yes (robots allow-all + sitemap) | opt-in Syrian creator directory | whole roster = **65 creators** (120 sitemap URLs, 55 are listing pages) | self-declared category, governorate, cross-platform links (IG/YouTube/FB), description | no follower counts; tiny roster; only 10 beauty | 65 | 65 | 0 | – |
| Heepsy public rankings | Partially: TikTok + Instagram top-10 served to one plain request each; **YouTube 404; several automated attempts answered 403** (no looping, no header spoofing; the two pages parsed came from single plain requests) | ranking page | top 10 per platform | rounded followers, ER, avg likes | 20 celebrities only; blocks repeated fetches | 20 | 17 new | 3 merged with influencer.sy creators | – |
| Web-search snippets (13 discovery queries: IG×8, TikTok, Facebook, YouTube, directories×2) | Yes | search discovery | poor for Syria micro-creators | followers/bio where the snippet is the profile itself | results are mostly reels/posts, salons, groups, non-Syrian accounts; 429 rate limits | 8 | 8 | the large majority of hits discarded | no stated Syria link / not a profile / business page |
| Search-snippet enrichment of known creators (17 handles) | Yes | snippet of the creator's own profile | 9 useful | followers, bio, business phone/WhatsApp, dated posts | 5 handles returned no profile snippet, 1 mismatched, 2 rate-limited | 9 | 0 new (9 merged) | – | – |
| Intellifluence «Top Influencers: Syria» | Yes | marketplace page | 3 creators (sports / finance / generic) | self-description | no beauty; 'reach' ≠ followers | 3 | 1 (counted in web search) | 2 | no verifiable platform URL, off-niche |
| Feedspot «Syria YouTube channels» | Yes | curated list | 8 channels (food, news, tourism) | subscribers, masked email | no beauty/lifestyle | 8 | 0 | 8 | off-niche, contact masked |
| StarNgage | **No — HTTP 403** | ranking | – | – | blocked, not bypassed | – | – | – | anti-bot |
| Hive Influence | **No — HTTP 502 on 5 attempts across 2 sessions** | ranking | – | (search snippet showed top-10 beauty names only) | site error | – | – | – | unavailable |
| Hafi.io, Influs | **No — connection failed** | – | – | – | unreachable from this network | – | – | – | – |
| HypeAuditor, Favikon | Reachable but **no Syria ranking (404)** | – | – | – | – | – | – | – | – |
| Instagram / TikTok / YouTube directly | **Deliberately not fetched** | – | – | – | Instagram robots.txt/ToS forbid automated collection without permission; TikTok robots ambiguous; YouTube needs an API key (none configured) | – | – | – | policy |

Overlap between sources (creators): Modash∩influencer.sy 8 · Heepsy∩influencer.sy 3 · Modash∩Heepsy 0 · influencer.sy+snippet 8. Unique-only: Modash 160 · influencer.sy 46 (+8 snippet-enriched) · Heepsy 17 · web search 7. **Most valuable sources:** Modash public pages (breadth + audience + captions), influencer.sy (Syria-native, self-declared category/city, opt-in), search snippets (only for freshness/contact on known handles).

## W2.4 Coverage (from `data/creators/syria/seed/stats.json`)
**Follower tiers** — under 1K 1 · 1K–5K 75 · 5K–10K 27 · 10K–25K 43 · 25K–50K 6 · 50K–100K 8 · 100K–250K 14 · 250K–500K 1 · 500K–1M 3 · 1M+ 23 · unknown 49. Micro/nano (<50K, known count): **152**. Under-1K and 25K–50K remain thin.
**Categories (main)** — fashion 28 · fitness 28 · food 17 · motherhood 14 · wellness 13 · music 12 · art 11 · beauty 10 · makeup 9 · entertainment 9 · business 8 · tech 6 · skincare 4 · travel 4 · education 3 · gaming 2 · comedy 1 · hair 1 · lifestyle 1 · **unknown 69**. Empty: men's grooming, shopping/deals, reviews, local media.
**Cities (creator side)** — see W2.1. Evidence: the creator's own bio or influencer.sy self-declared governorate only; audience city never used as creator city.
**Platforms** — Instagram 214 · TikTok 31 · YouTube 5 · Facebook 5 (the last two only through creators' self-declared links; no independent YouTube/Facebook discovery was possible).

## W2.5 Contact coverage (hierarchy: mgmt/agency 1 · business email 2 · WhatsApp 3 · business phone 4 · website/contact page 5 · IG DM 6 · TikTok DM 7 · FB Messenger 8 · none 9)
Best public contact per creator: rank 2 (email) 4 · rank 3 (WhatsApp) 5 · rank 4 (business phone) 16 · rank 6 (IG DM only) 189 · rank 7 (TikTok DM only) 30 · rank 8 (Messenger only) 3 · none 3. **25 creators have a public business contact (10 %)**; management/agency email 0; website/link-page 0. DM rank means "a profile exists" — DM openness is *not* verified. Phones are stored only with business context (booking/ads/WhatsApp wording or a service/salon bio); 4 bare numbers were skipped. 24 of the 25 also have a known follower count; 18 are <50K.

## W2.6 Pools (queryable views + JSON/CSV under `seed/pools/`; SQL views verified equal to the JS rules)
| Pool | Rule | Count |
|---|---|---|
| PR_POOL | pr_fit high/medium · followers <100K · not celebrity · not confirmed inactive | **37** (9 with a business contact; 4 recently active; categories: fashion 13, motherhood 8, makeup 7, wellness 4, skincare 3, beauty 2) |
| UGC_POOL | ugc_potential high/medium **and** an evidence URL | **2** (text evidence only; no visual review) |
| PAID_POOL | followers ≥50K or known_paid | **49** (known_paid: 0; likely_commercial signals: 31 in the whole set) |
| EXPERT_POOL | creator_type = expert (pharmacists, skin specialists, salon/makeup professionals from bio) | **19** |
| MEDIA_POOL | publisher / local page / local·shopping category | **1** (no Syrian local-media or deals pages found through public sources) |
Overlaps: PR+Expert 9 (+2 also paid) · PR+Paid 3 · Paid+Expert 2 · UGC+Paid 1 · UGC+Expert 1.

## W2.7 What was built in Wave 2 (data/logic only; UI touched minimally to surface new fields)
`creatorResearch.js`: public-contact extraction & classification (strict Syrian/international phone patterns, business-context gating, wa.me, link-in-bio pages), activity status, evidence-scored category/type classification, text-evidence UGC assessment (cap = medium; `high` only via a recorded visual review), PR/paid evidence (accepts_gifting=yes only on gifting markers; sponsored ≠ rate; known_paid only for rate-card/management), source-conflict resolution with history, `data_quality_score` (identity/platform/audience/contact/category/city/freshness/source-diversity — separate from creator priority), “why this creator” (machine + human text built only from populated fields), commercial pools, benchmark validation. `creatorLogic.js`: contact hierarchy → `contactability_score`, benchmark-scope confidence caps (global → low, MENA ≤ medium). Migration `20260930120000_creator_intelligence_wave2.sql` (evidence columns, `creator_source_history`, benchmark provenance, follower-tier function, 6 views). Service: benchmarks grouped per source, best scope first.

**Benchmarks found (all stored with their real scope; none is Syrian):** Valors Media MENA 2026 (nano $50–600 · micro $200–2.5K · mid $800–8K · macro $3K–25K · celebrity $10K–100K+ per post; scope mena, confidence low; the source says the same reach costs ~7× more in the UAE than in Egypt) and Hootsuite 2026 Instagram (global). Open Sponsorship medians (global, 1,527 campaigns) recorded as a sanity check only. Every estimate in the UI reads “Estimated … · benchmark mena · low/medium”; under-1K and profiles without a tier row show Unknown.

## W2.8 Verdict and gaps
Commercially usable today: **37 PR-pool creators, 25 with a public business contact, ~4 with dated recent activity**, 19 experts. Not sufficient for a 300-creator wave.
Remaining gaps, biggest first: (1) **discovery breadth** — the public roster reachable without login is ~250; (2) **freshness** — 103/166 provider records are >180 days old; (3) **UGC** — only text evidence exists; needs a viewing pass; (4) **acceptance of gifting / paid willingness** — 0 confirmed; (5) **contacts** — DM-only for 89 %; (6) **Syria rate quotes** — none; benchmarks are MENA/global; (7) YouTube/Facebook discovery; (8) 69 unknown categories, 147 unknown cities, 49 unknown follower counts.

## W2.9 Next step — marginal value of a paid provider vs the remaining gaps (recommendation, not an action)
Do first, at zero licence cost: (a) **YouTube Data API key** (official, free quota) for channel discovery; (b) a **team verification sprint** on the 37 PR-pool + 19 experts: open each public profile, record last-post date, business contact, city, and watch 3 recent videos to set `ugc_potential` with a visual-review record (this is the only way to earn “high” UGC and it is not something a provider sells); (c) **outreach for quotes** from the first 50 contacted → real `creator_rate_history` → a Syrian benchmark table; (d) invite the ~46 influencer.sy-only creators through their public links (they opted in to being found).
A paid provider (Modash/HypeAuditor) would mainly help **discovery breadth (gap 1) and fresh audience/metrics for the long tail (gap 2)** — plausibly hundreds more candidates with Syria-audience filters. It would **not** close UGC (3), gifting/paid acceptance (4), or Syrian quotes (6), and its contact data must be checked against the “public business contact only” rule before use. Decide after (b) shows how many of the 37 actually convert; if conversion is healthy, breadth becomes the binding constraint and a one-month seat is justified.

---
# WAVE 1 (historical, superseded by the numbers above)

## Headline (read this first)
The 500-raw / 300-usable target was **not reached**. The honest number is **167 verified-at-source records** (154 + 10 + 3 raw → 167 after dedup by platform+handle; 0 duplicates found). Reason: the accessible public sources are capped (Modash public pages list ≤20 per page; Heepsy shows the top 10 only; Instagram/TikTok/YouTube official APIs and Modash/HypeAuditor/Meta/TikTok search tools need accounts/keys and were **not bypassed**). Coverage gap is recorded, not padded.

Two blocks are **empty by design**, because no public source states them: **UGC potential** (needs review of on-camera content) and **accepts gifting / accepts product exchange / paid collaboration** (needs a creator's own statement or a past collaboration post). They show as "غير معروف".

## 1. Sources used
| Source | Type | Access | What it gave |
|---|---|---|---|
| Modash — public directory pages `find-influencers/syria[/skincare,fashion,fashion/affiliates,fitness,food,food/affiliates,family,health,male,female,damascus]` and `find-influencers/tiktok/syria` | public directory page (free, no login, robots.txt allows) | HTTP GET, 1.2 s spacing, honest User-Agent | 154 profiles: followers, engagement, avg reel plays/views/likes/comments, fake-followers %, audience credibility, audience country/city/gender (Modash-estimated), monthly follower history, recent post dates, bio |
| Heepsy — public ranking `find-influencers/tiktok/syria` | public ranking page (top 10) | HTTP GET | 10 TikTok celebrity profiles: rounded followers, engagement, avg likes |
| Public web search (Firecrawl) — Instagram/TikTok snippets | search discovery | search API | 3 profiles, only facts stated verbatim in the snippet (confidence low) |

## 2. What each source can / cannot provide
- **Modash public pages:** strong metrics + audience split for ~154 profiles; contact details, full audience breakdown and search are behind a paid login (not accessed). Lists are "top N per page", so long-tail coverage is impossible without an account. Audience data is Modash's estimate, labelled confidence *medium*.
- **Heepsy:** only top 10 per platform; **Instagram and YouTube rankings returned HTTP 403** (bot protection) → **not retried, not bypassed**. Followers rounded (e.g. 24.6M).
- **Web search:** yields many posts/reels, few clean profiles; follower counts and Syria link are frequently unstated → only 3 usable.
- **Not usable now (limitations):** Modash/HypeAuditor search (login), Meta Creator Marketplace, TikTok Creative Center, YouTube Data API (no key configured), Hive Influence (HTTP 502 during the run), HypeAuditor country lists (404 for Syria), Favikon (404).

## 3. Counts
| Stage | n |
|---|---|
| Raw candidates (Modash 154 + Heepsy 10 + search 3) | 167 |
| After dedup (platform+handle, normalized) | 167 (0 duplicates; 0 cross-platform same-handle pairs) |
| Validated (direct profile URL parsed + ≥1 sourced evidence row) | 167 |
| Dropped | 0 at ingestion. Most web-search hits (posts/reels, salons, clinics, accounts with no stated Syria link or no follower count) were **not recorded at all**; only the 3 clean profiles were kept.
| Usable for outreach targeting (has followers + a Syria signal) | 166 (1 has followers unknown) |

Rejection reasons applied: no stated link to Syria; business/salon/clinic account rather than a creator; post/reel URL instead of a profile; follower count not stated and no second source.

## 4. Distributions (from `data/creators/syria/seed/stats.json`)
- **Platform:** Instagram 139 · TikTok 28 · Facebook 0 · YouTube 0.
- **Follower tier:** 1K–5K **75** · 5K–10K **27** · 10K–25K **28** · 25K–50K 5 · 50K–100K 6 · 100K–250K 11 · 250K–500K 0 · 500K–1M 2 · 1M+ **12** · unknown 1 · under 1K 0.
- **Category (bio keywords / provider page membership):** unknown **74** · fashion 20 · fitness 19 · food 13 · wellness 11 · makeup 7 · motherhood 7 · skincare 6 · beauty 5 · entertainment 3 · lifestyle 1 · travel 1. Hair 0 · men 0 · comedy 0 · shopping 0 · reviews 0 · local media 0.
- **Creator city (only where the creator's own bio states it):** Damascus 11 · Aleppo 11 · Latakia 6 · Homs 3 · Hama 2 · unknown **134**. Other governorates: 0 (gap).
- **Audience Syria %:** available for **89 / 167**; mean 48.5 % (Modash estimate). Unknown for the rest.
- **Verification level:** B 164 · C 3 · A 0 (A needs two independent providers on the same profile; none overlap yet).
- **Growth (real 6–7 monthly Modash snapshots):** rising 41 · stable 107 · declining 4 · unknown 15.
- **Recent activity:** last-post date known for 152; posted within 90 days of 30 Sep 2026: **8** (within 30 days: 2). Modash's "recent posts" are often old snapshots — treat activity as **unreliable until re-verified live**.

## 5. Contactability
Public contact data is essentially **absent**: 1 public business email (Masa Jammal, from her own bio), 0 WhatsApp, 0 management contacts. Modash paywalls contact details; profile bios sometimes contain phone numbers, which were **intentionally not stored** (cannot tell business from personal numbers). Contact is currently via **Instagram/TikTok DM only** (the profile URL). This is the biggest operational gap.

## 6. Pools
- **PR / Gifting pool** (5K–50K, PR fit high/medium): **26**. All records with `pr_fit` high or medium (up to 100K followers, relevant category): 47 (28 high + 19 medium). `pr_fit` is a **rule-derived fit** (follower band + relevant category + Syria audience ≥ 40 %), **not** consent; `accepts_gifting` remains "unknown" for all 167. A batch of 300 is **not possible** yet: the builder reports "Only N qualified" instead of padding.
- **UGC pool:** **0 classified.** No source states on-camera ability. Needs a video-review wave (manual or AI-assisted with confidence) — see next wave.
- **Paid candidates** (50K+): **31**; 12 celebrities (1M+). `paid_collaboration` unknown for all; **no quoted rates, no Syria benchmark table** → all rate cells display "غير معروف" (the estimator returns null without a benchmark; nothing is invented).
- **Experts / professionals** (pharmacists, skin specialists — from bio keywords): 11.

## 7. Data gaps
1. Long tail below 5K and 5K–25K beauty/skincare creators (Modash lists are top-N).
2. Facebook and YouTube: 0 profiles.
3. UGC potential, gifting/exchange acceptance, paid willingness: no evidence collected.
4. Public contacts (WhatsApp/email/management): ~none.
5. Creator city: 134 unknown; governorates beyond Damascus/Aleppo/Latakia/Homs/Hama: none.
6. Category unknown for 74 records (bio gave no classifiable keyword).
7. Hair, men's grooming, comedy, shopping/deals, reviews, local media pools: empty.
8. No Syria rate benchmark (`creator_benchmarks` empty).
9. Activity freshness unreliable (see above).

## 8. Known limitations
- Modash audience data is a provider **estimate**; creator location label is Modash's, kept separate from audience location (`creator_country` vs `creator_audience_metrics`).
- Category/expert/blogger tags are **keyword-derived** (`tags_origin = research`), not manually validated. Cross-platform identity is not merged automatically.
- Follower counts are as of Modash's Sept 2026 refresh (not live). Heepsy figures are rounded.
- Using Modash's public directory for internal lead research is low risk (open pages, no login, polite rate) but it is a third party's data: confirm their terms if the dataset will be resold or published.
- The migration uses the same permissive RLS as `syria_b2b_leads` (PIN login ⇒ `anon`); the tables therefore hold **public data only**, and real gating is the app permission `VIEW_CREATOR_INTELLIGENCE`.

## 9. Recommended next research wave
1. Add a Modash (or HypeAuditor) paid seat for one month → bulk search by bio keyword + audience Syria ≥ 40 % across 1K–50K; export CSV and use the importer (`تبويب البحث`, provider = modash/hypeauditor).
2. Register a YouTube Data API key → channel search for Syrian beauty (Arabic queries); official API only.
3. Video-review pass on the 26 PR candidates + 47 wider pool to set `ugc_potential` with reasons.
4. Manual verification of public contact points (link-in-bio, business email) for the top 100.
5. Ask the first 50 contacted creators for their rate → `creator_rate_history` (quoted); then build the Syria benchmark table from real quotes.
6. Facebook page discovery for local lifestyle/media pages via Meta Content Library (needs approval).
