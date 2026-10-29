-- Backfilled 29 Oct 2026 from production supabase_migrations.schema_migrations (version 20261029061005).
-- Already applied to fghdumrgimoeqsafdhhh on 29 Oct 2026 06:10 UTC; this file only records it in the repo. Text is verbatim.
-- (Superseded in practice by 20261029600000_orders_select_active_staff, which lets every active staff profile read orders.)
CREATE POLICY orders_select_authenticated_role_scope
ON public.orders
FOR SELECT
TO authenticated
USING (
  public.current_role_type() = 'media_buyer'
  OR (
    public.current_role_type() = 'employee'
    AND market = (
      SELECT p.order_market
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
      LIMIT 1
    )
  )
);
