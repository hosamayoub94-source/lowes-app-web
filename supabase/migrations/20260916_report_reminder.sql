-- =============================================================
-- 20260916_report_reminder.sql — تذكير تقرير الحملات + صور الإعلانات بالتقرير
-- إضافي فقط: لا يمس أي صف أو سياسة أو دالة قائمة.
--
-- 1) report_ad_results.image_urls — صور يرفعها الموظف لإعلان وصلت منه رسائل.
-- 2) cron كل 5 دقائق يستدعي edge function shift-report-reminder:
--    −30 دقيقة قبل نهاية الوردية → تذكير · +30 بعدها بلا تقرير → تنبيه.
--    ⚠️ استبدل <VITE_SUPABASE_ANON_KEY> بالمفتاح العام من .env.local قبل التشغيل.
--    (نفس نمط migration_v12_lozy_kpi_coach_cron — anon key كافٍ لأن الدالة
--     منشورة --no-verify-jwt وتستخدم service_role داخلياً.)
-- =============================================================

ALTER TABLE public.report_ad_results
  ADD COLUMN IF NOT EXISTS image_urls text[] NOT NULL DEFAULT '{}';

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

select cron.unschedule('shift-report-reminder')
 where exists (select 1 from cron.job where jobname = 'shift-report-reminder');

select cron.schedule(
  'shift-report-reminder',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://fghdumrgimoeqsafdhhh.supabase.co/functions/v1/shift-report-reminder',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <VITE_SUPABASE_ANON_KEY>',
      'Content-Type',  'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- للتحقق:  select jobname, schedule, active from cron.job where jobname = 'shift-report-reminder';
-- للإلغاء: select cron.unschedule('shift-report-reminder');
