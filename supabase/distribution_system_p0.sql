-- ================================================================
-- DISTRIBUTION SYSTEM — P0 (Foundation)  |  منظومة المندوبين والمسوّقين
-- Apply in Supabase SQL Editor (idempotent — safe to re-run).
-- Run AFTER 0004_master_schema.sql and orders_migration.sql.
--
-- WHAT THIS COVERS (P0 — الأساس فقط، بلا أي منطق عمولات بعد):
--   1. territories            — المناطق المحمية (3 مراحل: survey/pilot/active)
--   2. mlm_groups             — مجموعات المسوّقات (مشرفة + مديرة مشرفات)
--   3. profiles  (+ أعمدة)    — seller_type / rep_level / mlm_rank / recruiter / group / zone / invite_code / wallet_balance
--   4. orders    (+ أعمدة)    — seller_id / zone_id / sale_type / client_id / commission_locked
--   5. rep_level_rules        — قواعد مستويات المندوب (seed: junior/active/pro/agent)
--   6. mlm_rank_rules         — قواعد رتب المسوّقة (seed: bronze..diamond)
--   7. commission_config      — صفّ واحد: نسب override + السقوف + group override
--   8. commission_ledger      — دفتر العمولات الموحّد (مصدر الحقيقة — يُملأ في P1)
--   9. withdrawals            — طلبات سحب المحفظة (تُستخدم في P1)
--  10. RLS helpers            — current_seller_id() / is_supervisor_of()
--  11. RLS policies + indexes
--
-- DESIGN: «توسعة لا استبدال». كل عمود جديد ADD COLUMN IF NOT EXISTS مع
--   GRANT صريح (وإلا ينكسر تسجيل الدخول). seller_type يفترض 'online' لكل
--   الموظفين الحاليين → سلوك الإنتاج الحالي محفوظ حرفياً.
-- ================================================================


-- ════════════════════════════════════════════════════════════════
-- 1. territories — المناطق المحمية
-- (تُنشأ قبل profiles لأن profiles.zone_id يشير إليها)
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.territories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  market      TEXT        CHECK (market IN ('syria','turkey')),
  parent_id   UUID        REFERENCES public.territories(id) ON DELETE SET NULL,
  agent_id    UUID        REFERENCES public.profiles(id)    ON DELETE SET NULL, -- وكيل المنطقة
  status      TEXT        NOT NULL DEFAULT 'survey'
                          CHECK (status IN ('survey','pilot','active','paused')),
  notes       TEXT,
  metadata    JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_territories_updated_at ON public.territories;
CREATE TRIGGER trg_territories_updated_at
  BEFORE UPDATE ON public.territories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX IF NOT EXISTS idx_territories_market ON public.territories (market, status);
CREATE INDEX IF NOT EXISTS idx_territories_agent  ON public.territories (agent_id);


