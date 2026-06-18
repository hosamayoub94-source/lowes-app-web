-- ============================================================================
-- 0007_audit_remediation.sql
-- إصلاحات من الفحص الشامل (يونيو 2026) — تتطلب تطبيقاً عبر Supabase SQL Editor
-- بجلسة المالك (exec_migration RPC غير موجود، وservice_role لا يطبّق DDL عبر REST).
-- idempotent + آمن: يمكن تشغيله أكثر من مرة بلا ضرر.
-- ============================================================================

-- ── [#5/#15] ذرّية المخزون: استبدال read-then-write بعملية واحدة محصّنة من السباق ──
-- تطبّق فرقاً (+/-) على (warehouse, product) ذرّياً عبر UPSERT مع قفل الصفّ ضمنياً.
-- بعد تطبيق هذا، تُعدَّل warehouseService.js لتستدعي supabase.rpc('wh_apply_stock_delta', …)
-- بدل _currentQty + _setQty (راجع docs/SECURITY-REMEDIATION.md للتفاصيل).
create or replace function public.wh_apply_stock_delta(
  p_warehouse uuid, p_product uuid, p_delta int
) returns int
language plpgsql security definer set search_path = public as $$
declare new_qty int;
begin
  insert into wh_stock (warehouse_id, product_id, quantity, updated_at)
  values (p_warehouse, p_product, p_delta, now())
  on conflict (warehouse_id, product_id)
    do update set quantity = wh_stock.quantity + p_delta, updated_at = now()
  returning quantity into new_qty;
  return new_qty;
end; $$;

-- تحويل ذرّي بين مخزنين (allocate): يقفل صفّ المصدر، يتحقّق من الكفاية، ثم ينقل.
create or replace function public.wh_transfer_stock(
  p_from uuid, p_to uuid, p_product uuid, p_qty int
) returns void
language plpgsql security definer set search_path = public as $$
declare from_qty int;
begin
  if p_qty is null or p_qty <= 0 then raise exception 'qty must be > 0'; end if;
  if p_from = p_to then raise exception 'source and destination are the same'; end if;
  select quantity into from_qty from wh_stock
    where warehouse_id = p_from and product_id = p_product for update;
  from_qty := coalesce(from_qty, 0);
  if from_qty < p_qty then raise exception 'insufficient stock: have %, need %', from_qty, p_qty; end if;
  perform public.wh_apply_stock_delta(p_from, p_product, -p_qty);
  perform public.wh_apply_stock_delta(p_to,   p_product,  p_qty);
end; $$;

grant execute on function public.wh_apply_stock_delta(uuid, uuid, int) to anon, authenticated;
grant execute on function public.wh_transfer_stock(uuid, uuid, uuid, int) to anon, authenticated;

-- ── [#16] ختم تصدير يورتيتشي على الطلب — يمنع شحنة Excel مكرّرة بعد إعادة التحميل ──
alter table public.orders add column if not exists yurtici_exported_at timestamptz;
-- ⚠️ القاعدة الحرجة: أي عمود جديد على جدول بـcolumn-level grants يحتاج GRANT صريحاً.
-- orders ليس لديه column-level grants (على عكس profiles)، لكن نضمن القراءة/الكتابة للعمود:
grant select (yurtici_exported_at), update (yurtici_exported_at) on public.orders to anon, authenticated;
-- بعد تطبيقه: OrdersScreen.exportYurticiExcel يكتب yurtici_exported_at للطلبات المُصدَّرة
-- ويستثني أي طلب له yurtici_exported_at من التصدير التالي (راجع docs/SECURITY-REMEDIATION.md).

-- ── [#24] حارس قاعدة بيانات لرصيد الإجازات (اختياري — يمنع تجاوز الرصيد عند الموافقة) ──
-- (موثّق كاقتراح في docs/SECURITY-REMEDIATION.md — لم يُفعّل هنا لأنه يحتاج سياسة رصيد
--  سنوي صريحة لكل موظف؛ المالك يقرّر القيمة والسلوك.)

-- ── تحقّق بعد التطبيق ────────────────────────────────────────────────────────
-- select proname from pg_proc where proname in ('wh_apply_stock_delta','wh_transfer_stock');
-- select column_name from information_schema.columns
--   where table_name='orders' and column_name='yurtici_exported_at';
