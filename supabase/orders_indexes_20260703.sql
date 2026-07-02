-- ============================================================
-- فهارس أداء لجدول orders (32,000+ صف) — 2026-07-03
--
-- المشكلة (M1 من تدقيق 2/7): استعلام شاشة الطلبات (~2.1s) والعدّ (~3.5s)
-- يمسحان الجدول كاملاً. هذه الفهارس تقصّ الزمن لأقل من ~300ms.
--
-- آمن تماماً: CREATE INDEX IF NOT EXISTS لا يمسّ أي بيانات. استخدمنا
-- CONCURRENTLY كي لا يقفل الكتابة على جدول حيّ (30 مستخدماً).
-- ⚠️ CONCURRENTLY لا يعمل داخل معاملة — نفّذ كل سطر على حدة في SQL Editor
--    (أو أزل CONCURRENTLY؛ القفل لحظيّ على 32k صف).
-- ============================================================

-- شاشة الطلبات: فلترة بالسوق + ترتيب زمنيّ تنازلي (الاستعلام الأساسي)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_market_created
  ON public.orders (market, created_at DESC);

-- بطاقات الإحصاء + الفلترة بالحالة
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_status
  ON public.orders (status);

-- نسب المبيعات للبائع (محرك الرواتب + محفظة البائع + كشوف الحركة)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_handler
  ON public.orders (handler_name);

-- تجميع الطلبات المحصّلة شهرياً (order_date ضمن الشهر + الحالة)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_orderdate_status
  ON public.orders (order_date, status);

-- بانر المزامنة الفاشلة (partial — الصفوف الفاشلة فقط، صغير وسريع)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_sync_failed
  ON public.orders (sync_status)
  WHERE sync_status = 'failed';

-- تحقّق بعد التطبيق:
-- EXPLAIN ANALYZE SELECT id FROM orders WHERE market='syria' ORDER BY created_at DESC LIMIT 500;
