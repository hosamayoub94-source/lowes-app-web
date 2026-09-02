-- =============================================================
-- Migration 20260830 — Payroll Returns/Target Engine (additive & safe)
-- Project: fghdumrgimoeqsafdhhh (lowes-production)
--
-- SAFE: only `ADD COLUMN IF NOT EXISTS` — no drops, no renames,
-- no data mutation, no unique/foreign-key changes. Idempotent.
--
-- Adds:
--   1) payroll_runs  — frozen month snapshot (target/rate/pct used
--      for THIS run only, so changing values next month never
--      re-prices a past, already-computed run) + confirmation gate.
--   2) payroll_entries — per-employee returns/target breakdown so
--      the payslip can show exactly how the number was reached
--      (team, average, allowed/excess returns, return deduction,
--      adjusted increase, shortfall deduction, salary source used).
-- See: docs/payroll-engine-blueprint.md, D-047-style additive rule.
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. payroll_runs — month setup snapshot + confirmation gate
-- ─────────────────────────────────────────────────────────────
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS target_syria_usd        numeric DEFAULT 1000;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS target_turkey_try       numeric DEFAULT 65000;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS above_target_pct_syria  numeric DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS above_target_pct_turkey numeric DEFAULT 5;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS rate_usd_try            numeric;   -- 1 USD = ? TRY
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS rate_usd_syp            numeric;   -- 1 USD = ? SYP
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS month_setup_confirmed_at timestamptz;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS month_setup_confirmed_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS archived_at             timestamptz; -- set once deliveries/returns archived on approval
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS finalized_by            uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS finalized_at            timestamptz;

-- ─────────────────────────────────────────────────────────────
-- 2. payroll_entries — returns/target breakdown + audit fields
-- ─────────────────────────────────────────────────────────────
ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS team                   text;    -- 'syria' | 'turkey' at compute time
ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS salary_source          text;    -- 'employee_salary_settings' | 'profiles' | null (missing)
ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS target_currency        text;    -- 'USD' | 'TRY' — the team's own calc currency
ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS target_local           numeric DEFAULT 0;
ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS sales_local            numeric DEFAULT 0;  -- team-currency sales total (pre-USD)
ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS sales_avg_local        numeric DEFAULT 0;  -- sales_local / orders count
ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS returns_count          int     DEFAULT 0;
ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS returns_allowed        int     DEFAULT 0;  -- CEIL(orders * 3%)
ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS returns_excess         int     DEFAULT 0;
ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS return_deduction_local numeric DEFAULT 0;
ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS increase_local         numeric DEFAULT 0;  -- sales_local - target_local (before return deduction)
ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS adjusted_increase_local numeric DEFAULT 0; -- MAX(0, increase - return_deduction)
ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS shortfall_local        numeric DEFAULT 0;  -- target_local - sales_local, when under target
ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS shortfall_deduction_usd numeric DEFAULT 0; -- shortfall_local * 10%, converted to USD

-- =============================================================
-- DONE — payroll_runs(9), payroll_entries(13). No drops, no renames.
-- =============================================================
