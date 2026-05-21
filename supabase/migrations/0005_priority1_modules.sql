-- =============================================================
-- Migration 0005 — Priority 1 Modules
-- Payroll · Accounting Ledger · Requests Hub · Daily Sales Wizard
-- Project: fghdumrgimoeqsafdhhh (lowes-production)
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. EXCHANGE RATES
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS exchange_rates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_cur    text NOT NULL CHECK (from_cur IN ('USD','TRY','SYP')),
  to_cur      text NOT NULL CHECK (to_cur   IN ('USD','TRY','SYP')),
  rate        numeric(14,6) NOT NULL,
  set_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (from_cur <> to_cur)
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_pair_time
  ON exchange_rates (from_cur, to_cur, created_at DESC);

ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exchange_rates_select_all"
  ON exchange_rates FOR SELECT
  USING (true);

CREATE POLICY "exchange_rates_insert_admin"
  ON exchange_rates FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role_type = 'admin')
  );

-- Seed default rates (approximate, admin updates manually)
INSERT INTO exchange_rates (from_cur, to_cur, rate) VALUES
  ('USD', 'TRY', 32.5),
  ('TRY', 'USD', 0.0308),
  ('USD', 'SYP', 13000),
  ('SYP', 'USD', 0.000077),
  ('TRY', 'SYP', 400),
  ('SYP', 'TRY', 0.0025)
ON CONFLICT DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- 2. PAYROLL — SALARY SETTINGS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS employee_salary_settings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id           uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  base_salary           numeric(12,2) NOT NULL DEFAULT 0,
  currency              text NOT NULL DEFAULT 'TRY'
                          CHECK (currency IN ('TRY','SYP','USD')),
  internet_allowance    numeric(12,2) NOT NULL DEFAULT 0,
  food_allowance        numeric(12,2) NOT NULL DEFAULT 0,
  monthly_target        numeric(12,2) NOT NULL DEFAULT 0,
  target_commission     numeric(12,2) NOT NULL DEFAULT 0,
  sales_commission_pct  numeric(5,2)  NOT NULL DEFAULT 0,
  is_active             boolean       NOT NULL DEFAULT true,
  effective_from        date          NOT NULL DEFAULT CURRENT_DATE,
  notes                 text,
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now(),
  created_by            uuid REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE (employee_id)
);

ALTER TABLE employee_salary_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "salary_settings_select_admin_manager"
  ON employee_salary_settings FOR SELECT
  USING (
    auth.uid() = employee_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role_type IN ('admin','manager','sales_manager')
    )
  );

CREATE POLICY "salary_settings_insert_admin"
  ON employee_salary_settings FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role_type = 'admin')
  );

CREATE POLICY "salary_settings_update_admin"
  ON employee_salary_settings FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role_type = 'admin')
  );

CREATE POLICY "salary_settings_delete_admin"
  ON employee_salary_settings FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role_type = 'admin')
  );


-- ─────────────────────────────────────────────────────────────
-- 3. PAYROLL RUNS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payroll_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_year     int  NOT NULL,
  period_month    int  NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  team_filter     text,
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','finalized','paid')),
  total_usd       numeric(14,2) DEFAULT 0,
  total_try       numeric(14,2) DEFAULT 0,
  total_syp       numeric(14,2) DEFAULT 0,
  notes           text,
  finalized_at    timestamptz,
  finalized_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE (period_year, period_month, team_filter)
);

ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_runs_select_management"
  ON payroll_runs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role_type IN ('admin','manager','sales_manager')
    )
  );

CREATE POLICY "payroll_runs_insert_admin"
  ON payroll_runs FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role_type = 'admin')
  );

CREATE POLICY "payroll_runs_update_admin"
  ON payroll_runs FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role_type = 'admin')
  );


