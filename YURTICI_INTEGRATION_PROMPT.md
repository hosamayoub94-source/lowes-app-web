# 🚚 برومبت محادثة جديدة — تفعيل ربط Yurtiçi Kargo (إنشاء شحنات + تتبّع)
> انسخ هذا الملف كاملاً لبدء التنفيذ في محادثة جديدة. كل الحقائق التقنية أدناه **مُتحقَّقة حيّاً** (10 يونيو 2026) — لا تُعِد البحث، ابنِ مباشرة.
> **معايير المالك الإلزامية:** نفّذ مباشرة بلا استئذان كثير · استخدم أفضل المهارات (brainstorming/debugging/verification) · اختبر كل مهمة بعد تنفيذها (build + اختبار حيّ) · حدّث HANDOFF.md + ملفات الذاكرة عند الانتهاء.

---

## 🎯 الهدف
ربط Yurtiçi Kargo بالكامل بتطبيق Lowe's:
1. **رفع الطلبات لشركة الشحن** — التطبيق ينشئ شحنة يورتيتشي بضغطة (createShipment).
2. **جلب كود الشحنة** — رقم التتبّع يرجع تلقائياً ويُحفظ بالطلب ويُزامَن للجدول.
3. **تتبّع تلقائي** — حالة الطلب تتحدّث من يورتيتشي لحالها (في النقل→في المركز→قيد التوصيل→تم التسليم).
4. طباعة البوليصة/الباركود إن أمكن.

---

## 🔑 الحقائق التقنية المُتحقَّقة (لا تُعِد البحث — اختُبرت حيّاً)

**الـ API = SOAP كلاسيكي** (وليس REST `api.yurticikargo.com` — المفاتيح الوهمية الحالية بـ`track-yurtici` غلط):
- **Endpoint:** `https://webservices.yurticikargo.com/KOPSWebServices/ShippingOrderDispatcherServices`
- **WSDL:** نفس الرابط + `?wsdl`
- **Namespace:** `http://yurticikargo.com.tr/ShippingOrderDispatcherServices`
- **SOAPAction:** فارغ — أرسل الترويسة `SOAPAction: ""` · **TLS 1.2 إلزامي**
- **العمليات:** `createShipment` · `createShipmentWithDelivery` · `cancelShipment` · `queryShipment` · `queryShipmentDetail` · `saveReturnShipmentCode` · `createShipmentDetail` · `cancelReturnShipmentCode`
- **`queryShipment` params بالترتيب:** `wsUserName, wsPassword, wsLanguage, keys[] (unbounded), keyType, addHistoricalData, onlyTracking`
  - `keyType`: **0 = Cargo Key** (المفتاح اللي تعيّنه أنت)، **1 = Invoice Key**. لا غير (≥2 → خطأ KEY_TYPE).
  - رد النجاح: `<outFlag>0</outFlag><outResult>Başarılı</outResult>` داخل `<ShippingDeliveryVO>`.

**🔴 القاعدة الذهبية المُثبتة:** يورتيتشي يتتبّع **فقط الشحنات التي أنشأها هذا الحساب عبر API** (بـ cargoKey). الشحنات اليدوية القديمة **غير قابلة للتتبّع أبداً** (اختُبر: «kargo anahtarı bulunmamaktadır»). لذلك:
- **التتبّع التلقائي ⇐ يتطلب الإنشاء عبر API.** اجعل `cargoKey = order_id` (أو `order.order_id`) عند الإنشاء، ثم تتبّع بـ `queryShipment keyType=0` بنفس المفتاح.
- **جلب أكواد الشحنات القديمة (اليدوية) = مستحيل.** الكود يأتي فقط لحظة الإنشاء عبر API للطلبات الجديدة. (أبلِغ المالك بهذا صراحةً.)

**يورتيتشي poll فقط** — لا webhook/push بهذه الباقة. «التتبّع المباشر» يُحاكى بـ cron + تحديث-عند-فتح-الشاشة.

