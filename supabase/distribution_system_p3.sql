-- ================================================================
-- DISTRIBUTION SYSTEM — P3 (Anti-leakage + Expansion)
-- مناطق · أمانة · تحصيل · مخالفات أسعار
-- Apply in Supabase SQL Editor (idempotent). Run AFTER P0..P1b.
-- يفترض وجود جدول crm_clients (موجود في وحدة field-crm).
-- ================================================================

-- ── 1. crm_clients: أعمدة التوزيع/التحصيل ──
ALTER TABLE public.crm_clients ADD COLUMN IF NOT EXISTS zone_id      UUID REFERENCES public.territories(id) ON DELETE SET NULL;
ALTER TABLE public.crm_clients ADD COLUMN IF NOT EXISTS credit_limit NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.crm_clients ADD COLUMN IF NOT EXISTS suspended    BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.crm_clients ADD COLUMN IF NOT EXISTS last_order_at TIMESTAMPTZ;

-- ── 2. orders.client_id → crm_clients (الآن الجدول موجود) ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='orders' AND column_name='client_id'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN client_id UUID REFERENCES public.crm_clients(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_orders_client ON public.orders (client_id);
  END IF;
END $$;


-- ── 3. consignments — رسم الأمانة ──
CREATE TABLE IF NOT EXISTS public.consignments (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID        REFERENCES public.crm_clients(id) ON DELETE SET NULL,
  client_name   TEXT,
  seller_id     UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  zone_id       UUID        REFERENCES public.territories(id) ON DELETE SET NULL,
  product_code  TEXT,
  product_name  TEXT,
  qty_placed    INTEGER     NOT NULL DEFAULT 0,
  qty_sold      INTEGER     NOT NULL DEFAULT 0,
  unit_price    NUMERIC     NOT NULL DEFAULT 0,
  currency      TEXT        NOT NULL DEFAULT 'USD' CHECK (currency IN ('TRY','SYP','USD')),
  tier          TEXT        NOT NULL DEFAULT 'trial' CHECK (tier IN ('trial','approved')),  -- trial=3 · approved=10
  status        TEXT        NOT NULL DEFAULT 'open'  CHECK (status IN ('open','settled')),
  placed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settle_due    TIMESTAMPTZ,                            -- placed_at + 90d للمعتمد
  settled_at    TIMESTAMPTZ,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_consign_seller ON public.consignments (seller_id, status);
CREATE INDEX IF NOT EXISTS idx_consign_client ON public.consignments (client_id);


-- ── 4. price_violations — مخالفات السعر/المنطقة (Mystery Shopper) ──
CREATE TABLE IF NOT EXISTS public.price_violations (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id      UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  client_id      UUID        REFERENCES public.crm_clients(id) ON DELETE SET NULL,
  client_name    TEXT,
  product        TEXT,
  expected_price NUMERIC,
  found_price    NUMERIC,
  kind           TEXT        NOT NULL DEFAULT 'price' CHECK (kind IN ('price','territory','crm','other')),
  severity       TEXT        NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high')),
  penalty_pct    NUMERIC     DEFAULT 0,
  note           TEXT,
  reported_by    UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_violations_seller ON public.price_violations (seller_id, created_at DESC);


-- ── RLS ──
ALTER TABLE public.consignments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_violations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "consign_select" ON public.consignments;
DROP POLICY IF EXISTS "consign_insert" ON public.consignments;
DROP POLICY IF EXISTS "consign_update" ON public.consignments;
CREATE POLICY "consign_select" ON public.consignments FOR SELECT
  USING (seller_id = auth.uid() OR public.is_supervisor_of(seller_id)
         OR public.current_role_type() IN ('admin','manager','sales_manager'));
CREATE POLICY "consign_insert" ON public.consignments FOR INSERT
  WITH CHECK (seller_id = auth.uid()
              OR public.current_role_type() IN ('admin','manager','sales_manager'));
CREATE POLICY "consign_update" ON public.consignments FOR UPDATE
  USING (seller_id = auth.uid()
         OR public.current_role_type() IN ('admin','manager','sales_manager'));

DROP POLICY IF EXISTS "violations_select" ON public.price_violations;
DROP POLICY IF EXISTS "violations_write"  ON public.price_violations;
CREATE POLICY "violations_select" ON public.price_violations FOR SELECT
  USING (seller_id = auth.uid()
         OR public.current_role_type() IN ('admin','manager','sales_manager'));
CREATE POLICY "violations_write"  ON public.price_violations FOR ALL
  USING (public.current_role_type() IN ('admin','manager','sales_manager'));


-- ── 5. تحصيل: الطلبات المستحقّة (غير/جزئية الدفع) مع أعمار الديون ──
CREATE OR REPLACE FUNCTION public.overdue_orders(p_all boolean DEFAULT false)
RETURNS TABLE (
  order_id uuid, order_no text, customer_name text, seller_id uuid,
  amount numeric, paid numeric, remaining numeric, currency text,
  days_old int, bucket text
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT o.id, o.order_id, o.customer_name, o.seller_id,
         COALESCE(o.amount,0),
         COALESCE(o.paid_amount,0),
         GREATEST(0, COALESCE(o.amount,0) - COALESCE(o.paid_amount,0)) AS remaining,
         o.currency,
         EXTRACT(DAY FROM now() - COALESCE(o.order_date, o.created_at))::int AS days_old,
         CASE
           WHEN now() - COALESCE(o.order_date, o.created_at) <= interval '30 days' THEN '0-30'
           WHEN now() - COALESCE(o.order_date, o.created_at) <= interval '60 days' THEN '31-60'
           WHEN now() - COALESCE(o.order_date, o.created_at) <= interval '90 days' THEN '61-90'
           ELSE '90+'
         END AS bucket
  FROM public.orders o
  WHERE o.status = 'delivered'
    AND COALESCE(o.payment_status,'unpaid') IN ('unpaid','partial')
    AND GREATEST(0, COALESCE(o.amount,0) - COALESCE(o.paid_amount,0)) > 0
    AND (
      p_all AND public.current_role_type() IN ('admin','manager','sales_manager')
      OR o.seller_id = auth.uid()
    )
  ORDER BY days_old DESC;
$$;
GRANT EXECUTE ON FUNCTION public.overdue_orders(boolean) TO authenticated;
