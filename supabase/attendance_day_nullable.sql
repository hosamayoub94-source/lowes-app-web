-- ============================================================
-- Attendance safety net: make `day` nullable
--
-- Root cause of employees being unable to check OUT:
-- the checkout INSERT was missing the `day` column, which was
-- NOT NULL → "null value in column 'day' violates not-null".
-- The app now always sends `day`, but dropping NOT NULL ensures
-- no future code path can ever block attendance again.
-- Safe to re-run.
-- ============================================================

ALTER TABLE public.attendance ALTER COLUMN day DROP NOT NULL;
