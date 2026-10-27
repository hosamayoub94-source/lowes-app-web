-- أداء: فهرس جزئي على orders(tracking_number) لتسريع الدالة profitability_orders (وبالتالي /sales-delivery والرواتب).
--
-- السبب (مقيس على الإنتاج بـEXPLAIN ANALYZE لسبتمبر 2026، قراءة فقط): تنفيذ الدالة ≈ 2.5 ثانية، منها ≈ 2.0 ثانية
-- في ثلاثة SubPlan من الشكل NOT EXISTS (SELECT 1 FROM orders x WHERE x.tracking_number = c.tracking_number
-- AND x.id <> c.id AND x.deleted_at IS NULL) تُنفَّذ لكل طلب مسلَّم بلا حدث تسليم وتمسح جدول orders كله
-- (≈ 34 ألف صف) في كل مرة (74 + 24 + 68 تمريرة). لا يوجد أي فهرس على tracking_number.
-- دور authenticated مهلته 8 ثوانٍ، فالنداء يقترب منها تحت التزامن (شوهد 57014 مرة).
--
-- الأثر المتوقع: يتحول مسح الجدول إلى Index Scan. على نسخة مؤقتة مع نفس الفهرس: 1.217s ← 0.391s للاستعلام المبسّط
-- ونتائج مطابقة (0 صفوف مختلفة من 3971). لا تغيير بمنطق الدالة ولا بالنتائج، والفهرس إضافي فقط.
--
-- الفهرس جزئي بـdeleted_at IS NULL لأن الاستعلام الفرعي يحمل نفس الشرط (يُثبت المخطط تضمّنه)؛ ومساواة tracking_number
-- تستبعد NULL ضمنياً. الجدول صغير (≈ 36 ألف صف) فبناء الفهرس العادي لحظي؛ لا حاجة لـCONCURRENTLY (غير مسموح داخل transaction).
--
-- التحقق بعد التطبيق (قراءة فقط):
--   EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM public.profitability_orders('2026-09-01T00:00:00+03','2026-10-01T00:00:00+03');
--   المتوقع: لا Seq Scan على orders داخل SubPlan، والزمن الكلي أقل بكثير من 2.5s، وعدد الصفوف 1071 كما قبل.
CREATE INDEX IF NOT EXISTS idx_orders_tracking_number_active
  ON public.orders (tracking_number)
  WHERE deleted_at IS NULL;

-- التراجع (إن لزم): DROP INDEX IF EXISTS public.idx_orders_tracking_number_active;