-- ─────────────────────────────────────────────────────────────
-- 4. PAYROLL ENTRIES
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payroll_entries (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                uuid NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id           uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  base_salary           numeric(12,2) NOT NULL DEFAULT 0,
  internet_allowance    numeric(12,2) NOT NULL DEFAULT 0,
  food_allowance        numeric(12,2) NOT NULL DEFAULT 0,
  monthly_target        numeric(12,2) NOT NULL DEFAULT 0,
  target_commission     numeric(12,2) NOT NULL DEFAULT 0,
  sales_commission_pct  numeric(5,2)  NOT NULL DEFAULT 0,
  currency              text NOT NULL DEFAULT 'TRY',
  total_sales           numeric(14,2) NOT NULL DEFAULT 0,
  commission_earned     numeric(12,2) NOT NULL DEFAULT 0,
  gross_salary          numeric(14,2) NOT NULL DEFAULT 0,
  absent_days           int           NOT NULL DEFAULT 0,
  absent_deduction      numeric(12,2) NOT NULL DEFAULT 0,
  advance_deducted      numeric(12,2) NOT NULL DEFAULT 0,
  bonus_amount          numeric(12,2) NOT NULL DEFAULT 0,
  net_salary            numeric(14,2) NOT NULL DEFAULT 0,
  manual_override       boolean       NOT NULL DEFAULT false,
  override_note         text,
  payment_status        text NOT NULL DEFAULT 'pending'
                          CHECK (payment_status IN ('pending','paid','hold')),
  paid_at               timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_payroll_entries_run      ON payroll_entries (run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_entries_employee ON payroll_entries (employee_id);

ALTER TABLE payroll_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_entries_select"
  ON payroll_entries FOR SELECT
  USING (
    auth.uid() = employee_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role_type IN ('admin','manager','sales_manager')
    )
  );

CREATE POLICY "payroll_entries_insert_admin"
  ON payroll_entries FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role_type = 'admin')
  );

CREATE POLICY "payroll_entries_update_admin"
  ON payroll_entries FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role_type = 'admin')
  );


-- ─────────────────────────────────────────────────────────────
-- 5. ACCOUNTING CATEGORIES
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS accounting_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_type  text NOT NULL CHECK (entry_type IN ('income','expense','salary','advance','bonus')),
  name_ar     text NOT NULL,
  name_en     text,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE accounting_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounting_categories_select_all"
  ON accounting_categories FOR SELECT USING (true);

CREATE POLICY "accounting_categories_write_admin"
  ON accounting_categories FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role_type = 'admin')
  );

-- Seed categories
INSERT INTO accounting_categories (entry_type, name_ar, name_en, sort_order) VALUES
  ('income',  'مبيعات أونلاين',       'Online Sales',         1),
  ('income',  'مبيعات مباشرة',        'Direct Sales',         2),
  ('income',  'عمولات',               'Commissions',          3),
  ('income',  'إيرادات أخرى',         'Other Income',         4),
  ('expense', 'إيجار',                'Rent',                 1),
  ('expense', 'رواتب',                'Salaries',             2),
  ('expense', 'إنترنت',               'Internet',             3),
  ('expense', 'مواصلات',              'Transportation',       4),
  ('expense', 'تسويق وإعلانات',       'Marketing & Ads',      5),
  ('expense', 'صيانة',                'Maintenance',          6),
  ('expense', 'مصاريف أخرى',          'Other Expenses',       7),
  ('salary',  'راتب أساسي',           'Base Salary',          1),
  ('salary',  'عمولة مبيعات',         'Sales Commission',     2),
  ('salary',  'بدل إنترنت',           'Internet Allowance',   3),
  ('salary',  'بدل غذاء',             'Food Allowance',       4),
  ('advance', 'سلفة راتب',            'Salary Advance',       1),
  ('advance', 'سلفة طارئة',           'Emergency Advance',    2),
  ('bonus',   'مكافأة أداء',          'Performance Bonus',    1),
  ('bonus',   'مكافأة هدف',           'Target Bonus',         2),
  ('bonus',   'هدية',                 'Gift',                 3)
ON CONFLICT DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- 6. ACCOUNTING ENTRIES
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS accounting_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_type      text NOT NULL CHECK (entry_type IN (
                    'income','expense','salary','advance','bonus'
                  )),
  category        text NOT NULL,
  description     text,
  employee_id     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  amount_usd      numeric(14,2) NOT NULL DEFAULT 0,
  amount_try      numeric(14,2) NOT NULL DEFAULT 0,
  amount_syp      numeric(14,2) NOT NULL DEFAULT 0,
  payment_method  text NOT NULL DEFAULT 'cash'
                    CHECK (payment_method IN ('cash','bank','sham_cash','transfer')),
  reference_no    text,
  entry_date      date NOT NULL DEFAULT CURRENT_DATE,
  advance_status  text CHECK (advance_status IN ('pending','approved','rejected','done')),
  notes           text,
  created_by      uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  approved_by     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acct_type     ON accounting_entries (entry_type);
