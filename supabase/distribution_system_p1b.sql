-- ================================================================
-- DISTRIBUTION SYSTEM — P1b (Gamification + Manager report)
-- Apply in Supabase SQL Editor (idempotent). Run AFTER P1.
--   1. badges + seller_badges  — الأوسمة (8 آلية)
--   2. challenges + challenge_progress — تحدّيات شهرية
--   3. RPC manager_commission_report — كشف عمولات كل البائعين (للإدارة)
--   4. RPC commission_leaderboard — لوحة شرف (أعلى عمولة بالشهر)
-- ================================================================

-- ── 1. badges ──
CREATE TABLE IF NOT EXISTS public.badges (
  code        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  icon        TEXT,
  description TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

INSERT INTO public.badges (code, name, icon, description, sort_order) VALUES
  ('first_sale',   'أول بيعة',        '🎉', 'أول طلب مُسلّم',                 1),
  ('ten_orders',   '١٠ طلبات',        '📦', '١٠ طلبات مُسلّمة',               2),
  ('fifty_orders', '٥٠ طلب',          '🚚', '٥٠ طلباً مُسلّماً',             3),
  ('recruiter',    'قائدة فريق',      '🌸', 'ضمّت أول مسوّقة لفريقها',        4),
  ('team_of_five', 'فريق ٥',          '👭', 'فريق من ٥ عضوات فأكثر',          5),
  ('top_month',    'نجمة الشهر',      '🏆', 'الأعلى عمولة هذا الشهر',         6),
  ('silver_rank',  'رتبة فضّية',      '🥈', 'وصلت الرتبة الفضّية',           7),
  ('diamond_rank', 'رتبة ألماس',      '💎', 'وصلت الرتبة الألماسية',         8)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, icon = EXCLUDED.icon,
      description = EXCLUDED.description, sort_order = EXCLUDED.sort_order;

CREATE TABLE IF NOT EXISTS public.seller_badges (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  badge_code TEXT NOT NULL REFERENCES public.badges(code) ON DELETE CASCADE,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (seller_id, badge_code)
);
CREATE INDEX IF NOT EXISTS idx_seller_badges_seller ON public.seller_badges (seller_id);


-- ── 2. challenges ──
CREATE TABLE IF NOT EXISTS public.challenges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  metric      TEXT NOT NULL CHECK (metric IN ('sales','orders','recruits')),
  target      NUMERIC NOT NULL,
  reward      TEXT,
  audience    TEXT NOT NULL DEFAULT 'all',  -- all | field_rep | marketer
  month       TEXT NOT NULL,                -- 'YYYY-MM'
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_challenges_month ON public.challenges (month, is_active);

CREATE TABLE IF NOT EXISTS public.challenge_progress (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  seller_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  value        NUMERIC NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  UNIQUE (challenge_id, seller_id)
);


-- ── RLS ──
ALTER TABLE public.badges             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_badges      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenges         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "badges_read"          ON public.badges;
DROP POLICY IF EXISTS "seller_badges_read"   ON public.seller_badges;
DROP POLICY IF EXISTS "seller_badges_write"  ON public.seller_badges;
DROP POLICY IF EXISTS "challenges_read"      ON public.challenges;
DROP POLICY IF EXISTS "challenges_write"     ON public.challenges;
DROP POLICY IF EXISTS "chprog_read"          ON public.challenge_progress;
DROP POLICY IF EXISTS "chprog_write"         ON public.challenge_progress;

CREATE POLICY "badges_read"        ON public.badges        FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "seller_badges_read" ON public.seller_badges FOR SELECT
  USING (seller_id = auth.uid() OR public.is_supervisor_of(seller_id) OR public.current_role_type() IN ('admin','manager','sales_manager'));
CREATE POLICY "seller_badges_write" ON public.seller_badges FOR ALL
  USING (public.current_role_type() IN ('admin','manager','sales_manager'));
CREATE POLICY "challenges_read"  ON public.challenges FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "challenges_write" ON public.challenges FOR ALL
  USING (public.current_role_type() IN ('admin','manager','sales_manager'));
CREATE POLICY "chprog_read"  ON public.challenge_progress FOR SELECT
  USING (seller_id = auth.uid() OR public.is_supervisor_of(seller_id) OR public.current_role_type() IN ('admin','manager','sales_manager'));
CREATE POLICY "chprog_write" ON public.challenge_progress FOR ALL
  USING (public.current_role_type() IN ('admin','manager','sales_manager'));


-- ── 3. كشف عمولات كل البائعين لشهر (للإدارة فقط) ──
CREATE OR REPLACE FUNCTION public.manager_commission_report(p_month text DEFAULT NULL)
RETURNS TABLE (seller_id uuid, employee_name text, seller_type text, currency text, total numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  IF public.current_role_type() NOT IN ('admin','manager','sales_manager') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT l.seller_id, p.employee_name, p.seller_type, l.currency, sum(l.amount) AS total
    FROM public.commission_ledger l
    JOIN public.profiles p ON p.id = l.seller_id
    WHERE l.month = COALESCE(p_month, to_char(now(), 'YYYY-MM'))
    GROUP BY l.seller_id, p.employee_name, p.seller_type, l.currency
    ORDER BY total DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.manager_commission_report(text) TO authenticated;


-- ── 4b. تقدّم البائع: ترقية آلية + منح أوسمة (يُستدعى من محرّك العمولات) ──
-- لا يكتب في commission_ledger (الترقية + الأوسمة + إشعار فقط).
CREATE OR REPLACE FUNCTION public.apply_seller_progress(p_seller uuid, p_month text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v            public.profiles%ROWTYPE;
  v_orders_mo  int;
  v_sales_mo   numeric;
  v_deliv_all  int;
  v_recruits   int;
  v_newlevel   text;
  v_newrank    text;
BEGIN
  SELECT * INTO v FROM public.profiles WHERE id = p_seller;
  IF NOT FOUND THEN RETURN; END IF;

  -- إحصاءات
  SELECT count(*) INTO v_orders_mo FROM public.orders
   WHERE seller_id = p_seller AND status = 'delivered'
     AND to_char(COALESCE(order_date, created_at), 'YYYY-MM') = p_month;
  SELECT COALESCE(sum(amount),0) INTO v_sales_mo FROM public.orders
   WHERE seller_id = p_seller AND status = 'delivered'
     AND to_char(COALESCE(order_date, created_at), 'YYYY-MM') = p_month;
  SELECT count(*) INTO v_deliv_all FROM public.orders
   WHERE seller_id = p_seller AND status = 'delivered';
  SELECT count(*) INTO v_recruits FROM public.profiles WHERE recruiter_id = p_seller;

  -- ترقية/نزول المندوب الميداني حسب طلبات الشهر
  IF v.seller_type = 'field_rep' THEN
    SELECT key INTO v_newlevel FROM public.rep_level_rules
      WHERE min_orders <= v_orders_mo ORDER BY min_orders DESC LIMIT 1;
    IF v_newlevel IS NOT NULL AND v_newlevel IS DISTINCT FROM v.rep_level THEN
      UPDATE public.profiles SET rep_level = v_newlevel WHERE id = p_seller;
      INSERT INTO public.notifications (user_id, type, title, message, severity, dedup_key)
      VALUES (p_seller, 'system_alert', 'تغيّر مستواك',
              'مستواك الجديد: ' || (SELECT label FROM public.rep_level_rules WHERE key = v_newlevel),
              'info', 'lvl-' || p_seller || '-' || p_month || '-' || v_newlevel)
      ON CONFLICT (dedup_key) DO NOTHING;
    END IF;
  END IF;

  -- ترقية رتبة المسوّقة حسب مبيعات الشهر
  IF v.seller_type = 'marketer' THEN
    SELECT key INTO v_newrank FROM public.mlm_rank_rules
      WHERE min_sales <= v_sales_mo ORDER BY min_sales DESC LIMIT 1;
    IF v_newrank IS NOT NULL AND v_newrank IS DISTINCT FROM v.mlm_rank THEN
      UPDATE public.profiles SET mlm_rank = v_newrank WHERE id = p_seller;
      INSERT INTO public.notifications (user_id, type, title, message, severity, dedup_key)
      VALUES (p_seller, 'system_alert', 'ترقية رتبة! 🎉',
              'رتبتك الجديدة: ' || (SELECT label FROM public.mlm_rank_rules WHERE key = v_newrank),
              'info', 'rank-' || p_seller || '-' || p_month || '-' || v_newrank)
      ON CONFLICT (dedup_key) DO NOTHING;
    END IF;
  END IF;

  -- منح الأوسمة الآلية (idempotent عبر UNIQUE(seller_id,badge_code))
  IF v_deliv_all >= 1  THEN INSERT INTO public.seller_badges(seller_id,badge_code) VALUES (p_seller,'first_sale')   ON CONFLICT DO NOTHING; END IF;
  IF v_deliv_all >= 10 THEN INSERT INTO public.seller_badges(seller_id,badge_code) VALUES (p_seller,'ten_orders')   ON CONFLICT DO NOTHING; END IF;
  IF v_deliv_all >= 50 THEN INSERT INTO public.seller_badges(seller_id,badge_code) VALUES (p_seller,'fifty_orders') ON CONFLICT DO NOTHING; END IF;
  IF v_recruits  >= 1  THEN INSERT INTO public.seller_badges(seller_id,badge_code) VALUES (p_seller,'recruiter')    ON CONFLICT DO NOTHING; END IF;
  IF v_recruits  >= 5  THEN INSERT INTO public.seller_badges(seller_id,badge_code) VALUES (p_seller,'team_of_five')  ON CONFLICT DO NOTHING; END IF;
  IF v.mlm_rank IN ('silver','gold','platinum','diamond') THEN INSERT INTO public.seller_badges(seller_id,badge_code) VALUES (p_seller,'silver_rank')  ON CONFLICT DO NOTHING; END IF;
  IF v.mlm_rank = 'diamond' THEN INSERT INTO public.seller_badges(seller_id,badge_code) VALUES (p_seller,'diamond_rank') ON CONFLICT DO NOTHING; END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.apply_seller_progress(uuid, text) TO authenticated;


-- ── 4. لوحة شرف (أعلى عمولة بالشهر) — متاحة للجميع ──
CREATE OR REPLACE FUNCTION public.commission_leaderboard(p_month text DEFAULT NULL, p_limit int DEFAULT 10)
RETURNS TABLE (seller_id uuid, employee_name text, total_usd numeric)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  -- يوحّد العملات تقريبياً إلى USD للترتيب فقط (TRY/33 · SYP/14000).
  SELECT l.seller_id, p.employee_name,
         sum(CASE l.currency WHEN 'USD' THEN l.amount
                             WHEN 'TRY' THEN l.amount/33.0
                             WHEN 'SYP' THEN l.amount/14000.0
                             ELSE l.amount END) AS total_usd
  FROM public.commission_ledger l
  JOIN public.profiles p ON p.id = l.seller_id
  WHERE l.month = COALESCE(p_month, to_char(now(), 'YYYY-MM'))
  GROUP BY l.seller_id, p.employee_name
  ORDER BY total_usd DESC
  LIMIT COALESCE(p_limit, 10);
$$;
GRANT EXECUTE ON FUNCTION public.commission_leaderboard(text, int) TO authenticated;