**الحساب:** `1200681314 - YOUSEF ŞAMRO - LOWE'S PROFESSIONAL` · Çıkış Birim `1160 ZEYTİNBURNU` · Bölge 9511 (Avrupa).
**4 حسابات Web Service** (حسب نوع الدفع) — **القيم بإيميل المالك** `Downloads/Entegrasyon Kod Talebi..eml` (اطلبها منه، لا تضعها بالكود/الذاكرة — حسّاسة مالياً):
| نوع | الوصف | wsUserName |
|---|---|---|
| GÖ NORMAL | صادر دفع عادي (مدفوع مسبقاً) | `1160G1200681314` |
| **GÖ TAHSİLATLI** | صادر **تحصيل عند التسليم (COD)** | `1160T1200681314` |
| AÖ NORMAL | وارد عادي | `1160A1200681314` |
| AÖ TAHSİLATLI | وارد تحصيل | `1160Y1200681314` |
> غالب طلبات تركيا COD (تحصيل) → استخدم **GÖ TAHSİLATLI** للـ COD و **GÖ NORMAL** للمدفوع مسبقاً (اختَر حسب `order.payment_method`/`payment_status`).

**تقنية الاختبار الحيّ المُثبتة** (PowerShell، نجحت هذه الجلسة):
```powershell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$req = [System.Net.HttpWebRequest]::Create($endpoint)
$req.Method='POST'; $req.ContentType='text/xml; charset=utf-8'; $req.Headers.Add('SOAPAction','""')
# جسم SOAP: <ship:queryShipment> مع params مباشرة (unqualified children)
```

---

## 🗺️ خطة التنفيذ (مراحل — ابدأ بـ brainstorming ثم نفّذ مرحلة-مرحلة مع اختبار)

**مرحلة 0 — الأسرار + الحسم:** خذ المفاتيح من المالك → خزّنها Supabase secrets (`YURTICI_WS_USER_GO` / `YURTICI_WS_PASS_GO` / `YURTICI_WS_USER_COD` / `YURTICI_WS_PASS_COD` أو ما يناسب). تُضبط عبر Dashboard→Edge Functions→Secrets (أو Chrome MCP). احسم مع المالك: نوع الحساب لكل دفعة · الوزن/الـ desi الافتراضي للكوزمتك (~1) · مين يقدر ينشئ شحنة (مدير+fulfillment).

**مرحلة 1 — `create-yurtici-shipment` (edge fn جديدة، SOAP `createShipment`):**
- `cargoKey = order.order_id` (مفتاحنا للتتبّع لاحقاً). يقرأ الطلب من DB (مصدر الحقيقة).
- ترجمة حقول الطلب → سكيمّا يورتيتشي: المرسَل إليه (customer_name)، هاتف (phone_1)، مدينة (city)، قضاء (district)، عنوان (address)، عدد القطع، الوزن/desi، نوع الدفع، **مبلغ التحصيل (COD)** = `amount` للطلبات COD.
- ⚠️ يورتيتشي قد يطلب **أكواد المدن/الأقضية** (il/ilçe) لا الأسماء — تحقّق من سكيمّا `createShipment` بالـ WSDL؛ إن لزم استخدم خدمة `getCityList`/`getTownList` أو جدول أكواد. (طلبات تركيا تخزّن المدينة/القضاء نصّاً — راجع `cities.js`.)
- يرجّع: رقم التتبّع (cargoKey/docId) + رابط/باركود البوليصة إن وُجد بالرد.
- **اختبار حسّاس:** `createShipment` ينشئ شحنة فعلية (قد تكلّف). اسأل المالك إن في حساب/بيئة اختبار يورتيتشي؛ وإلا اختبر بشحنة واحدة حقيقية ثم `cancelShipment` للإلغاء.

**مرحلة 2 — الواجهة (`src/screens/OrdersScreen.jsx`):**
- زر «🚚 أنشئ شحنة يورتيتشي» على كرت طلب تركيا (للمدير/fulfillment) → يستدعي الدالة → يحفظ `tracking_number` + `shipping_company='Yurtiçi Kargo'` → يستدعي `syncToSheet` (المزامنة للجدول جاهزة أصلاً). أكّد بصرياً (toast) + اعرض الباركود/زر طباعة.
- `OrderCard` ~سطر 1506 · `handleStatusChange` ~سطر 2490 · `syncToSheet` من `orderSyncService`.

