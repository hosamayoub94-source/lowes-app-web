# منظومة الطلبات والمزامنة — إعادة تصميم شاملة (Design Spec)
> 2026-06-08 · صاحب القرار: Ayoub (Hosam) · ملف مرجعي: `src/screens/OrdersScreen.jsx`, `src/services/customerService.js`, `supabase/functions/{sync-order-to-sheet,sheet-to-app,track-yurtici}`

## 1. المشكلة
الفريق يشتكي أن «أخذ الطلب وتنزيله بالجدول لا يعمل صحيحاً»: مزامنة هشّة (boolean واحد `sheet_synced`، بلا رؤية للفشل)، خلط حالات سوريا/تركيا في قائمة واحدة، حذف صلب يفقد البيانات ويكسر المزامنة الثنائية، لا سجل لتغيّر الحالة، ولا حارس للتكرار. المطلوب: مزامنة ثنائية موثوقة + فصل الأسواق + شفافية كاملة لحالة المزامنة + سجل حالات + قواعد تعارض واضحة.

## 2. القرارات المحسومة (المالك — 2026-06-08)
- **البناء على مراحل**، الأساس أولاً، كل مرحلة تُختبر حيّاً وتُدفع.
- **قوائم حالات منفصلة لكل سوق** (الحالات الـ14 تبقى بقيد القاعدة؛ العرض/الفلترة per-market).
- **صلاحية تغيير الحالة كما هي** (مدراء + fulfillment لأي طلب، البائع لطلبه فقط) — نضيف فقط تسجيل الخط الزمني.
- **soft-delete** و**مصدر الحقيقة** و**حارس التكرار** و**التحقق عند الإدخال** و**الخط الزمني** و**إشعار البائع** — كلها مطلوبة (مواصفات المالك في البرومبت).

## 3. مبدأ مصدر الحقيقة (Source of Truth) — لكل حقل
| الحقل | المصدر الفائز | السبب |
|------|----------------|--------|
| `status` | **الجدول/شركة الشحن** | الحالة الحقيقية تأتي من اللوجستيك (يورتيتشي/المركز) |
| `tracking_number` | **الجدول/شركة الشحن** | يُكتب يدوياً بالجدول أو من تتبّع يورتيتشي |
| بيانات العميل (الاسم/الهاتف/المدينة/العنوان) | **التطبيق** | البائع يملك بيانات العميل |
| الأصناف (`items`) + المبلغ + الدفع | **التطبيق** | تُحدَّد عند أخذ الطلب |
| الأعمدة اليدوية بالجدول (تقييد/فاطمة/زيزو/W.App…) | **الجدول** (APP_OWNED guard موجود) | لا يكتب التطبيق فوقها |

التطبيق→الجدول لا يرسل `status`/`tracking_number` ضمن الحقول التي يكتبها فوق القيم اليدوية؛ والجدول→التطبيق لا يحدّث إلا `status`+`tracking_number` (وما يشتقّ منهما). يمنع هذا الكتابة المتبادلة فوق بعض.

## 4. تغييرات القاعدة (DDL — المرحلة 1، تُشغّل عبر Management API)
```sql
-- مؤشر حالة المزامنة (بديل أذكى من sheet_synced وحده — يبقى sheet_synced للتوافق)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sync_status   TEXT DEFAULT 'pending'
  CHECK (sync_status IN ('synced','pending','failed'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sync_error    TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sync_attempts INT DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- حذف ناعم
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deleted_by TEXT;

-- خط زمني للحالات (append-only)
CREATE TABLE IF NOT EXISTS order_status_history (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  changed_by  TEXT,                 -- نصّي (اسم/«sheet»/«yurtici»)
  source      TEXT DEFAULT 'app'    -- app | sheet | yurtici
                CHECK (source IN ('app','sheet','yurtici')),
  changed_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS osh_order_idx ON order_status_history(order_id, changed_at DESC);

-- RLS متساهل + GRANT (موظفو PIN: auth.uid()=null)
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY osh_all ON order_status_history FOR ALL USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON order_status_history TO anon, authenticated;
GRANT ALL ON order_status_history TO service_role;
```
> القيد `orders_status_check` (14 حالة) بلا تغيير. لا أعمدة جديدة في `profiles` → لا حاجة لـ column-grants هناك.

