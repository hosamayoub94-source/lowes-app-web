-- Remove anonymous RPC access to sensitive SECURITY DEFINER functions.
-- Applied to production on 2026-10-29 and verified through effective privilege checks.
-- Authenticated callers retain existing application capabilities pending role-level authorization tests.
REVOKE EXECUTE ON FUNCTION public.wh_apply_stock_delta(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wh_apply_stock_delta(uuid, uuid, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.wh_register_order_return(uuid, uuid, jsonb, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wh_register_order_return(uuid, uuid, jsonb, text, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.wh_sync_order_stock(uuid, uuid, jsonb, boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wh_sync_order_stock(uuid, uuid, jsonb, boolean, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.wh_transfer_stock(uuid, uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wh_transfer_stock(uuid, uuid, uuid, integer) TO authenticated;

-- This SECURITY DEFINER function returns full order rows matched by a phone-like key.
-- Keep it available to signed-in app users, not anonymous clients.
REVOKE EXECUTE ON FUNCTION public.get_customer_orders_by_key(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_customer_orders_by_key(text) TO authenticated;

-- These identity/authorization helper functions are not public endpoints.
REVOKE EXECUTE ON FUNCTION public.auth_blob_user_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_blob_user_id() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.auth_is_full_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_is_full_access() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.current_is_network() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_is_network() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.current_role_type() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_role_type() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.current_seller_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_seller_id() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.current_team() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_team() TO authenticated;
