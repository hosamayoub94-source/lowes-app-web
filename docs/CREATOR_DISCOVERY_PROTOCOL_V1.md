# Syria Creator Discovery — Protocol v1

Status: first sweep done (2026-10-01). Data lives locally in `data/creators/syria/discovery/` (not in git, not in any database).

## Principle
Discovery ≠ Qualification. A discovered account is only "a real public account that probably belongs to a Syrian creator".
Contact, rate, city, audience %, UGC/PR proof and skincare fit stay `null` until verified. Pipeline:
**Discovery → Verification → Enrichment → Qualification → Review** (the Review Workbench is the last step).

## Hard rules
1. Never add an account without a discovery source (type + URL + date + tool).
2. Never guess city, category or follower count. Unknown = `null`. Truncated counts ("K+") are `null`.
3. Public sources only. No login, CAPTCHA or protection bypass. No direct scraping of Instagram/TikTok pages (robots/ToS) — only what the public web index returns in its own snippets. No messages to anyone.
4. A private account is not "verified" without a public source.
5. Honest signal strength per row: `strong` (Syria stated in bio/snippet) · `medium` (Syrian hashtags/city words) · `weak` · `query_only` (matched only because our query said "Syria" — NOT evidence). `query_only` and `weak` rows are `needs_verification`.

## Mandatory dedup (run by `scripts/creators/discovery-merge.mjs` before anything is kept)
1. Profile URL first, then `platform + normalised username` (case, `@`, trailing slash, `www.`/`m.` hosts are equal).
2. Checked against: the research seed (255 handles), the review queue (including removed creators) and earlier rows of the same run.
3. Never by name alone. Same username on another platform is reported as a *possible link* for human review — never auto-merged, never a second creator row.
4. Doubtful same-person cases are not added; they go to Needs Review.

## Targets (not quotas — shortfalls are reported, never padded)
Micro/Emerging first: 500–1K, 1K–2.5K, 2.5K–5K, 5K–10K (high density) → 10K–25K (medium) → 25K+ (selective).
Categories: Beauty, Skincare, Makeup, Hair, Fashion, Lifestyle, Women, Motherhood, Fitness, Wellness, Food, Home, Education, Experts/Doctors/Pharmacists, Hairdressers/Makeup artists, UGC, Students, Art/Photography, Music, Entertainment, local creators.

## What the first sweep showed (yield by method)
| Method | Result |
|---|---|
| Instagram index, query `"followers" "following" "posts" <niche> <city>` (EN + AR) | Best source. ~3–8 usable profiles per query; many rows are reels that leak the author handle + counts. Fitness, fashion, photography, hair worked best; skincare/mothers/food mostly returned shops and non-Syrian accounts. |
| TikTok index, query `TikTok "Followers" سوريا دمشق` | Clean profile pages (handle + followers + bio) — but only for generic "Syrian creator" wording. Category-specific Arabic queries returned mostly videos/discover pages from other Arab countries (≈0–3 usable per query). |
| YouTube index | ~0 usable (big non-Syrian channels). |
| Rate limit | The search provider answered HTTP 429 after ~25 queries in a few minutes. Respect it: pace requests, do not retry in a loop. |

Result of the first sweep: **61 new unique accounts** (0 already in the database), 31 under 10K, 10 `strong` + 29 `medium` Syria signal, 22 `weak`/`query_only` flagged for verification. City is known for only 28 of them.