## 5. المعمارية (وحدات صغيرة بحدود واضحة)
- **`src/services/orderSyncService.js` (جديد):** كل منطق المزامنة في مكان واحد.
  - `syncToSheet(orderId)` → يستدعي edge fn، يحدّث `sync_status`/`sync_error`/`sync_attempts`/`last_synced_at` حسب الرد. (ينقل منطق `syncOrderToSheet` المبعثر هنا.)
  - `retrySync(orderId)` → إعادة محاولة يدوية (يصفّر الخطأ ويعيد المحاولة).
  - `recordStatusChange({orderId, from, to, by, source})` → INSERT في `order_status_history`.
  - `softDeleteOrder(order, by)` → يضع `deleted_at`/`deleted_by`، يطلق `releaseForOrder`، ويزامن الجدول (يوسم الصف «محذوف» — انظر §7).
  - `findDuplicates({phone, items, market, withinMinutes})` → فحص التكرار.
- **`src/data/orderStatus.js` (جديد):** `STATUSES` (يُنقل من OrdersScreen) + `STATUS_BY_MARKET = { turkey:[...], syria:[...] }` + `STAGES_BY_MARKET` لشريط التقدّم.
- **`OrdersScreen.jsx`:** يستهلك الخدمتين أعلاه؛ يصغُر ويتركّز على العرض/الحالة.
- **`OrderCard`:** يضيف شارة المزامنة + زر إعادة + موسّع الخط الزمني.
- **`AdminFailedSyncPanel` (داخل تبويب موجود أو زر للمدير):** يعرض `sync_status='failed'` مع زر إعادة جماعي.

## 6. حالات المزامنة على الكرت (المرحلة 1)
- ✓ teal = `synced` · ⏳ amber = `pending` · ⚠️ red = `failed` (+ tooltip بنص الخطأ + زر «أعد المزامنة»).
- الأرشيف والطلبات غير (سوريا/تركيا) لا تُظهر الشارة.
- لوحة الأدمن: فلتر بالطلبات الفاشلة + زر «أعد مزامنة الكل».

## 7. الحذف الناعم + المزامنة (المرحلة لاحقة، schema يُجهَّز بالمرحلة 1)
- `handleDelete` يتحوّل لـ `softDeleteOrder`: يضع `deleted_at`، لا يحذف الصف.
- `load()` يستثني `deleted_at IS NOT NULL` (مثل `archived`).
- الجدول: edge fn يوسم الصف (مثلاً حالة «ملغي/محذوف» أو علامة بعمود مملوك للتطبيق) بدل حذف السطر — آمن للمزامنة الثنائية (الجدول→التطبيق لن يعيد إنشاءه).
- استرجاع: المدير يقدر يلغي الحذف (مرحلة لاحقة، اختياري).

## 8. الخط الزمني (المرحلة لاحقة)
- كل تغيير حالة (من التطبيق/الجدول/يورتيتشي) → `recordStatusChange`.
- الجدول→التطبيق (`sheet-to-app`) و`track-yurtici`: يكتبان صفّاً في `order_status_history` بـ`source` المناسب.
- الكرت: بند «وقت التغيير» يتوسّع لقائمة (من→إلى · مَن · المصدر · الوقت).

## 9. حارس التكرار + التحقق (المرحلة لاحقة)
- عند الحفظ: لو نفس `phone_1`+منتج خلال X دقيقة (افتراضي 10) → تحذير «طلب مشابه قبل دقائق — متابعة؟».
- تحقق per-market: الهاتف (تركيا 90 / سوريا 963)، المدينة من القائمة، المنتج من الكتالوج → سطر سليم يصل الجدول.

## 10. الاختبار
- كل مرحلة: `npm run build` أخضر + اختبار حيّ (preview أو service_role) مع تنظيف بيانات الاختبار.
- المرحلة 1: DDL يُطبّق ويُتحقّق · إنشاء طلب → `sync_status` يتحوّل synced/failed صحيحاً · شارة الكرت · زر الإعادة · لوحة الفاشلة.
- ⚠️ الأسماء العربية تُختبر عبر browser fetch/preview لا bash curl.

## 11. خطة المراحل
1. **الأساس (هذه الجلسة):** DDL §4 + `orderSyncService` + شارة المزامنة + زر إعادة + لوحة الفاشلة + `orderStatus.js` (فصل قوائم الأسواق §3 العرض). build + اختبار حيّ + commit.
2. مصدر الحقيقة الثنائي الكامل في edge fns (sync-order-to-sheet / sheet-to-app) + الخط الزمني (DB + كتابة من الطرفين + عرض على الكرت).
3. soft-delete الكامل (تطبيق + جدول) + استرجاع.
4. حارس التكرار + التحقق per-market + إشعار البائع عند تغيّر الحالة من الجدول.
```
