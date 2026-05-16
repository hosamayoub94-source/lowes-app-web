-- =============================================================
-- Enterprise CRM & Sales Pipeline — Supabase Schema
-- Run in Supabase SQL Editor or via migration tool.
-- Depends on: update_updated_at() function (from files module)
-- =============================================================

-- ── 1. Customers ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name    TEXT        NOT NULL,
  industry        TEXT,
  website         TEXT,
  country         TEXT        DEFAULT 'SA',
  city            TEXT,
  address         TEXT,

  assigned_to     UUID        REFERENCES auth.users(id),
  owner_id        UUID        REFERENCES auth.users(id),

  status          TEXT        NOT NULL DEFAULT 'active',
    -- active | inactive | archived

  tags            TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  total_deals     INTEGER     NOT NULL DEFAULT 0,
  total_revenue   NUMERIC     NOT NULL DEFAULT 0,
  last_contact_at TIMESTAMPTZ,
  notes           TEXT,

  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. Customer Contacts ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_contacts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  full_name    TEXT        NOT NULL,
  role         TEXT,
  email        TEXT,
  phone        TEXT,
  whatsapp     TEXT,
  is_primary   BOOLEAN     NOT NULL DEFAULT FALSE,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. Leads ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT        NOT NULL,
  company_name    TEXT,
  contact_name    TEXT,
  contact_email   TEXT,
  contact_phone   TEXT,
  contact_whatsapp TEXT,

  source          TEXT        NOT NULL DEFAULT 'manual',
    -- manual | website | referral | social | cold_call | ad | event | partner

  status          TEXT        NOT NULL DEFAULT 'new',
    -- new | contacted | qualified | unqualified | converted | lost

  estimated_value NUMERIC     NOT NULL DEFAULT 0,
  currency        TEXT        NOT NULL DEFAULT 'SAR',

  assigned_to     UUID        REFERENCES auth.users(id),
  owner_id        UUID        REFERENCES auth.users(id),

  tags            TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  notes           TEXT,
  score           INTEGER     NOT NULL DEFAULT 0,  -- 0-100 AI/manual score

  converted_at    TIMESTAMPTZ,
  customer_id     UUID        REFERENCES customers(id),

  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. Pipelines ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pipelines (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  description  TEXT,
  is_default   BOOLEAN     NOT NULL DEFAULT FALSE,
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  owner_id     UUID        REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 5. Pipeline Stages ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID        NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL,
  color       TEXT        NOT NULL DEFAULT '#64748b',
  position    INTEGER     NOT NULL DEFAULT 0,
  is_won      BOOLEAN     NOT NULL DEFAULT FALSE,
  is_lost     BOOLEAN     NOT NULL DEFAULT FALSE,
  probability INTEGER     NOT NULL DEFAULT 0,  -- 0-100 close probability %
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (pipeline_id, slug)
);

