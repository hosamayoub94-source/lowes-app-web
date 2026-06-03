# تصميم نظام المخازن متعدّد الطبقات — Lowe's Professional
> Spec · 2026-06-03 · مالك المشروع: Ayoub (Hosam)

---

## 1. الهدف

بناء نظام مخازن هرمي يعطي **رؤية دقيقة لما لدينا من بضاعة وأين** عبر طبقات (مركزي → مبيعات → مناديب)، مع خصم تلقائي عند البيع وضبط صلاحيات الوصول. الهدف الجوهري بكلمات المالك: «نعرف شو عنا بضاعة».

**مثال توضيحي (المالك):** عندنا 1000 قطعة من منتج X في المركزي. نخصّص 100 لمخزن المبيعات و300 للمناديب → يبقى 600 بالمركزي. النظام يعرض هذا التوزيع لحظياً.

---

## 2. السياق التنظيمي

### الفِرق وأهداف البيع (Targets)
- **سوريا:** التارجت = **$1000** لكل بائع (بغضّ النظر عن المنتج المباع).
- **تركيا:** التارجت = **65,000 TL** (يتغيّر مع التضخّم؛ ~$1500 حالياً).

### روستر المبيعات النشط

**تيم سوريا (14):** Reham · Rita Deeb · Sally Teba · Sarah Ibrahim · Haneen Mohamad · Dalal Ali · Petra Dahdouh · Taj mahmoud · Leen Alasaad · Raghad almaroof · Sedra Deeb · Rand Jaweesh · Ziena Hamodi · Yasmin Mahmoud

**تيم تركيا (12):** Diana Hasan · Sarah Alasaad · bushra saidy · Thanaa Al Ashkar · Hassna Deeb · yasmeen alahmad · Marah Bashir · Rouida Alibrahim · Hla Al Namra · zeina almarouf · Louna Dahdouh · Arwa Mohammed

**براند منفصل — la ronven glow (سابقاً strong man):** Zina Sulyman · Khedr alnisafe — في تركيا لكن ~90% من مبيعاتهم منتجات مختلفة عن لويز.

### قواعد تنظيمية
- **الموظفون المستقيلون:** لا حاجة لإظهار أسمائهم. أرشيف طلباتهم يُجمَّع تحت اسم موحّد (مثلاً «مبيعات لويز»). الأرشيف يهمّ فقط للبائعين النشطين أعلاه.
- **السوق لكل طلب:** موظف تركيا قد يبيع لعميل سوري (والعكس)، وقد يتناوبون. السوق يُختار **لكل طلب** لا لكل موظف (مدعوم حالياً). 3 من تركيا لهم مبيعات سوريا قليلة.
- **عزل la ronven glow:** طلبات Zina/Khedr تُوسَم `brand='la_ronven_glow'` → تُسجَّل للمبيعات والتارجت لكن **لا تخصم من مخزون لويز**. مخزون la ronven glow المستقل = مشروع منفصل مستقبلاً.

---

## 3. نموذج البيانات

> 🏷️ نستخدم سابقة `wh_` لكل الجداول لتفادي أي تضارب مع الجداول المؤسسية النائمة (`warehouses`/`stock_levels`/`stock_movements`).

```sql
-- المخازن
wh_warehouses (
  id uuid pk,
  name text,            -- "المخزن المركزي" · "مبيعات سوريا" ...
  type text,            -- central | sales | distributor | returns
  owner_name text,      -- اسم المسؤول (يوسف/فاطمة/المندوب) — informational
  market text,          -- syria | turkey | null (للمركزي)
  is_active boolean default true,
  created_at timestamptz
)

-- المخزون لكل (مخزن × منتج)
wh_stock (
  id uuid pk,
  warehouse_id uuid fk → wh_warehouses,
  product_id uuid fk → products,
  quantity int default 0,
  unique (warehouse_id, product_id)
)

-- سجل كل حركة (audit trail كامل)
wh_movements (
  id uuid pk,
  product_id uuid fk → products,
  from_warehouse_id uuid null,   -- مصدر (null للاستلام الخارجي)
  to_warehouse_id uuid null,     -- وجهة (null للبيع/الخروج)
  quantity int,                  -- موجب دائماً
  type text,                     -- receive | allocate | reserve | release | adjust | return
  reason text,
  performed_by text,             -- اسم المنفّذ (PIN auth → نص لا uuid)
  order_id uuid null,            -- ربط بالطلب عند reserve/release
  created_at timestamptz
)

-- ربط الموظف بمخزنه (للمناديب)
profiles.warehouse_id uuid null  -- null = يستخدم المخزن الافتراضي حسب السوق

-- وسم البراند على الطلب (لعزل la ronven glow)
orders.brand text default 'lowes'   -- lowes | la_ronven_glow
```

> ⚠️ الجداول المؤسسية القديمة (`warehouses`/`stock_levels`/`stock_movements`) **فارغة وغير مستخدمة** وبنيتها over-engineered (SAR + ربط auth.users يكسر PIN auth). نتركها كما هي ونبني جداول `wh_*` الجديدة المتوافقة مع `products` الحقيقي و PIN auth. كل جداول `wh_*` بـ RLS مفتوح + GRANT (نمط PIN auth).

