-- =============================================================
-- لوحة الميديا باير v2 (15 تشرين الأول 2026) — طلب حسام
-- إضافي بحت: أعمدة nullable جديدة، صفر UPDATE على بيانات موجودة، لا تغيير RLS.
--
-- campaigns.daily_budget_try      — الميزانية اليومية بالليرة التركية (لحساب تكلفة التأكيد)
-- campaigns.cost_per_message_try  — تكلفة الرسالة (إدخال يدوي من الميديا باير، ₺)
-- campaigns.paused_at             — تاريخ وقف الحملة (يُضبط عند الوقف، يُمسح عند إعادة التفعيل)
-- campaign_ads.added_by           — من أضاف الإعلان (موظفة أو ميديا باير)
-- campaign_ads.deleted_at/by      — حذف ناعم: الموظفة تخفي الإعلان من عندها، ويبقى
--                                   للميديا باير بنتائجه (report_ad_results.ad_id بلا ON DELETE).
-- رجوع: supabase/rollbacks/20261015_media_buyer_board_v2_rollback.sql
-- =============================================================
alter table public.campaigns
  add column if not exists daily_budget_try     numeric check (daily_budget_try is null or daily_budget_try >= 0),
  add column if not exists cost_per_message_try numeric check (cost_per_message_try is null or cost_per_message_try >= 0),
  add column if not exists paused_at            timestamptz;

alter table public.campaign_ads
  add column if not exists added_by   text,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text;
