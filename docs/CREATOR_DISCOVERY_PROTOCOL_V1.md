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

## Recommended next layers (to reach thousands)
1. Hashtag / location pages and "related profiles" are rich but sit behind login — use only through an allowed provider or manual human browsing (reviewers can add accounts through the workbench "add creator" form).
2. Syrian brands/stores that tag creators in collaborations (brand pages are public and name creators) — query by brand, not by niche.
3. Local directories/blogs (influencer.sy already covered: 65), Syrian media lists, university/pharmacy/clinic pages for Experts.
4. A commercial discovery provider only if bought legally by the company; evaluate on a small paid sample against this protocol's dedup and evidence rules, not on claimed database size.
5. Throttle: ≤ 1 query / 10 s, stop on 429, resume later.

## Files (local only)
`batch_NN.json` raw rows · `discovery_pool.json` / `.csv` merged pool · `skipped.json` · `known_handles.json` (dedup base).
