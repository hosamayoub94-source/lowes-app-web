# Creator Pilot — runbook (Queue 1 → up to 30 creators)
Status 2026-09-30: **tooling ready; the pilot itself has NOT started** — no creator has been reviewed or contacted, so there are no results yet. Persistence migration NOT applied, no deploy, no production writes. Nothing is sent by the system; "نسخ رسالة" only copies text.

## Who does what
| Step | Who | Tool |
|---|---|---|
| Review the 46 Queue-1 creators (8 questions each) | humans (2–3 reviewers) | Workbench → وضع التجربة (default) |
| Build the pilot list (≤30) | admin | Workbench → «التجربة» |
| Contact creators, record every step | humans | Workbench → «المتابعة» |
| Daily export | each reviewer | «تصدير الكل (JSON)» |
| Merge + report | admin | `pilot-report.mjs` |

Why humans: the 8 answers require opening the profiles and watching videos. Automated viewing of Instagram is not allowed (robots/ToS), and fabricated answers would defeat the purpose of the pilot.

## Setup (once)
1. `node scripts/creators/build-workbench-queue.mjs` (already generated: `data/creators/syria/seed/workbench_queue.json`, 103 rows; the workbench uses the 46 with `queue_tier = 1`).
2. Workbench → «البيانات» → team names (one per line) → load the queue file. Pilot mode is ON by default (Queue 1 only, strict review). Do not host the file publicly (it holds public business phones/emails).

## Review rules in pilot mode
- All 8 questions must be answered. "غير متأكد", a blank city, no contact answer, or a video claim without quality + URL = **that question is not answered** → the creator stays **Needs Review** (the card shows n/8 and what is missing).
- Q4 city: pick a city, or «غير معروف (تحققت)» if you looked and found none. Q5 contact: add a published contact **with its source link**, confirm the one research found, or tick «لا يوجد تواصل عام».
- Q3 is the UGC test: every «نعم» needs a quality rating and at least one video URL you watched. UGC "High" exists only from this.
- Fill the operational box when relevant (what slowed you, which questions were hard, which evidence helped) — it feeds the report. Use «ملاحظات» for bugs, missing fields, sources or contact methods that worked.
- Clear rejections (fit = no / inactive / recommend none) do not need all 8 answers.

## Pilot list (≤30, targets not quotas)
Targets: Beauty/Skincare 10 · Lifestyle/Women 5 · UGC-capable 5 · Experts 5 · Hair/Beauty 5. Only **human-reviewed, fully answered** Queue-1 creators with PR Ready / UGC Ready / Expert enter. Selection is **not** "first N": inside each group it prefers creators that add a follower tier, platform, contact method or city not yet in the list. A group without enough qualified creators shows its shortage; nothing is moved between groups; paid-inquiry creators are reported separately and are not in the gifting pilot. Use «اعرض سبب الاختيار» to see each pick's reasons.

## Outreach recording (per creator)
Stages: selected → assigned → **contacted** (needs owner + contact method) → replied → interested → accepted → address received → product sent (needs accepted + address) → received → content received (URL) → posted (URL); plus declined / no response (only after contact) / do not contact. «Interested» may be skipped when a creator goes straight to accepted (it is then counted as implied). Follow-ups: day 3, +4 days, then mark no response. Everything is sent manually by a person.

## Metrics (tab «النتائج», report tab, `pilot-report.mjs`)
1 contact response rate (replied or declined ÷ contacted) · 2 positive response (interested or beyond ÷ contacted) · 3 gift acceptance (accepted ÷ contacted, and among responders) · 4 address completion (÷ accepted) · 5 content completion (÷ product received) · 6 posting rate (÷ content received, and ÷ contacted) · 7 avg days to response · 8 avg days to content (product received → content; contact → content also shown) · 9 no-response rate · 10 breakdown by group. Breakdown dimensions: pilot group (slot), reviewer segment, creator type, follower tier, platform, PR/UGC/Expert/Paid, contact method.
Every rate shows its denominator and a Wilson 95 % interval; below 10 contacted it is labelled **descriptive only** and the report never calls a group successful or unsuccessful. The decision gate needs ≥30 contacted, ≥2 groups with ≥10 contacted, no open contacts and no products still waiting for content; **follower count is not an input**. Reaching the gate means the sample is big enough to read — it is NOT a success signal ("30 contacted" is a sample size, not a result). Success is read only from the downstream behaviour: interested → accepted → address → sent → received → content → posted.

**Paid Inquiry is a separate track.** Creators the reviewer marks "paid inquiry" stay in the system (Workbench → التجربة lists them with the reason, and the report has a “Paid inquiry track” section) but are not in the gifting/PR pilot, so gifting results are not mixed with budgeted deals.

**Pilot status rule:** the pilot is considered started only when real reviewers have completed real reviews. Test/synthetic runs never count and must not be turned into figures.

## Daily routine
Reviewers/contact owners export JSON daily → admin runs
`node scripts/creators/pilot-report.mjs data/creators/syria/seed/workbench_queue.json export-A.json export-B.json …`
→ `data/creators/syria/reviews/PILOT_DECISION_REPORT.md` + `pilot_report.json` (sections: DATA · OUTREACH · CONTENT · SEGMENT RESULTS · OPERATIONAL FINDINGS · SYSTEM ISSUES · DECISION GATE). `merge-workbench-exports.mjs` additionally produces `verified_leads.csv`. Browser data is per device: export before clearing it.

## What the final decision report must answer (already scaffolded in the generated report)
Reviewed / Qualified / Needs Review / Rejected · Contacted / Replied / Interested / Accepted / Declined / No response · Product sent / Content received / Posted · results per group · what slowed reviewers, which fields were hard, which evidence helped, which categories were hardest to find, which contact methods worked · UI bugs, workflow bugs, missing fields, persistence and export/merge problems.
