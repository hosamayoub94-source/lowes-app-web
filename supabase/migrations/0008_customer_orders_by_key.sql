-- =============================================================
-- 0008 — get_customer_orders_by_key(p_key)
-- سجل مبيعات العميل بالكامل عبر مفتاح الهاتف المُطبَّع (أرقام فقط).
-- يُغذّي درل-داون «سجل المبيعات — مين باع شو» داخل كرت العميل.
--
-- المشكلة: getCustomerOrders كانت تطابق phone_1 حرفياً، فتفوّت طلبات
-- مخزّنة بصيغة هاتف مختلفة (رمز دولة/صفر/فواصل) → سجل ناقص وعدّ لا يطابق
-- customer_stats. هذه الدالة تطبّع phone_1 و wa_number لأرقام فقط وتطابقهما
-- بنفس مفتاح العرض، فتُرجع كل طلبات العميل بغضّ النظر عن صيغة التخزين.
--
-- ⚠️ شغّل هذا الملف عبر Supabase SQL Editor (DDL — لا يمر عبر التطبيق).
-- التطبيق يعمل قبل التطبيق بفضل fallback في getCustomerOrders، لكن السجل
-- يكتمل فقط بعد إنشاء الدالة.
-- =============================================================

create or replace function public.get_customer_orders_by_key(p_key text)
returns setof public.orders
language sql
stable
security definer
set search_path = public
as $$
  select o.*
  from public.orders o
  where o.deleted_at is null
    and p_key is not null
    and length(p_key) >= 6
    and (
      regexp_replace(coalesce(o.phone_1, ''),   '\D', '', 'g') = p_key
      or regexp_replace(coalesce(o.wa_number, ''), '\D', '', 'g') = p_key
    )
  order by o.order_date desc nulls last
  limit 200;
$$;

-- نفس صلاحيات قراءة الطلبات في التطبيق (anon + authenticated).
grant execute on function public.get_customer_orders_by_key(text) to anon, authenticated;
