-- ============================================================
-- Star Network Bridge — جسر طلبات شبكة النجوم (تركيا) → تطبيق لويز
-- ------------------------------------------------------------
-- شبكة النجوم (lowes-classic) مشروع Supabase منفصل: kesoqnwyydycuyifqfhl.
-- طلبات تركيا للمسوّقات كانت تُولَد هناك ولا تصل الإدارة أبداً — لا لوحة
-- تجهيز ولا تتبّع ولا آلية عمل. هذا الجسر ينسخ كل طلب تركي جديد لهنا.
--
-- الاتجاه: A→B فقط (قراءة). لا DDL ولا trigger على قاعدة شبكة النجوم.
-- التنفيذ: edge function `pull-star-orders` بحلقة سحب/مطابقة كل دقيقتين.
--
-- ⚠️ يُشغَّل مرة واحدة بـSupabase SQL Editor (المشروع لا يستعمل db push).
-- ============================================================

-- ── 1) أعمدة المصدر الخارجي على orders ──────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS source             text,        -- 'star_network' | NULL (أصلي)
  ADD COLUMN IF NOT EXISTS external_id        text,        -- orders.id بشبكة النجوم: 'ord_xxx'
  ADD COLUMN IF NOT EXISTS external_stage     text,        -- verifyStage: supervisor|ops|rejected|returned
  ADD COLUMN IF NOT EXISTS external_synced_at timestamptz;

COMMENT ON COLUMN public.orders.source IS
  'مصدر الطلب: NULL = أُنشئ هنا · star_network = نسخة من شبكة النجوم (كل الحقول لقطة زمنية، والمخزون يُخصَم بالمصدر لا هنا)';
COMMENT ON COLUMN public.orders.external_id IS
  'معرّف الطلب بالنظام المصدر — مفتاح التفرد الوحيد المعتمد لمنع التكرار';

-- فهرس **كلّي** لا جزئي: PostgREST/ON CONFLICT لا يستنتج شرط الفهرس الجزئي.
-- external_id فارغ بكل الصفوف القديمة، وNULL لا يتعارض مع NULL — فالفهرس مجاني.
CREATE UNIQUE INDEX IF NOT EXISTS orders_external_id_key ON public.orders (external_id);
CREATE INDEX IF NOT EXISTS orders_source_idx ON public.orders (source) WHERE source IS NOT NULL;

-- ── 2) توسيع مصادر الخط الزمني ──────────────────────────────
-- القيد الحالي ('app','sheet','yurtici') يرفض 'star'، وكل مواقع الاستدعاء
-- تبتلع خطأ الإدراج بصمت (recordStatusChange · sheet-to-app) — فتضيع سجلّات
-- الخط الزمني بلا أي إشارة. لازم يتوسّع قبل تشغيل الساحب.
ALTER TABLE public.order_status_history DROP CONSTRAINT IF EXISTS order_status_history_source_check;
ALTER TABLE public.order_status_history ADD  CONSTRAINT order_status_history_source_check
  CHECK (source IN ('app','sheet','yurtici','star'));

-- ── 3) حالة التكامل (علامة مائية + قفل تشغيل) ────────────────
CREATE TABLE IF NOT EXISTS public.integration_state (
  id              text PRIMARY KEY,
  last_created_at timestamptz,   -- أحدث created_at شوهد بالمصدر (علامة مائية إرشادية فقط)
  last_run_at     timestamptz,
  running_until   timestamptz,   -- إيجار القفل — يمنع تداخل دورتين
  last_error      text,
  stats           jsonb
);

ALTER TABLE public.integration_state ENABLE ROW LEVEL SECURITY;

-- جدول تشغيلي بحت: service_role فقط (الساحب). لا anon/authenticated.
REVOKE ALL ON public.integration_state FROM anon, authenticated;
GRANT  ALL ON public.integration_state TO   service_role;

INSERT INTO public.integration_state (id) VALUES ('star_network')
ON CONFLICT (id) DO NOTHING;

-- ── 4) تحقّق يدوي بعد التشغيل ────────────────────────────────
-- يجب أن يقبل قيد الحالة كلاً من 'waiting' و'pending' (سوريا تستعملهما فعلاً):
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'public.orders'::regclass AND conname LIKE '%status%';