## Second sweep — public directories (2026-10-01)
| Source | Access | Result |
|---|---|---|
| StarNgage Pro public rankings (`starngage.pro/ranking/<platform>/Syria/<topic>`) | robots.txt: no Disallow, no content-signal. Plain GET, honest UA, 1 req / 3 s, stop on non-200. Collector: `collect-starngage-public.mjs`, raw HTML kept in `data/creators/syria/raw/starngage/`. | Instagram "All": 1,000 (all ≥ 22.8K followers). TikTok: 604. YouTube: 228. Topic pages reach smaller accounts (Instagram Food/Home ≈ 2.7–3.8K, TikTok topics ≈ 2.7–5K) but each topic list is short (29–111 per topic). Location "SY" is the provider's own inference → `medium` signal unless the bio names Syria/a Syrian city (`strong`). Provider topics are stored as `provider_topics`, never as our `category`. Follower counts are the provider's snapshot (date not stated). |
| Modash public pages | Already collected in Wave 1 (`micro` re-parsed: 20 rows, overlap with the seed). Other slugs (beauty, lifestyle, cities) return 404. | No new pages exist. |
| upgrow.com/find-influencers/syria | public | **0** Syrian influencers ("still building our database"). |
| starngage.com (old domain) | 403 | not used. |

Merged pool after both sweeps (`discovery-merge.mjs`): **2,260 new unique accounts** (33 already in the database removed, 398 cross-source duplicates collapsed, 9 same-username cross-platform pairs reported for review — not merged). Under 10K followers: 399 (Instagram 199, TikTok 46, YouTube 154). City known for 145 (117 from the creator's own bio, exactly one city named). 133 flagged `possible_non_creator` (news/shop/quotes/salon/clinic words) — kept for human decision.

**Coverage gap (reported, not padded):** the 500–2.5K band is thin (≈123 accounts) because public directories rank by size; micro creators need the manual "add creator" route, brand-collaboration tags, or a licensed provider.

## Recommended next layers (to reach thousands)
1. Hashtag / location pages and "related profiles" are rich but sit behind login — use only through an allowed provider or manual human browsing (reviewers can add accounts through the workbench "add creator" form).
2. Syrian brands/stores that tag creators in collaborations (brand pages are public and name creators) — query by brand, not by niche.
3. Local directories/blogs (influencer.sy already covered: 65), Syrian media lists, university/pharmacy/clinic pages for Experts.
4. A commercial discovery provider only if bought legally by the company; evaluate on a small paid sample against this protocol's dedup and evidence rules, not on claimed database size.
5. Throttle: ≤ 1 query / 10 s, stop on 429, resume later.

## Files (local only)
`batch_NN.json` raw rows · `discovery_pool.json` / `.csv` merged pool · `skipped.json` · `known_handles.json` (dedup base).

## Third sweep (2026-10-01, after B001 went to review) — measured result
Rate-limit rule applied: manual search stopped at the second HTTP 429 (no retry loop); the StarNgage topic collector ran to completion at 1 request / 3 s with 0 refusals.
- Raw rows collected: 630 (16 remaining StarNgage topics × Instagram/TikTok/YouTube + 8 web-search rows).
- **New unique accounts: 212** (all Instagram). Already in the 2,260 pool: 397 · already in seed / database: 8 · repeated inside this run: 13.
- New by follower band: 500–2.5K **35** · 2.5–5K 20 · 5–10K 34 · 10–25K 123 (no 25K+ — the rankings were already exhausted).
- Pool: 2,472 (B001's 50 stay in the pool marked `queued`, never planned again). Needs-review list: 170 (146 possible non-creators, 24 same username on two platforms).
- Conclusion: public web/directory sources are saturated for 500–2.5K (+35 in a full sweep). Do not keep pressing them; move to the micro-creator sources below.

## Micro-creator source plan (replaces repeating the same queries)
1. The company's own audience: followers/engagers/taggers of the brand accounts (export from the company's Meta Business Suite — owner data, no scraping).
2. Official Meta Graph API `business_discovery` from the company's Instagram Business account: look up a username and read public followers_count / media of professional accounts — verification and enrichment at scale (not discovery, and only for professional accounts).
3. Brand-collaboration graph: Syrian brands/stores that repost or tag creators (collect via the same API tagged-media endpoints on our own account, or by hand from public brand pages).
4. The team's manual "add creator" form (already live), prioritising 500–2.5K, with a source on every row.
5. A licensed discovery provider only as a small paid test measured on this protocol's dedup/evidence rules (not on claimed database size).
