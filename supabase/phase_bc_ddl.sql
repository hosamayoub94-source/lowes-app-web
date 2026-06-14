-- ================================================================
-- Phase B + C — DDL (يحتاج صلاحية عالية: SQL Editor / edge-ddl / dashboard)
-- آمن وقابل للتراجع. لا يحذف بيانات.
-- ================================================================

-- Phase B (اختياري — الإصلاح جهة التطبيق يعمل بدونه): تفعيل realtime لجدول
-- orders حتى ينعكس تغيير الحالة فوراً عبر postgres_changes بدل poll كل 30s.
ALTER PUBLICATION supabase_realtime ADD TABLE orders;

-- Phase C: ربط مدير الإعلانات بالحملة (للرؤية/التحليل، ليس للتشغيل).
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS manager_name text;
-- (campaigns تستخدم GRANT على مستوى الجدول لـ anon/authenticated؛ العمود الجديد
--  مشمول تلقائياً — لا حاجة لمنح على مستوى العمود مثل profiles.)
