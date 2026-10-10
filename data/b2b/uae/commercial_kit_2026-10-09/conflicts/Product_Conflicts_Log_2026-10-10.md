# Product Conflicts Log — 10 Oct 2026 (internal · nothing sent, nothing changed)

Evidence classes: **[مستند]** read in a company file · **[الإدارة]** management-confirmed · **[غير موجود بالملفات]** not found in files (does NOT mean the company lacks it) · **[خارجي]** needs confirmation from a third party.
Rule applied: no INCI is chosen, no label/formula is altered, no claim is used without support.

## C-01 · Rosemary Hair Oil (LW-HR-803, LHR-OIL-01) — INCI conflict: REAL

Compared (read-only): box artwork (`Lowes - Rosemary Hair Oil - Box.pdf`), product-details file (`... Rosemary Hair Oil ... تفصيل` PDF), catalog (EN/AR). The print-file and `سيروم الشعر.pdf` are image-only (no text layer) — **not compared**.

| Source | Batch / Expiry | INCI items | Biotin in INCI | Claims |
|---|---|---|---|---|
| Box artwork [مستند] | LBH 004 / 30.09.2028 | **30** | **No** | Front: "Blended with Biotin and Natural Oils"; "Nourishes Skin and Scalp" |
| Details file [مستند] | LRO 001 / 30.08.2027 | **26** | **No** | not extractable (Arabic text layer) |
| Catalog [مستند] | — | not listed | not listed | Active: Rosemary Oil; "promotes hair growth", "reduce hair loss", "increase hair density", "improves blood circulation in the scalp" |
| Manufacturer statement [مستند، أعدّته الشركة] | — | none | — | no INCI, no claims |
| Test reports [مستند] | — | — | — | SKINLAB tests **Pure Rosemary Water only** (see C-04) |

**Result of the comparison (full ingredient table: `hair_oil_inci_comparison_2026-10-10.csv`):**
- Common to both: **17** ingredients.
- **Box only (13):** Equisetum Arvense Extract, **Benzyl Nicotinate**, Oryza Sativa Bran Oil, Arctium Lappa Root Extract, Glycerin, Apium Graveolens Seed Extract, **Ascorbic Acid**, Ocimum Basilicum Oil, Pogostemon Cablin Oil, Salvia Officinalis Oil, Silica, Urtica Dioica Extract, Melaleuca Alternifolia Leaf Oil.
- **Details file only (9):** Helianthus Annuus Seed Oil, Boswellia Serrata Extract, Nigella Sativa Oil, Corylus Avellana Seed Oil, Anthemis Nobilis Extract, Argania Spinosa Kernel Oil, Persea Gratissima Oil, Macadamia Ternifolia Seed Oil, Linum Usitatissimum Seed Oil.
- The two files carry **different batch codes and expiry dates**, so they are most likely **two different production versions** — but that is an inference, not a documented fact.

**Answers:**
1. **Is there a real INCI difference?** Yes. 22 of 39 distinct ingredients differ between the box and the details file.
2. **Is Biotin in the formula or only on the pack?** In **no** INCI list found. It exists **only as a front-of-pack phrase**. Biotin in the formula is therefore **not proven**; the phrase must not be used in any listing until the manufacturer confirms.
3. **Official manufacturer document?** None for this product. The only company-level paper is a statement prepared by the company itself. [غير موجود بالملفات]
4. **Which claims are provable today?** Only what is printed on the box: "Nourishes Skin and Scalp" and usage instructions. **No** hair-growth, hair-loss, density or blood-circulation claim is supported for this oil: the SKINLAB result belongs to a different product (water), and no test on the oil was found.
5. **Hold until written confirmation:** final INCI, Biotin, every hair-growth/hair-loss/circulation claim, and the batch version to ship. Also ask about **Benzyl Nicotinate** (a rubefacient/vasodilating ingredient appearing in the box INCI) and **Ascorbic Acid** in an oil: confirm intended presence and the regulatory acceptability of each ingredient for UAE.

**Decision:** Rosemary Hair Oil = **hold — not ready to prepare for publication** until C-01 is closed by the manufacturer in writing. Draft letter: `correspondence/Manufacturer_Letter_DRAFT_EN.md` (not sent).

## C-02 · Vitamin C Serum (LW-SR-101, LSK-SER-01)

| Item | Box [مستند] | Catalog / details [مستند] | Resolution |
|---|---|---|---|
| Front actives | Ascorbic Acid 20% · Ferulic Acid 2% · Vitamin B5 | Catalog agrees; the details file appears to attach "2%" to B5 | Use the **box**; confirm with CEELLO (non-blocking) |
| "Enhances sunscreen effectiveness" | not on box | in catalog | Do **not** use without substantiation |
| INCI | Aqua, Ascorbic Acid, Panthenol, Ferulic Acid, Glycerin, Glutathione, Phenoxyethanol, Ethylhexylglycerin | — | Box INCI = only source; no conflict found |
| Name / size / brand | "Vitamin C Serum", 30 ml (1.00 fl.oz), LOWE'S Profesyonel | same | **Match** |

No INCI conflict for Vitamin C.

## C-03 · Label company ≠ ABOS entities [مستند] — open (management)
Pack artwork names **L B İÇ VE DIŞ TİCARET KOZMETİK A.Ş.** (Kadıköy, İstanbul). ABOS records two different entities (Turkish LTD and UAE FZ-LLC). Role of the label company (brand owner / responsible person / distributor) is **not documented**. Platforms and the regulator match label data to documents → management must explain it in writing.

## C-04 · SKINLAB result vs LOWE'S products — scope limit
Report (SKINLAB P.S.A., Kraków, 20.03.2026, commissioned by CEELLO) tests **"The CEEL Pure Rosemary Water"**: +15.53% hair density, 8 weeks, 30 volunteers.
- Applies at most to **Pure Rosemary Water (LHR-TNR-01)**, and only after CEELLO confirms in writing that the tested product and the LOWE'S product have the **same formula**.
- **Does not apply to Rosemary Hair Oil** (a different product: oil with 26–30 ingredients).
- What would count as proof: (a) the full report incl. test-product INCI and sample/batch; (b) a CEELLO letter stating the relation between "The CEEL Pure Rosemary Water" and LOWE'S Pure Rosemary Water; (c) permission/wording for the claim. Draft: `correspondence/SKINLAB_CEELLO_Clarification_DRAFT_EN.md` (not sent).

## C-05 · Trademark — application ≠ ownership proof
See `correspondence/Trademark_Authority_Review.md`.

## C-06 · Test reports [مستند — فهرس]
The certificates index says all 26 products have stability/challenge/micro reports in a Drive folder; locally, reports exist for 9 SKUs only. Vitamin C and Hair Oil have **no local report**. [غير موجود بالملفات]
