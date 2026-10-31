-- =============================================================
-- مقترح — توحيد أسماء منتجات مكررة (D-176 / docs/product-duplicates-audit-2026-10-31.md)
-- ⛔ غير مطبَّق. لا يُشغَّل على الإنتاج إلا بموافقة حسام الصريحة.
--
-- ما يفعله: إدراج أسماء بديلة (alias) في product_name_map فقط.
-- ما لا يفعله: لا يحذف ولا يعدّل أي صف بجداول التكلفة/الطلبات/الخريطة الموجودة.
-- الرجوع: 20261031_product_name_unify_rollback.sql (يحذف صفوف هذه الدفعة فقط بوقت إدراجها).
-- =============================================================

-- 0) فحص مسبق (قراءة فقط): يجب أن يرجع 0 صفوف — وإلا فالاسم موجود مسبقاً ولا يُعاد إدراجه
-- select alias_name, canonical_name from product_name_map
--  where lower(alias_name) in (lower('Female Viagra 100'), lower('تونر جسم'), lower('Süper viga blue'), lower('ديرما رول ,1mm'), lower('سيروم روزماري'));

begin;

-- 1) Tier A — إملاء فقط (آمن). الموحِّد يطبّع الحروف الكبيرة/الصغيرة، فاسم واحد يكفي لكل تنويعات الحالة.
insert into product_name_map (alias_name, canonical_name, brand, is_active) values
  ('Female Viagra 100', 'Female.Viagra 100',       'strong', true),
  ('تونر جسم',          'تونر الجسم',              'lowes',  true),
  ('Süper viga blue',   'Super Viga Blue',         'strong', true),
  ('ديرما رول ,1mm',    'ديرما رول 1mm',           'lowes',  true),
  ('سيروم روزماري',     'سيروم الروزماري',         'lowes',  true)
on conflict (alias_name) do nothing;

-- 2) Tier B — اسم قديم/لغة أخرى لنفس المنتج — ⛔ معلَّق حتى تأكيد المالك لكل سطر
-- insert into product_name_map (alias_name, canonical_name, brand, is_active) values
--   ('LOWE''S sakal ve Bıyık Serumu', 'سيروم اللحية',              'lowes', true),
--   ('LOWE''SsakalveBıyıkSerumu',     'سيروم اللحية',              'lowes', true),
--   ('sakal ve Bıyık Serumu',         'سيروم اللحية',              'lowes', true),
--   ('LOWE''S GÖĞÜS BAKIM SERUM',     'سيروم العناية بالثدي',      'lowes', true),
--   ('LOWE''SGÖĞÜSBAKIMSERUM',        'سيروم العناية بالثدي',      'lowes', true),
--   ('LOWE''S RETİNOL SERUM',         'سيروم الريتينول',           'lowes', true),
--   ('LOWE''SRETİNOLSERUM',           'سيروم الريتينول',           'lowes', true),
--   ('LOWE''S VİTAMİN C SERUM',       'سيروم فيتامين سي',          'lowes', true),
--   ('LOWE''SVİTAMİNCSERUM',          'سيروم فيتامين سي',          'lowes', true),
--   ('LOWE''S BIBERIYE SERUM',        'سيروم الروزماري',           'lowes', true),
--   ('سيروم لبقع وتصبغات',            'سيروم مصحح البقع الداكنة',  'lowes', true),
--   ('سكراب للجسم',                   'سكراب الجسم بالفراولة',     'lowes', true)
-- on conflict (alias_name) do nothing;

-- 3) تحقق بعد الإدراج (قبل commit): كل اسم يجب أن يشير لاسم موحّد موجود
select m.alias_name, m.canonical_name,
       exists (select 1 from product_name_map c where c.canonical_name = m.canonical_name and c.alias_name <> m.alias_name) as canonical_known
  from product_name_map m
 where m.alias_name in ('Female Viagra 100', 'تونر جسم', 'Süper viga blue', 'ديرما رول ,1mm', 'سيروم روزماري');

-- commit;   -- ⛔ يدوياً بعد مراجعة نتيجة التحقق
rollback;    -- الافتراضي: لا شيء يُحفظ
