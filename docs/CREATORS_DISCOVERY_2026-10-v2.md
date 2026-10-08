# جولة الاكتشاف الثانية — سوريا (6 تشرين الأول 2026)

> **لم يُدخل شيء على الإنتاج.** لا migration، لا commit، لا push، لا deploy.
> الملفات: `data/creators/syria/discovery_2026-10-06-v2.csv` (مرشّحون جدد — يحلّ محل ملف الجولة الأولى ويتضمّن الـ10 بعد إعادة تصنيفها) · `data/creators/syria/recheck_existing_2026-10-06.csv` (أدلة جديدة على حسابات موجودة — للتصنيف لاحقاً، لا للاستيراد).

## ⚠️ الحقيقة أولاً: لماذا العدد ما زال صغيراً
1. **Instagram غير قابل للجلب:** أداة الجلب ترفض صفحات Instagram صراحةً، ولم أتجاوز ذلك. كل الأدلة من **فهرس محركات البحث** (عنوان + مقتطف + تاريخ المنشور) ومن أدلة المؤثرين العامة.
2. **أغلب نتائج «سكين كير + محافظة» متاجر وصيدليات وعيادات** — عشرات النتائج بكل بحث، استُبعدت كلها حسب طلبك.
3. **اسم الحساب لا يظهر دائماً:** كثير من الريلز السورية المناسبة (مراجعات واقيات شمس، سيرومات فيتامين C بسوريا…) ظهرت بلا اسم صاحبها، فلم تُضف لأن الإضافة تحتاج @handle حقيقياً.
4. **رصيد Firecrawl انخفض أثناء الجولة** (تنبيه «low on credits» من أول بحث). نُفّذ **39 بحثاً + 4 صفحات أدلة** عبر الجولتين — أقل بكثير من «مئات» الـQueries المطلوبة. **لإكمال التغطية يلزم رصيد إضافي.**

## الأرقام

| المؤشر | العدد |
|---|---|
| حسابات شخصية فُحصت بالاسم (كل الجولتين) | **74** (+ عشرات صفحات متاجر/عيادات غير معدودة بالاسم) |
| **مرشّحون جدد فريدون** (بالملف) | **14** |
| مكررات داخل القائمة | 0 |
| مكررات مع القاعدة الحالية (لم تُضف) | **6** — `dr.souadalayoubi`، `masa.dawalibi`، `alma._.yaghi`، `dr.ramasharkas`، `dr.joell_mohamad`، `carmen_tutorials2` |
| مستبعَدون | **49** (التفصيل أدناه) + 5 «معلّقون — بلا دليل سوريا» |
| UGC Creator | **8** |
| Skincare (Expert أو تخصص بشرة مسجّل) | **7** |
| Reviewer | **2** (+ 6 حسابات فيها محتوى مراجعة) |
| Expert (صيدلاني/طبيب — **منفصل عن UGC**) | **4** |
| Unboxing | **0** — لم يُعثر على حساب سوري بدليل Unboxing مثبت |
| Beauty / General | 0 / 0 (بين الجدد) |
| Nano (<10K) — حسب مقتطفات بحث غير متحقَّقة | 4 (`with.rouya`، `ugcbyzouna`، `shamassa_0`، `tala.mahfoud12`) |
| Micro (10K–100K) — حسب مقتطف | 1 (`ph.mona_almadani`) · Macro: 1 (`dr_mohammad_al_ali1`) · **الحجم مجهول: 8** |
| وجود مؤكَّد على Instagram (بروفايل مفهرس ببايو) | **11** · الباقي 3 = منشور مؤرَّخ للحساب فقط |
| `partial` (بروفايل + دليل سوريا صريح) | **9** |
| `unverified` / يحتاج مراجعة | **5** — وكل الـ14 حالتها `discovered` |

**followers / engagement:** NULL لكل الجدد (المقتطفات غير مؤرَّخة — ذُكرت بالملاحظات فقط كـ«غير متحقَّق»).

