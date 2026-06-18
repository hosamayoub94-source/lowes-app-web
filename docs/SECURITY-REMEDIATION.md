# 🔐 خطة معالجة الأمان — فحص شامل (يونيو 2026)

> ناتج عن الفحص الشامل للنظام. القسم 1 **عاجل جداً** (مفاتيح مكشوفة). البنود التي
> لا يستطيع Claude تنفيذها (تدوير مفاتيح، نشر Edge Functions، تطبيق DDL) موضوعة هنا
> بخطوات دقيقة لتنفّذها بنفسك. ما أصلحه Claude في الكود مُعلَّم بـ ✅.

---

## 1) 🚨 عاجل: مفاتيح مكشوفة — تدوير فوري إلزامي

**المشكلة (CRITICAL):** مفتاح **`service_role`** (صلاحية كاملة تتخطّى RLS، لا تنتهي عملياً
`exp=2091`) كان **مكتوباً نصّاً في كود مرفوع على git** في:
- `supabase/functions/sheet-to-app/index.ts` ✅ (أُزيل من الكود)
- `supabase/functions/sync-meta-insights/index.ts` ✅ (أُزيل من الكود)
- `scripts/setup-yurtici-cron.sql` ✅ (أُزيل من الكود)

المفتاح موجود في **تاريخ git** (وربما على GitHub) → يجب اعتباره **مخترَقاً**.

**ما عليك فعله (لا يستطيع Claude):**
1. **دوّر مفتاح service_role:** Supabase Dashboard → Project Settings → API → *Reset/Roll* service_role key. هذا يُبطل المفتاح القديم فوراً.
2. **دوّر التوكنات المكشوفة الأخرى** (كانت نصّاً بالكود/مكشوفة بناتج الفحص):
   - توكنات الجداول: `LOWES-SYRIA-2026` / `LOWES-TURKEY-2026` → عيّن قيماً جديدة في Edge Function Secrets (`SHEET_SYNC_TOKEN`, `TURKEY_SHEET_SYNC_TOKEN`) **وحدّث سكربت Google Apps Script** ليُرسل القيمة الجديدة.
   - بوّابة ميتا: `LOWES-META-SYNC-2026` → عيّن `META_SYNC_ADMIN_KEY` بقيمة جديدة (الكود صار يقرأها من env مع fallback مؤقّت ✅).
3. **(موصى به) نظّف تاريخ git** من المفتاح: `git filter-repo` أو BFG، ثم force-push (نسّق مع أي متعاون). حتى لو نظّفت، التدوير في الخطوة 1 يبقى إلزامياً.
4. بعد التدوير: حدّث سرّ القاعدة لـpg_cron: شغّل `scripts/setup-yurtici-cron.sql` (صار فيه placeholder) بالمفتاح الجديد في SQL Editor.

---

## 2) Edge Functions — تحقّق من الهوية خادمياً (نشر منسّق)

> هذه تغييرات **كاسرة عند النشر بلا ضبط env** — طبّقها بعد ضبط الأسرار، ثم انشر.
> Claude لم ينشرها (تحتاج CLI/CI + جلستك).

### أ) `manage-employee` — تصعيد صلاحيات (CRITICAL, #3)
الدالة تثق بـ`requesterRole` القادم من **جسم الطلب** → أي مستخدم يرسل `requesterRole:'admin'` يصير أدمن.
**الإصلاح:** انشرها مع التحقّق من JWT (أزل `--no-verify-jwt`) أو تحقّق داخلها:
```ts
const { data: { user } } = await admin.auth.getUser(req.headers.get('Authorization')?.replace('Bearer ',''));
if (!user) return json({ok:false,error:'unauthorized'},401);
const { data: me } = await admin.from('profiles').select('role_type').eq('id', user.id).maybeSingle();
if (!['admin','manager'].includes(me?.role_type)) return json({ok:false,error:'forbidden'},403);
// اشتقّ الدور من me.role_type — لا تثق بأي حقل من الجسم.
```

### ب) `ai-assistant` — يثق بـ`userRole`/`permissions` من العميل (HIGH, #10)
نفس النمط: تحقّق من JWT واقرأ الدور/الصلاحيات من `profiles` خادمياً بدل الجسم.

### ج) `track-yurtici` — بلا أي مصادقة ويُعدّل حالات الطلبات (MEDIUM, #20)
أضف بوّابة: لاستدعاء العميل تحقّق من JWT؛ ولـcron استخدم `x-admin-key`/`CRON_KEY` من env.