CREATE INDEX IF NOT EXISTS idx_acct_date     ON accounting_entries (entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_acct_employee ON accounting_entries (employee_id);
CREATE INDEX IF NOT EXISTS idx_acct_advance  ON accounting_entries (advance_status)
  WHERE entry_type = 'advance';

ALTER TABLE accounting_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounting_entries_select"
  ON accounting_entries FOR SELECT
  USING (
    auth.uid() = employee_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role_type IN ('admin','manager')
    )
  );

CREATE POLICY "accounting_entries_insert_admin_manager"
  ON accounting_entries FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role_type IN ('admin','manager')
    )
  );

CREATE POLICY "accounting_entries_update_admin"
  ON accounting_entries FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role_type = 'admin')
  );

CREATE POLICY "accounting_entries_delete_admin"
  ON accounting_entries FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role_type = 'admin')
  );


-- ─────────────────────────────────────────────────────────────
-- 7. LEAVE BALANCES
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS leave_balances (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  year            int  NOT NULL,
  total_days      int  NOT NULL DEFAULT 15,
  used_days       int  NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, year)
);

ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leave_balances_select"
  ON leave_balances FOR SELECT
  USING (
    auth.uid() = employee_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role_type IN ('admin','manager','sales_manager','social_manager')
    )
  );

CREATE POLICY "leave_balances_write_admin"
  ON leave_balances FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role_type = 'admin')
  );


-- ─────────────────────────────────────────────────────────────
-- 8. EMPLOYEE REQUESTS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS employee_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  request_type     text NOT NULL CHECK (request_type IN (
                     'leave','advance','permission','other'
                   )),
  -- Leave fields
  leave_type       text CHECK (leave_type IN ('annual','sick','emergency','unpaid')),
  leave_from       date,
  leave_to         date,
  leave_days       int,
  -- Advance fields
  advance_amount   numeric(12,2),
  advance_currency text CHECK (advance_currency IN ('TRY','SYP','USD')),
  repay_month      int CHECK (repay_month BETWEEN 1 AND 12),
  repay_year       int,
  -- Permission fields
  permission_date  date,
  permission_hours numeric(4,2),
  -- Common
  reason           text NOT NULL,
  attachments      text[],
  -- Status
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','approved','rejected','cancelled')),
  decided_by       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  decided_at       timestamptz,
  decision_note    text,
  -- Meta
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_req_employee ON employee_requests (employee_id);
CREATE INDEX IF NOT EXISTS idx_req_status   ON employee_requests (status);
CREATE INDEX IF NOT EXISTS idx_req_type     ON employee_requests (request_type);
CREATE INDEX IF NOT EXISTS idx_req_created  ON employee_requests (created_at DESC);

ALTER TABLE employee_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "requests_select"
  ON employee_requests FOR SELECT
  USING (
    auth.uid() = employee_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role_type IN ('admin','manager','sales_manager','social_manager')
    )
  );

CREATE POLICY "requests_insert_self"
  ON employee_requests FOR INSERT
  WITH CHECK (auth.uid() = employee_id);

CREATE POLICY "requests_update_admin_manager"
  ON employee_requests FOR UPDATE
  USING (
    -- Admin/Manager can update status (approve/reject)
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role_type IN ('admin','manager')
    )
    OR (
      -- Employee can only cancel their own pending request
      auth.uid() = employee_id
      AND status = 'pending'
    )
  );


-- ─── Trigger: deduct leave balance on approval ───────────────

CREATE OR REPLACE FUNCTION fn_deduct_leave_on_approval()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved'
     AND OLD.status = 'pending'
     AND NEW.request_type = 'leave'
     AND NEW.leave_type = 'annual'
     AND NEW.leave_from IS NOT NULL
     AND NEW.leave_days IS NOT NULL
  THEN
    INSERT INTO leave_balances (employee_id, year, used_days)
    VALUES (
      NEW.employee_id,
      EXTRACT(YEAR FROM NEW.leave_from)::int,
      NEW.leave_days
    )
    ON CONFLICT (employee_id, year)
    DO UPDATE SET
      used_days  = leave_balances.used_days + NEW.leave_days,
      updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_leave_balance ON employee_requests;
CREATE TRIGGER trg_leave_balance
  AFTER UPDATE ON employee_requests
  FOR EACH ROW EXECUTE FUNCTION fn_deduct_leave_on_approval();