**مرحلة 3 — إعادة كتابة `track-yurtici` (SOAP):**
- استبدل REST بالـ SOAP `queryShipment` (keyType=0, keys=[order.order_id], addHistoricalData=true).
- **التقط أكواد الحالات الحقيقية** من رد شحنة منشأة فعلاً (الحالات داخل `shippingDeliveryDetailVO`) وحدّث `mapYurticiStatus` (الموجود تخميني). الحالات لدينا بـ`orderStatus.js`: shipped/at_center/on_way/delivered/not_received/returning.
- أعد تفعيل cron (pg_cron — كان موجوداً، راجع `20260606_track_yurtici_cron.sql`) + أضف **تحديث-عند-فتح-الشاشة** بالتطبيق للطلبات «في النقل». (التتبّع التلقائي معطّل حالياً بـ`if(!manual)` — أزِل التعطيل بعد التأكد.)

**مرحلة 4 — الجدول + التنظيف:**
- رقم التتبّع يتدفّق للجدول عبر `sync-order-to-sheet` الموجود (عمود tracking). تأكّد.
- 🔒 **نظّف `track-yurtici`:** فيها **service_role JWT مكتوب صريحاً** (سطر 9) + مفاتيح REST وهمية (سطر 11-12) — احذف الـ fallbacks (Supabase يحقن `SUPABASE_SERVICE_ROLE_KEY` تلقائياً).

---

## 📁 الملفات والبنية
- `supabase/functions/track-yurtici/index.ts` (إعادة كتابة SOAP + تنظيف) · **جديد** `supabase/functions/create-yurtici-shipment/index.ts`
- `supabase/functions/sync-order-to-sheet/index.ts` (تدفّق رقم التتبّع للجدول — جاهز)
- `src/screens/OrdersScreen.jsx` (زر الإنشاء + تحديث-عند-الفتح) · `src/services/orderSyncService.js` · `src/data/orderStatus.js` · `src/data/cities.js`
- DB: `orders(order_id, tracking_number, shipping_company, status, market='turkey', customer_name, phone_1, city, district, address, amount, payment_method, payment_status, items)` · migration cron
- **النشر:** Edge Functions عبر CI تلقائياً عند push لـ`supabase/functions/**` (deploy-functions.yml). الواجهة Vercel عند push لـmain. ⚠️ **درس حرج:** أي دالة تُنشر يدوياً **ثبّتها بالريبو فوراً** وإلا CI يدهسها (صار مع manage-employee).

## 📌 مراجع الذاكرة (اقرأها)
`[[yurtici-integration]]` (كل التفاصيل) · `[[sheets-apps-script]]` (تعديل سكربتات الجدول عبر Chrome) · `[[orders_sync_overhaul_plan]]` · `[[deploy-autonomy]]` · `[[sync-failures-validation-fix]]`. الحساب على Apps Script: `hosam101hosam10@gmail.com`. جدول تركيا: `1OP_q1GJeE7CFvhF7quQO1CjiWXnh8rzeqrcDcq_1OM8` (تابات LOWES_TR/STRONG_TR).

## ❓ أسئلة احسمها مع المالك في البداية
1. نوع حساب الشحن لكل دفعة (COD مقابل مدفوع مسبق) — أي wsUser لأيّهما؟
2. الوزن/الـ desi الافتراضي للشحنة (كوزمتك خفيف ~1 kg/desi)؟
3. مين يقدر ينشئ شحنة (مدير + fulfillment فقط؟)؟
4. هل في حساب/بيئة اختبار يورتيتشي لتجربة createShipment بأمان قبل الإنتاج؟
5. أكواد المدن/الأقضية: هل نحتاج جدول il/ilçe أم يقبل يورتيتشي الأسماء؟
