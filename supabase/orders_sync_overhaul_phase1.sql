-- ============================================================
-- Orders Sync Overhaul — Phase 1 DDL
-- مؤشر المزامنة + الحذف الناعم + سجل الحالات (الخط الزمني)
-- يُشغّل عبر Management API (Supabase dashboard token).
-- ============================================================

-- مؤشر حالة المزامنة (يبقى sheet_synced للتوافق الخلفي)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS sync_status    TEXT DEFAULT 'pending'
  CHECK (sync_status IN ('synced','pending','failed'));
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS sync_error     TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS sync_attempts  INT DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- الحذف الناعم
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS deleted_by TEXT;

-- بذرة: الطلبات السورية/التركية المزامَنة سابقاً = synced (البقية pending)
UPDATE public.orders SET sync_status = 'synced'
  WHERE sheet_synced = true AND sync_status IS DISTINCT FROM 'synced';

CREATE INDEX IF NOT EXISTS orders_sync_status_idx ON public.orders(sync_status);
CREATE INDEX IF NOT EXISTS orders_deleted_at_idx  ON public.orders(deleted_at);

-- RPC ذرّي لزيادة عدّاد المحاولات
CREATE OR REPLACE FUNCTION public.increment_order_sync_attempts(p_order_id UUID)
RETURNS void LANGUAGE sql AS $$
  UPDATE public.orders SET sync_attempts = COALESCE(sync_attempts, 0) + 1 WHERE id = p_order_id;
$$;
GRANT EXECUTE ON FUNCTION public.increment_order_sync_attempts(UUID) TO anon, authenticated, service_role;

-- ============================================================
-- خط زمني للحالات (append-only)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.order_status_history (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id    UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  changed_by  TEXT,
  source      TEXT DEFAULT 'app' CHECK (source IN ('app','sheet','yurtici')),
  changed_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS osh_order_idx ON public.order_status_history(order_id, changed_at DESC);

ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS osh_all ON public.order_status_history;
CREATE POLICY osh_all ON public.order_status_history FOR ALL USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON public.order_status_history TO anon, authenticated;
GRANT ALL ON public.order_status_history TO service_role;
