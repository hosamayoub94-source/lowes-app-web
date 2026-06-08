-- =============================================================
-- distribution_system_p7_fix.sql
-- إصلاح حرِج: محرّك العمولة لا يحتسب أي عمولة على prod.
--
-- السبب (مكتشَف بتست حيّ end-to-end):
--   post_order_commission() → apply_seller_progress() ينفّذ:
--     INSERT INTO notifications (...) ... ON CONFLICT (dedup_key) DO NOTHING;
--   لكن عمود notifications.dedup_key بلا قيد UNIQUE على prod →
--   خطأ «there is no unique or exclusion constraint matching the ON CONFLICT»
--   → الـRPC كلها تتراجع → لا تُكتب عمولة ولا يُحدَّث wallet_balance.
--
-- الإصلاح: فهرس فريد **كامل** (غير جزئي) على dedup_key.
--   • ON CONFLICT (dedup_key) بلا WHERE لا يستخدم فهرساً جزئياً كـarbiter،
--     لذلك يجب أن يكون الفهرس كاملاً.
--   • NULLs المتعدّدة مسموحة تلقائياً في فهرس UNIQUE (كل NULL مميّز) —
--     فلا يكسر إشعارات dedup_key=NULL.
-- آمن وidempotent (تأكّدنا: لا تكرارات غير فارغة على prod).
-- =============================================================

-- أزل أي فهرس جزئي سابق بنفس الاسم (من نسخة أولى خاطئة)
DROP INDEX IF EXISTS public.notifications_dedup_key_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedup_key_uidx
  ON public.notifications (dedup_key);

-- بعد التطبيق: أعِد تست العمولة (scripts كانت تُرجع $10 لـfield_rep pro على $100).
