-- =============================================================
-- migration_v13_analytics_snapshot_cron.sql
-- جدولة يومية تستدعي daily-analytics-snapshot آخر الليوم (23:55 UTC تقريباً
-- ≈ 2:55 صباحاً تركيا/سوريا اليوم التالي — بعد ما يخلص اليوم فعلياً) لحفظ
-- KPI snapshot يومي بجدول analytics_snapshots (كان فاضياً بالكامل، وهو
-- سبب "لا توجد بيانات" برسم اتجاه الحضور بلوحة القيادة التنفيذية).
--
-- ⚠️ نُفِّذت هذه الجدولة فعلياً بجلسة 28 يوليو 2026 عبر
-- `supabase db query --linked` (بدون الحاجة لهالملف يدوياً) — محفوظ هون
-- للمرجعية والتوثيق فقط، ولإعادة التنفيذ لو انحذفت الجدولة بالغلط.
-- =============================================================

select cron.schedule(
  'daily-analytics-snapshot',
  '55 23 * * *', -- كل يوم 23:55 UTC
  $$
  select net.http_post(
    url     := 'https://fghdumrgimoeqsafdhhh.supabase.co/functions/v1/daily-analytics-snapshot',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnaGR1bXJnaW1vZXFzYWZkaGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTE3OTQsImV4cCI6MjA5MTc2Nzc5NH0.e9DiuJySh4WMp7x5ErVV5LqBFawHUESrlGDRb8N5zPM',
      'Content-Type',  'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- للتحقق:
-- select * from cron.job where jobname = 'daily-analytics-snapshot';
-- لإلغاء الجدولة:
-- select cron.unschedule('daily-analytics-snapshot');
