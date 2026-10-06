# PHASE 6B — Directory Expansion · Master Discovery (6 تشرين الأول 2026)

> **ملف مراجعة فقط.** لا migration، لا قاعدة إنتاج، لا import، لا commit، لا push، لا deploy. الـ205 استُعملت كمرجع قراءة فقط ولم تُعدَّل.
> الملف: `data/creators/syria/discovery_master_2026-10-06.csv` (286 صفاً فريداً) — يحتوي الأعمدة المطلوبة + `status_vs_205` · `rank` (A–D) · `exclusion` · `size` · `duplicates_merged`.

## المصادر وما أمكن الوصول إليه (بلا Firecrawl)
| المصدر | الطريقة | النتيجة |
|---|---|---|
| **Modash** | جلب HTML العام مباشرة (curl) | 15 صفحة سورية متاحة: الرئيسية، دمشق (+affiliates)، skincare، micro، female، male، health، fashion (+affiliates)، fitness، food (+affiliates)، family — **صفحات المحافظات الأخرى (حلب، حمص، حماة، اللاذقية، طرطوس، إدلب، درعا، السويداء، الحسكة، الرقة، دير الزور، القنيطرة، ريف دمشق) وفئات beauty/makeup/haircare/lifestyle/creator/ugc غير موجودة (404)** — جرّبت 55 رابطاً. كل صفحة = Top 20 كحد أقصى. |
| **Hive Influence** | جلب HTML العام | 12 فئة سورية متاحة (beauty، skincare، hair، health، fashion، business، media، fitness، food، travel، music، photography) × Top 10 |
| **Heepsy** | جلب HTML العام | Top 10 سوريا (مشاهير) فقط؛ صفحات الفئات 404 |
| **StarNgage** | — | **403 حماية من البوتات — لم أتجاوزها.** نسخة starngage.pro تُحمَّل بـJavaScript فقط |
| **WhoTag / Influs** | — | لا صفحة سورية عامة قابلة للوصول |
| **Google/Bing العامة** | أداة WebSearch | 12 بحثاً (عربي/إنجليزي × محافظات × UGC/skincare/صيدلانية/unboxing/ريفيو). النتائج يغلب عليها صفحات إعادة نشر ومتاجر وعيادات؛ أضافت **1 مرشّحاً قوياً** (`dr.sara.care`) و3 للمراجعة |
| جولات الاكتشاف 1+2 | Firecrawl (سابقاً) | 14 مرشّحاً + أدلة على 19 حساباً موجوداً |

## الأرقام
| | العدد |
|---|---|
| **إجمالي المرشحين قبل التنظيف** (سجلات خام) | **408** = 315 سجل أدلة + 14 بحث جولة 2 + 9 WebSearch + 10 إعادة فحص + 60 حساباً مستبعداً بالاسم أثناء البحث |
| **الحسابات الفريدة بالملف** | **286** |
| **المكررات المدموجة** (نفس الحساب بأكثر من صفحة/مصدر) | **62** |
| **موجودون أصلاً بالـ205** (`existing`) | **96** |
| **جدد** (`candidate`) | **190** |
| مستبعدون داخل الملف | **234** |
| مستبعدون بالاسم أثناء البحث (خارج الملف) | **60** |
| **باقون بعد التنظيف** | **52** → A: **5** · B: **9** · C: **27** · D: **11** |

### التصنيف (الـ52 الباقون)
| UGC | SKINCARE | REVIEWER | UNBOXING | EXPERT | BEAUTY | GENERAL |
|---|---|---|---|---|---|---|
| 10 | 3 | 2 | **0** | 16 | 10 | 11 |

- محتوى UGC (نوع أو أنواع محتوى): **11** · ارتباط Skincare مسجّل (Skincare/Expert/تخصص بشرة): **22** · محتوى مراجعات: **10** · Unboxing مثبت: **0**.
- **Expert منفصل تماماً عن UGC:** الأطباء والصيادلة الـ16 مصنّفون EXPERT ولا يُحسب أي منهم UGC.
- الحجم (من بيانات الأدلة المؤرَّخة فقط): Nano **8** · Micro **10** · Macro **6** · **مجهول 28** (لم يُقدَّر أي رقم).
- المحافظات (A/B/C = 41): دمشق 7 · حلب 3 · حمص 2 · اللاذقية 2 · ريف دمشق 2 · إدلب 1 · طرطوس 1 · حماة 1 · **غير معروفة 22**. لا أحد من درعا/السويداء/القنيطرة/الحسكة/الرقة/دير الزور.
- **تحتاج تحقق:** كل الـ52 (لا أحد `verified` — لم يُفتح أي حساب على Instagram مباشرة). `partial` = 15 (بروفايل/دليل + سوريا صريحة).