-- ─── Trigger: create accounting advance entry on approval ────

CREATE OR REPLACE FUNCTION fn_create_advance_entry_on_approval()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved'
     AND OLD.status = 'pending'
     AND NEW.request_type = 'advance'
     AND NEW.advance_amount IS NOT NULL
  THEN
    INSERT INTO accounting_entries (
      entry_type, category, description,
      employee_id,
      amount_usd, amount_try, amount_syp,
      payment_method, entry_date,
      advance_status,
      created_by
    ) VALUES (
      'advance',
      'سلفة راتب',
      COALESCE(NEW.reason, 'سلفة راتب'),
      NEW.employee_id,
      CASE WHEN NEW.advance_currency = 'USD' THEN NEW.advance_amount ELSE 0 END,
      CASE WHEN NEW.advance_currency = 'TRY' THEN NEW.advance_amount ELSE 0 END,
      CASE WHEN NEW.advance_currency = 'SYP' THEN NEW.advance_amount ELSE 0 END,
      'cash',
      CURRENT_DATE,
      'approved',
      COALESCE(NEW.decided_by, NEW.employee_id)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_advance_accounting ON employee_requests;
CREATE TRIGGER trg_advance_accounting
  AFTER UPDATE ON employee_requests
  FOR EACH ROW EXECUTE FUNCTION fn_create_advance_entry_on_approval();


-- ─────────────────────────────────────────────────────────────
-- 9. SALES CHANNELS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sales_channels (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  channel_type  text NOT NULL CHECK (channel_type IN ('page','whatsapp','other')),
  platform      text CHECK (platform IN ('facebook','instagram','tiktok','whatsapp','other')),
  team          text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES profiles(id) ON DELETE SET NULL
);

ALTER TABLE sales_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_channels_select_all"
  ON sales_channels FOR SELECT USING (true);

CREATE POLICY "sales_channels_write_admin_buyer"
  ON sales_channels FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role_type IN ('admin','media_buyer')
    )
  );


-- ─────────────────────────────────────────────────────────────
-- 10. CAMPAIGNS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS campaigns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  team            text NOT NULL,
  channel_id      uuid REFERENCES sales_channels(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','paused','ended')),
  start_date      date,
  end_date        date,
  budget          numeric(14,2),
  budget_currency text DEFAULT 'USD' CHECK (budget_currency IN ('USD','TRY','SYP')),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status  ON campaigns (status);
CREATE INDEX IF NOT EXISTS idx_campaigns_team    ON campaigns (team);
CREATE INDEX IF NOT EXISTS idx_campaigns_channel ON campaigns (channel_id);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaigns_select_all"
  ON campaigns FOR SELECT USING (true);

CREATE POLICY "campaigns_write_admin_buyer_sales"
  ON campaigns FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role_type IN ('admin','media_buyer','sales_manager')
    )
  );


-- ─────────────────────────────────────────────────────────────
-- 11. CAMPAIGN ADS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS campaign_ads (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name         text NOT NULL,
  image_url    text,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_campaign_ads_campaign ON campaign_ads (campaign_id);

ALTER TABLE campaign_ads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign_ads_select_all"
  ON campaign_ads FOR SELECT USING (true);

CREATE POLICY "campaign_ads_write_admin_buyer"
  ON campaign_ads FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role_type IN ('admin','media_buyer')
    )
  );


-- ─────────────────────────────────────────────────────────────
-- 12. DAILY SALES REPORTS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS daily_sales_reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  report_date      date NOT NULL DEFAULT CURRENT_DATE,
  channel_id       uuid REFERENCES sales_channels(id) ON DELETE SET NULL,
  channel_type     text CHECK (channel_type IN ('page','whatsapp','other')),
  inbox_count      int NOT NULL DEFAULT 0,
  returning_orders int NOT NULL DEFAULT 0,
  other_orders     int NOT NULL DEFAULT 0,
  other_amount_usd numeric(12,2) NOT NULL DEFAULT 0,
  other_amount_try numeric(12,2) NOT NULL DEFAULT 0,
  other_amount_syp numeric(12,2) NOT NULL DEFAULT 0,
  other_source_note text,
  total_orders     int NOT NULL DEFAULT 0,
  total_sales_usd  numeric(14,2) NOT NULL DEFAULT 0,
  total_sales_try  numeric(14,2) NOT NULL DEFAULT 0,
  total_sales_syp  numeric(14,2) NOT NULL DEFAULT 0,
  status           text NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','submitted','confirmed')),
  submitted_at     timestamptz,
  confirmed_by     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  confirmed_at     timestamptz,
  wizard_step      int NOT NULL DEFAULT 1,
  wizard_data      jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, report_date)
);

