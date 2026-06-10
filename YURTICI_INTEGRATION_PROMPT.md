# 🚚 ربط Yurtiçi Kargo — ✅ مُنجَز (10 يونيو 2026)

> هذا البرومبت كان للتنفيذ بمحادثة جديدة، لكن **التنفيذ تمّ بالكامل** في نفس الجلسة.
> التوثيق الكامل والحقائق التقنية: ملف الذاكرة `yurtici-integration` + `HANDOFF.md`.

## ما أُنجز
- **`create-yurtici-shipment`** (edge fn) — SOAP `createShipment`، cargoKey=order_id، يختار حساب COD/NORMAL حسب الدفع، يحفظ `orders.yurtici_cargo_key` ويزامن الجدول. (`test:true` للاختبار، `debug:true` لفحص الأسرار.)
- **`track-yurtici`** — أُعيدت كتابتها SOAP `queryShipment` (keyType=0=cargoKey) + أُزيل الـ service_role المكشوف.
- **العمود** `orders.yurtici_cargo_key` (+GRANT SELECT) طُبّق.
- **الواجهة:** زر «🚚 أنشئ شحنة يورتيتشي» على كرت تركيا + تحديث-عند-فتح-الشاشة.
- **الأسرار** `YURTICI_COD_*` / `YURTICI_NORMAL_*` مضبوطة بـ Edge Functions Secrets.
- **اختُبر حيّاً:** إنشاء+إلغاء عبر الدالة المنشورة نجح (`created:true · cancelled:true · account:COD`).

## كيفية الاستخدام
كرت طلب تركيا → «🚚 أنشئ شحنة يورتيتشي» (مدير/fulfillment) → شحنة + تتبّع تلقائي.

## متبقّيات صغيرة (غير حارقة)
- حساب NORMAL (مدفوع مسبق) غير مختبَر — يُتحقَّق بأول طلب مدفوع مسبق.
- أكواد حالات النقل/التسليم تُحسم من أول شحنات حقيقية (`mapStatus` يعتمد النص التركي حالياً).
- cron `run_yurtici_tracking` يحتاج `app.settings.service_role_key` (refresh-on-open كافٍ حالياً).
