# تصميم: طبقة المحاسبة والمتابعة للطلبات (Order Accountability Layer)

> التاريخ: 2026-06-07 · المالك: Ayoub (Hosam) · الحالة: مسوّدة للمراجعة

## 1. الهدف والسياق

النظام الحالي «بائع-محوري»: كل موظف يستقبل الطلب على رقمه/صفحته (إعلانات + واتساب + مسنجر)،
يُدخله بنفسه، ويبقى **مالكه** (`handler_name`). لا يوجد توزيع مركزي ولا نقل بين الموظفين.

**المطلوب:** رفع الاحترافية عبر **طبقة متابعة ومحاسبة لكل موظف** فوق النظام الحالي — بدون
إعادة بناء الإدخال أو نموذج الطلب.

### الأهداف (Goals)
1. **محاسبة لا تُنكَر:** سجل تدقيق لكل تغيير حالة (مين + إيمتى + من→إلى).
2. **لا يضيع طلب:** تنبيه التقادم/SLA — أي طلب وقف بمرحلة فترة طويلة يُعلَّم «عالق».
3. **لوحة محاسبة الموظفين:** كرت أداء لكل موظف (توزيع الحالات + نسبة نجاح + مبيعات + عالق + متوسط زمن).

### خارج النطاق (Non-Goals)
- توزيع مركزي / صندوق pool / claim — **مرفوض صراحةً** (المالك أكّد: لا توزيع).
- نقل/تحويل الطلب بين الموظفين — **مرفوض** (كل موظف يبقى مالك طلباته).
- محاسبة على مستوى المجموعة/الحملة/السوق — المطلوب **لكل موظف فقط** (المصدر يُلتقط كحقل خفيف للمستقبل، بدون لوحات).
- لوحة Kanban / سحب-وإفلات.

## 2. نموذج البيانات (Data Model)

### 2.1 جدول جديد: `order_status_history`
سجل تدقيق غير قابل للتعديل لكل تغيير حالة.

```sql
CREATE TABLE order_status_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status text,
  to_status   text NOT NULL,
  changed_by  text NOT NULL,          -- employee_name أو 'system'/'sheet'/'yurtici'
  changed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_osh_order ON order_status_history(order_id);
CREATE INDEX idx_osh_changed_at ON order_status_history(changed_at);
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY osh_all ON order_status_history FOR ALL USING (true) WITH CHECK (true);
```
> ملاحظة: `orders` سياستها `orders_all = true` (الكل يقرأ/يكتب)، نطابق نفس النمط. لا علاقة لـ
> column-level grants هنا (تلك خاصة بجدول `profiles` فقط).

### 2.2 عمود جديد على `orders`
```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source text;  -- 'campaign'|'whatsapp'|'messenger'|'page'|'other'
```
حقل اختياري يُلتقط من النموذج (مصدر الطلب). لا لوحات per-source الآن — لقطة للمستقبل فقط.

## 3. المكوّنات

### المكوّن 1 — سجل التدقيق + الخط الزمني (Phase 1)
- **التسجيل:** في `handleStatusChange` ([OrdersScreen.jsx:1969](src/screens/OrdersScreen.jsx)) — بعد نجاح
  `update`، نُدرج صف history `{order_id, from_status: order.status, to_status: newStatus, changed_by: userName}`.
  best-effort (try/catch، لا يُفشل تغيير الحالة).
- **المصادر الآلية:** `track-yurtici` و`sheet-to-app` عند تغييرهما الحالة → يُدرجان history بـ
  `changed_by='yurtici'`/`'sheet'` (تعديل صغير بكل function).
- **الخط الزمني:** ضمن بطاقة الطلب (توسعة موجودة) قسم «📜 سجل الحالات» يعرض history مرتّب زمنياً
  (الحالة بالعربي عبر `STATUSES[key].label` الموجود في OrdersScreen + الوقت + المنفّذ).
- **Backfill:** صف history أولي لكل طلب موجود من `created_at`→`status` الحالي (سكربت SQL لمرة واحدة، اختياري).

