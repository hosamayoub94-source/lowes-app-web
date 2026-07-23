-- ================================================================
-- migration_v11_inventory_daily_log.sql
-- جرد إغلاق اليوم — لقطة يومية للمخزون تُحفَظ تلقائياً عند طباعة
-- بوليصات الشحن (src/services/labelPrint.js → saveDailySnapshot).
-- تُطبَّق مرّة واحدة من Supabase SQL Editor.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.inventory_daily_log (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  log_date    date NOT NULL,
  market      text NOT NULL CHECK (market IN ('syria', 'turkey')),
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity    int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (log_date, market, product_id)
);

CREATE INDEX IF NOT EXISTS idx_inv_daily_log_date   ON public.inventory_daily_log (log_date);
CREATE INDEX IF NOT EXISTS idx_inv_daily_log_product ON public.inventory_daily_log (product_id);

ALTER TABLE public.inventory_daily_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'inventory_daily_log' AND policyname = 'inventory_daily_log_all'
  ) THEN
    CREATE POLICY "inventory_daily_log_all" ON public.inventory_daily_log FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- upsert (log_date, market, product_id) يحدّث updated_at تلقائياً.
CREATE OR REPLACE FUNCTION public.set_inventory_daily_log_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inventory_daily_log_updated_at ON public.inventory_daily_log;
CREATE TRIGGER trg_inventory_daily_log_updated_at
  BEFORE UPDATE ON public.inventory_daily_log
  FOR EACH ROW EXECUTE FUNCTION public.set_inventory_daily_log_updated_at();