-- ════════════════════════════════════════════════════════════════
-- 2. mlm_groups — مجموعات المسوّقات
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.mlm_groups (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  supervisor_id UUID        REFERENCES public.profiles(id) ON DELETE SET NULL, -- المشرفة
  manager_id    UUID        REFERENCES public.profiles(id) ON DELETE SET NULL, -- مديرة المشرفات
  monthly_target NUMERIC,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  metadata      JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_mlm_groups_updated_at ON public.mlm_groups;
CREATE TRIGGER trg_mlm_groups_updated_at
  BEFORE UPDATE ON public.mlm_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX IF NOT EXISTS idx_mlm_groups_supervisor ON public.mlm_groups (supervisor_id);
CREATE INDEX IF NOT EXISTS idx_mlm_groups_manager    ON public.mlm_groups (manager_id);


-- ════════════════════════════════════════════════════════════════
-- 3. profiles — أعمدة منظومة البائع
--    ⚠️ كل عمود يُقرأ وقت login يحتاج GRANT صريح (درس seller_system_migration.sql)
-- ════════════════════════════════════════════════════════════════
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS seller_type    TEXT DEFAULT 'online'
  CHECK (seller_type IN ('online','field_rep','marketer'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS rep_level      TEXT;   -- junior|active|pro|agent
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mlm_rank       TEXT;   -- bronze|silver|gold|platinum|diamond
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS recruiter_id   UUID REFERENCES public.profiles(id)  ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS group_id       UUID REFERENCES public.mlm_groups(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS zone_id        UUID REFERENCES public.territories(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS invite_code    TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC NOT NULL DEFAULT 0; -- cache من commission_ledger

-- invite_code فريد (جزئياً — يتجاهل NULL)
CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_invite_code
  ON public.profiles (invite_code) WHERE invite_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_seller_type ON public.profiles (seller_type);
CREATE INDEX IF NOT EXISTS idx_profiles_recruiter   ON public.profiles (recruiter_id);
CREATE INDEX IF NOT EXISTS idx_profiles_group       ON public.profiles (group_id);
CREATE INDEX IF NOT EXISTS idx_profiles_zone        ON public.profiles (zone_id);

-- CRITICAL: column-level grants (وإلا ينكسر login عند قراءة البروفايل)
GRANT SELECT (seller_type, rep_level, mlm_rank, recruiter_id, group_id, zone_id, invite_code, wallet_balance)
  ON public.profiles TO anon, authenticated;
GRANT UPDATE (seller_type, rep_level, mlm_rank, recruiter_id, group_id, zone_id, invite_code, wallet_balance)
  ON public.profiles TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 4. orders — أعمدة ربط البائع/المنطقة/نوع البيع
-- ════════════════════════════════════════════════════════════════
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS seller_id         UUID REFERENCES public.profiles(id)    ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS zone_id           UUID REFERENCES public.territories(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS sale_type         TEXT DEFAULT 'retail'
  CHECK (sale_type IN ('retail','wholesale','consignment','mlm','online'));
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS commission_locked BOOLEAN NOT NULL DEFAULT FALSE;
-- client_id يُضاف في P3 عند بناء crm_clients (لتجنّب FK لجدول غير موجود بعد)

CREATE INDEX IF NOT EXISTS idx_orders_seller ON public.orders (seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_zone   ON public.orders (zone_id);

-- هجرة البيانات: ملء seller_id للطلبات القديمة بمطابقة handler_name ↔ employee_name
-- (آمنة — تتجاهل غير المتطابق؛ handler_name يبقى كما هو لمزامنة Sheets)
UPDATE public.orders o
SET seller_id = p.id
FROM public.profiles p
WHERE o.seller_id IS NULL
  AND o.handler_name IS NOT NULL
  AND lower(trim(p.employee_name)) = lower(trim(o.handler_name));


-- ════════════════════════════════════════════════════════════════
-- 5. rep_level_rules — قواعد مستويات المندوب الميداني
--    (مصدر القواعد في DB بدل ثوابت الكود)
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.rep_level_rules (
  key         TEXT        PRIMARY KEY,           -- junior|active|pro|agent
  label       TEXT        NOT NULL,
  min_orders  INTEGER     NOT NULL DEFAULT 0,    -- حد أدنى لطلبات الشهر للترقية
  base_pct    NUMERIC     NOT NULL DEFAULT 0,    -- نسبة العمولة الأساسية
  sort_order  INTEGER     NOT NULL DEFAULT 0
);

INSERT INTO public.rep_level_rules (key, label, min_orders, base_pct, sort_order) VALUES
  ('junior', 'مبتدئ',      0,   8,  1),
  ('active', 'نشيط',       25,  5,  2),
  ('pro',    'محترف',      60,  10, 3),
  ('agent',  'وكيل منطقة', 120, 20, 4)
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label, min_orders = EXCLUDED.min_orders,
      base_pct = EXCLUDED.base_pct, sort_order = EXCLUDED.sort_order;


-- ════════════════════════════════════════════════════════════════
-- 6. mlm_rank_rules — قواعد رتب المسوّقة
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.mlm_rank_rules (
  key           TEXT        PRIMARY KEY,         -- bronze|silver|gold|platinum|diamond
  label         TEXT        NOT NULL,
  min_sales     NUMERIC     NOT NULL DEFAULT 0,  -- حد أدنى لمبيعات الشهر للترقية
  personal_pct  NUMERIC     NOT NULL DEFAULT 0,  -- نسبة العمولة الشخصية
  promotes_to_supervisor BOOLEAN NOT NULL DEFAULT FALSE, -- silver+ تصبح مشرفة
  sort_order    INTEGER     NOT NULL DEFAULT 0
);

INSERT INTO public.mlm_rank_rules (key, label, min_sales, personal_pct, promotes_to_supervisor, sort_order) VALUES
  ('bronze',   'برونزي',  0,    35, FALSE, 1),
  ('silver',   'فضّي',    500,  40, TRUE,  2),
  ('gold',     'ذهبي',    1500, 45, TRUE,  3),
  ('platinum', 'بلاتيني', 3000, 48, TRUE,  4),
  ('diamond',  'ألماس',   6000, 50, TRUE,  5)
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label, min_sales = EXCLUDED.min_sales,
      personal_pct = EXCLUDED.personal_pct,
      promotes_to_supervisor = EXCLUDED.promotes_to_supervisor,
      sort_order = EXCLUDED.sort_order;


-- ════════════════════════════════════════════════════════════════
-- 7. commission_config — إعدادات عامة (صفّ واحد id=1)
--    override حسب العمق [L1,L2,L3] + إشراف المجموعة + السقوف
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.commission_config (
  id                  INTEGER     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  override_pcts       NUMERIC[]   NOT NULL DEFAULT ARRAY[5,3,2],  -- upline depth 1,2,3
  group_override_pct  NUMERIC     NOT NULL DEFAULT 5,             -- عمولة المشرفة على مجموعتها
  comm_cap_pct        NUMERIC     NOT NULL DEFAULT 50,            -- سقف طبيعي
  comm_hardmax_pct    NUMERIC     NOT NULL DEFAULT 55,            -- سقف صارم
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.commission_config (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;


-- ════════════════════════════════════════════════════════════════
-- 8. commission_ledger — دفتر العمولات الموحّد (مصدر الحقيقة)
--    صفّ-لكل-مكوّن: شخصي / override فريق / إشراف مجموعة / بونصات
--    يُملأ في P1 عبر RPC؛ هنا فقط الجدول + RLS.
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.commission_ledger (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_id      UUID        REFERENCES public.orders(id) ON DELETE SET NULL,
  source_seller_id UUID     REFERENCES public.profiles(id) ON DELETE SET NULL, -- صاحب البيع (لعمولات override)
  type          TEXT        NOT NULL
                            CHECK (type IN (
                              'personal','team_override','group_override',
                              'bonus_volume','bonus_new_client','bonus_collection',
                              'bonus_retention','bonus_recruit','penalty','adjustment')),
  basis_amount  NUMERIC     NOT NULL DEFAULT 0,  -- المبلغ الذي حُسبت عليه النسبة
  pct           NUMERIC,                          -- النسبة المطبّقة (NULL للبونص المقطوع)
  amount        NUMERIC     NOT NULL DEFAULT 0,  -- قيمة العمولة (قد تكون سالبة للعقوبة)
  currency      TEXT        NOT NULL DEFAULT 'USD' CHECK (currency IN ('TRY','SYP','USD')),
  status        TEXT        NOT NULL DEFAULT 'earned' CHECK (status IN ('earned','paid','void')),
  month         TEXT        NOT NULL,             -- 'YYYY-MM' لتجميع الكشف الشهري
  note          TEXT,
  metadata      JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_seller_month ON public.commission_ledger (seller_id, month);
CREATE INDEX IF NOT EXISTS idx_ledger_order        ON public.commission_ledger (order_id);
CREATE INDEX IF NOT EXISTS idx_ledger_type         ON public.commission_ledger (type, month);


-- ════════════════════════════════════════════════════════════════
-- 9. withdrawals — طلبات سحب المحفظة (تُستخدم في P1)
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.withdrawals (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount        NUMERIC     NOT NULL CHECK (amount > 0),
  currency      TEXT        NOT NULL DEFAULT 'USD' CHECK (currency IN ('TRY','SYP','USD')),
  status        TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','approved','paid','rejected')),
  note          TEXT,
  decided_by    UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_seller ON public.withdrawals (seller_id, status);


-- ════════════════════════════════════════════════════════════════
-- 10. RLS helpers — على نمط current_role_type()/current_team()
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.current_seller_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT auth.uid()
$$;

-- هل المستخدم الحالي مشرف على target؟
--   (أ) في سلسلة recruiter صعوداً من target  أو
--   (ب) مشرفة/مديرة مجموعة target
-- SECURITY DEFINER → يقرأ profiles مباشرة (يتجاوز RLS، يمنع recursion).
CREATE OR REPLACE FUNCTION public.is_supervisor_of(target uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  WITH RECURSIVE chain AS (
    SELECT id, recruiter_id, 0 AS depth
    FROM public.profiles WHERE id = target
    UNION ALL
    SELECT p.id, p.recruiter_id, c.depth + 1
    FROM public.profiles p
    JOIN chain c ON p.id = c.recruiter_id
    WHERE c.depth < 10
  )
  SELECT
    EXISTS (SELECT 1 FROM chain WHERE id = auth.uid() AND depth > 0)
    OR EXISTS (
      SELECT 1 FROM public.profiles tp
      JOIN public.mlm_groups g ON g.id = tp.group_id
      WHERE tp.id = target
        AND (g.supervisor_id = auth.uid() OR g.manager_id = auth.uid())
    )
$$;


-- ════════════════════════════════════════════════════════════════
-- 11. RLS policies
-- ════════════════════════════════════════════════════════════════

-- ── territories: قراءة للكل المصادَق · كتابة للإدارة (حماية ملكية العميل للشركة)
ALTER TABLE public.territories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "territories_read"  ON public.territories;
DROP POLICY IF EXISTS "territories_write" ON public.territories;
CREATE POLICY "territories_read"  ON public.territories FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "territories_write" ON public.territories FOR ALL
  USING (public.current_role_type() IN ('admin','manager','sales_manager'));

-- ── mlm_groups: أعضاء + مشرفة + مديرة + إدارة
ALTER TABLE public.mlm_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mlm_groups_read"  ON public.mlm_groups;
DROP POLICY IF EXISTS "mlm_groups_write" ON public.mlm_groups;
CREATE POLICY "mlm_groups_read" ON public.mlm_groups FOR SELECT
  USING (
    supervisor_id = auth.uid()
    OR manager_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.group_id = mlm_groups.id)
    OR public.current_role_type() IN ('admin','manager','sales_manager')
  );
CREATE POLICY "mlm_groups_write" ON public.mlm_groups FOR ALL
  USING (manager_id = auth.uid() OR public.current_role_type() IN ('admin','manager','sales_manager'));

-- ── commission_ledger: كل بائع يرى صفوفه · المشرفة ترى فريقها · الإدارة الكل
--    الكتابة محصورة بالإدارة (P1 يكتب عبر RPC SECURITY DEFINER)
ALTER TABLE public.commission_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ledger_select" ON public.commission_ledger;
DROP POLICY IF EXISTS "ledger_write"  ON public.commission_ledger;
CREATE POLICY "ledger_select" ON public.commission_ledger FOR SELECT
  USING (
    seller_id = auth.uid()
    OR public.is_supervisor_of(seller_id)
    OR public.current_role_type() IN ('admin','manager','sales_manager')
  );
CREATE POLICY "ledger_write" ON public.commission_ledger FOR ALL
  USING (public.current_role_type() IN ('admin','manager','sales_manager'))
  WITH CHECK (public.current_role_type() IN ('admin','manager','sales_manager'));

-- ── withdrawals: البائع يطلب لنفسه · المشرفة/الإدارة تراجع وتوافق
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "withdrawals_select" ON public.withdrawals;
DROP POLICY IF EXISTS "withdrawals_insert" ON public.withdrawals;
DROP POLICY IF EXISTS "withdrawals_update" ON public.withdrawals;
CREATE POLICY "withdrawals_select" ON public.withdrawals FOR SELECT
  USING (
    seller_id = auth.uid()
    OR public.is_supervisor_of(seller_id)
    OR public.current_role_type() IN ('admin','manager','sales_manager')
  );
CREATE POLICY "withdrawals_insert" ON public.withdrawals FOR INSERT
  WITH CHECK (seller_id = auth.uid());
CREATE POLICY "withdrawals_update" ON public.withdrawals FOR UPDATE
  USING (public.current_role_type() IN ('admin','manager','sales_manager'));

-- ── rules / config: قراءة للكل · كتابة للإدارة
ALTER TABLE public.rep_level_rules   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mlm_rank_rules    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rep_rules_read"    ON public.rep_level_rules;
DROP POLICY IF EXISTS "rep_rules_write"   ON public.rep_level_rules;
DROP POLICY IF EXISTS "mlm_rules_read"    ON public.mlm_rank_rules;
DROP POLICY IF EXISTS "mlm_rules_write"   ON public.mlm_rank_rules;
DROP POLICY IF EXISTS "comm_config_read"  ON public.commission_config;
DROP POLICY IF EXISTS "comm_config_write" ON public.commission_config;
CREATE POLICY "rep_rules_read"    ON public.rep_level_rules   FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "rep_rules_write"   ON public.rep_level_rules   FOR ALL    USING (public.current_role_type() = 'admin');
CREATE POLICY "mlm_rules_read"    ON public.mlm_rank_rules    FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "mlm_rules_write"   ON public.mlm_rank_rules    FOR ALL    USING (public.current_role_type() = 'admin');
CREATE POLICY "comm_config_read"  ON public.commission_config FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "comm_config_write" ON public.commission_config FOR ALL    USING (public.current_role_type() = 'admin');


-- ════════════════════════════════════════════════════════════════
-- DONE — P0 foundation ready.
-- التحقق السريع:
--   SELECT count(*) FROM public.orders WHERE seller_id IS NULL;  -- الطلبات غير المربوطة
--   SELECT key, base_pct FROM public.rep_level_rules ORDER BY sort_order;
--   SELECT key, personal_pct FROM public.mlm_rank_rules ORDER BY sort_order;
-- ════════════════════════════════════════════════════════════════
