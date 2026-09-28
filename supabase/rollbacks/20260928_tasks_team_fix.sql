-- سجل تصحيح قيم team القديمة (28 أيلول 2026) — المرحلة الأولى لمهام السوشال.
-- مصدر الخطأ: نموذج تعديل المهمة كان يكتب social/sales/ops بدل ميديا/سوريا/تركيا.
-- صُحّحت 7 مهام فقط لأن فريقها واضح من المسؤول/المنشئ:
--   social → ميديا (5): المسؤول alic kanaan (ميديا) أو المنشئة Dalal Ali (ميديا)
--   sales  → سوريا (2): المسؤولة Natalie alhaddad (مديرة مبيعات سوريا)
-- لم تُمَسّ 8 مهام (لا يمكن تحديد فريقها بلا تخمين):
--   sales (4) مسندة لـReem (أدمن بلا فريق): 76acf7e4… 94c3dc49… 6b996282… ab784f48…
--   ops   (4) مسندة لـDiana (Medical Relations، خارج تبعية مدير السوشال): 70b1f536… 3eba5636… 57051105… a9a14541…
--
-- Rollback (يعيد القيم القديمة حرفياً):
update public.tasks set team = 'social' where team = 'ميديا' and id in (
  '7d865a19-427e-4366-9966-3a4b8813eedb','d691460c-84e1-41dd-ae9c-b44203e6fd34',
  'f1a104d3-d1b0-40b6-ab65-6e193d5c092f','051b9839-3d2b-4143-aa0e-521caf3bad4b',
  'ce2d3f17-11a9-4d13-959e-e9feba73bc8e');
update public.tasks set team = 'sales' where team = 'سوريا' and id in (
  'a81b450f-3398-4067-ad0a-2cd73394bd36','0fe085a9-725c-4858-a345-229f6d782e4c');
