-- ================================================================
-- ترقية "هيا" إلى مسؤولة مبيعات تركيا (sales_manager)
-- شغّل هذا من Supabase → SQL Editor
-- ================================================================

-- 1) أولاً شوف اسمها الدقيق في القاعدة
SELECT id, employee_name, role_type, order_market, team
FROM profiles
WHERE employee_name ILIKE '%هيا%'
   OR employee_name ILIKE '%hiya%'
   OR employee_name ILIKE '%هيه%'
ORDER BY employee_name;

-- 2) بعد ما تتأكد من الاسم، شغّل هذا (عدّل الاسم لو لزم)
UPDATE profiles
SET
  role_type    = 'sales_manager',
  order_market = 'turkey'
WHERE employee_name ILIKE '%هيا%';

-- 3) تحقق
SELECT employee_name, role_type, order_market FROM profiles
WHERE employee_name ILIKE '%هيا%';

-- ================================================================
-- ما تمنحه هذا التغيير لهيا:
--   ✅ طباعة البوليصات  (زر 🖨️ بوليصات)
--   ✅ تصدير/رفع يورتيتشي
--   ✅ لوحة التجهيز اليومي
--   ✅ تسليمات الشهر + سجل الموظفين
--   ✅ الأرشيف + المحذوفة
--   ✅ التتبع (كانت تراه أصلاً)
--   ✅ فلتر البائع + المدة
-- ================================================================
