-- Emergency containment for unauthenticated access to orders.
-- Applied to production on 2026-10-29 after read-only ACL/RLS inspection.
-- This intentionally leaves authenticated write policies unchanged until the
-- application role matrix and all order mutation workflows have been verified.

REVOKE ALL PRIVILEGES ON TABLE public.orders FROM anon;

-- These broad policies were redundant for authenticated users because
-- authenticated-specific policies already exist. Removing the SELECT-all
-- policy restores the intended seller/full-access SELECT condition.
DROP POLICY IF EXISTS orders_select_all ON public.orders;
DROP POLICY IF EXISTS orders_write_all ON public.orders;