### حسب المحافظة (الجدد)
دمشق 4 · حلب 1 · حمص 1 · اللاذقية 1 · **غير معروفة 7** (`location_confidence` = medium/low) · باقي المحافظات (ريف دمشق، حماة، طرطوس، إدلب، درعا، السويداء، القنيطرة، الحسكة، الرقة، دير الزور): **0** — بُحث فيها، والنتائج كانت متاجر/مراكز تجميل فقط.

## المرشّحون الجدد مرتّبين بالـScore (نفس دالة التطبيق)
| # | الحساب | Score | النوع | المحافظة | ملاحظة |
|---|---|---|---|---|---|
| 1 | `tala.mahfoud12` | 63 🟢 | UGC | — | «Syria \| UGC Creator — Real reviews, GRWM» |
| 2 | `doctor.simon1` | 62 🟢 | Reviewer | — | سلاسل تقييم منتجات البشرة الوطنية |
| 3 | `dr_mohammad_al_ali1` | 62 🟢 | Expert | — | صيدلاني، «للإعلانات DM» |
| 4 | `drsarah.skin` | 60 🟢 | Expert | دمشق (low) | «pharmacy skincare finds in Damascus» — قد تكون زيارة |
| 5 | `creates.by.farah_` | 55 🟡 | UGC | **حمص** | «Product & UGC Creator» + تصوير منتجات عناية — **الأقرب لهدفنا** |
| 6 | `beautywithvia` | 51 🟡 | UGC | — | «Germany • Syria» ⚠️ |
| 7 | `ph.mona_almadani` | 50 🟡 | Expert | دمشق | ⚠️ تبيع منتجاتها — منافس محتمل |
| 8 | `safa_rhall` | 50 🟡 | Reviewer | — | تقييم منتجات وطنية |
| 9 | `with.rouya` | 43 | UGC | — | مدربة UGC |
| 10 | `shamassa_0` | 43 | UGC | دمشق | أزياء |
| 11 | `pinkbyshoshi` | 38 | UGC | حلب | Faceless + بريد تعاون |
| 12 | `_leen__care_` | 38 | Expert | اللاذقية | مرتبطة بمركز تجميل |
| 13 | `saraghafri3` | 30 | UGC | دمشق (high) | بريد + رقم عام |
| 14 | `ugcbyzouna` | 26 | UGC | — | جديد جداً |

> الـScore منخفض عند حسابات UGC قوية مثل `saraghafri3` و`creates.by.farah_` لأن تاريخ النشاط والتفاعل **مجهولان (0 نقطة، لا تقدير)**. بعد فتح الحساب وتسجيل آخر نشر وأنواع المحتوى سيرتفع.

## «أفضل 50» — غير ممكن بأمانة الآن
المتاح بدليل كافٍ: **14 جديداً + 10 حسابات موجودة أصلاً لها أدلة skincare قوية** (من إعادة الفحص). أفضل 24:
الجدد أعلاه + من القاعدة الحالية: `miray.sultanah` (Skin care specialist، طرطوس) · `dr.souadalayoubi` (أخصائية بشرة، اللاذقية) · `dr.joell_mohamad` (صيدلانية، حمص) · `dr.ramasharkas` (Cosmetic Scientist) · `sarah.sk963` (Skin Expert، حماة) · `skin.by.sama` (skincare) · `carmen_tutorials2` (makeup & skincare tips، حلب) · `alma._.yaghi` (Formulator ⚠️ براند خاص) · `rawan.dari` (دمشق ⚠️ براند `rava_skin_care_`) · `masa.dawalibi` (⚠️ الإمارات حسب Modash).
**الوصول لـ50 يحتاج:** رصيد Firecrawl إضافي، أو مراجعة يدوية من الفريق باستعمال تبويب «اكتشاف» (يولّد نفس الـQueries) وفتح الحسابات مباشرة على Instagram.

