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
-- الإصلاح: فهرس فريد جزئي على dedup_key (يسمح بـNULL المتعدّد، يفرض
--   التفرّد فقط على القيم غير الفارغة) — يطابق ما تفترضه ON CONFLICT.
-- آمن وidempotent. لا يؤثّر على صفوف الإشعارات بـdedup_key=NULL.
-- =============================================================

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedup_key_uidx
  ON public.notifications (dedup_key)
  WHERE dedup_key IS NOT NULL;

-- بعد التطبيق: أعِد تست العمولة (scripts كانت تُرجع $10 لـfield_rep pro على $100).
