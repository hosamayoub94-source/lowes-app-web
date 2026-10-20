-- One order reservation transaction for the mixed order/transfer contention test.
-- Synthetic IDs only; called against the disposable PostgreSQL fixture.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'actor_id', true);
SELECT inventory_rehearsal.wh_transition_order_status(:'order_id'::uuid, 'preparing');
COMMIT;