## إعادة فحص الـ205 (بلا تعديل ولا حذف ولا استيراد)
فُحص **19 حساباً** من الـ84 المصنّفة بشرة/جمال/مكياج/صحة (الأولوية للأقرب للبشرة). النتائج بـ`recheck_existing_2026-10-06.csv`. أهمها:
- **خارج سوريا على الأغلب:** `masa.dawalibi` (Modash: الإمارات، 27% متابعون وهميون) · `dr.maya_alesmaeel` (بايو «Syria Germany»، منشورات تشرين الأول 2026 بموقع Deutschland) · `dr_nataliesalloum` (صيدلانية، Dubai).
- **غير نشط:** `helem.alhajj` — البروفايل يُظهر **0 منشورات** رغم المتابعين.
- **براند خاص (منافس محتمل):** `alma._.yaghi` (@alma._.cosmetics) · `rawan.dari` (@rava_skin_care_) · `ph.mona_almadani` (جديد).
- **مقدّمو خدمات عيادة، لا UGC:** `sarah.sk963` (ديرمابلان/تقشير/ليزر) · `makeupby.danaa` (مكياج عرائس).
- **تأكيد Skincare + موقع:** `miray.sultanah` (طرطوس) · `dr.souadalayoubi` (اللاذقية) · `dr.joell_mohamad` (حمص) · `carmen_tutorials2` (حلب).
- **موديل/ممثلة، لا skincare:** `leenhallakk` · `rand_alkudmani` (دمشق).
- **نشاط حديث مؤكد:** `rawan.dari` (3 تشرين الأول) · `elimar_ahmad` (10 أيلول) · `hanin_gredah` (19 أيلول) · `miray.sultanah` (آب).
- **لم يُفحص بعد:** 65 من الـ84 + 121 حساباً خارج مجال البشرة (السبب: الرصيد).

## المستبعدون (49) وسبب الاستبعاد
| السبب | العدد | أمثلة |
|---|---|---|
| متجر / براند / صفحة بيع | 19 | `tulip._.store9`، `tulip._.care`، `koki_mac_syria`، `kokimac_alhasakah`، `lovage.sy`، `lava_derm.syria`، `skin_care_syria`، `saja__products`، `pouchlysyria`، `neomakeup_syria`، `cuteness_store285`، `az.beauty12`، `your_skin_code`، Devora، Halora… |
| عيادة / مركز تجميل / صيدلية تجارية | 9 | `selena.beauty.clinic`، Shalabi Clinic، Nour pharma، RF Rana Fahed، `adila_beauty_care`، Derma Life، `mera_bell_clinic`، `syrian_beauty_center`… |
| خارج سوريا | 8 | `nourhussam__` (دبي)، `by.ayajamalaldin` (دبي)، `mauosh_maya` (دبي)، `dr.haya_skinsociety` (الأردن)، `styledbysyria` (فرنسا)، حسابات UGC عراقية |
| بلا دليل سوريا | 5 | `rimshtiwii`، `joycederderian`، `nancyy.ugc`، `itsfarah.111`، `hazaarstar` |
| دليل ضعيف (وسم واحد بلا سياق) | 5 | `ugcsara`، `life_racha`، `ph_safa_dahdoh`، `may_augcreator`، `boujee.syria` |
| خارج مجال الجمال/البشرة | 3 | `jana_alshab` (تسويق ومهنة)، `rama___life`، `jida_hilal` (يوميات) |
| **معلّقون — مناسبون لكن بلا دليل سوريا (لم يُضافوا)** | 5 | `ennas1_` (Beauty UGC)، `_daliaalshikh` (Beauty & Skincare Creator، 61K)، `farahgharzldeen` (soft glam، skincare، UGC)، `dr.beauty__1`، `dr_linayaziji` (جلدية) |

## مصادر الاكتشاف
- Google/فهرس البحث عبر Firecrawl Search (`site:instagram.com` + عبارات عربية/إنجليزية) — المصدر الرئيسي.
- Modash public directory: `/find-influencers/syria/skincare` و`/syria/micro` (صفحتا beauty وmakeup غير موجودتين — 404).
- مقتطفات منشورات Instagram المفهرسة (تاريخ المنشور + صاحب الحساب).
- لا Instagram مباشر، لا تسجيل دخول، لا تجاوز حماية.

