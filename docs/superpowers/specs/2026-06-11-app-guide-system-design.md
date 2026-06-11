# تصميم: نظام الدليل المرجعي للتطبيق + تعليم لوزي
> تاريخ: 2026-06-11 · الحالة: معتمد (المالك فوّض القرارات للخبير)

## المشكلة
محتوى «كيف تستخدم التطبيق» موجود حالياً في **مكانين منفصلين يُحدَّثان يدوياً**:
1. `src/data/guides.js` — 11 دليل مختصر يظهر في مودال `HelpGuide` (زر ❓).
2. نص «دليل الاستخدام» مكتوب يدوياً داخل `supabase/functions/ai-assistant/index.ts` (الـsystem prompt للوزي).

عند إضافة أي مشروع/ميزة جديدة يجب تحديث الاثنين يدوياً، وغالباً يُنسى أحدهما → الدليل ولوزي يتأخّران عن الواقع. كما أن الأدلة الحالية مختصرة وتنقصها أقسام أساسية (طلبات سوريا/تركيا، التجهيز، يورتيتشي…).

## الهدف
**مصدر واحد** للأدلة (قاعدة البيانات) يغذّي ثلاثتها تلقائياً: شاشة دليل مخصّصة + زر ❓ السياقي + معرفة لوزي. تُضاف/تُحرَّر الأدلة من **لوحة أدمن بلا كود ولا نشر**، مقسّمة لأقسام، وكل مستخدم يرى أدلة صلاحياته.

## القرارات (مُعتمدة)
- **المصدر:** جدول `app_guides` في Supabase + لوحة أدمن (مصدر واحد).
- **التفصيل:** مفصّل خطوة-بخطوة — عنوان + لماذا (الفائدة) + خطوات مرقّمة + تنبيهات/أخطاء شائعة.
- **الوصول:** شاشة `/guide` مخصّصة (مقسّمة لأقسام + بحث + مفلترة بالصلاحية) **مع** إبقاء زر ❓ السياقي بالهيدر.
- **التحرير:** صلاحية جديدة `MANAGE_GUIDES` (أدمن + مدير افتراضياً).
- **لوزي:** تُبنى كتلة الدليل ديناميكياً من الأدلة المنشورة داخل الـsystem prompt (بدل النص المكتوب يدوياً).
- **الوسائط (صور/فيديو):** مؤجّلة (YAGNI v1) — المخطط مرن لإضافتها لاحقاً.

## المعمارية

### 1) قاعدة البيانات — `app_guides`
```sql
CREATE TABLE IF NOT EXISTS app_guides (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text UNIQUE NOT NULL,         -- معرّف ثابت: 'orders_syria'
  section_key text NOT NULL DEFAULT 'core', -- يطابق NAV_GROUPS: core/sales/inventory/hr/reports/social/admin/self
  title       text NOT NULL,
  icon        text DEFAULT '📄',
  why         text DEFAULT '',              -- الفائدة
  steps       jsonb NOT NULL DEFAULT '[]',  -- ["خطوة 1","خطوة 2", ...]
  tips        jsonb NOT NULL DEFAULT '[]',  -- [{"type":"warning|tip","text":"..."}]
  routes      jsonb NOT NULL DEFAULT '[]',  -- ["/orders/syria"] لمطابقة ❓ السياقي
  permission  text,                          -- مفتاح صلاحية (NULL = للجميع)
  sort_order  int  NOT NULL DEFAULT 100,
  is_published boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
ALTER TABLE app_guides ENABLE ROW LEVEL SECURITY;
CREATE POLICY app_guides_read  ON app_guides FOR SELECT USING (true);
CREATE POLICY app_guides_write ON app_guides FOR ALL USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON app_guides TO anon, authenticated;
```
- RLS مفتوح (مسار PIN/anon متوافق مع باقي الجداول). الكتابة محميّة على مستوى **الواجهة** بصلاحية `MANAGE_GUIDES`.
- **تنفيذ الـDDL:** عبر لوحة Supabase (جلسة المالك بالمتصفّح) — لا يوجد sbp token بالـworktree.

### 2) خدمة الواجهة — `src/services/guidesService.js`
- `fetchGuides()` — يجلب الأدلة المنشورة، يخزّنها بالذاكرة (+ invalidate عند الحفظ من اللوحة).
- `guidesForUser(guides, permSet)` — يفلتر بالصلاحية (`permission` null = للجميع، وإلا `permSet.has(permission)`). **دالة نقيّة قابلة للاختبار.**
- `guidesForRoute(guides, pathname)` — أدلة الشاشة الحالية أولاً (للزر ❓). **نقيّة.**
- `groupGuidesBySection(guides)` — تجميع حسب `section_key` بترتيب `NAV_GROUPS`. **نقيّة.**

