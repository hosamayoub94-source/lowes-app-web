-- =============================================================
-- Fix: allow 'partial' (مدفوع جزئياً) in orders.payment_status.
-- The app uses unpaid | partial | paid, but the old check constraint
-- rejected 'partial', blocking employees from saving partial-payment orders.
-- Existing data is only unpaid/paid → safe. Run ONCE in Supabase SQL Editor.
-- =============================================================
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IS NULL OR payment_status IN ('unpaid', 'partial', 'paid'));