-- ── 6. Deals ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deals (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title                TEXT        NOT NULL,
  pipeline_id          UUID        NOT NULL REFERENCES pipelines(id),
  stage_id             UUID        NOT NULL REFERENCES pipeline_stages(id),

  customer_id          UUID        REFERENCES customers(id),
  lead_id              UUID        REFERENCES leads(id),

  assigned_to          UUID        REFERENCES auth.users(id),
  owner_id             UUID        REFERENCES auth.users(id),

  value                NUMERIC     NOT NULL DEFAULT 0,
  currency             TEXT        NOT NULL DEFAULT 'SAR',
  status               TEXT        NOT NULL DEFAULT 'open',
    -- open | won | lost | archived

  expected_close_date  DATE,
  closed_at            TIMESTAMPTZ,
  probability          INTEGER     NOT NULL DEFAULT 0,

  notes                TEXT,
  tags                 TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],

  metadata             JSONB       NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 7. Deal Activities ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deal_activities (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id           UUID        REFERENCES deals(id) ON DELETE CASCADE,
  customer_id       UUID        REFERENCES customers(id),
  lead_id           UUID        REFERENCES leads(id),
  user_id           UUID        NOT NULL REFERENCES auth.users(id),

  activity_type     TEXT        NOT NULL DEFAULT 'note',
    -- call | email | meeting | note | stage_change | file |
    -- task | whatsapp | sms | visit

  title             TEXT        NOT NULL,
  description       TEXT,
  outcome           TEXT,
  duration_minutes  INTEGER,

  scheduled_at      TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,

  metadata          JSONB       NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 8. Followups ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS followups (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id        UUID        REFERENCES deals(id) ON DELETE CASCADE,
  customer_id    UUID        REFERENCES customers(id),
  lead_id        UUID        REFERENCES leads(id),

  assigned_to    UUID        NOT NULL REFERENCES auth.users(id),
  owner_id       UUID        REFERENCES auth.users(id),

  title          TEXT        NOT NULL,
  description    TEXT,

  followup_type  TEXT        NOT NULL DEFAULT 'call',
    -- call | email | meeting | whatsapp | sms | task | visit

  status         TEXT        NOT NULL DEFAULT 'pending',
    -- pending | done | overdue | cancelled

  due_at         TIMESTAMPTZ NOT NULL,
  completed_at   TIMESTAMPTZ,
  reminder_sent  BOOLEAN     NOT NULL DEFAULT FALSE,

  metadata       JSONB       NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 9. Sales Notes ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales_notes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id     UUID        REFERENCES deals(id) ON DELETE CASCADE,
  customer_id UUID        REFERENCES customers(id),
  lead_id     UUID        REFERENCES leads(id),
  user_id     UUID        NOT NULL REFERENCES auth.users(id),
  content     TEXT        NOT NULL,
  is_pinned   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_customers_assigned   ON customers (assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_customers_status     ON customers (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_name_fts   ON customers USING gin(to_tsvector('simple', company_name));
CREATE INDEX IF NOT EXISTS idx_contacts_customer    ON customer_contacts (customer_id);
CREATE INDEX IF NOT EXISTS idx_leads_assigned       ON leads (assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_leads_status         ON leads (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_source         ON leads (source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deals_pipeline       ON deals (pipeline_id, stage_id);
CREATE INDEX IF NOT EXISTS idx_deals_assigned       ON deals (assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_deals_customer       ON deals (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_deal      ON deal_activities (deal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_customer  ON deal_activities (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_followups_assigned   ON followups (assigned_to, due_at, status);
CREATE INDEX IF NOT EXISTS idx_followups_due        ON followups (due_at, status);
CREATE INDEX IF NOT EXISTS idx_notes_deal           ON sales_notes (deal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_customer       ON sales_notes (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stages_pipeline      ON pipeline_stages (pipeline_id, position);

-- ── Triggers ───────────────────────────────────────────────────
CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_customer_contacts_updated_at
  BEFORE UPDATE ON customer_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_pipelines_updated_at
  BEFORE UPDATE ON pipelines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_deals_updated_at
  BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_followups_updated_at
  BEFORE UPDATE ON followups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_sales_notes_updated_at
  BEFORE UPDATE ON sales_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── RLS ────────────────────────────────────────────────────────
ALTER TABLE customers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_contacts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads              ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipelines          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals              ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_activities    ENABLE ROW LEVEL SECURITY;
ALTER TABLE followups          ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_notes        ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read + write their own rows or assigned rows
CREATE POLICY "customers_select"  ON customers        FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "customers_write"   ON customers        FOR ALL    USING (auth.uid() = owner_id OR auth.uid() = assigned_to OR auth.uid() IS NOT NULL);

CREATE POLICY "contacts_all"      ON customer_contacts FOR ALL   USING (auth.uid() IS NOT NULL);
CREATE POLICY "leads_select"      ON leads             FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "leads_write"       ON leads             FOR ALL    USING (auth.uid() IS NOT NULL);
CREATE POLICY "pipelines_select"  ON pipelines         FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "pipelines_write"   ON pipelines         FOR ALL    USING (auth.uid() IS NOT NULL);
CREATE POLICY "stages_select"     ON pipeline_stages   FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "stages_write"      ON pipeline_stages   FOR ALL    USING (auth.uid() IS NOT NULL);
CREATE POLICY "deals_select"      ON deals             FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "deals_write"       ON deals             FOR ALL    USING (auth.uid() IS NOT NULL);
CREATE POLICY "activities_all"    ON deal_activities   FOR ALL    USING (auth.uid() IS NOT NULL);
CREATE POLICY "followups_select"  ON followups         FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "followups_write"   ON followups         FOR ALL    USING (auth.uid() IS NOT NULL);
CREATE POLICY "notes_all"         ON sales_notes       FOR ALL    USING (auth.uid() IS NOT NULL);

-- ── Seed: default pipeline + stages ───────────────────────────
-- Run once after schema deploy to set up the default pipeline.
-- Replace 'INSERT OR IGNORE' semantics with IF NOT EXISTS check.
DO $$
DECLARE
  _pipeline_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pipelines WHERE is_default = TRUE) THEN
    INSERT INTO pipelines (name, description, is_default, is_active)
    VALUES ('خط المبيعات الرئيسي', 'خط المبيعات الافتراضي للشركة', TRUE, TRUE)
    RETURNING id INTO _pipeline_id;

    INSERT INTO pipeline_stages (pipeline_id, name, slug, color, position, probability) VALUES
      (_pipeline_id, 'عميل محتمل جديد',   'new_lead',          '#64748b', 0,  10),
      (_pipeline_id, 'تم التواصل',         'contacted',         '#3b82f6', 1,  25),
      (_pipeline_id, 'قيد التفاوض',        'negotiation',       '#f59e0b', 2,  60),
      (_pipeline_id, 'بانتظار الدفع',      'awaiting_payment',  '#a855f7', 3,  85),
      (_pipeline_id, 'صفقة مكتملة',        'won',               '#22c55e', 4, 100),
      (_pipeline_id, 'خسارة',             'lost',               '#ef4444', 5,   0);

    -- Mark won/lost stages
    UPDATE pipeline_stages SET is_won  = TRUE WHERE pipeline_id = _pipeline_id AND slug = 'won';
    UPDATE pipeline_stages SET is_lost = TRUE WHERE pipeline_id = _pipeline_id AND slug = 'lost';
  END IF;
END $$;
