-- One status transition in its own Postgres session.
-- The caller supplies only a synthetic order ID and target status.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'actor_id', true);
SELECT inventory_rehearsal.wh_transition_order_status(:'order_id'::uuid, :'new_status');
COMMIT;
