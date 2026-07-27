-- =============================================================
-- migration_v12_lozy_kpi_coach_cron.sql
-- جدولة يومية تستدعي edge function lozy-kpi-coach صباحاً (9 صباحاً تركيا/سوريا
-- تقريباً ≈ 6 صباحاً UTC). يحتاج تفعيل pg_cron و pg_net.
--
-- ⚠️ قبل التنفيذ: تأكد أن lozy-kpi-coach منشورة (تم بالفعل).
-- ملاحظة: الدالة منشورة بـ--no-verify-jwt، فبوابة Supabase ما بتتحقق من التوكن
-- إطلاقاً — الدالة نفسها بتستخدم service_role key داخلياً (من env الخاص فيها)
-- بغضّ النظر عن التوكن المُرسَل بالطلب. فـanon key (عام أصلاً، موجود بـ.env
-- الواجهة الأمامية) كافي هون للمصادقة على الشبكة، بدون حاجة لكشف service_role.
-- =============================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'lozy-kpi-coach-daily',
  '0 6 * * *', -- كل يوم 6:00 صباحاً UTC
  $$
  select net.http_post(
    url     := 'https://fghdumrgimoeqsafdhhh.supabase.co/functions/v1/lozy-kpi-coach',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnaGR1bXJnaW1vZXFzYWZkaGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTE3OTQsImV4cCI6MjA5MTc2Nzc5NH0.e9DiuJySh4WMp7x5ErVV5LqBFawHUESrlGDRb8N5zPM',
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