CREATE INDEX IF NOT EXISTS idx_dsr_employee ON daily_sales_reports (employee_id);
CREATE INDEX IF NOT EXISTS idx_dsr_date     ON daily_sales_reports (report_date DESC);
CREATE INDEX IF NOT EXISTS idx_dsr_status   ON daily_sales_reports (status);

ALTER TABLE daily_sales_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dsr_select"
  ON daily_sales_reports FOR SELECT
  USING (
    auth.uid() = employee_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role_type IN ('admin','manager','sales_manager')
    )
  );

CREATE POLICY "dsr_insert_self"
  ON daily_sales_reports FOR INSERT
  WITH CHECK (auth.uid() = employee_id);

CREATE POLICY "dsr_update"
  ON daily_sales_reports FOR UPDATE
  USING (
    -- Employee/media_buyer update own draft
    (auth.uid() = employee_id AND status = 'draft')
    -- Admin/manager can confirm
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role_type IN ('admin','manager','sales_manager')
    )
  );


-- ─────────────────────────────────────────────────────────────
-- 13. DAILY SALES AD RESULTS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS daily_sales_ad_results (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id    uuid NOT NULL REFERENCES daily_sales_reports(id) ON DELETE CASCADE,
  campaign_id  uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  ad_id        uuid REFERENCES campaign_ads(id) ON DELETE SET NULL,
  order_count  int          NOT NULL DEFAULT 0,
  amount_usd   numeric(12,2) NOT NULL DEFAULT 0,
  amount_try   numeric(12,2) NOT NULL DEFAULT 0,
  amount_syp   numeric(12,2) NOT NULL DEFAULT 0,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dsar_report   ON daily_sales_ad_results (report_id);
CREATE INDEX IF NOT EXISTS idx_dsar_campaign ON daily_sales_ad_results (campaign_id);
CREATE INDEX IF NOT EXISTS idx_dsar_ad       ON daily_sales_ad_results (ad_id);

ALTER TABLE daily_sales_ad_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dsar_select"
  ON daily_sales_ad_results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM daily_sales_reports dsr
      WHERE dsr.id = report_id
        AND (
          dsr.employee_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND role_type IN ('admin','manager','sales_manager')
          )
        )
    )
  );

CREATE POLICY "dsar_write_self"
  ON daily_sales_ad_results FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM daily_sales_reports dsr
      WHERE dsr.id = report_id
        AND dsr.employee_id = auth.uid()
        AND dsr.status = 'draft'
    )
  );


-- ─────────────────────────────────────────────────────────────
-- 14. DAILY REPORT CAMPAIGNS (junction)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS daily_report_campaigns (
  report_id   uuid NOT NULL REFERENCES daily_sales_reports(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  PRIMARY KEY (report_id, campaign_id)
);

ALTER TABLE daily_report_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drc_select"
  ON daily_report_campaigns FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM daily_sales_reports dsr
      WHERE dsr.id = report_id
        AND (
          dsr.employee_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND role_type IN ('admin','manager','sales_manager')
          )
        )
    )
  );

CREATE POLICY "drc_write_self"
  ON daily_report_campaigns FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM daily_sales_reports dsr
      WHERE dsr.id = report_id
        AND dsr.employee_id = auth.uid()
        AND dsr.status = 'draft'
    )
  );


-- ─────────────────────────────────────────────────────────────
-- 15. REALTIME PUBLICATION
-- ─────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE payroll_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE payroll_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE accounting_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE employee_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE daily_sales_reports;
ALTER PUBLICATION supabase_realtime ADD TABLE campaigns;
ALTER PUBLICATION supabase_realtime ADD TABLE sales_channels;


-- ─────────────────────────────────────────────────────────────
-- DONE
-- ─────────────────────────────────────────────────────────────
-- Tables created: 14
-- Triggers created: 2 (leave balance deduction, advance accounting entry)
-- Policies created: ~30
-- Realtime enabled: 7 tables
-- =============================================================
