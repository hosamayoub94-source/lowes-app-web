# Creator Review & Outreach Workbench
Status 2026-09-30: built, tested locally (browser-verified), **not deployed, no migration applied, no production data touched.**
Goal: turn the 250 researched records into a shortlist of **human-verified, contactable leads**, then run a small first commercial test (Wave 01 = 50) and measure it.

## 1. Flow
`Queue (103) → human review 60–90 s → verdict labels → Wave 01 (50, quotas) → manual outreach tracking → funnel numbers`
Nothing is sent by the system. "نسخ رسالة" only copies a template for a person to paste.

## 2. Where it lives
- Screen: `/creators/workbench` (button «🧪 مراجعة وتواصل» on the Creators screen). Permission: VIEW_CREATOR_INTELLIGENCE to open · MANAGE_CREATOR_RESEARCH (or MANAGE_CREATOR_DATA) to review · MANAGE_CREATOR_CAMPAIGNS to build waves / track outreach.
- Logic: `src/services/creatorReview.js` (pure, 68 tests) · storage: `creatorReviewStore.js` · UI: `src/components/creators/CreatorWorkbench.jsx`.
- **Storage is local to each browser + JSON export**, because the `creator_*` tables are not applied anywhere. A draft persistence migration exists (`20260930130000_creator_review_workbench.sql`, verified on PGlite, not applied).

## 3. Start (admin)
1. `node scripts/creators/build-workbench-queue.mjs` → `data/creators/syria/seed/workbench_queue.json` (103 creators: tier 1 = 46 = PR ∪ Expert ∪ UGC pools; tier 2 = 41 remaining Paid pool; tier 3 = 16 others with a business contact or beauty category). **Internal file: never host it publicly** (it contains public business phones/emails).
2. Open the workbench → «البيانات» → type the team names (one per line) → «تحميل الطابور». The queue is distributed round-robin so every reviewer gets the same tier mix.
3. Each reviewer opens «ابدأ المراجعة».

## 4. The 8 questions (60–90 s per creator; the timer is shown, the median is tracked)
| # | Question | How to answer fast | Feeds |
|---|---|---|---|
| 1 | Is the account really active? | open the profile; active = a post within 90 days; enter the date of the last post | activity (fresh, human-verified) |
| 2 | Does the content fit LOWE'S? + segment | skincare / beauty / women lifestyle / hair / expert | fit, wave slot |
| 3 | Face on camera? talks? review? unboxing? video quality? | open **1–2 sample posts/reels** (links are on the card); paste the reel URL(s) you watched | **UGC** — the only way to reach UGC Ready/High |
| 4 | City | as stated by the creator (bio/tag) | city (source = human) |
| 5 | Public contact | only what is published on the profile; always with the source link | contact hierarchy |
| 6 | Visible PR / collab signal | «gifted seen» needs the post link | accepts_gifting (evidence only) |
| 7 | Fit for Retinol / skincare | yes / maybe / no | PR Ready |
| 8 | Decision: gift / UGC / paid inquiry / none | | verdict |
Rules: "unsure" is a valid answer and produces **Needs Review**, never a guess. Do not add private numbers/emails. Do not store personal details.

## 5. Verdicts (derived automatically, can co-exist)
| Label | Rule |
|---|---|
| **UGC Ready** | face on camera = yes **and** (talks or reviews or unboxes) **and** quality high/medium **and** ≥1 video URL. (High = quality high + this evidence) |
| **PR Ready** | active = yes, fit yes/partial, skincare fit yes/maybe (or lifestyle/expert segment), action gift/ugc, and at least a reachable channel |
| **Paid Inquiry** | action = paid and a reachable channel |
| **Expert** | creator type expert or segment expert, fit yes/partial |
| **Not Relevant** | fit = no, or inactive, or action = none |
| **Needs Review** | any of active / fit / skincare fit / action unanswered, or UGC recommended without evidence |
After a review, the creator's record is updated in the workbench view: activity (human basis), city, contacts (`human_verified`), UGC (`visual_review`), gifting evidence, pools, data-quality score and the "why" text.

## 6. Wave 01 = 50 (defaults, editable per slot)
`10 UGC-capable · 5 Experts · 20 Beauty/Skincare · 10 Lifestyle/Women · 5 Hair/Beauty`.
Only **human-reviewed** creators with a commercial label can enter; each is used once (slot order: UGC → Experts → the three segments); creators in earlier waves are excluded. **If a slot cannot be filled the shortfall is shown — the system never pads with unreviewed names.** With today's data the realistic first fill is well below 50 (only 46 tier-1 creators exist, 2 UGC candidates on text evidence); the review pass decides the true number.

## 7. Outreach tracking (operational only)
Stages: selected → assigned → contacted → replied → accepted → address received → product sent → received → content received → posted, plus declined / no response / do not contact.
Guard rails: an owner must be assigned before "contacted"; "product sent" needs accepted **and** address received; "posted" needs a content URL; no moves backwards; terminal states are final. Follow-up suggestions: day 3 (first), +4 days (second), then "mark no response". Funnel: counts and conversion vs previous stage and vs contacted, plus UGC-content count and per-segment view.

## 8. Daily routine without a shared database
Each reviewer: «تصدير الكل (JSON)» at the end of the day → send to the admin. Admin: `node scripts/creators/merge-workbench-exports.mjs data/creators/syria/seed/workbench_queue.json export-A.json export-B.json …` → `data/creators/syria/reviews/{merged_exports.json, verified_leads.csv, summary.json}` (invalid rows are listed, latest review per creator wins, history is kept; wave members keep the record with the longer history). Browser data is per device: **export before clearing the browser.**

## 9. Effort and what to measure
Tier 1 (46) ≈ 46 × 90 s ≈ 70 min of reviewer time; the whole queue (103) ≈ 2.5 h. Capture per wave: contacted → replied → accepted → address → sent → received → content → posted, UGC content count, and reply time. **These numbers, not a global rate benchmark, decide Wave 02 (100) and Wave 03 (300).** Suggested gate (owner to confirm): move on when ≥30 have been contacted and the reply/accept rates are known per segment; scale the segments that convert.

## 10. Known limits
- Reviews are local until the persistence migration is applied; two reviewers editing the same creator offline is resolved by "latest review wins" (history kept).
- PR fit is still rule-derived until a human answers questions 2/6/7; gifting acceptance stays unknown until a creator says yes or a gifted post is linked.
- Contact data is public-business only; DM channels mean "a profile exists", not "DMs are open".
- No Syrian rate benchmark exists; the workbench does not price anyone.
