-- =============================================================
-- migration_v10 — جدول طلبات انضمام شبكة النجوم
-- العملاء يصلون للصفحة عبر QR البوليصة → https://app.lowesprofesyonel.com/join
-- شغّل هذا السكريبت من: Supabase Dashboard → SQL Editor
-- =============================================================

CREATE TABLE IF NOT EXISTS mlm_join_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  phone        TEXT NOT NULL,
  referred_by  TEXT,                         -- اسم أو رمز المُحيل (اختياري)
  status       TEXT NOT NULL DEFAULT 'pending', -- pending | contacted | approved | rejected
  notes        TEXT,                         -- ملاحظات الفريق عند المتابعة
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ
);

-- RLS: anon يكتب فقط (لا قراءة) · authenticated يقرأ ويحدّث
ALTER TABLE mlm_join_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert_join_requests"
  ON mlm_join_requests FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "auth_read_join_requests"
  ON mlm_join_requests FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "auth_update_join_requests"
  ON mlm_join_requests FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

-- فهرس للبحث السريع بالحالة والتاريخ
CREATE INDEX IF NOT EXISTS idx_mlm_join_requests_status ON mlm_join_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mlm_join_requests_phone  ON mlm_join_requests (phone);

-- trigger لتحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_mlm_join_updated ON mlm_join_requests;
CREATE TRIGGER trg_mlm_join_updated
  BEFORE UPDATE ON mlm_join_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