### 3) الشاشات
- **`src/screens/GuideScreen.jsx`** (`/guide`): شاشة «📖 دليل التطبيق». أكورديون لكل قسم → بطاقات أدلة (عنوان/أيقونة/لماذا/خطوات مرقّمة/تنبيهات) + بحث نصّي + مفلترة بصلاحية المستخدم.
- **`src/screens/admin/AdminGuidesScreen.jsx`** (`/admin/guides`): CRUD — جدول الأدلة + نموذج (القسم/العنوان/الأيقونة/لماذا/خطوات [+/−]/تنبيهات/المسارات/الصلاحية/الترتيب/منشور) + حذف بتأكيد. محميّة `MANAGE_GUIDES`.
- **`src/components/ui/HelpGuide.jsx`** (موجود): يُعاد توصيله ليقرأ من `guidesService` بدل `guides.js` المستورد؛ يعرض دليل المسار الحالي أولاً.

### 4) القائمة والصلاحيات
- `navigation.js`: عنصر `{ id:'guide', label:'دليل التطبيق', icon:'📖', path:'/guide', roles:ALL, group:'self' }` + عنصر أدمن `{ id:'admin-guides', path:'/admin/guides', perm:MANAGE_GUIDES }` (ضمن لوحة الأدمن).
- `permissions.js`: إضافة `MANAGE_GUIDES` + وصفه + ضمن مجموعة مناسبة + ضمن قوالب admin/manager الافتراضية.
- `paths.js` + `AppRoutes.jsx`: مساران جديدان (lazy).

### 5) تعليم لوزي — `ai-assistant/index.ts`
- يُستبدل بلوك «📱 دليل استخدام التطبيق الكامل» المكتوب يدوياً بـ**بناء ديناميكي**: استعلام `app_guides` (المنشورة، مرتّبة) → تنسيق مُوجز لكل دليل (`### {title}` + لماذا + خطوات مرقّمة) داخل `buildSystemPrompt`.
- دالة تنسيق نقيّة `formatGuidesForPrompt(guides)` (قابلة للاختبار) بحدّ معقول للطول.
- النشر: تلقائي عبر `deploy-functions.yml` عند الـpush. **النتيجة: أي دليل يُضاف باللوحة → لوزي تعرفه فوراً (القراءة وقت الطلب).**

### 6) الترحيل والمحتوى الأولي
- ملف `supabase/app_guides_seed.sql`: يُنشئ الجدول + يُدخل الأدلة الأولية (UPSERT بالـ`key`، idempotent).
- المحتوى: تحويل الـ11 دليل الحالي + دمج تفاصيل نص لوزي + **إضافة الأقسام الناقصة**: طلبات سوريا، طلبات تركيا، التجهيز (FulfillmentBoard)، يورتيتشي (تصدير Excel)، المخازن، العملاء/الأرشيف، المحادثات، السوشال ستوديو، التحليلات/لوحة المدير. (~18–20 دليل مفصّل.)
- بعد الترحيل: تُزال قراءة `guides.js` وقت التشغيل (يبقى الملف مرجعاً تاريخياً أو يُحذف).

### 7) عملية «أضفنا مشروع جديد» (تُوثَّق بالـHANDOFF)
خطوة واحدة: **Admin → الأدلة → + دليل جديد** → اختر القسم/العنوان/اكتب الخطوات/الصلاحية → حفظ. يظهر فوراً في `/guide` لأصحاب الصلاحية **ولوزي تعرفه**. بلا مبرمج ولا نشر.

## الاختبار
- **وحدة (node):** `guidesForUser` (فلترة الصلاحية)، `groupGuidesBySection` (الترتيب)، `guidesForRoute`، `formatGuidesForPrompt`.
- **حيّ:** `/guide` يعرض الأقسام حسب الدور (مدير مقابل موظف) · CRUD باللوحة (إضافة دليل → يظهر) · زر ❓ يفتح دليل الشاشة · لوزي تجاوب «كيف بدي أنزّل طلب سوريا؟» من دليل مُضاف · `npm run build` أخضر.

## خارج النطاق (v1)
صور/فيديو بالخطوات · ترجمة متعدّدة اللغات · تتبّع «قرأ الدليل» · إصدارات/تأريخ الأدلة.

## المخاطر
- **تنفيذ DDL** يحتاج جلسة Supabase للمالك (متصفّح). — مُدار.
- **حجم prompt لوزي** قد يكبر مع كثرة الأدلة → نُوجز ونحدّ الطول.
- **توافق الصلاحيات:** `MANAGE_GUIDES` يجب أن يُضاف لقوالب الأدوار وإلا لا يراه أحد بلوحة الأدمن.
