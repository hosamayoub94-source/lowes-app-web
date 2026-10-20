-- One concurrent stock increment per independent psql process.
-- TEST FIXTURE ONLY; synthetic UUIDs and disposable PostgreSQL only.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'actor_id', true);
SELECT inventory_rehearsal.wh_apply_stock_delta(
  :'warehouse_id'::uuid,
  :'product_id'::uuid,
  1
);
COMMIT;