### المستبعدون (294) وأسبابهم
| السبب | داخل الملف | أثناء البحث | المجموع |
|---|---|---|---|
| محتوى عام بلا ارتباط بالجمال/البشرة (أكل، رياضة، موسيقى، إعلام، سفر، يوميات…) | 204 | 3 | 207 |
| صالون / مكياجير / مركز تجميل / مقدّم خدمة | 18 | — | 18 |
| متجر / براند / صفحة بيع | 7 | 21 | 28 |
| عيادة / صيدلية تجارية / أكاديمية | 1 | 9 | 10 |
| صفحة إعادة نشر («Syrian Beauty»…) | — | 9 | 9 |
| خارج سوريا | 3 | 7 | 10 |
| بلا دليل سوريا | 1 | 5 | 6 |
| دليل ضعيف | — | 6 | 6 |
> من الـ96 الموجودين أصلاً: **70 مستبعَدون** بهذه القواعد — منهم 13 صالون/مكياجير (`yousef_a_hamoud`، `miladhannoun`، `johnysouleiman`، `thaer.trablse`، `silvahosni.makeup`، `stephany.zaour`، `marahmoalla_makeupartist`…). **لم يُحذف أي منهم من القاعدة** — هذا تصنيف مراجعة فقط.

## معيار الترتيب (ليس Score فقط)
- **A — ممتاز لـLOWE'S:** UGC أو Reviewer أو Skincare + دليل سوريا (medium/high) + محتوى منتجات أو استعداد تعاون (PR/بريد) + ليس متجراً/منافساً.
- **B — مناسب:** Expert سوري بمحتوى بشرة فعلي، أو Beauty بدليل skincare واضح، أو UGC سوري مؤكد بلا skincare بعد.
- **C — يحتاج مراجعة:** سوريا غير مؤكدة، أو Beauty بلا دليل skincare، أو صاحب براند/عيادة (منافس محتمل)، أو نشاط مجهول.
- **D — غير مناسب:** خارج المجال، خارج سوريا، غير نشط، موديل/خدمة.

## TOP LOWE'S CREATOR CANDIDATES — العدد الحقيقي: **14 موصى بهم (A+B)** + 27 مشروطون (C)
لا يوجد 50 حساباً موثوقاً ومناسباً. هذا هو العدد الحقيقي.

| # | الحساب | Rank | النوع | المحافظة | متابعون | 205؟ | لماذا |
|---|---|---|---|---|---|---|---|
| 1 | `creates.by.farah_` | **A** | UGC | حمص | NULL | جديد | UGC + تصوير منتجات عناية بالبشرة + حمص بالبايو |
| 2 | `doctor.simon1` | **A** | Reviewer | — | NULL | جديد | سلاسل تقييم منتجات بشرة سورية بالسعر |
| 3 | `pinkbyshoshi` | **A** | UGC | حلب | NULL | جديد | Faceless beauty UGC، PR/Collabs، بريد عام |
| 4 | `saraghafri3` | **A** | UGC | دمشق | NULL | جديد | UGC مقيمة بدمشق + بريد ورقم تعاون |
| 5 | `tala.mahfoud12` | **A** | UGC | — | NULL | جديد | UGC + مراجعات + «Syria» + نشطة أيلول 2026 |
| 6 | `miray.sultanah` | B | Skincare | طرطوس | NULL | موجود | «blogger Skin care specialist #tartous #syria» |
| 7 | `carmen_tutorials2` | B | Beauty | حلب | 2.9K | موجود | نصائح makeup & skincare، تفاعل 6.65% |
| 8 | `dr.souadalayoubi` | B | Expert | اللاذقية | 1.4K | موجود | أخصائية بشرة، do & don'ts للروتين، تفاعل 4.5% |
| 9 | `dr.joell_mohamad` | B | Expert | حمص | 12K | موجود | صيدلانية — skincare/haircare tips |
| 10 | `dr.ramasharkas` | B | Expert | إدلب | 16.5K | موجود | Clinical pharmacist + cosmetic scientist |
| 11 | `dr.sara.care` | B | Expert | — | NULL | جديد | «معتمدة من وزارة الصحة السورية» |
| 12 | `dr_mohammad_al_ali1` | B | Expert | — | NULL | جديد | صيدلاني يراجع منتجات بسوريا، يقبل إعلانات |
| 13 | `shamassa_0` | B | UGC | دمشق | NULL | جديد | UGC موديل — أزياء، لا skincare بعد |
| 14 | `with.rouya` | B | UGC | — | NULL | جديد | UGC سوريا — محتوى تعليمي |

