-- =============================================================
-- migration_v12_lozy_kpi_coach_cron.sql
-- جدولة يومية تستدعي edge function lozy-kpi-coach صباحاً (9 صباحاً تركيا/سوريا
-- تقريباً ≈ 6 صباحاً UTC). يحتاج تفعيل pg_cron و pg_net (خارج صلاحيات anon/service
-- key العادية — لازم يُنفَّذ من مالك المشروع بـSQL Editor).
--
-- ⚠️ قبل التنفيذ: تأكد أن ai-assistant/lozy-kpi-coach منشورة (تم بالفعل).
-- =============================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- استبدل SERVICE_ROLE_KEY_HERE بمفتاح service_role الحقيقي (Project Settings → API)
-- — لا تستخدم anon key هون لأن الدالة تحتاج صلاحية قراءة/كتابة كاملة على الجداول.
select cron.schedule(
  'lozy-kpi-coach-daily',
  '0 6 * * *', -- كل يوم 6:00 صباحاً UTC
  $$
  select net.http_post(
    url     := 'https://fghdumrgimoeqsafdhhh.supabase.co/functions/v1/lozy-kpi-coach',
    headers := jsonb_build_object(
      'Authorization', 'Bearer SERVICE_ROLE_KEY_HERE',
      'Content-Type',  'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- للتحقق أن الجدولة نجحت:
-- select * from cron.job where jobname = 'lozy-kpi-coach-daily';

-- لإلغاء الجدولة لاحقاً لو احتاج الأمر:
-- select cron.unschedule('lozy-kpi-coach-daily');