### المكوّن 2 — التقادم / SLA (Phase 2)
- **الحساب:** «زمن في المرحلة الحالية» = `now - (آخر changed_at من history، أو created_at إن لا history)`.
- **العتبات (ثوابت بالكود أولاً، قابلة لجعلها إعدادات لاحقاً):**
  ```
  pending: 1d · preparing: 1d · ready: 2d · shipped/on_way/motor/at_center: 4d · waiting/not_received: 2d
  ```
  الحالات النهائية (delivered/settled/cancelled/returned) لا تتقادم.
- **العرض:** شارة `🔴 عالق` على بطاقة الطلب المتجاوز + عدّاد «عالق: N» بالهيدر + فلتر «العالقة فقط».
- نعيد استخدام نمط `FOLLOWUP_STATUSES` الموجود.

### المكوّن 3 — لوحة محاسبة الموظفين (Phase 3)
- تبويب جديد «📊 محاسبة الموظفين» (للمدراء/الأدمن فقط — مخفي للبائع/fulfillment/storage).
- فلتر فترة (هذا الشهر / مدى مخصص) + فلتر سوق، يعيد استخدام منطق `dateFrom/dateTo` و`toUSD` الموجود.
- **كرت لكل موظف (`handler_name`):**
  - إجمالي الطلبات في الفترة
  - توزيع: وارد / قيد العمل / تم / راجع / ملغي
  - **نسبة النجاح** = `delivered / (delivered + returned + cancelled)` ×100
  - إجمالي المبيعات المسلّمة (بالعملة + USD عبر `toUSD`)
  - عدد العالق الآن (من المكوّن 2)
  - متوسط زمن المعالجة (إنشاء→تسليم، من history) — إن توفر
- Leaderboard قابل للفرز. يختلف عن «تسليمات الشهر» (الموجود = عمولة/إيراد) بكونه **متابعة/محاسبة**
  (نسبة نجاح + عالق + توزيع). نتجنّب التكرار بإعادة استخدام المكوّنات لا نسخها.

### المكوّن 4 — تلميع الإدخال + حقل المصدر (Phase 4)
- إضافة dropdown «مصدر الطلب» للنموذج (حملة/واتساب/مسنجر/صفحة/أخرى) يكتب `orders.source`.
- ترتيب النموذج: تجميع الحقول، علامات الحقول المطلوبة أوضح. تغيير بصري خفيف فقط.

## 4. التقسيم والتسليم (Phasing)
كل مرحلة مستقلة وقابلة للنشر وحدها، بالترتيب:
1. **Phase 1:** جدول history + التسجيل في `handleStatusChange` + الخط الزمني بالبطاقة.
2. **Phase 2:** التقادم/SLA (شارات + عدّاد + فلتر).
3. **Phase 3:** لوحة محاسبة الموظفين.
4. **Phase 4:** حقل المصدر + تلميع النموذج.

## 5. الأمان والمخاطر
- جدول history بسياسة `USING(true)` متطابق مع `orders` — مقبول لأن البيانات غير حساسة والتطبيق
  مغلق خلف Auth. (لو لاحقاً صار التشديد مطلوباً، نقيّد INSERT/UPDATE.)
- التسجيل best-effort: فشل history **لا** يُفشل تغيير الحالة الأساسي.
- لا تغيير على نموذج/تدفق الإدخال في Phases 1-3 → مخاطرة منخفضة على الموظفين الحاليين.
- `order_status_history` فقط INSERT من التطبيق (لا UPDATE/DELETE) → سجل تدقيق سليم.

## 6. الاختبار (Testing)
- بعد كل Phase: `npm run build` + اختبار حيّ (preview + حقن جلسة مدير) للتحقق من العرض والبيانات الحقيقية.
- Phase 1: تغيير حالة طلب → التأكد من ظهور صف history + الخط الزمني.
- Phase 2: طلب قديم بمرحلة non-terminal → ظهور شارة «عالق» + الفلتر يعمل.
- Phase 3: مطابقة أرقام كرت موظف مع استعلام SQL مباشر.