---

## 4. طبقات المخازن

| المخزن | type | المالك | الوصول (read/write) |
|--------|------|--------|---------------------|
| المخزن المركزي | central | الشركة | **الأدمن + سيم (wasim alkshki) + فادي (Fadi jarrouge) فقط** |
| مبيعات سوريا | sales | يوسف (Yousef Alkshki) | يوسف + المدراء |
| مبيعات تركيا | sales | فاطمة (Fatima Ayoub) | فاطمة + المدراء |
| مخازن المناديب | distributor | كل مندوب | المندوب يشوف مخزنه فقط + المدراء |
| مرتجعات (اختياري) | returns | — | المدراء |

يوسف **لا** وصول له للمركزي.

---

## 5. تدفقات المخزون

1. **استلام (`receive`):** بضاعة جديدة → المركزي. `to=central`, `from=null`. المركزي += كمية.
2. **تخصيص (`allocate`):** المركزي → مبيعات/مندوب. `from=central`, `to=target`. المركزي −= ، الهدف += . ← «خصصنا 100 ليوسف».
3. **حجز عند إنشاء الطلب (`reserve`)** [قرار المالك]: عند تسجيل طلب `brand='lowes'` → خصم تلقائي من مخزن المصدر. **المصدر:** `profiles.warehouse_id` للبائع إن وُجد (مندوب)، وإلا مخزن المبيعات حسب سوق الطلب (سوريا→يوسف، تركيا→فاطمة). يُسجَّل movement مربوط بـ `order_id`.
4. **إرجاع عند الإلغاء (`release`):** إلغاء الطلب → إعادة الكمية لمخزن المصدر.
5. **تعديل/جرد (`adjust`):** تصحيح يدوي مع سبب.
6. **مرتجع (`return`):** بضاعة راجعة → مخزن مرتجعات أو المركزي.

> طلبات `brand='la_ronven_glow'` لا تُنشئ أي حركة مخزون لويز.

---

## 6. لوحة الرؤية «شو عنا بضاعة»

جدول رئيسي لكل منتج:

| المنتج | المركزي | مبيعات سوريا | مبيعات تركيا | المناديب | **الإجمالي** | تنبيه |
|--------|---------|--------------|--------------|----------|-------------|-------|
| منتج X | 600 | 100 | 0 | 300 | **1000** | — |

+ فلترة بالمخزن · بحث · تمييز المخزون المنخفض (≤ min_stock) · إجمالي القيمة.

---

## 7. الصلاحيات (تُضاف لـ `src/data/permissions.js`)

| Permission | يُمنح لـ |
|------------|---------|
| `MANAGE_CENTRAL_STOCK` | الأدمن + سيم + فادي (استلام/تخصيص من المركزي) |
| `MANAGE_SALES_STOCK` | fulfillment (يوسف/فاطمة) + المدراء |
| `VIEW_INVENTORY` | المدراء + المخزنجية |

سيم وفادي يُمنحان `MANAGE_CENTRAL_STOCK` عبر `profiles.extra_permissions` من شاشة المستخدمين.

---

## 8. الأرشيف (مؤجّل — مواصفة مبسّطة جاهزة)

استيراد تاريخي **خفيف**: لكل طلب أرشيفي → اسم العميل + القيمة + التاريخ + البائع فقط (بدون منتجات). يُدخل لـ `orders` بوسم `archived=true` + `sheet_synced=true`. طلبات المستقيلين تُجمَّع تحت handler موحّد. **الجديد يُسجَّل كاملاً** (كل التفاصيل). يُنفَّذ كمهمة منفصلة بعد نظام المخازن.

---

## 9. خطة المراحل

| المرحلة | المحتوى |
|---------|---------|
| **1** | الجداول (`warehouses`/`warehouse_stock`/`stock_movements`) + بذر المخازن (مركزي + مبيعات سوريا + مبيعات تركيا) + التخصيص + **لوحة الرؤية** + صلاحيات المركزي + روستر النشطين |
| **2** | الحجز التلقائي عند إنشاء الطلب (`reserve`) + الإرجاع عند الإلغاء (`release`) + وسم `orders.brand` + عزل la ronven glow + تنبيهات نقص |
| **3** | مخازن المناديب (`profiles.warehouse_id`) + المرتجعات + دورات تخصيص شهرية + تقارير مخزون |
| **منفصل** | استيراد الأرشيف · مخزون la ronven glow المستقل · ربط التارجت بلوحة المدير |

---

## 10. إجراءات يحتاجها المالك (خارج البرمجة)
- تأكيد: سيم = `wasim alkshki` · فادي = `Fadi jarrouge` (موجودان بالـ DB).
- لا حاجة لأسماء المستقيلين (أرشيفهم يُجمَّع موحّداً).

---

*ينتقل بعد الموافقة إلى مهارة writing-plans لخطة تنفيذ المرحلة 1.*