**C — مشروطون (27، يحتاج فتح الحساب قبل أي تواصل):** `ugcbyzouna` · `beautywithvia` · `sarmin.ugc` · `ennas1_` · `farahgharzldeen` · `_daliaalshikh` · `safa_rhall` · `skin.by.sama` · `drsarah.skin` · `_leen__care_` · `dr.skinn.care` · `fatim96_a` · `noorzaineddin_` · `manar_morabia` · `loubana_hamdan` · `batoulysalim` · `leen_allahham0` · `fatima.almahairi` · `lilanaddaf` · `maram_bayyumi_` · `carmenkrait` · `maramsmair` · ⚠️ منافسون محتملون (لهم براند/عيادة/بيع): `alma._.yaghi` · `ph.mona_almadani` · `rawan.dari` · `haya_makansi` · `sarah.sk963`.

## المقارنة
| | Discovery (جولة 1+2) | الـ205 الموجودون | Directory Expansion (6B) |
|---|---|---|---|
| حجم الإدخال | 14 جديداً + أدلة على 19 موجوداً (~24 قوياً) | 205 | 253 حساباً فريداً من الأدلة + 13 من WebSearch |
| يتداخل مع الـ205 | 6 مكررات لم تُضف | — | **86 من الـ253 موجودون أصلاً** (الـ205 أصلها Modash/Hive) |
| جدد فعلاً | 14 | — | 167 من الأدلة + 13 WebSearch |
| مفيدون بعد التنظيف (A/B/C) | 14 جديداً (A 5 · B 4 · C 5) | 18 من الموجودين (B 5 · C 13) + 8 D | **من الأدلة: 2 جدد فقط بمستوى C** (`manar_morabia`، `lilanaddaf`)؛ من WebSearch: 1 B (`dr.sara.care`) + 6 C |
| UGC | 6 | 0 | 0 (الأدلة لا تفهرس UGC الصغار) |
| ملاحظات | أفضل مصدر للـUGC والمراجعين | 64 فقط بموقع؛ 0 متحقَّق؛ 13 صالون/مكياجير؛ 3 خارج سوريا؛ 1 بلا منشورات؛ 3 لهم براند | الأدلة العامة = Top 10/20 للمشاهير والأزياء والأكل؛ لا صفحات محافظات ولا UGC/Unboxing |

**الاستنتاج:** الأدلة العامة استُنفدت عملياً — قيمتها الأساسية كانت **تنظيف الـ205** (كشف الصالونات والمتاجر والمقيمين خارج سوريا) لا الاكتشاف. الـUGC والمراجعون الحقيقيون جاؤوا فقط من البحث المباشر بالمحتوى.

## الإجابات المباشرة
| السؤال | الجواب |
|---|---|
| **كم حساب Skincare حقيقي لدينا؟** | **9** بدليل skincare + سوريا ومستوى A/B: `doctor.simon1`، `creates.by.farah_`، `miray.sultanah`، `carmen_tutorials2`، `dr.souadalayoubi`، `dr.joell_mohamad`، `dr.ramasharkas`، `dr.sara.care`، `dr_mohammad_al_ali1` — منها 5 Expert. (+13 بارتباط skincare لكن بمستوى C) |
| **كم UGC محتمل؟** | **6** مؤكد سوريا (A/B): `creates.by.farah_`، `saraghafri3`، `tala.mahfoud12`، `pinkbyshoshi`، `shamassa_0`، `with.rouya` · +5 بمستوى C |
| **كم Reviewer؟** | **1** قوي (`doctor.simon1`، A) + 1 ضعيف (`safa_rhall`، C)؛ و8 آخرون لديهم محتوى مراجعات ضمن نوع آخر |
| **كم Expert؟** | **16** (5 مستوى B، 11 مستوى C) — ليس أي منهم UGC |
| **كم حساب يستحق التواصل فعلياً الآن؟** | **14** (A 5 + B 9). البداية المقترحة: الـ5 من A لـUGC/المراجعات، ثم `miray.sultanah` و`carmen_tutorials2` و`dr.souadalayoubi` (nano/micro بتفاعل عالٍ). الخبراء الـ5 للتعاون كـExpert (مراجعة/توصية) لا كـUGC |

## قيود صريحة
- لم يُفتح أي حساب على Instagram — «وجود الحساب» مستنتج من الأدلة أو من فهرسة البحث فقط.
- followers/engagement مملوءة **فقط** من Modash/Hive (مؤرَّخة أيلول/تشرين الأول 2026)؛ الباقي NULL.
- ملخّصات WebSearch مصدرها نموذج بحث — المرشّحون منها مُعلَّمون `unverified`/C ما لم يتأكدوا من مصدر آخر.
