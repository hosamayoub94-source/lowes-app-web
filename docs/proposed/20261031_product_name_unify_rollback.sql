-- رجوع عن 20261031_product_name_unify.sql — يحذف صفوف تلك الدفعة فقط.
-- ضع وقت التطبيق الفعلي مكان :applied_at (من created_at للصفوف المُدرجة) كي لا يُحذف اسم كان موجوداً قبلها.
begin;
delete from product_name_map
 where alias_name in ('Female Viagra 100', 'تونر جسم', 'Süper viga blue', 'ديرما رول ,1mm', 'سيروم روزماري'
                      -- + أسماء Tier B إن طُبِّقت
                     )
   and created_at >= :'applied_at';
-- commit;
rollback;