### د) إزالة توكنات افتراضية نصّية (HIGH/MED, #11, #19, #2)
- `sheet-to-app`: احذف `'LOWES-TURKEY-2026'`/`'LOWES-SYRIA-2026'` من `VALID_TOKENS` (تركها Claude مؤقتاً لتفادي قطع المزامنة) بعد ضبط الأسرار وتحديث Apps Script.
- `sync-order-to-sheet` (سطر 43,106) و`sync-prices` (سطر 13-18): احذف fallback النصّي واطلب السرّ من env.
- `OrdersScreen.jsx:607` (#12): زرّ المزامنة بالمتصفّح يمرّر التوكن نصّاً في الـbundle → غيّر `sync-prices` ليتحقّق من JWT بدل توكن مشترك، واحذف تمرير التوكن من العميل.

---

## 3) 🏛️ معماري: RLS مفتوح + مفتاح anon العام (CRITICAL — قرار + تنفيذ مرحلي)

**الوضع المؤكَّد حيّاً:** مفتاح `anon` العام (المشحون بالـbundle) **يقرأ ويكتب** كل الجداول
تقريباً (`USING(true)`): المحاسبة، الحضور، المحادثات، الرواتب، سجلّ التدقيق، كل الـprofiles،
الطلبات… وعمود `pin` فقط محميّ بالقراءة. الكود نفسه يكتب `profiles.pin` عبر anon
(`changeMyPin`) → **أي شخص يستخرج المفتاح يقدر يقرأ كل البيانات ويعيد تعيين PIN أي
موظف (اختطاف حساب) أو يرفع دوره لأدمن.**

**لماذا لا يُصلَح بسطر واحد:** التطبيق **يعتمد** على هذا (تغيير PIN، إدارة المستخدمين،
كل الكتابات تمرّ عبر anon/جلسة يدوية). تشديد RLS فوراً **يكسر تسجيل الدخول والوظائف**.

**خطة مرحلية مقترحة (تحتاج قرارك قبل التنفيذ):**
1. **زوّد كل المستخدمين بحسابات Supabase Auth** (`npm run auth:provision`) ليصبح لكل مستخدم JWT حقيقي (`auth.uid()`), وأوقف مسار «الجلسة اليدوية» القابل للتزوير (`authService.js` step 4 — حالياً يثق بـlocalStorage مزوَّر).
2. **انقل كل الكتابات الحسّاسة لـEdge Functions** (service_role) مع تحقّق دور: تغيير PIN، تعديل `profiles` (خصوصاً `role_type`/`pin`)، الرواتب، الحذف.
3. **شدّد RLS تدريجياً** لكل جدول: `SELECT/UPDATE/DELETE` للمستخدمين المصادَقين فقط ومبنيّ على الدور/الفريق، بدل `USING(true)`. اختبر سلوكياً (anon محظور، الدور المصرّح يعمل) قبل كل جدول.
4. **`profiles.pin`:** خزّنه مُجزّأً (hash) وتحقّق داخل `verify-pin` فقط (#17 أيضاً: اطلب PIN الحالي قبل تغييره).

> ملاحظة: هذا **مشروع** وليس إصلاحاً سريعاً. ابدأ بالخطوة 1+2 (لا تكسران شيئاً) ثم 3 تدريجياً.

---

## 4) إصلاحات قاعدة بيانات جاهزة للتطبيق — `supabase/migrations/0007_audit_remediation.sql`

طبّقها في **SQL Editor بجلستك** (idempotent):
- **`wh_apply_stock_delta` / `wh_transfer_stock`** (#5/#15): عمليات مخزون ذرّية تمنع ضياع
  التحديثات عند الكتابة المتزامنة. **بعد التطبيق:** عدّل `src/services/warehouseService.js`
  ليستدعي `supabase.rpc('wh_apply_stock_delta', { p_warehouse, p_product, p_delta })` بدل
  `_currentQty`+`_setQty` في receiveStock/adjustStock/_reserveOrder/_releaseOrder/reverseMovement،
  و`wh_transfer_stock` في allocateStock.
- **`orders.yurtici_exported_at`** (#16): عمود ختم التصدير. **بعد التطبيق:** في
  `OrdersScreen.exportYurticiExcel` اكتب الختم للطلبات المُصدَّرة واستثنِ ما له ختم.

---

## 5) خطر منهجي: «mock إلا إذا = false» (HIGH)

كل الوحدات (14) تعرّف `USE_MOCK = (flag !== 'false')` → **أي علم `VITE_USE_MOCK_*`
ناقص على Vercel يجعل تلك الوحدة تعرض بيانات وهمية بالإنتاج.** `main.jsx` يطبع تحذيراً فقط.
**الإصلاح الموصى به (عكس الافتراضي لأمان الإنتاج):** غيّر النمط في الـ14 ملف إلى
`USE_MOCK = (flag === 'true')` بحيث الافتراضي = بيانات حقيقية، وmock يحتاج تفعيلاً صريحاً.
(لم يُطبَّق تلقائياً لأنه يغيّر سلوك dev الافتراضي — قرارك.)

---

## مرجع الأخطاء الكامل
كل الاكتشافات الـ39 المُتحقَّقة (مع ملف:سطر والإصلاح) في `docs/audit-findings-full.txt`.
