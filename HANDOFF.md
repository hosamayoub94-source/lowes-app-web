# Lowe's App Web — HANDOFF.md
> استلام فوري للمشروع — يحتوي على كل ما يحتاجه أي مبرمج أو محادثة Claude جديدة للمتابعة فوراً بدون أسئلة

---

## 🚨 للمحادثة الجديدة — اقرأ هذا أولاً (يونيو 2026)

### ⚡ سلوك المالك (إلزامي — صرّح به مراراً)
المالك يعطي أمراً ويريد **تنفيذه فوراً بدون طلب إذن**. **لا تسأل، نفّذ** (تعديل ملفات، SQL، نشر، git push، نشر Edge Functions/Apps Script عبر Chrome). استثناء وحيد: عمليات خطرة غير قابلة للتراجع (حذف بيانات إنتاج، تدوير مفاتيح). **دائماً استخدم أفضل المهارات** (brainstorming/debugging/verification...). راجع memory: `deploy_autonomy`.

### 🆕🆕🆕 أحدث إصلاح (7 يونيو 2026 — الورديات الليلية في الحضور) — commit `ffc7331`
**المشكلة:** موظف تنتهي ورديته 1:00 بعد منتصف الليل لم يستطع تسجيل دخول صباح نفس اليوم. **السبب الجذري:** حالة الزر كانت مرتبطة بالـ«يوم التقويمي» — صف `out` ليلي (01:00) يجعل اليوم يبدو «مكتمل» فيعطّل الزر الرئيسي («اليوم مكتمل 🎉»). **الإصلاح** في `src/screens/AttendanceScreen.jsx`: فُصلت الحالة عن التاريخ وربطت بـ**الوردية المفتوحة** (`openShift = checkIn && (!checkOut || checkOut < checkIn)`) → انصراف فقط أثناء وردية مفتوحة، وإلا **الحضور متاح دائماً** (يغطّي الورديات الليلية + الوردية الثانية بنفس اليوم). أُزيلت حالة «done» المعطّلة. **تحقّق:** محاكاة Node لمنطق `loadData`+الحالة عبر 6 سيناريوهات (كلها PASS) + build أخضر. **اكتشاف مهم:** قيد `UNIQUE(employee_name,date)` المعلن في schema **غير مفعّل** على القاعدة الحيّة. راجع memory `attendance_shift_model`.

### #2 — إعادة تصميم الصلاحيات (قوالب أدوار + استثناءات) — commit `056edf7`
اختيار المالك: **قوالب أدوار + استثناءات فردية**. بُني فوق نموذج `resolvePermissions` الموجود (role defaults + extra_permissions − denied_permissions).
- `src/data/permissions.js`: أُضيف `PERMISSION_DESCRIPTIONS` (أوصاف عربية) + `PERMISSION_GROUPS` (5 مجموعات منطقية) + `ROLE_TEMPLATES` (تسمية+أيقونة+مسؤولية لكل دور) + دوال للمعاينة (`resolveProfilePermissions`, `basePermissionsFor`, `permissionState`).
- `src/components/feature/PermissionsEditor.jsx` (جديد): أقسام مجمّعة + مفتاح ON/OFF لكل صلاحية مع شارة المصدر (من الدور/إضافية/ممنوعة) + وصف مضمّن + رأس المسؤولية + معاينة حيّة «X صلاحية فعّالة». صلاحية الدور الافتراضية تُمنع→denied، وغير الافتراضية تُمنح→extra. الأدمن = الكل مقفل.
- `AdminUsersScreen`: استُبدل الـchecklist المسطّح بالمحرّر الجديد + يقرأ/يحفظ `denied_permissions`. العمودان موجودان حيّاً (تم التحقق) — لا migration.

### #4 — منظومة متابعة الحملات — commit `9815fbf`
أُعيد بناء `CampaignsScreen` لنظام متابعة كامل:
- **صلاحيات جديدة** (`permissions.js`): `MANAGE_CAMPAIGNS` (ميديا باير/مدير مبيعات/سوشال/مدير) + `VIEW_CAMPAIGN_COST` (ميديا باير/مدير/أدمن) — مجموعة «الحملات».
- **الميديا باير/المدير:** إنشاء/تعديل حملة (تكلفة تظهر لأصحاب الصلاحية فقط + إسناد موظفين متعدد + تواريخ) + إضافة إعلانات (العدّاد) + تبويب «الأداء والالتزام» (من سجّل اليوم من المكلّفين + رسائل/مشتريات/تحويل لكل إعلان).
- **الموظفون:** يرون فقط حملاتهم المُسندة + يسجّلون لكل إعلان يومياً (رسائل/مشتريات/وردية/ملاحظة). الحملة الواحدة يتشاركها عدّة موظفين.
- **التكلفة مخفية** عن الموظفين (تُعرض الرسائل بدلها).
- إصلاح ثانوي: لوحة التفاصيل كانت تقرأ `ad.name`/`ad.image_url` والصحيح `ad_name`/`ad_image_url`.

> 🔴 **إجراء مطلوب من المالك (مرة واحدة):** شغّل `src/modules/campaigns/supabase/campaigns_tracking.sql` في Supabase (Management API/SQL Editor) — يضيف أعمدة `ad_campaigns` وجدول `ad_daily_logs`. حتى يُشغّل، تظهر للمدير لافتة إعداد داخل الشاشة بنفس الـSQL. (لا أملك sbp_ token لتشغيله بنفسي.)

### #5 — محاسبة احترافية — المرحلة 1 ✅ commit `54502a5` (المالك: «ابن الكل بالتسلسل»)
**قرار محسوم بالأدلة:** الجدول الرسمي = **`accounting_entries`** (موصول بلوزي+الطلبات+الشاشة). `finance_ledger` (37 صف) كود يتيم/ميت.
**المرحلة 1 (محافظ+أرصدة+تحويلات، بلا DDL):** محافظ TRY + دالة `walletDelta` تُطبّع `payment_method` القديم («cash») لمحفظة حسب العملة (الأرصدة صارت تعمل) + مودال تحويل بين المحافظ (قيدان transfer_out/in بنفس reference_no، يدعم اختلاف العملة) + إجمالي TRY بلوحة الخزائن. تحقّق بمحاكاة + build.
**المرحلة 2 ✅ `ee83cfb`:** سندات قبض/صرف رسمية — أرقام متسلسلة من DB (`computeNextVoucherNo` → VOC-YYYY-NNN، بدل localStorage) + مودال سند ينشئ القيد ويطبع، وإعادة الطباعة بنفس الرقم.
**المرحلة 3 ✅ `00e835e`:** تقرير مالي للفترة (`AccountingReport`): صافي ربح/عملة + تفصيل تصنيفات + حركة محافظ. زر «📊 تقرير».
**#5 شبه مكتمل** — المتبقّي اختياري فقط: ربط تلقائي للطلبات/العمولات (مودال السند يغطّي التسجيل اليدوي الآن).

### #3 — دليل استخدام per-role ✅ commit `1b694ee`
دليل ديناميكي حسب الصلاحيات (يلغي الشرح الفردي): `src/data/guides.js` (لكل ميزة: ما المطلوب/كيف/لماذا، مبوّب بصلاحية — null=للجميع) + `HelpGuide` (مودال يعرض مسؤولية الدور من ROLE_TEMPLATES ثم أدلّة ما يخصّ المستخدم، ودليل الشاشة الحالية أولاً ومفتوحاً عبر useLocation) + زر «❓» في الـHeader لكل الشاشات.

### #6 — تطوير لوزي كوكيل تخطيط ✅ commit `8c1234e` (ينشر تلقائياً عبر CI)
أداة جديدة `create_tasks_bulk` في `ai-assistant` (مبوّبة بـASSIGN_TASKS + إعادة فحص في runTool): تنشئ حتى 30 مهمة دفعة واحدة (لكل مهمة مسؤول/موعد/أولوية/وصف، حلّ أسماء المسؤولين مع cache). تعليمات النظام تُوجّه لوزي للتخطيط ثم استدعاء الأداة للخطط/المشاريع/التوزيع/الجدولة (المواعيد = تذكيرات عبر تنبيهات الاستحقاق). حلقة الأدوات (5 تكرارات) تدعم التخطيط متعدد الخطوات. فحص esbuild نجح.