## Queries المستخدمة (الجولة الثانية)
1. `site:modash.io find-influencers syria`
2. `site:instagram.com حلب صانعة محتوى عناية بالبشرة سكين كير`
3. `site:instagram.com Aleppo skincare blogger review serum`
4. `site:instagram.com حمص بلوغر بيوتي سكين كير تجربة منتجات`
5. `site:instagram.com "rimshtiwii" OR "tulip._" OR "#بلوغر_سورية" عناية بالبشرة`
6. `site:instagram.com "روتيني" "بشرتي" سوريا ريل تجربتي سيروم`
7. `site:instagram.com "ريفيو" منتجات بشرة سوريا صانعة محتوى`
8. `site:instagram.com "UGC creator" سوريا OR Syria OR دمشق OR حلب OR اللاذقية OR حمص OR طرطوس`
9. `site:instagram.com "صانعة محتوى UGC" سوريا`
10. `site:instagram.com "Product & UGC Creator" OR "UGC Creator" "Syria" Latakia OR Tartus OR Hama OR Aleppo OR Damascus`
11. `"بتمنى يكون المحتوى فادك" صانعة محتوى UGC instagram`
12. `site:instagram.com اللاذقية OR طرطوس صانعة محتوى بيوتي عناية بشرة "بلوغر"`
13. `site:instagram.com أخصائية بشرة سوريا حمص OR حماة OR اللاذقية OR حلب نصائح روتين`
14. `site:instagram.com مصورة منتجات محتوى إعلاني UGC سوريا تصوير منتجات عناية`
15. `site:instagram.com إدلب OR درعا OR السويداء OR "دير الزور" OR الحسكة صانعة محتوى بيوتي مكياج عناية بالبشرة`
16. `instagram "jana alshab" OR "مصورة فوتوغرافية وصانعة محتوى UGC" OR "حنين، دكتورة صيدلانية وأخصائية البشرة"`
17. `site:instagram.com "_leen__care_" OR "dr.haya_skinsociety" OR "dr_linayaziji" OR "saraghafri3" OR "creates.by.farah_"`
18. `site:instagram.com "skin.by.sama" OR "rawan.dari" OR "elimar_ahmad" OR "miray.sultanah" OR "haya_makansi"` (إعادة فحص)
19. `site:instagram.com "dr.maya_alesmaeel" OR "sarah.sk963" OR "helem.alhajj" OR "noorzaineddin_" OR "dr.shorouqmsoud" OR "dr_nataliesalloum"` (إعادة فحص)
20. `site:instagram.com "makeupby.danaa" OR "leenhallakk" OR "hanin_gredah" OR "yasmin_a_ha73" OR "maryuma_bukhari" OR "rand_alkudmani"` (إعادة فحص)
21. `site:instagram.com "Syria" "skincare" "PR" OR "collab" beauty creator bio … nano`
22. `site:instagram.com "Beauty Creator" OR "Skincare Creator" OR "Faceless Creator" Syria followers`
23. `site:instagram.com "صانعة محتوى" "سوريا" followers بيوتي مكياج عناية`
+ الجولة الأولى (16 بحثاً): موثّقة بـ`docs/CREATORS_DISCOVERY_2026-10.md`.

## المقترح للجولة الثالثة (يحتاج رصيداً)
- Queries «اسم المحافظة × (صانعة محتوى | بلوغر | UGC | تجربتي | ريفيو)» للمحافظات الـ10 الفارغة، كل واحدة بصفحتي نتائج.
- حلّ أصحاب الريلز المجهولة عبر البحث بنص الكابشن (ريلز «أفضل 3 سيرومات فيتامين سي بسوريا»، «تقييم أربع واقيات شمس وطنية»، «أنا ريام صانعة محتوى UGC»، «يوميات صانعة محتوى و إعلانات ب ادلب»، «زينة — مصورة ومونتيرة، دير الزور»).
- إكمال إعادة فحص الـ65 الباقية من حسابات المجال.
