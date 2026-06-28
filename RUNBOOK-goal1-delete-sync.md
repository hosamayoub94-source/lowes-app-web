# 🚀 Runbook — البند ١: مزامنة الحالة + إصلاح «الحذف يرجع»

> الكود مكتوب ومراجَع، لكنه **غير منشور وغير مُختبَر حيّاً** (لا يتوفّر لي توكن Supabase
> ولا جلسة Google). هذا الدليل لتنشره وتختبره أنت. **لا تدمج PR قبل التحقق الحيّ.**

## ما الذي تغيّر (repo)

| الملف | التغيير |
|------|---------|
| `supabase/functions/sheet-to-app/index.ts` | إجراء جديد `reconcile_present`: يحذف ناعماً أي طلب نشط غير منتهٍ غاب «كود الطلب» تبعه عن التابين النشطين. **حمايات الحذف الجماعي بالداخل** (سقف ١٥ + رفض القائمة الفارغة + استثناء delivered/settled/returned/cancelled). |
| `supabase/functions/sync-order-to-sheet/index.ts` | حارس `deleted_at` بعد قراءة الطلب: طلب محذوف لا يُدفع للجدول أبداً → ينهي «الحذف يرجع» من المصدر. |
| `src/services/orderSyncService.js` | `softDeleteOrder` ما عاد يدفع المحذوف للجدول (كان نداءً مضلِّلاً صار no-op). |
| `google-apps-script/turkey-sales-sync.gs` | **مرجع** — `onTurkeyRowRemoved` + `createReconcileTrigger` (تُلصق في المشروع الحيّ). |

## السبب الجذري (للتذكير)
`onSheetEdit` يلتقط تعديلات الخلايا فقط (عمود I الحالة + P التتبع) — **لا يلتقط حذف الصفّ**.
فالطلب يبقى `deleted_at=null` بالـDB، وعند أول تغيير حالة لاحق كان `doPost` لا يجد «كود الطلب»
بالتاب فيُلحق صفّاً جديداً = الطلب «يرجع». الحلّ ثلاثي: (١) حارس edge fn يمنع دفع المحذوف،
(٢) إجراء reconcile_present يحذف ما غاب صفّه، (٣) onChange حيّ يطلق reconcile.

---

## خطوات النشر

### ١) نشر الـ edge functions (يحتاج Supabase CLI مُسجَّل دخول)
```bash
cd "lowes-app-web"
supabase login                         # مرة واحدة (أو SUPABASE_ACCESS_TOKEN)
supabase link --project-ref fghdumrgimoeqsafdhhh
supabase functions deploy sheet-to-app
supabase functions deploy sync-order-to-sheet
```

### ٢) المشروع الحيّ Apps Script (تركيا) — يحتاج جلسة Google (hosam101hosam10@gmail.com)
المشروع: `1ub2zm_Ne4NzbJmylw_IgB7Mu8ac_EIUBnVGHbCV-n2jhxbymcEmrkX1O` (ملف `Dashboard.gs`).
1. افتح المشروع الحيّ على script.google.com.
2. الصق الدالتين `onTurkeyRowRemoved` و`createReconcileTrigger` من `turkey-sales-sync.gs` (المرجع) → **Save**.
   - تأكّد أن `TOKEN` و`SHEET_TO_APP_URL` معرّفان بالمشروع الحيّ (موجودان أصلاً).
3. شغّل **مرة واحدة**: Run ▶ `createReconcileTrigger` ووافق على الأذونات.
4. **لا حاجة لإعادة نشر الـ web app** — تريغر onChange يشتغل على كود الـHEAD لا على النشر المثبّت.
   (إعادة النشر تلزم فقط لو غيّرت `doPost` — وهنا لم نغيّره.)

---

## ✅ التحقق الحيّ (إلزامي قبل الدمج)

1. **إصلاح الحذف من الجدول:** احذف صفّ طلب نشط من `LOWES_TR` → خلال ثوانٍ يصير الطلب
   `deleted_at` معبّأ + `cancelled` ويختفي من قائمة الطلبات بالتطبيق.
2. **لا يرجع:** غيّر حالة طلب آخر بالتطبيق → الطلب المحذوف **لا يُلحَق من جديد** بالجدول.
3. **حماية الحذف الجماعي:** (اختبار أمان) لو حُذفت صفوف كثيرة دفعة، يرفض الـedge fn
   ويرجّع `too_many_would_delete` بلا حذف. تحقّق من سجلّ الـfunction.
4. **لا يلمس التسليمات:** طلب «تم التسليم ✅» (منقول/سيُنقل لتاب التسليمات) لا يُحذف
   لأنه منتهٍ (مستثنى من reconcile).
5. **المزامنة الثنائية للحالة (تبقى شغّالة):** غيّر الحالة من الجدول → تنعكس بالتطبيق،
   والعكس — خلال ١٠ث.

### اختبار مباشر للـ edge fn (بدون انتظار التريغر)
```bash
# يحذف فقط الطلب المحذوف صفّه (مرّر كل أكواد الطلبات النشطة عدا واحد)
curl -X POST "https://fghdumrgimoeqsafdhhh.supabase.co/functions/v1/sheet-to-app" \
  -H "Content-Type: application/json" \
  -d '{"token":"LOWES-TURKEY-2026","action":"reconcile_present","market":"turkey","present_ids":["<كل الأكواد النشطة عدا واحد>"]}'
# توقّع: {"ok":true,"reconciled":1,...}. وبقائمة فارغة: {"skipped":"empty_present_list"}.
```

## ⚠️ مخاطر وملاحظات
- **الحذف الجماعي:** السقف الافتراضي ١٥ (`MAX_RECONCILE_DELETE`) ورفض حذف ≥ كامل النشط.
  لو تركيا فيها طلبات نشطة كثيرة وحُذف عدد كبير عمداً، عدّل السقف بوعي.
- **التنسيق مع البند ٢:** بعد تفعيل ترحيل التسليمات، المنقولة منتهية (مستثناة) فآمنة.
- **سوريا:** نفس المعالجة ممكنة لاحقاً بمشروع `1Dpnbvh5` (لم تُطبَّق هنا).