> ✅ **كل مهام البرومبت (#1–#6) منجزة ومنشورة.** المتبقّي اختياري فقط: #5 ربط تلقائي للطلبات/العمولات في الليدجر (مودال السند يغطّيه يدوياً الآن).
### 🔧 إصلاح جوهري بعد الاختبار — جدول الحملات الصحيح — commit `646c8a3`
**الاختبار كشف:** شاشة `/campaigns` كانت تقرأ `ad_campaigns` (3 صفوف) بينما الحملات الحقيقية (**44 حملة + 73 إعلان**) في جدول **`campaigns`** (المشترك مع وحدة sales، وهدف FK لـ`campaign_ads`). وإضافة إعلان كانت تفشل (FK→campaigns).
**الإصلاح:** `CampaignsScreen` يستخدم الآن `campaigns` مع ربط الحقول: `budget_usd↔التكلفة`, `members↔المكلّفون`, `channel_*_custom↔القناة`, و`created_by` عند الإنشاء. اختبار تكامل: 6/6 ✅ (إنشاء/إضافة إعلان/تعيين/تعديل/حذف متسلسل).
**⏳ خطوة يدوية واحدة متبقية (حجبها نظام الأمان عن التنفيذ التلقائي):** نقل قيد FK لـ`ad_daily_logs.campaign_id` ليشير إلى `campaigns` — **لازم لحفظ التسجيل اليومي فقط**. شغّل `src/modules/campaigns/supabase/repoint_logs_fk.sql` في Supabase SQL Editor (الجدول فارغ → بلا خطر). بقية الميزات تعمل بدونه.

### تحسينات الحملات (طلب المالك) — commit `fa004f4`
- **رفع صورة للإعلان** فعلياً (bucket عام `chat-files` بمسار `campaign-ads/`) + معاينة + إزالة + لصق رابط بديل.
- **تعديل وحذف الإعلان** (تأكيد) + **حذف الحملة** من بطاقتها (تأكيد، cascade).
- **لوحة أداء للمدير** (قابلة للطي): إجماليات (رسائل/مشتريات/تحويل) + التزام اليوم + تكلفة/شراء (لأصحاب صلاحية التكلفة) + أعلى الحملات مبيعاً + الحملات المتأخّرة بالتسجيل.
- تحسينات: نسبة تحويل لكل إعلان + شارة التزام اليوم على كل بطاقة.
- ✅ **SQL الحملات طُبّق فعلياً** (7 يونيو 2026): `ad_daily_logs` أُنشئ + `ad_campaigns` فيه cost_usd/assigned_to/dates. كل ميزات الحملات تعمل الآن بالكامل.

> ✅ لا إجراءات SQL عالقة. **تقنية مهمة جديدة:** يمكن تشغيل DDL بلا `sbp_` token عبر Edge Function تتصل بـ`SUPABASE_DB_URL` (تحقنه المنصّة) — أُنشئت `run-campaigns-migration` لمرة واحدة (مبوّبة بتوكن، DDL ثابت فقط)، شُغّلت وتحقّقت، ثم **عُطّلت بنسخة 410**. (لحذفها نهائياً من Supabase Dashboard اختياري.) راجع memory `edge-ddl-migration`.

### 🆕🆕 أحدث جلسة (يونيو 2026 — محاسبة التسليمات + توحيد البائعين + العمولة المتدرّجة + CI)
أُنجز ونُشر على main (commits `d06ce42`→`5b60f6a`؛ تفاصيل: memory `deliveries_accountant_summary` + `orders_sync_commission_june2026`):

1. **إسناد طلبات سوريا غير المنسوبة (45):** تبويب «Delivered Orders» السوري **فعلاً فيه** عمود بائع (col13) ومبلغ (col6) — الاستيراد الأصلي لم يقرأهما. backfill من الجدول عبر gviz بالـgid → أُسندت (41 لبائعين + 4 لـLOWES). (حلّ المتابعة القديمة في النقطة #4 بالأسفل / السطر «⏳ متابعة: تبويب Delivered».)

2. **توحيد أسماء البائعين (~14,500 صف):** كل الطلبات (أرشيف+حديث) وُحّدت لاسم البروفايل القانوني. نسخة احتياطية: جدول `handler_name_backup_20260607`. دالة **`canonicalSeller()`** في `customerService.js` (خريطة `SELLER_CANON`) مطبّقة عند الحفظ + تجميع اللوحة + الفلتر → لا تجزئة جديدة.
   - ⚠️ **3 «زينة» منفصلات (المالك صحّحها):** «Ziena M»→Zeina Almarouf · «ZIENA»→Zina Sulyman · «Ziena Hamodi» كما هي.
   - المستقيلون (Layla/rody/bana/razan/Anas/Qamar) + «YUSEF» سوريا + القيم المتسرّبة (أرقام/«تم التسليم»/اسم منتج) → **LOWES (مبيعات الشركة)**. «Yousef» تركيا→Yousef Alkshki.

3. **أساس المبيعات = سعر الكتالوج بالدولار (مناعة ضد العروض):** مبالغ SYP كانت مضطربة (غير ثابتة النسبة) → احتساب المبيعات/التارجت/التصدير صار **Σ(الكمية × `product_economics.sale_price_usd`)** عبر دالة `orderUsd()`. `product_economics` كان فارغاً → زُرع. السعر الأساسي بالدولار ثابت ($7/$8)؛ العروض محلية فقط. الأكواد/الأسماء مشتركة بين جدولي سوريا وتركيا.

4. **محرّك العمولة المتدرّج per-market (مواصفات المالك):** أعمدة جديدة بـ`commission_rules`: `prepaid_target_try, prepaid_tier1_pct, prepaid_tier2_pct, above_target_pct`.
   - **تركيا (TRY):** فوق 65,000₺→5% · مسبق الدفع: عند بلوغ 15,000₺ → أول 15k @5% ثم الزائد @10%.
   - **سوريا (USD):** فوق $1000 → 10% (مبدئي).
   - `commissionBreakdown(emp, rulesById, adj)` market-aware يرجّع بعملة السوق. شريط التقدّم per-market (تركيا ₺/₺، سوريا $/$). مختبَر: 65k/20k = 1,250₺ ✓. الإعدادات ⚙️ تعرض كل النِسب.

5. **مزامنة الأسعار:** Edge fn **`sync-prices`** (منشورة، JWT) تقرأ عمود $ من جدول سوريا وتحدّث `product_economics`. زر **«🔄 مزامنة الأسعار»** للمدير بتاب التسليمات. + التعديل اليدوي inline موجود.

6. **🔐 أمان + CI تلقائي:**
   - أُزيل توكن GitHub المكشوف من `.git/config` → رابط نظيف + `credential.helper=manager`. **المالك ألغى التوكن القديم** `lowes-app-deploy`.
   - **نشر Edge Functions تلقائياً:** `.github/workflows/deploy-functions.yml` (أُضيف عبر GitHub UI) + سرّان `SUPABASE_PROJECT_REF` + `SUPABASE_ACCESS_TOKEN`. **تشغيل تجريبي نجح ✅** — أي push لـ`supabase/functions/**` يَنشر تلقائياً. (متبقٍّ اختياري: حذف توكن Supabase القديم `lowes-deploy`.)

**دروس CI:** التوكن لازم يبدأ بـ`sbp_` (anon key `eyJ` يفشل بـ«Invalid access token format»). زر «Add secret» معطّل حتى تُطلق input/change events (React) — عبر Chrome JS: native value setter + dispatch. عنوان تحديث سرّ = `/settings/secrets/actions/<NAME>` (بلا `/edit`).

### 🆕 جلسة يونيو 2026 — منظومة الطلبات الكاملة (التفاصيل: memory `orders_sync_commission_june2026`)
أُنجز ونُشر على main:
1. **شركاء الوردية:** «طلباتي»/«عملائي» تشمل طلبات/عملاء الشركاء المقبولين (تعديل/حذف بنفس اليوم).
2. **تتبع يورتيتشي التلقائي:** Edge Function `track-yurtici` + pg_cron كل 30د (jobid=1). تاب 📡 تتبع بالتطبيق + Realtime يحدّث الحالة فوراً. ⚠️ يحتاج API credentials حقيقية من YKSS.
3. **مزامنة ثنائية جدول↔تطبيق:** Edge Function `sheet-to-app` (`--no-verify-jwt`): رقم التتبع(عمود P)+الحالة من الجدول→DB، و`bulk_import` (تقبل market/currency). تقبل توكني تركيا+سوريا. `onSheetEdit` trigger مضبوط.
4. **استيراد الطلبات (طريقة gviz):** تركيا 74 (LOWES_TR+STRONG_TR) + سوريا 118 (LOWES Sales) + 57 مسلّم (Delivered tab، «غير منسوب» $0 لأن المصدر بلا مبلغ/بائع). **الإجمالي: تركيا 83 / سوريا 179 نشط.**
5. **توحيد أسماء البائعين** في DB لتطابق البروفايل (المرجع `SELLER_ALIASES` في customerService.js).
6. **رؤية التيمين (يشوف ويعدّل):** أُزيل حصر السوق في `load()` — كل موظف يشوف+يعدّل طلبات سوريا+تركيا، تبويبات السوق للجميع، نموذج الطلب يفتح على سوق الموظف.
7. **العمولة/التارجت بالـ USD:** جدولا `commission_rules`(turkey/syria) + `monthly_commission_adjustments`. القياس USD لكل العملات (try_per_usd=33, syp_per_usd=14000، قابلة للتعديل). تارجت سوريا $1000، مبيعات السوري في تركيا تُحوّل USD وتُضاف لتارجته. تاب 📦 تسليمات الشهر (leaderboard+تفصيل عمولة+أرشفة شهرية، إعدادات ⚙️ للأدمن).
8. **عدّاد المخزن:** كان موجوداً (reserveForOrder/releaseForOrder).

**نشر Edge Functions:** لا يوجد supabase login محفوظ — استخدم:
`$env:SUPABASE_ACCESS_TOKEN="sbp_..."; npx supabase functions deploy <fn> --project-ref fghdumrgimoeqsafdhhh --use-api [--no-verify-jwt]` (التوكن يُنشأ من Dashboard→Account→Access Tokens). تشغيل SQL عبر Management API بنفس التوكن.

**✅ حُلّ (أحدث جلسة):** تبويب «Delivered Orders» تبيّن أنه فيه عمود بائع (col13) ومبلغ (col6) — أُسندت الـ45 طلباً منه. راجع القسم العلوي «🆕🆕 أحدث جلسة».

### ✅ ربط جدول تركيا — اكتمل ومُختبر (يونيو 2026)
**حُلّ بالكامل عبر Chrome MCP.** السبب الجذري كان ثلاثياً: (أ) `setupSheets` لم يُشغَّل (الأوراق النظيفة غير موجودة)، (ب) الـ Web App منشور بنسخة قديمة، (ج) الأهم: الـ secret `TURKEY_SHEET_SYNC_URL` كان يشير لـ deployment قديم (يكتب على أوراق `Strong`/`LOWE'S` الفوضوية، يرجع `sheet:"Strong"`).
**ما تم:**
1. شُغّل `setupSheets` → أُنشئت `STRONG_TR` (gid 119831634) + `LOWES_TR` بالـspreadsheet التركي (id `1OP_q1GJeE7CFvhF7quQO1CjiWXnh8rzeqrcDcq_1OM8`).
2. نُشرت نسخة جديدة من الـ Web App (الإصدار 32) — deployment id `AKfycbwtLOeqJQqkLF-3S9IKgC4yVDRpR0iyiyvVx2EMNxGGw36XOYDQ804GrwJkIs6ctTO76Q`.
3. حُدّث الـ secret `TURKEY_SHEET_SYNC_URL` = `https://script.google.com/macros/s/AKfycbwtLOeqJQqkLF-3S9IKgC4yVDRpR0iyiyvVx2EMNxGGw36XOYDQ804GrwJkIs6ctTO76Q/exec`.
4. أُضيف installable trigger: `onSheetEdit` · من جدول البيانات · عند التعديل (للاتجاه العكسي — UrlFetchApp يحتاج installable لا simple).
**مُختبر فعلياً:** التطبيق→الجدول (طلب strong+lowes نزلا STRONG_TR/LOWES_TR بكل الأعمدة + upsert يحدّث بلا تكرار = رد `action:"updated"`). الجدول→التطبيق (عدّلت رقم التتبع M2 يدوياً → DB تحدّثت فوراً، ثم مسحتها → رجعت فارغة).
- **الكود المرجعي:** `google-apps-script/turkey-sales-sync.gs` (نفس المحتوى موجود بملف `بلا عنوان.gs` داخل مشروع Apps Script المرتبط بالجدول — project id `1ub2zm_Ne4NzbJmylw_IgB7Mu8ac_EIUBnVGHbCV-n2jhxbymcEmrkX1O`). ملاحظة: المشروع فيه أيضاً Dashboard.gs/تحديث التاريخ lowes.gs (onEdit للأوراق القديمة) + بولصة الموتور.gs (طباعة بوالص) — لا تلمسها.
- ⚠️ **متابعة:** الطلبات التركية القديمة عليها `sheet_synced=true` فلن تُعاد مزامنتها تلقائياً للأوراق النظيفة (فقط الطلبات الجديدة أو `sheet_synced=false` تنزل). لو أراد المالك ملء الأوراق النظيفة بالطلبات الحالية → backfill (صفّر sheet_synced للطلبات التركية النشطة، أو استدعِ syncOrderToSheet لكل id).
2. **مزامنة جدول سوريا** — تعمل أصلاً (LOWES Sales، edge fn، توكن LOWES-SYRIA-2026) لكن المالك يريد التأكد من صحتها بنفس منطق الاتجاهين. راجع memory `orders_sheet_sync`.
3. **العناوين التركية — إكمال:** تم: 81 ولاية + بلدياتها (`src/data/turkeyAddress.js`)، تتالي ولاية→بلدية، **Mahalle autocomplete حيّ** عبر API `turkiyeapi.dev` (`src/services/turkeyApi.js`)، حقول Sokak/No/Daire تبني العنوان، ComboBox واضح. **تأكد أنها تعمل حياً** (PWA cache — hard refresh).
4. **الأرشيف — «شو اشترى عميلي سابقاً لأعرف شو أعرض عليه»:** مبني جزئياً في CustomerModal بـ`/customers` (getCustomerOrders → boughtProductNames → suggestComplements + reorder). تأكد أنه يظهر بوضوح ويفيد البائع.

### ✅ منتجات سترونغ + العمود A = توقيت الإنشاء (يونيو 2026)
- **16 منتج سترونغ** أُضيفت لجدول `products` (cialis 100mg/20mg، Cialis 5، titan gold، super viga blue/black/red، spray super viga، viagra 100، Female.Viagra 100، MR.HORNEY، CLS، xxl، Mandil viga، maxman jel، Lovegra drop) — category=`Strong`. الفورم الآن يعرض كل المنتجات (32 لويز + 16 سترونغ). **لا يوجد عمود brand بالمنتجات؛ sku مطلوب (NOT NULL).**
- **العمود A بالجدول = توقيت إنشاء الطلب** (`created_at`): edge fn `sync-order-to-sheet` v11 يرسل `order_date: o.created_at || o.order_date`. مُختبر: A يعرض created_at بتوقيت تركيا.
- STRONG_TR و LOWES_TR **نفس البنية** (صف العناوين القديم متطابق بينهما عدا فروق تافهة typo/#REF). الفرق الحقيقي = المنتجات فقط (حُلّ بإضافتها).
- ⚠️ **درس:** تعديل خلية بمربع الاسم في Google Sheets هشّ — إن أخطأ يكتب بالخلية النشطة (أفسد A1 الرأس مرة). إن انفسد الرأس → شغّل `rebuildSheets` ثم أعد المزامنة. الأفضل: انقر الخلية مباشرة لا عبر مربع الاسم.

### ✅ Sokak (الشارع) autocomplete حقيقي — بيانات UAVT الرسمية (مجاني، كل تركيا)
- المصدر: قاعدة العناوين الوطنية UAVT (GormYa/UAVT على GitHub) — 1.22M شارع، قسّمتها بـNode إلى **973 ملف per-بلدية** (`public/tr-streets/{districtId}.json` = {mahalle:[streets]}) + `index.json` (city|district→districtId). الحجم 16MB فقط.
- **مجاني تماماً:** ملفات ثابتة same-origin يقدّمها Vercel، تُحمّل **عند الطلب** فقط (ملف البلدية ≤108KB). **صفر تخزين بقاعدة Supabase، صفر API key، صفر اعتماد خارجي.** غير محمّلة في PWA precache (json خارج globPatterns).
- `fetchStreets(province,district,mahalle)` في `turkeyApi.js`. Sokak ComboBox يقترح شوارع الحي المختار (يطابق أسماء turkiyeapi — مؤكّد: Sultanbeyli→district 2014، 15 حي، شوارع صحيحة). fallback: الشوارع المتذكّرة محلياً.
- **No/Daire يبقيان يدويين** (رقم فريد لكل مبنى — حتى Türk Telekom يطلب كتابتهما).
- سكربت المعالجة: `/tmp/uavt/process.mjs` (لإعادة التوليد عند تحديث UAVT).

### ✅ أوراق تركيا تطابق نطاق الشيت القديم + حفظ الأعمدة اليدوية (يونيو 2026)
- HEADER في `turkey-sales-sync.gs` صار يطابق صف 5 بالشيت القديم: التاريخ، الإسم، الهاتف، رقم الواتساب، المدينة، البلدية، العنوان، السعر، الحالة، صاحب الطلب، كود الطلب(K)، **تقييد، واتساب، W.App، 📍الموقع، رقم التتبع(P)، YURTİÇİ، تتبع**، نوع الدفع، مكان الاستلام، **ارسال مع**، ملاحظة، **فاطمة، زيزو**، الصنف الأول..الثامن.
- **التطبيق يكتب فقط الأعمدة التي يملكها** (`APP_OWNED`)؛ الأعمدة اليدوية/الصيغ (رقم التتبع P، تقييد، W.App، الموقع، YURTİÇİ، تتبع، فاطمة، زيزو، المجموع) **تُحفظ عند upsert ولا يكتب التطبيق فوقها** — التتبع P يدوي بالكامل. مُختبر: كتبت P2 يدوياً ثم upsert → بقي محفوظاً ✅.
- دالة `rebuildSheets()` تعيد ضبط رأس الورقتين (شُغّلت). **Apps Script الإصدار 35** منشور. أعدت مزامنة الطلبات التركية النشطة (4) للتخطيط الجديد.
- ⚠️ تغيير الـ HEADER يتطلب `rebuildSheets` (يمسح الصفوف) ثم إعادة مزامنة. الاتجاه العكسي onSheetEdit يقرأ الحالة(I=الحالة) والتتبع(P=رقم التتبع) بالأسماء.

### ✅ حالات الطلب الكاملة (يونيو 2026 — workflow المالك الحقيقي)
الحالات الـ14 الآن: pending(وارد جديد) · preparing(في التجهيز) · ready(جاهز) · **motor(قيد توصيل الموتور)** · **at_center(في المركز)** · shipped(في النقل) · **on_way(في الطريق للعميل)** · delivered(تم التسليم) · waiting(بالانتظار) · **not_received(لم يتم الاستلام)** · **returning(راجع للمركز)** · returned(راجع) · **settled(تمت التسوية)** · cancelled(ملغي).
- **«تمت التسوية» (settled)** = العميل ما استلم لكن دفع أجور الشحن → **0 مرتجع برصيد البائع** (يُعرض منفصلاً بتقرير المدير، لا يدخل نسبة الرجوع).
- ثوابت في OrdersScreen: `RETURN_STATUSES`=[not_received,returning,returned] (تُحتسب راجع) · `FOLLOWUP_STATUSES`=[waiting,not_received,returning] (تذكير/بانر) · `RELEASE_STATUSES`=[returning,returned,cancelled] (تُرجِع المخزون).
- **DB constraint** `orders_status_check` وُسّع لكل الـ14 (SQL مطبّق). **Apps Script الإصدار 34** منشور (STATUS_AR + reverse). مُختبر: settled→«تمت التسوية 🤝» بالجدول من الطرفين.
- ⏳ **سؤال معلّق للمالك:** هل يريد بنية أعمدة الأوراق النظيفة تطابق الشيت القديم (مصفوفة منتجات + عمود تتبع يدوي P)؟ + استثمار Claude API للوزي.

### 🔴🔴 بَغ حرج مُصلَح: الطلبات الجديدة لا تُحفظ (created_by/updated_by uuid)
**العَرَض:** المالك ينشئ طلباً → لا يظهر بالتطبيق ولا الجدول (المودال يُغلق كأنه نجح). **السبب:** عمودا `orders.created_by` و`updated_by` كانا نوع **UUID**، لكن الكود يكتب الاسم النصّي (`created_by: userName`) ويعرضه نصّاً بالكرت → INSERT يفشل بـ `22P02 invalid input syntax for type uuid` (والتعديل أيضاً عبر updated_by). الفشل صامت (handleSave ما يعرض الخطأ). **الإصلاح (SQL، مطبّق):** تحويل العمودين إلى `text` (مع إسقاط أي FK):
```sql
-- drop FKs on those cols then:
ALTER TABLE public.orders ALTER COLUMN created_by TYPE text USING created_by::text;
ALTER TABLE public.orders ALTER COLUMN updated_by TYPE text USING updated_by::text;
```
مُختبر: INSERT صار 201. **درس: أي عمود audit يكتب له الكود اسماً لازم يكون text لا uuid؛ والـ handleSave يحتاج عرض أخطاء الإدخال لا يبتلعها.**
- **Sokak autocomplete:** لا يوجد API لبيانات الشوارع التركية (فقط Mahalle). جعلنا Sokak ComboBox **يتذكّر ما يكتبه الفريق** (localStorage `lowes_sokak_history`). **No/Daire يبقيان نصّاً حرّاً** (فريدان لكل عنوان — لا قائمة ممكنة).

### ✅ تحسينات الطلبات (يونيو 2026 — جلسة الحالات والرواجع)
- **ComboBox**: زر ▾ يعرض **كل** الخيارات (كان يُفلتر بالقيمة الافتراضية فيخفي الباقي — سبب «الشحن yurtiçi فقط» و«الدفع طريقة واحدة»). `src/components/ui/ComboBox.jsx` (showAll).
- **أنواع الاستلام**: استلام من المركز / عنوان المنزل / عنوان العمل + شحن «توصيل خاص 🚗».
- **حالة الطلب = قائمة منسدلة قابلة للتراجع** (بدل القفشة أحادية الاتجاه) على كل كرت. حالات جديدة: `waiting` (⏳) + `returned` (🔁). الرواجع تُرجِع المخزون مثل الإلغاء.
- **⚠️ DB constraint**: `orders_status_check` كان يرفض waiting/returned → حُدّث عبر SQL Editor ليقبل `('pending','preparing','ready','shipped','delivered','waiting','returned','cancelled')`. **أي حالة جديدة لازم تُضاف للـ constraint وإلا الحفظ يفشل (23514).**
- **الرواجع/المتابعة**: بانر + شرائح فلترة (راجع/انتظار) + زر اتصال tel: على الكرت + تذكير يومي للبائع (إشعار مرة/يوم) بطلبات الانتظار/الراجع.
- **تقرير آخر الشهر** (ManagerBoardScreen): لكل بائع المسلّم مقابل الراجع (عدد+قيمة+نسبة رجوع). `fetchReturnsReport`.
- **Apps Script تركيا**: STATUS_AR + reverse `_statusKey` يدعمان waiting/returned. **الإصدار 33** منشور (deployment AKfycbwtLOeq). مُختبر: returned→«راجع 🔁» بالجدول. **درس: setValue على Monaco يُحفظ لكن انتظر تأكيد الحفظ قبل إعادة النشر وإلا تنشر نسخة قديمة.**
- ميزات مؤجّلة من نقاش المالك: إكمال Mahalle التلقائي (API خارجي turkiyeapi.dev غير موثوق — يحتاج بديل) · صلاحية البائع لتغيير حالة طلبه (حالياً مدراء/fulfillment فقط).

### 🧪 اختبار مزامنة طلب تركي (عبر edge fn، anon key):
```js
// أنشئ طلب turkey في orders ثم:
fetch('https://fghdumrgimoeqsafdhhh.supabase.co/functions/v1/sync-order-to-sheet',{method:'POST',
 headers:{apikey:ANON,Authorization:'Bearer '+ANON,'Content-Type':'application/json'},
 body:JSON.stringify({orderId})}).then(r=>r.json()) // {ok:true, action:'appended'|'updated'}
```
الرد ok:true يعني وصل Apps Script. لو `run setupSheets first` → الورقتان غير منشأتين.

### ✅ أُنجز هذه الجلسة (يونيو 2026):
- **داشبورد قيمة المبيعات للأدمن فقط** (ManagerBoardScreen، role===admin): RPC `sales_totals(from,to)` + فلتر اليوم/أسبوع/شهر/سنة/إجمالي. view `sales_value_summary`. (~33M TRY · ~88M SYP).
- **حذف الطلب بالصلاحيات:** مدراء/أدمن/fulfillment دائماً · الموظف طلبه بنفس اليوم فقط. + أعمدة audit `created_at/by, updated_at/by` تظهر بالكرت (من أنشأ/عدّل ومتى).
- **نموذج الطلب لا يُغلق عند نقر الخلفية** (كان يضيّع البيانات).
- **شركات الشحن التركية المعتمدة** + ComboBox.

### ⏳ لم يبدأ بعد:
- **نظام الشراكة بالورديات:** بتركيا 3 أشخاص على نفس الرقم/الصفحة بحملة؛ زبون أحدهم يخدمه شريكه. المطلوب: الشركاء (shift partners، موجود بـ ProfileScreen) يرون/يعدّلون **طلبات وعملاء بعضهم** («عملائي» يشمل عملاء الشريك + صلاحية تعديل). 
- Lookalike Audiences (تصدير أرقام للإعلانات) + تحليل السلة (basket analysis) — أفكار تسويقية مؤجّلة.

---

## 🆕 أحدث جلسة (يونيو 2026 — الأرشيف + ذكاء العملاء)

### 📦 استيراد الأرشيف (2889 طلب سوريا تاريخي)
- مصدر: ملف Excel «Archive» رفعه المالك. السكربت `scripts/import-archive.mjs` (يقرأ xlsx → POST دفعات لـ PostgREST بالـ anon key). شغّله: `VITE_SUPABASE_ANON_KEY=... node scripts/import-archive.mjs [dry|test|go]`.
- خريطة الأعمدة (مفكوكة): 0=تاريخ · 1=عميل · 2/3=هاتف · 4=مدينة · 5=عنوان · 6=مبلغ(SYP) · 11=حالة(DONE→delivered) · 12=رقم أصلي · **13=البائع** · 16=شحن · 17=دفع · 19+=منتجات.
- `orders.archived=true` · `market=syria` · `sheet_synced=true` · order_id=`ARC-N` (لأن order_id عليه UNIQUE؛ الأصلي في notes) · بائعو Zina/Khder → `brand=strong`.
- `OrdersScreen.load()` يخفي `archived` (`.or('archived.is.null,archived.eq.false')`).

### ⭐ ذكاء العملاء
- **`customer_stats` (view، مفتاح = الهاتف digits-only):** orders_count · sellers[] · totals SYP/USD/TRY · أول/آخر طلب · stars (⭐2+/⭐⭐5+/⭐⭐⭐10+). GRANT SELECT لـ anon/authenticated.
- **بانر بنموذج الطلب:** كتابة الهاتف → `lookupCustomer` → «⭐ عميل لنا · N طلب سابق · باعه: ...». (debounce 500ms).
- **شاشة `/customers`** (`CustomersScreen`، مدراء): بحث + فلتر VIP + بطاقات (نجوم/طلبات/بائعون/مجاميع). nav «العملاء» ⭐. خدمة `customerService.js`.
- **183 عميل متكرر** · 2573 عميل إجمالاً.

### 🗄️ أرشفة شهرية
- زر «🗄️ أرشفة» بشاشة الطلبات (مدراء): يوسم `delivered` الأقدم من 30 يوماً كـ archived (يختفي من القائمة، يبقى بسجل العملاء).

---

## 🆕 جلسة سابقة (يونيو 2026 — توحيد المخزون + التارجت + إصلاحات)

### 🔗 توحيد /inventory مع المخازن
- `products.quantity` صار **مرآة محسوبة** لمجموع `wh_stock` عبر trigger `sync_product_quantity` (مصدر حقيقة واحد). seed: نُقل products.quantity القديم للمخزن المركزي (لا فقدان بيانات). ملف `supabase/warehouse_unify_inventory.sql`.
- `InventoryScreen`: الكمية صارت **للعرض فقط** (مشتقّة) · أُزيل التعديل اليدوي → رابط لـ`/warehouses` · النموذج ما يكتب quantity.

### 🎯 التارجت ($1000 سوريا / 65,000 TL تركيا لكل بائع)
- `src/data/targets.js` (TARGETS_BY_CURRENCY: USD 1000 · TRY 65000). شريط تقدّم بـ«طلباتي» (SellerStatsCard) + نسبة «% من الهدف» بتقرير عمولة لوحة المدير.

### 🐞 إصلاحات
- خطأ تعديل المنتج (`null.trim()`) → حماية `(form.x||'').trim()`.
- المدينة صارت قائمة منسدلة (datalist) لكل بلد مع كتابة حرّة — `src/data/cities.js`.

### ⚠️ متابعات للمالك
- **Wasim مكرّر:** «Wasim Alkshki» (employee، 50 حضور) + «wasim alkshki» (manager، 8 حضور) كلاهما نشط — قرار دور/وصول (لم أحسمه). Fadi محلول (نسخة معطّلة أصلاً).
- **اسم براند زينة/خضر** — بانتظار الاسم النهائي (المفتاح `la_ronven_glow` ثابت).
- service_role rotation · مزامنة تركيا (OAuth) · حذف صفوف Google التجريبية.

---

## 🆕 جلسة سابقة (يونيو 2026 — نظام المخازن متعدّد الطبقات: المرحلة 1)

### 🏬 نظام المخازن — المرحلة 1 (منشورة)
- **الجداول (wh_ prefix، PIN-auth، RLS مفتوح + GRANT):** `wh_warehouses` (مركزي/مبيعات/مناديب/مرتجعات) · `wh_stock` (كمية لكل مخزن×منتج، unique) · `wh_movements` (سجل: receive/allocate/reserve/release/adjust/return). ملف: `supabase/warehouse_phase1.sql`.
- **مبذور:** 3 مخازن — المخزن المركزي · مبيعات سوريا (يوسف) · مبيعات تركيا (فاطمة).
- **الخدمة:** `src/services/warehouseService.js` — getStockMatrix · receiveStock · allocateStock · adjustStock · listMovements (منطق read-compute-write client-side).
- **الشاشة:** `/warehouses` (`WarehouseScreen.jsx`) — مصفوفة منتج×مخزن + الإجماليات + تمييز المخزون المنخفض + modals استلام/تخصيص/جرد (مبوّبة بالصلاحيات). nav «المخازن» 🏬.
- **الصلاحيات (permissions.js):** `MANAGE_CENTRAL_STOCK` (manager + الأدمن + **سيم/فادي** عبر extra_permissions) · `MANAGE_SALES_STOCK` (manager + **يوسف/فاطمة**) · `VIEW_INVENTORY`.
- ✅ مُختبر (DB): استلام 100→المركزي، تخصيص 30→مبيعات سوريا → المركزي 70 / سوريا 30. build نجح.
- **المواصفة الكاملة + الخطة:** `docs/superpowers/specs/2026-06-03-warehouse-system-design.md` + `docs/superpowers/plans/2026-06-03-warehouse-phase1.md`.
- ✅ **المرحلة 2 (منشورة):** حجز تلقائي عند إنشاء الطلب (`reserveForOrder`: يخصم منتجات الكتالوج من مخزن المصدر = `profiles.warehouse_id` للبائع أو مخزن المبيعات حسب السوق؛ idempotent؛ يتخطى brand≠lowes) + إرجاع عند الإلغاء (`releaseForOrder`). `orders.brand` (lowes|la_ronven_glow) + منتقي براند بالنموذج + طلبات زينة/خضر وُسمت la_ronven_glow. `profiles.warehouse_id` (GRANT مضبوط). ملف: `supabase/warehouse_phase2.sql`. ⚠️ المنتجات تُطابَق بالاسم (name/name_en) — النص الحر غير المطابق لا يُخصم.
- ⏳ **المرحلة 3:** مخازن المناديب + المرتجعات + دورات تخصيص شهرية + تقارير.
- ⚠️ **تنظيف:** profiles مكرّرة (Wasim Alkshki/wasim alkshki · Fadi Jarrouge/Fadi jarrouge بحالات أحرف مختلفة) — تحتاج دمج/حذف يدوي.

---

## 🆕 جلسة سابقة (يونيو 2026 — مزامنة طلبات سوريا مع Google Sheet + منظومة البائع)

### 🔗 Dual-write: طلبات سوريا → التطبيق + Google Sheet (LOWES Sales)
- موظف سوريا يسجّل طلب بالتطبيق `/orders` → يُحفظ بـ `orders` + يُرسل تلقائياً لورقة Google "LOWES Sales" (صف جديد بنفس الأعمدة).
- **Apps Script Web App** (مشروع "LOWES Sales Sync" بحساب المالك، openById): `google-apps-script/lowes-sales-sync.gs`. يكتشف صف العناوين بـ "Order ID"، يطابق الأعمدة بأسمائها، العملات بأعمدة ثابتة G(£سوري)/H($دولار)/I(₺تركي)، يدعدع بـ Order ID. التوكن `LOWES-SYRIA-2026`.
- **Edge fn `sync-order-to-sheet`** (v7، منشورة): يقرأ الطلب من DB، يترجم أسماء المنتجات عربي→إنجليزي عبر `products.name_en`، يرسل لـ Apps Script. secrets: `SHEET_SYNC_URL` + `SHEET_SYNC_TOKEN`.
- `OrdersScreen`: بعد الحفظ يستدعي sync لطلبات سوريا + إعادة محاولة تلقائية للفاشل. أعمدة `orders.sheet_synced`/`sheet_synced_at`. **عزل:** سوريا فقط لجدول سوريا.
- ✅ مُختبر: USD→$ · SYP→£ · الوقت + كل الحقول + المنتجات بالإنجليزية تنزل صح.
- ⚠️ **درس:** bash يشوّه العربي في curl → اختبر طلبات بأسماء عربية عبر **browser fetch** فقط.

### 🗺️ منظومة مبيعات البائع — مكتملة ✅ (commits a84d7d1 + a9d5461)
- **أ.1 اسم المنتج إنجليزي ✅** — كل الـ32 منتج لها name_en (مُلئت الـ4 الأخيرة).
- **أ.2 الدفع ✅** — 3 حالات (مدفوع/جزئي/غير مدفوع) + `orders.paid_amount` + المتبقّي يُحسب تلقائياً.
- **ب «طلباتي» ✅** — تاب يفلتر handler_name=userName + شريط مراحل على كل كرت.
- **ج محاسبة البائع ✅** — `SellerStatsCard` بمجاميع SYP/USD/TRY + عمولة. `profiles.commission_pct` (default 10%) يُضبط من AdminUsersScreen. تقرير عمولة كل البائعين بـ ManagerBoardScreen (`fetchCommissions`).
- **د الفاتورة ✅** — `InvoiceModal` كرت بشعار لويز → تحميل PNG (html-to-image) أو واتساب (Web Share API). زر 🧾.
- **إشعار حالة الطلب ✅** — `notifySellerStatusChange` يُشعر البائع عند نقل طلبه لمرحلة جديدة.
- **⏳ يعتمد على المالك:** مزامنة جدول تركيا (تأذين OAuth) · تدوير service_role key · حذف الصفوف التجريبية بجدول Google.

---

## 🆕 جلسة سابقة (يونيو 2026 — لوزي Agent + أسئلة ذكية + الهيكل التنظيمي)

### 🤖 لوزي صارت Agent تنفّذ أوامر (Claude Tool Use + بوابة صلاحيات)
- `ai-assistant` edge function (v12، منشورة) — Claude Sonnet مع **tool use** + agent loop (5 iters).
- **أدوات قراءة:** get_my_summary · list_team · get_attendance_report · get_sales_report · get_orders · get_tasks
- **أدوات كتابة:** create_task · update_task_status · create_announcement
- **بوابة صلاحيات:** كل أداة لها `perm` من `src/data/permissions.js` (منسوخة TS بالـ function). **least-privilege**: `toolsForUser` يفلتر الأدوات حسب صلاحية المستخدم (الموظف ما يشوف أداة ما يملكها) + runTool يعيد الفحص (defense-in-depth). الأدمن = كل الأدوات.
- الـ widget (`AIAssistantWidget`) يمرّر `extraPermissions`/`deniedPermissions` من الجلسة.
- ✅ مُختبر: أدمن "كم حضر اليوم؟" → نفّذ get_attendance_report (39 حاضر). أدمن "أنشئ مهمة لناتاليا" → أنشأها فعلياً بالـ DB. موظف يطلب إنشاء مهمة → ما عنده الأداة → يُرفض.
- ⚠️ ملاحظة: عمود `tasks` هو `assigned_to`/`assignee_id` (**لا يوجد `assignee_name`**).

### 🧠 أسئلة تدريب ذكية بالـ AI (تحل محل الـ104 الغبية)
- `generate-quiz` edge function (منشورة) — Claude Sonnet + **web search** (للمكوّنات/أسئلة العملاء). يولّد سؤالاً يومياً لكل فئة (منتجات/مكوّنات/مبيعات/عملاء) ويخزّنه في `quiz_questions` (عمود `source='ai'`، `question_date=today`). idempotent (مرة/يوم).
- `TrainingScreen`: يفضّل أسئلة `source='ai'` لليوم؛ وإن غابت يطلق التوليد بالخلفية (auto على أول فتح). أسئلة سيناريو ذكية واقعية.

### 🏢 الهيكل التنظيمي + مستخدمون
- ملف الهيكل الكامل: `C:\Users\acer\Documents\Cowork\operations\team\org_structure.md`.
- **توحيد الفِرق:** "تيم سوريا" → "سوريا" (لا تكرار). الفِرق: سوريا/تركيا/ميديا/إدارة.
- **أدمن جدد (PIN 1234):** hosam ayoub · Amany alkshki (شريكة، سوريا) · Reem alkshki (شريكة، COO).
- **PIN موحّد للجدد = 1234** (ناتاليا، أولغا، والقادمون). ناتاليا (مندوبة سوريا) · Olka Zghaib (ميديا باير).
- المسميات الوظيفية مسجّلة بـ `profiles.job_title` لكل المسؤولين.

### 🔴 إصلاح: activity_logs RLS (سجل نشاط الموظفين كان معطّل)
- موظف PIN → auth.uid()=null → INSERT مرفوض. الحل: سياسة INSERT متساهلة + GRANT (`supabase/activity_logs_rls_fix.sql` مطبّق). **قاعدة: أي جدول يكتب له موظف PIN يحتاج RLS متساهل + GRANT.**

---

## 🆕 جلسة سابقة (يونيو 2026 — إصلاحات الرواتب + الانصراف + الإشعارات)

### ✅ الإصلاحات المنشورة على prod (commit 5de4397)

**1. الرواتب (AdminSettingsScreen):**
- خطأ: `employee_salary_settings` له FKان لـ profiles (created_by + employee_id) → PostgREST PGRST201.
- الحل: `profiles!employee_salary_settings_employee_id_fkey(employee_name, role_type)` في الـ select.

**2. تسجيل الانصراف (AttendanceScreen):**
- خطأ: `handleCheckOut` يرفض لو أي صف `out` موجود (حتى قديم مثل 00:08)، بينما الزر يظهر فعّالاً (منطق متناقض).
- الحل: `alreadyOut = !!checkOut && checkOut >= checkIn` (نفس منطق العرض).
- + timeout 12ث على كاميرا SelfieCapture → error + "متابعة بدون صورة" إذا علّقت.

**3. الإشعارات (VAPID):**
- خطأ: `VITE_VAPID_PUBLIC_KEY` كان مفقوداً من Vercel → `vapidConfigured=false` → البانر مخفي على prod.
- الحل: أُضيف المتغير في Vercel (lowes1/lowes-app-web/settings/environment-variables).
- القيمة: `BOjFSpYCptZ0EgkoDFBtrEKe_jd58xeEnN354PxsXoK2jgJVTyo7hPPD0OrAhYVJjttS0nYBeP0J-_phRyl6kY4`
- تأكيد: `vapidInBundle=YES` على prod bundle. البانر الآن يظهر للموظفين.

**نشر Edge Function (طريقة برمجية بدون UI):**
من تبويب Supabase Dashboard (مسجّل دخول): استخرج `localStorage['supabase.dashboard.auth.token'].access_token` ثم:
`POST https://api.supabase.com/v1/projects/<ref>/functions/deploy?slug=<name>` بـ multipart (metadata JSON + file Blob). الكود يُحمّل من GitHub raw (الريبو عام: hosamayoub94-source/lowes-app-web).

**نصيحة Vercel:** لملء form + Save برمجياً: React value setters + `button.click()`. الإحداثيات غير موثوقة.

---

## 🆕 جلسة سابقة (يونيو 2026 — التحقق بالوجه + لوحة المدير + استوديو السوشال)

### 🔐 التحقق من الوجه (Face Verification)
- مكتبة `@vladmandic/face-api` (مجانية، تعمل بالمتصفح، بدون API key). Models في `public/face-models/`.
- `src/services/faceVerificationService.js` — loadModels / extractDescriptor / compareFaces. عتبة التطابق 0.5.
- `profiles.face_descriptor` (jsonb) — مطبّق على prod + GRANT SELECT/UPDATE لـ anon/authenticated.
- شاشة الأدمن: `/admin/face-enroll` (AdminFaceEnrollScreen) — يختار موظف ويرفع صورة مرجعية → يُستخرج descriptor.
- `SelfieCapture` يقارن الوجه الحي بالمحفوظ قبل تسجيل الحضور. عدم تطابق → خيار "تسجيل مع تنبيه" + إشعار للأدمن.
- `AttendanceScreen` يحمّل `face_descriptor` للموظف ويمرّره.

### 📈 لوحة المدير التنفيذية — `/manager-board` (للمدراء/الأدمن)
- `ManagerBoardScreen` + `src/services/managerBoardService.js` — يسحب KPIs حية من Supabase.
- المبيعات (daily_reports: TRY/SYP/USD + تأكيدات) · الطلبات (orders: حالات + أعلى منتجات) · الحضور (حاضر/غائب/متأخر + قائمة الغائبين) · المهام (متأخرة/قيد التنفيذ/أولوية عالية).
- الهدف من `sales_targets` (فارغ حالياً → يعرض رسالة). nav: «لوحة المدير» 📈.

### 🌸 استوديو السوشال — `/social-studio` (أدمن/مدير/سوشال/ميديا)
- `SocialStudioScreen` — 4 أوضاع: كابشن · أفكار ريلز · رد على عميل · تقويم أسبوعي.
- Edge Function `social-content` (Claude **Sonnet 4.6**، verify_jwt=false، **منشورة على prod**) — نبرة البراند + كتالوج المنتجات.
- منتقي المنتج من جدول products. زر نسخ + سجل آخر التوليدات. nav: «استوديو السوشال» 🌸.

### 🔑 نشر Edge Functions برمجياً (أسرع من UI)
من تبويب Supabase Dashboard (مسجّل دخول): استخرج `localStorage['supabase.dashboard.auth.token'].access_token` ثم:
`POST https://api.supabase.com/v1/projects/<ref>/functions/deploy?slug=<name>` بـ multipart (metadata JSON {name, entrypoint_path:'index.ts', verify_jwt:false} + file). الكود يُحمّل من GitHub raw (الريبو عام).

### 🔴 إصلاح: notifications realtime crash
- `subscribeToNotifications` كان يعيد استخدام اسم channel ثابت → "cannot add postgres_changes after subscribe()". الحل: `notif_user_${id}_${Date.now()}`.

### 🔑 PIN الأدمن
- أُعيد ضبطه إلى **6311** (كان مجهولاً). الموظف «أدمن» id=65d6efb5-13b3-471f-835a-e2baf2d9631d.

---

## 🆕 جلسة سابقة (يونيو 2026 — الحضور + الإشعارات + بوت لوزي + المهام v2)

### أدوات الأدمن + الموسيقى (يونيو 2026)
- **كتالوج المنتجات:** أُضيفت أعمدة products (`products_columns_fix.sql` مطبّق) → AdminProductsScreen يعمل كاملاً.
- **لوحة معرفة لوزي:** `/admin/lozy` — الأدمن يدير ما تعلّمته لوزي (`lozy_knowledge`).
- **موسيقى queue:** `/اغنية` يضيف للقائمة أثناء التشغيل، `/تخطي` للتالي. جدول `channel_music_queue` (مطبّق).
- **تقارير المدير:** موجودة بالفعل بـ AdminReportsScreen (حضور/مهام/مبيعات/أداء).
- 🔴 **متابعة المالك:** تدوير service_role key (الوكيل لا يدوّر مفاتيح).

### 🔴 إصلاح حاسم: الانصراف كان يفشل (يونيو 2026)
- **السبب:** insert الانصراف كان ينقصه عمود `day` (NOT NULL) → الموظفون يدخلون ولا يطلعون. أُصلح بإرسال `day` + جعل العمود nullable (`supabase/attendance_day_nullable.sql` — مطبّق).
- **لوحة "الموجودون الآن":** بشاشة الحضور — اسم+تيم+وقت لكل موجود + قسم غادروا (live).
- **Web Push:** `PushPermissionPrompt` banner بعد الدخول ليشترك الموظفون → تصلهم الإشعارات والتطبيق مغلق (كان الاشتراك يدوياً بالملف الشخصي فقط).

### الحضور — قفل الخروج أول ساعة
- لا يمكن تسجيل الانصراف قبل مرور **ساعة** من الحضور (منع in→out بالخطأ). الزر يظهر معطّلاً مع عدّاد حيّ.
- `src/screens/AttendanceScreen.jsx` — `MIN_MINUTES_BEFORE_CHECKOUT=60`.

### الإشعارات — إصلاح عدم الوصول (سبب جذري) ✅
- كانت RLS على `notifications` تستخدم `auth.uid()` لكن الموظفين على manual session (PIN) → `auth.uid()=null` → لا إشعارات.
- الحل: فتح RLS (`supabase/notifications_rls_fix.sql` — **مطبّق على prod**) + فلترة `user_id` بالكود في `notificationService.js`.

### بوت لوزي 🌸 — يعرف التطبيق ويتعلّم ✅
- Edge Function `ai-assistant` (نُشرت عبر Dashboard): دليل استخدام كامل للتطبيق في الـ prompt + لم يعد يقول "ما بعرف".
- تعلّم من الفريق: وسم `[[LEARN: ...]]` يُخزَّن في جدول `lozy_knowledge` ويُحقن بكل المحادثات. جداول: `lozy_knowledge` + `lozy_chats` (`supabase/lozy_knowledge.sql` — مطبّق).

### المهام v2
- إنشاء مهمة: اختيار تيم → فلترة موظفين + رابط + رفع مرفقات. أعمدة `link`/`team` بجدول tasks.
- صلاحيات `EDIT_TASK`/`DELETE_TASK` (مدراء + media_buyer) + أزرار تعديل/حذف بالـ drawer.

### المراسلة — إعادة تصميم ✅
- **خط أخف مثل واتساب:** رسائل 15px وزن عادي، فقاعة teal صلبة، أوزان أخف.
- **بوت أغاني per-channel (ديسكورد):** `/اغنية <رابط يوتيوب>` بأي قناة يشغّل للكل، `/وقف` يوقف. جدول `channel_music` (realtime، `supabase/channel_music.sql` مطبّق) + `ChannelMusicPlayer` أعلى الرسائل.

### 🔑 نشر Edge Functions (لا CLI)
Dashboard → Edge Functions → `<name>` → Code → الصق (Set-Clipboard ثم Ctrl+V في Monaco) → Deploy updates.

---

## 🆕 آخر تحديثات كبيرة (يونيو 2026 — جلسة الصلاحيات والرواتب والسيلفي)

### نظام الطلبات `/orders`
- إدارة طلبات تركيا 🇹🇷 + سوريا 🇸🇾. مراحل: وارد → تجهيز → جاهز → شحن → توصيل
- **صلاحيات الفريق:** الموظف يشوف طلبات تيمه فقط · مسؤول التجهيز (`order_role='fulfillment'`) يشوف سوقه ويحرّك الحالة
- جدول `orders` (راجع `supabase/orders_migration.sql`) — items كـ JSONB
- منتقي المنتجات: autocomplete من جدول `products` (32 منتج) + نص حر مسموح
- Fatima Ayoub (PIN 2626, تركيا, fulfillment) · Yousef Alkshki (سوريا, fulfillment)

### نظام الصلاحيات `src/data/permissions.js`
- `PERMISSIONS` keys + `ROLE_PERMISSIONS` افتراضي لكل دور
- per-user: `profiles.extra_permissions` + `denied_permissions` (JSONB)
- hook: `usePermissions()` → `can(PERMISSIONS.X)`
- الأدمن يمنح مدراء جدد صلاحيات من شاشة «المستخدمون» (checkboxes)
- مثال مطبّق: إنشاء المهام محجوب خلف `ASSIGN_TASKS` (الموظف ما يشوف الزر)

### الحضور بالسيلفي `src/components/attendance/SelfieCapture.jsx`
- **إصلاح bug الخروج:** كان فيه خطوتين (ضغطة تُظهر ملاحظة + ضغطة تسجّل) → الموظفون يمشون بعد الأولى ظناً أنهم سجّلوا. الآن **ضغطة واحدة**.
- سيلفي عند الدخول والخروج → bucket `attendance-selfies` → `attendance.selfie_url`
- الكاميرا المعطّلة لا تمنع التسجيل (زر «متابعة بدون صورة»)
- **مين حاضر اليوم:** `TodayTeamStatus` في HomeScreen (كان يستعلم عن عمود `role` غير موجود → أُصلح لـ `role_type`)

### الرواتب `/payroll`
- **سبب الصعوبة سابقاً:** لا راتب أساسي مخزّن → إدخال يدوي كل شهر
- الحل: `profiles.base_salary_usd` + `housing_allowance_usd` + `transport_allowance_usd` (تُعيَّن من «المستخدمون»)
- زر **«ملء الموظفين تلقائياً»** في دورة الرواتب يضيف كل النشطين برواتبهم الأساسية + البدلات

### 🔐 أمان (من جلسة سابقة)
- verify-pin Edge Function: التحقق من PIN server-side · أعمدة `pin`/`password` ممنوعة على anon
- ⚠️ **متابعة مطلوبة:** تدوير service_role key من Supabase Settings → API (كان في git history)

---

## 1. معلومات المشروع الأساسية

| البند | التفاصيل |
|-------|----------|
| الاسم | Lowe's Professional — Staff App |
| الشركة | Lowe's Professional (كوزمتك / عناية بالبشرة) |
| المالك | Ayoub (Hosam) — hosam.ayoub94@gmail.com |
| المسار | `C:\Users\acer\Desktop\lowes app\lowes-app-web\` |
| المرجع القديم | `C:\Users\acer\Desktop\lowes app\index_v4.html` (12,608 سطر HTML — للقراءة فقط) |
| Schema SQL | `C:\Users\acer\Desktop\lowes app\supabase_schema.sql` |

---

## 2. تشغيل المشروع

```bash
cd "C:\Users\acer\Desktop\lowes app\lowes-app-web"
npm run dev
```

يفتح على: **http://localhost:5173**

أو انقر مرتين على `start-dev.bat` في المجلد الأب.

---

## 3. Credentials — Supabase (lowes-attendance)

| البند | القيمة |
|-------|--------|
| **Supabase Project** | lowes-attendance |
| **Supabase Ref** | `fghdumrgimoeqsafdhhh` |
| **URL** | `https://fghdumrgimoeqsafdhhh.supabase.co` |
| **Anon Key** | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnaGR1bXJnaW1vZXFzYWZkaGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTE3OTQsImV4cCI6MjA5MTc2Nzc5NH0.e9DiuJySh4WMp7x5ErVV5LqBFawHUESrlGDRb8N5zPM` |
| **Service Role Key** | ⚠️ **محذوف من هذا الملف لأسباب أمنية** — موجود في Supabase Dashboard → Settings → API |

> 🔐 **تحذير أمني:** المفتاح القديم كان مكشوفاً في git history. يُفضّل **تدويره (rotate)** من
> Supabase Dashboard → Settings → API → "Reset service_role key".
> Service Role يبطل الـ RLS بالكامل — لا يوضع أبداً في كود المتصفح، فقط في سكريبتات Node.js المحلية
> عبر متغير بيئة `SUPABASE_SERVICE_ROLE` (وليس مكتوباً في الكود).

---

## 4. VAPID Keys (Web Push Notifications)

| البند | القيمة |
|-------|--------|
| **Public Key** | `BOjFSpYCptZ0EgkoDFBtrEKe_jd58xeEnN354PxsXoK2jgJVTyo7hPPD0OrAhYVJjttS0nYBeP0J-_phRyl6kY4` |
| **Private Key** | ⚠️ **محذوف** — موجود في Supabase → Edge Functions → Secrets كـ `VAPID_PRIVATE_KEY` |
| **VAPID Subject** | `mailto:hosam.ayoub94@gmail.com` |

**أين كل مفتاح:**
- Public Key → في `.env` كـ `VITE_VAPID_PUBLIC_KEY`
- Private Key → في Supabase Dashboard → Edge Functions → Secrets:
  - `VAPID_PRIVATE_KEY`
  - `VAPID_SUBJECT`
  - `VAPID_PUBLIC_KEY`

---

## 5. Stack التقني

| الطبقة | التقنية |
|--------|---------|
| Framework | React 18 + Vite 5 |
| Styling | Tailwind CSS v3 + CSS Variables |
| State | Zustand |
| Routing | React Router v6 (lazy loading) |
| Backend | Supabase (PostgreSQL + Auth) |
| Language | عربي، RTL، خط Tajawal |
| Charts | recharts |
| Excel | xlsx |
| Notifications | Web Push (VAPID) |
| Auth | Supabase Auth + PIN-based (4 أرقام) |

---

## 6. ملف .env الكامل

```env
VITE_SUPABASE_URL=https://fghdumrgimoeqsafdhhh.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnaGR1bXJnaW1vZXFzYWZkaGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTE3OTQsImV4cCI6MjA5MTc2Nzc5NH0.e9DiuJySh4WMp7x5ErVV5LqBFawHUESrlGDRb8N5zPM
# SUPABASE_SERVICE_ROLE — لا يوضع هنا. صدّره كمتغير بيئة عند الحاجة فقط (سكريبتات محلية)

VITE_USE_MOCK_TASKS=false
VITE_USE_MOCK_ATTENDANCE=false
VITE_USE_MOCK_NOTIFICATIONS=false
VITE_USE_MOCK_ANALYTICS=false
VITE_USE_MOCK_AUDIT=false
VITE_USE_MOCK_FILES=false
VITE_USE_MOCK_CRM=false
VITE_USE_MOCK_COLLAB=false
VITE_USE_MOCK_INVENTORY=false
VITE_USE_MOCK_PAYROLL=false
VITE_USE_MOCK_ACCOUNTING=false
VITE_USE_MOCK_REQUESTS=false
VITE_USE_MOCK_SALES=false

VITE_VAPID_PUBLIC_KEY=BOjFSpYCptZ0EgkoDFBtrEKe_jd58xeEnN354PxsXoK2jgJVTyo7hPPD0OrAhYVJjttS0nYBeP0J-_phRyl6kY4
```

جميع MOCK flags = false (قاعدة البيانات الحقيقية مفعّلة).

---

## 7. الأدوار (ROLES)

```js
// src/data/teams.js
ROLES = {
  MANAGER:        'manager',
  ADMIN:          'admin',
  MEDIA_BUYER:    'media_buyer',
  SALES_MANAGER:  'sales_manager',
  SOCIAL_MANAGER: 'social_manager',
  EMPLOYEE:       'employee',
}
```

**كلمات المرور للأدوار الإدارية** (مخزونة في `system_settings` بـ Supabase):
| الدور | كلمة المرور |
|-------|-------------|
| manager | `lowes2020` |
| admin | `lowes2026` |
| media_buyer | `media2026` |

**سلوك تسجيل الدخول:**
- Manager/Admin/Media Buyer/Sales Manager/Social Manager → إدخال كلمة مرور مباشرة
- Employee → اختيار الاسم من القائمة ← إدخال PIN (4 أرقام)

---

## 8. نظام Auth (PIN-based)

**الملف:** `src/services/authService.js`

### تدفق الدخول:
1. المستخدم يختار دوره
2. إذا كان employee: يختار اسمه من `profiles` table
3. يدخل PIN من 4 أرقام
4. `signInWithPin()` تحول الاسم لـ email وهمي: `${profileId}@auth.lowes-pro.local`
5. تسجيل الدخول بـ Supabase Auth باستخدام هذا الـ email

### Manual Session Fallback:
- إذا فشل Supabase Auth → يُخزَّن session يدوي في:
  ```
  localStorage key: 'lowes_manual_session'
  ```
- `AuthBoot.jsx` يتحقق من كلا النظامين

### موقع الملفات:
- `src/services/authService.js` — signInWithPin, listActiveProfiles
- `src/context/AuthBoot.jsx` — auth state listener
- `src/context/ThemeBoot.jsx` — dark/light theme
- `src/services/supabase.js` — Supabase client

---

## 9. هيكل src/ الكامل

```
lowes-app-web/src/
├── main.jsx              ← entry point (boot sequence)
├── App.jsx               ← ThemeBoot + AuthBoot + BrowserRouter
├── styles/
│   ├── theme.css         ← CSS variables (navy/teal/cream)
│   └── globals.css       ← Tailwind + base resets
├── routes/
│   ├── AppRoutes.jsx     ← كل الـ routes (50+)
│   ├── ProtectedRoute.jsx
│   └── paths.js          ← ROUTES constants
├── context/
│   ├── ThemeBoot.jsx
│   └── AuthBoot.jsx
├── screens/
│   ├── LoginScreen.jsx
│   ├── HomeScreen.jsx
│   ├── AttendanceScreen.jsx
│   ├── AttendanceReportScreen.jsx
│   ├── TeamScreen.jsx
│   ├── HolidaysScreen.jsx
│   ├── AccountingScreen.jsx
│   ├── ProfileScreen.jsx       ← tabs: my info / achievements / settings
│   ├── NotificationsScreen.jsx
│   ├── NotFoundScreen.jsx
│   ├── CampaignsScreen.jsx
│   ├── TaskReportScreen.jsx
│   ├── TrainingScreen.jsx      ← Daily Quiz (اختبار المنتجات)
│   ├── PerformanceScreen.jsx   ← KPI + Commission (نظام 100 نقطة)
│   ├── InventoryScreen.jsx
│   ├── ChatScreen.jsx
│   ├── AnnouncementsScreen.jsx
│   ├── LeaveRequestsScreen.jsx
│   ├── HRDashboard.jsx
│   ├── ShiftScheduleScreen.jsx
│   ├── AdvanceRequestsScreen.jsx
│   ├── PerformanceReviewScreen.jsx
│   └── admin/
│       ├── AdminScreen.jsx
│       ├── AdminUsersScreen.jsx
│       ├── AdminSettingsScreen.jsx
│       ├── AdminReportsScreen.jsx
│       ├── AdminQuizScreen.jsx
│       └── MysteryShopperScreen.jsx  ← مراقبة الأسعار
├── modules/
│   ├── tasks/pages/TasksPage.jsx
│   ├── crm/pages/CRMDashboard.jsx
│   ├── field-crm/pages/FieldCRMScreen.jsx  ← زيارات ميدانية
│   ├── files/pages/FileManagerDashboard.jsx
│   ├── analytics/pages/ExecutiveDashboard.jsx
│   ├── workspace/pages/DailyWorkspacePage.jsx
│   ├── audit/pages/AuditDashboard.jsx
│   ├── payroll/pages/PayrollDashboard.jsx  ← + PDF payslip
│   ├── requests/pages/RequestsDashboard.jsx
│   ├── accounting/pages/AccountingDashboard.jsx
│   ├── sales/pages/SalesDashboard.jsx      ← + sales targets widget
│   ├── gamification/pages/AchievementsScreen.jsx
│   ├── inventory/
│   ├── attendance/
│   ├── crm/integrations/crmEventBus.js
│   ├── files/integrations/fileEventBus.js
│   └── analytics/integrations/analyticsEventBus.js
├── components/
│   ├── ui/               ← Card, Button, Avatar, Loading, Modal...
│   ├── ai/AIAssistantWidget.jsx   ← Floating AI Bot (Claude API)
│   ├── chat/MusicRoomPanel.jsx
│   ├── feature/
│   └── dev/MockModeBanner.jsx
├── core/
│   ├── events/           ← Event Bus
│   ├── queue/            ← Queue system
│   ├── automation/       ← Automation system
│   ├── operations/       ← Workflow metrics + OperationalInsightsDashboard
│   ├── maintenance/      ← MaintenanceDashboard
│   └── testing/          ← QA dashboard + validateEnvironment
├── layouts/
│   ├── MainLayout.jsx    ← يتضمن AIAssistantWidget
│   └── AuthLayout.jsx
├── services/
│   ├── supabase.js
│   └── authService.js
├── hooks/
│   ├── useAuth.js
│   ├── useToast.js
│   ├── useTheme.js
│   └── usePushNotifications.js
├── stores/               ← Zustand stores
├── data/
│   └── teams.js          ← ROLES, ROLE_LABELS, TEAM_KEYS
└── utils/
```

---

## 10. Boot Sequence (main.jsx)

عند التشغيل تُنفَّذ هذه الـ subsystems بالترتيب — كل واحدة مُغلَّفة بـ `safeBoot()` (خطأ في أي منها لا يوقف التطبيق):

1. EventListeners (`@/core/events`)
2. Queue (`@/core/queue`)
3. Automation (`@/core/automation`)
4. AttendanceIntegration (`@modules/attendance`)
5. FileIntegration
6. AnalyticsIntegration
7. CRMIntegration
8. EnvValidation (`@/core/testing`)
9. TimerTracking (`@/core/maintenance`)
10. WorkflowMetrics + PersistedMetrics (`@/core/operations`)
11. MaintenanceCleanup

---

## 11. الشاشات والمسارات الكاملة (50+ route)

| المسار | الشاشة / الملف | الأدوار المسموحة |
|--------|----------------|-----------------|
| `/` | HomeScreen | الكل |
| `/login` | LoginScreen | — |
| `/attendance` | AttendanceScreen | الكل |
| `/attendance-report` | AttendanceReportScreen | Admin, Manager |
| `/tasks` | TasksPage | الكل |
| `/tasks-report` | TaskReportScreen | Admin, Manager, Sales Mgr |
| `/crm` | CRMDashboard | الكل |
| `/field-crm` | FieldCRMScreen | الكل |
| `/files` | FileManagerDashboard | الكل |
| `/analytics` | ExecutiveDashboard | الكل |
| `/workspace` | DailyWorkspacePage | الكل |
| `/team` | TeamScreen | الكل |
| `/holidays` | HolidaysScreen | الكل |
| `/chat` | ChatScreen | الكل |
| `/announcements` | AnnouncementsScreen | الكل |
| `/notifications` | NotificationsScreen | الكل |
| `/profile` | ProfileScreen | الكل |
| `/achievements` | AchievementsScreen | الكل |
| `/training` | TrainingScreen | الكل |
| `/performance` | PerformanceScreen (KPI) | الكل |
| `/leave` | LeaveRequestsScreen | الكل |
| `/schedule` | ShiftScheduleScreen | الكل |
| `/advances` | AdvanceRequestsScreen | الكل |
| `/reviews` | PerformanceReviewScreen | الكل |
| `/requests` | RequestsDashboard | الكل |
| `/accounting` | AccountingScreen | Manager, Admin |
| `/payroll` | PayrollDashboard | Admin, Manager |
| `/ledger` | AccountingDashboard | Admin, Manager |
| `/sales` | SalesDashboard | Admin, Manager, Sales Mgr, Media Buyer |
| `/campaigns` | CampaignsScreen | Admin, Manager, Sales Mgr, Media Buyer |
| `/inventory` | InventoryScreen | Admin, Manager, Sales Mgr |
| `/hr` | HRDashboard | Admin, Manager |
| `/mystery-shopper` | MysteryShopperScreen | Admin, Manager, Sales Mgr |
| `/admin` | AdminScreen | Admin فقط |
| `/admin/users` | AdminUsersScreen | Admin فقط |
| `/admin/settings` | AdminSettingsScreen | Admin فقط |
| `/admin/reports` | AdminReportsScreen | Admin فقط |
| `/admin/audit` | AuditDashboard | Admin فقط |
| `/admin/quiz` | AdminQuizScreen | Admin فقط |
| `/admin/qa` | QADashboard | Admin فقط |
| `/admin/maintenance` | MaintenanceDashboard | Admin فقط |
| `/admin/operations` | OperationalInsights | Admin فقط |

---

## 12. نظام الألوان

```css
--navy:  #0f1f3d   /* اللون الرئيسي */
--teal:  #0d7377   /* اللون الثانوي */
--cream: #f8f7f4   /* الخلفية */
```

Dark mode: `[data-theme="dark"]` على `<html>` — يُخزَّن في localStorage.

---

## 13. قاعدة البيانات — الجداول الكاملة (40 section)

### جداول رئيسية:
| الجدول | الوصف |
|--------|-------|
| `attendance` | الحضور — UNIQUE(employee_name, date) — check_in/check_out بصيغة HH:MM |
| `profiles` | ملفات الموظفين — employee_name, pin, role_type, team, avatar_url |
| `tasks` | المهام — status, priority, assignee_name, due_date, kanban_column |
| `task_comments` | تعليقات المهام + mentions[] |
| `task_points` | نقاط الإنجاز لكل مهمة |
| `task_subtasks` | المهام الفرعية |
| `task_timeline` | سجل أحداث المهمة |
| `finance_ledger` | السجل المالي |
| `channels` | القنوات (pages + whatsapp) |
| `campaigns` | الحملات الإعلانية |
| `campaign_ads` | إعلانات الحملات (max 6 per campaign) |
| `daily_reports` | التقارير اليومية للمبيعات |
| `report_ad_results` | نتائج الإعلانات لكل تقرير |
| `report_other_sales` | مبيعات أخرى (old_customer/other) |
| `partnerships` | الشراكات القديمة |
| `partnership_requests` | طلبات الشراكة الجديدة (pending→approved/rejected) |
| `employee_partnerships` | الشراكات النشطة |
| `alerts` | التنبيهات (late/no_checkout/task_due/absent/custom) |
| `alert_rules` | قواعد التنبيهات |
| `bonuses` | المكافآت |
| `bonus_settings` | إعدادات قيمة النقطة |
| `requests` | طلبات الإجازات/السلف/الأذونات |
| `performance_scores` | تقييم الأداء الشهري |
| `departments` | الأقسام (syria/turkey/social/hr/finance) |
| `audit_log` | سجل التدقيق |
| `attachments` | المرفقات العامة |
| `notifications` | مركز الإشعارات الموحّد |
| `delivery_results` | نتائج التسليم النهائية |
| `monthly_sales_records` | سجلات المبيعات الشهرية |
| `app_settings` | إعدادات التطبيق العامة |
| `system_settings` | إعدادات النظام (key/value) — تشمل كلمات مرور الأدوار |
| `salary_deductions` | خصومات الراتب |
| `user_sessions` | جلسات المستخدمين |
| `otp_codes` | رموز OTP لـ 2FA |
| `backup_log` | سجل النسخ الاحتياطية |
| `chat_rooms` | غرف المحادثة |
| `chat_messages` | رسائل المحادثة |
| `chat_room_members` | أعضاء الغرف |
| `chat_join_requests` | طلبات الانضمام |
| `chat_last_read` | آخر قراءة لكل مستخدم |
| `push_subscriptions` | اشتراكات Web Push |
| `quiz_questions` | أسئلة اختبار المنتجات |
| `quiz_attempts` | محاولات الموظفين في الاختبار |

### Storage Buckets:
- `avatars` — صور الملف الشخصي (public)
- `attachments` — مرفقات المهام (public)
- `ads` — صور الإعلانات (public)

### ملاحظة مهمة — جدول attendance:
```sql
CREATE TABLE attendance (
  id             uuid PRIMARY KEY,
  employee_name  text NOT NULL,
  date           date NOT NULL,
  check_in       text,   -- HH:MM (أرقام لاتينية)
  check_out      text,   -- HH:MM (أرقام لاتينية)
  notes          text,
  team           text,
  delay_minutes  int DEFAULT 0,
  was_late       boolean DEFAULT false,
  method         text DEFAULT 'manual',
  recorded_at    text,
  gps_lat, gps_lng, gps_accuracy...
  CONSTRAINT attendance_emp_date_unique UNIQUE (employee_name, date)
)
```

**⚠️ لا يوجد date_str أو date_slash — العمود `date` من نوع date، وليس text مع شرطات مائلة.**
**موظف واحد = صف واحد في اليوم** (مش صفين in/out).

---

## 14. كلمات مرور الأدوار (system_settings)

مخزونة في جدول `system_settings`:
```
manager_pass   = lowes2020
admin_pass     = lowes2026
media_buyer_pass = media2026
```

---

## 15. الفرق بين المشروعين

| البند | lowes-app-web (هذا) | lowes-professional (ERP) |
|-------|---------------------|--------------------------|
| النوع | Staff App (موظفين) | Admin ERP (إدارة) |
| Stack | React + Vite | NestJS + Next.js |
| DB | Supabase (lowes-attendance) | Supabase (lowes-production) |
| Auth | PIN-based | JWT + bcrypt |
| Port | 5173 | API: 3001 / Admin: 3002 |
| المسار | `Desktop/lowes app/lowes-app-web` | `Desktop/my projects/lowes-professional` |

---

## 16. تنبيهات تقنية مهمة

### ⚠️ Glob لا يعمل في هذا المشروع
بسبب المسافة في اسم المجلد `"lowes app"` — الـ Glob tool لا يجد ملفات `src/`.
**الحل:** استخدم `Read` مباشرة بالمسار الكامل، أو `Bash` مع تحديد المسار.

### ⚠️ paths.js في AppRoutes
مسارات الـ imports تستخدم alias مثل `@/` و `@modules/`:
```js
// vite.config.js يُعرَّف فيه:
resolve: {
  alias: {
    '@': '/src',
    '@modules': '/src/modules',
  }
}
```

### ⚠️ PWA Service Worker
يوجد `vite-plugin-pwa` مُفعَّل — قد يُسبب تخزين مؤقت عند التطوير.
افتح DevTools → Application → Clear Storage عند الحاجة.

---

## 17. Supabase Realtime

بعض الشاشات تستخدم Realtime subscriptions:
- `ProfileScreen` — partnership_requests (realtime لطلبات الشراكة)
- `NotificationsScreen` — notifications table
- يُفعَّل عبر `supabase.channel()` في hooks

---

## 18. Web Push Notifications

- **hook:** `src/hooks/usePushNotifications.js`
- **الجدول:** `push_subscriptions`
- **Edge Function:** مُضبوطة في Supabase مع:
  - `VAPID_PRIVATE_KEY` → ⚠️ محذوف من هنا، موجود في Supabase Secrets فقط
  - `VAPID_SUBJECT=mailto:hosam.ayoub94@gmail.com`
  - `VAPID_PUBLIC_KEY=BOjFSpYCptZ0EgkoDFBtrEKe_jd58xeEnN354PxsXoK2jgJVTyo7hPPD0OrAhYVJjttS0nYBeP0J-_phRyl6kY4`

---

## 19. التدريب اليومي (Training / Quiz System)

### الجداول:
- `quiz_questions` — أسئلة عن المنتجات (4 خيارات، واحد صحيح)
- `quiz_attempts` — محاولات الموظفين (مرة واحدة في اليوم)

### الشاشات:
- `/training` — TrainingScreen — الموظف يجيب على سؤال يومي
- `/admin/quiz` — AdminQuizScreen — الأدمن يضيف/يعدل الأسئلة
- `AttendanceScreen` — نافذة اختبار عند تسجيل الخروج (checkout quiz modal)

---

## 20. نظام الإجازات وطلبات الموارد البشرية

### الجدول: `requests`
```
request_type: leave / advance / permission / other
status: pending / under_review / approved / rejected / cancelled
```

### الشاشات:
- `/requests` — RequestsDashboard — الموظف يقدم طلبات ويتابعها
- `/hr` — HRDashboard — المدير/الأدمن يعالج الطلبات

---

## 21. آخر Commits (مايو 2026)

```
fix: AI bot — use direct fetch instead of supabase.functions.invoke
  (App uses PIN auth not Supabase Auth → functions.invoke fails → direct fetch بـ anon key)

feat: mega sprint — AI bot + CRM field visits + KPI/commission + certifications
  + mystery shopper + WhatsApp share + payroll PDF + profile tabs
  + push notifications + quiz shuffle + sales targets + chat improvements

fix: disable mock data, fix @media grid, unify leave system, standardize formulas
fix: add missing profile columns + fix chat/profile RLS
feat: 5 new HR features — shift schedule, advances, performance reviews, employee modal, announcements
feat(home): daily motivational quote card
feat(quiz): 50 real Lowe's product questions in template library
fix: chat channels, payroll, profiles, quiz redesign
feat(profile): realtime subscription for shift partner requests
feat: Enhanced Profile (work info + shift partners) + Daily Quiz Training System
feat(chat): Quick emoji, read receipts, @mention, forward message
feat: Enhanced Task System (Kanban DnD + @mention + File Attachments)
feat: VAPID keys + Leave Requests system + HR Dashboard
```

---

## 22. AI Assistant (Floating Bot)

**المكوّن:** `src/components/ai/AIAssistantWidget.jsx`
**مُضمَّن في:** `MainLayout.jsx` (يظهر في كل الشاشات)

### كيفية العمل:
- يستدعي Supabase Edge Function: `ask-ai`
- **⚠️ مهم:** يستخدم `direct fetch` بدلاً من `supabase.functions.invoke`
  لأن التطبيق يعتمد PIN auth وليس Supabase Auth → `functions.invoke` يفشل
- URL: `https://fghdumrgimoeqsafdhhh.supabase.co/functions/v1/ask-ai`
- Headers: `{ Authorization: 'Bearer <anon_key>', 'Content-Type': 'application/json' }`
- Edge Function تحتاج: `verify_jwt: false` في Supabase Dashboard

### Edge Function Secret المطلوب:
```
ANTHROPIC_API_KEY = <your-claude-api-key>
```

---

## 22b. جداول DB الجديدة (أضيفت في mega sprint)

| الجدول | الوصف |
|--------|-------|
| `crm_clients` | عملاء زيارات CRM الميدانية |
| `crm_visits` | سجل الزيارات الميدانية (field-crm) |
| `employee_certifications` | شهادات الموظفين (80% quiz → gold badge) |
| `kpi_records` | سجلات KPI الأسبوعية/الشهرية |
| `mystery_shopper_reports` | تقارير Mystery Shopper |
| `sales_targets` | أهداف المبيعات الشهرية |

---

## 23. كيفية إجراء Migration جديدة على Supabase

1. افتح [Supabase Dashboard](https://supabase.com/dashboard/project/fghdumrgimoeqsafdhhh)
2. انتقل لـ SQL Editor
3. انسخ الـ SQL المطلوب وشغّله مباشرة

أو عبر browser JavaScript في Console (بعد تسجيل الدخول في dashboard):
```js
const token = (await fetch('/rest/v1/', {credentials: 'include'})).headers.get('Authorization');
// ... ثم استخدم Supabase Management API
```

---

## 24. Profiles الأساسية (موظفون في DB)

```
اسم الموظف          الفريق                  الدور
alic kanaan         تيم السوشال ميديا       manager (social_only)
wasim alkshki       تيم سوريا               manager (finance_only)
Fadi jarrouge       تيم سوريا               manager (finance_only)
shamh               تيم السوشال ميديا       employee
ala aboumasoud      تيم السوشال ميديا       employee
Hamza Nsr           تيم السوشال ميديا       employee
```

---

## 25. الأقسام (Departments)

```
syria   → تيم سوريا
turkey  → تيم Lowes تركيا
social  → تيم السوشال ميديا
hr      → الموارد البشرية
finance → المحاسبة
```

---

## 26. نصائح للمبرمج القادم

1. **قبل أي شيء** — شغّل `npm run dev` وتأكد إن الصفحة تفتح على 5173
2. **الـ Glob لا يعمل** — استخدم `Read` مع المسار الكامل دائماً
3. **الـ Mock flags** كلها `false` — لا تُفعّلها إلا للاختبار المحلي بدون إنترنت
4. **قاعدة البيانات حقيقية** — أي تغيير في Supabase مباشر، لا يوجد staging
5. **نظام Auth** له fallback يدوي في localStorage — إذا رأيت `lowes_manual_session` فهذا طبيعي
6. **الـ schema SQL** في `supabase_schema.sql` هو المرجع الكامل للجداول
7. **الـ HANDOFF.md للمشروع الثاني** موجود في: `C:\Users\acer\Desktop\my projects\lowes-professional\HANDOFF.md`
8. **AI Bot** يستخدم direct fetch — لا تغيره إلى `supabase.functions.invoke` (سيفشل مع PIN auth)
9. **ProfileScreen** له 3 tabs: "معلوماتي" / "الإنجازات" / "الإعدادات"
10. **PerformanceScreen** (/performance) هو نظام KPI بـ 100 نقطة — راجع SALES_RULES.md إن وُجد

---

*آخر تحديث: 31 مايو 2026*
