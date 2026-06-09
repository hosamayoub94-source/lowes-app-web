-- ============================================================
-- Generate-Quiz Cron Job — daily at 05:00 UTC (08:00 Turkey)
-- يولّد أسئلة التدريب الذكية يومياً بدون انتظار أول زائر للشاشة.
-- طُبّق حيّاً عبر run-campaigns-migration runner في 2026-06-10.
-- ============================================================

-- 1. Enable required extensions (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Helper: calls the generate-quiz edge function.
--    يستخدم anon key (عمومي بطبيعته — نفسه بالواجهة) لأن الدالة idempotent
--    ولا تكشف بيانات حساسة، وبهذا لا نعتمد على app.settings.service_role_key.
CREATE OR REPLACE FUNCTION public.run_quiz_generation()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://fghdumrgimoeqsafdhhh.supabase.co/functions/v1/generate-quiz',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnaGR1bXJnaW1vZXFzYWZkaGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTE3OTQsImV4cCI6MjA5MTc2Nzc5NH0.e9DiuJySh4WMp7x5ErVV5LqBFawHUESrlGDRb8N5zPM',
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
END;
$$;

-- 3. Remove old job if it exists, then schedule daily 05:00 UTC
SELECT cron.unschedule(jobid)
FROM   cron.job
WHERE  jobname = 'generate-quiz-daily';

SELECT cron.schedule(
  'generate-quiz-daily',
  '0 5 * * *',
  'SELECT public.run_quiz_generation()'
);
