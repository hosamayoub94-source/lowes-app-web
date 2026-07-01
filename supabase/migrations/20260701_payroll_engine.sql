-- =============================================================
-- Migration 20260701 — Payroll Engine (additive & safe)
-- Project: fghdumrgimoeqsafdhhh (lowes-production)
--
-- SAFE: only `ADD COLUMN IF NOT EXISTS` — no drops, no renames,
-- no data mutation. Idempotent (re-runnable). Zero rollback risk.
--
-- Goal: enable one-click monthly payroll that computes, per
-- employee in their NATIVE currency:
--   base + allowances + sales commission
--   − absence deduction − approved advances
-- See: docs/payroll-engine-blueprint.md
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. profiles — native salary currency + optional seller alias
-- ─────────────────────────────────────────────────────────────
-- salary_currency defaults to 'USD' so EXISTING numbers keep their
-- current meaning ($). Admin sets each employee's real currency
-- from /admin/users. seller_alias links orders.handler_name to the
-- profile when the seller name in orders differs from employee_name.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS salary_currency text NOT NULL DEFAULT 'USD'
    CHECK (salary_currency IN ('USD','TRY','SYP'));

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS seller_alias text;

-- CRITICAL: profiles uses column-level grants. New columns MUST be
-- granted or login/reads break (per project rule in CLAUDE.md).
GRANT SELECT (salary_currency, seller_alias) ON profiles TO anon;
GRANT SELECT (salary_currency, seller_alias) ON profiles TO authenticated;
GRANT UPDATE (salary_currency, seller_alias) ON profiles TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2. payroll_entries — engine breakdown columns
-- ─────────────────────────────────────────────────────────────
-- payroll_entries uses table-level RLS ( USING(true) WITH CHECK(true) ),
-- so no column-level grants are required here.
-- The `_usd` suffix on money columns is legacy naming; amounts are
-- actually in `currency` (the employee's native currency).

ALTER TABLE payroll_entries
  ADD COLUMN IF NOT EXISTS currency              text    DEFAULT 'USD';
ALTER TABLE payroll_entries
  ADD COLUMN IF NOT EXISTS allowances_usd        numeric DEFAULT 0;  -- housing + transport
ALTER TABLE payroll_entries
  ADD COLUMN IF NOT EXISTS commission_usd        numeric DEFAULT 0;  -- sales commission earned
ALTER TABLE payroll_entries
  ADD COLUMN IF NOT EXISTS commission_pct        numeric DEFAULT 0;  -- % applied
ALTER TABLE payroll_entries
  ADD COLUMN IF NOT EXISTS sales_total_usd       numeric DEFAULT 0;  -- collected sales the month
ALTER TABLE payroll_entries
  ADD COLUMN IF NOT EXISTS sales_orders_count    int     DEFAULT 0;
ALTER TABLE payroll_entries
  ADD COLUMN IF NOT EXISTS absence_deduction_usd numeric DEFAULT 0;  -- from attendance
ALTER TABLE payroll_entries
  ADD COLUMN IF NOT EXISTS source                text    DEFAULT 'manual'; -- 'auto' | 'manual'
ALTER TABLE payroll_entries
  ADD COLUMN IF NOT EXISTS computed_at           timestamptz;

-- ─────────────────────────────────────────────────────────────
-- 3. payroll_runs — currency column already exists in the live
--    _usd schema (migration_v5). Ensure it is present regardless.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'USD';

-- =============================================================
-- DONE — columns added: profiles(2), payroll_entries(9), payroll_runs(1)
-- Grants: profiles.salary_currency, profiles.seller_alias
-- =============================================================
