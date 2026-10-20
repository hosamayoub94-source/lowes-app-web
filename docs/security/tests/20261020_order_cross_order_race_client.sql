-- One distinct order transition per session for cross-order stock race testing.
-- Only synthetic UUIDs and the disposable PostgreSQL fixture are used.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'actor_id', true);
SELECT inventory_rehearsal.wh_transition_order_status(:'order_id'::uuid, 'preparing');
COMMIT;
