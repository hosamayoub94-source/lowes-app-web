-- One status-transition call in its own Postgres session.
-- Called only by the disposable CI concurrency test.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'actor_id', true);
SELECT inventory_rehearsal.wh_transition_order_status(:'order_id'::uuid, 'preparing');
COMMIT;
