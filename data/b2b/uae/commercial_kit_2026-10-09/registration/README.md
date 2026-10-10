# Registration-match table (26 SKUs) — 10 Oct 2026

`registration_match_26_2026-10-10.csv/.json` — built read-only from the company product folders by `scripts/b2b/discovery/build_registration_match.cjs`.

- **UAE registration:** management confirms all products are registered; **no certificate, number or validity date was found in the available files**. Status for every row: «التسجيل مؤكد من الإدارة؛ إثبات التسجيل لم يُعثر عليه ضمن الملفات المتاحة». No product is labelled unregistered and nothing is re-registered.
- **EAN:** printed EAN-13 (valid check digit) read from artwork for 3 SKUs only (LW-SR-101, LW-HR-803, LW-FC-203); the other packs have text converted to outlines, so the field is empty — read manually from the current pack.
- **"on-pack name / label company = غير مقروء آلياً"** means the PDF text is outlined, not that the pack lacks it.
- SKUs without a pack/print file in the folder: LW-SP-401, LW-MN-901, LW-BD-703 (details file only).
- Fields to complete by management once proofs exist: `uae_registration_number`, `uae_registration_proof_path`, `uae_registration_validity`.
