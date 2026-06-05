-- ============================================================
-- RUN THIS ONCE in Supabase SQL Editor
-- شغّل مرة واحدة في SQL Editor بعد إضافة Yurtiçi credentials
-- ============================================================

-- Step 1: Set service_role key in DB settings
ALTER DATABASE postgres SET "app.settings.service_role_key" = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnaGR1bXJnaW1vZXFzYWZkaGhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE5MTc5NCwiZXhwIjoyMDkxNzY3Nzk0fQ.xpvq4jRX-SiEy5WpLCOnAbY68k_hXlpPDn6Jp_MhhRs';
SELECT pg_reload_conf();

-- Step 2: Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Step 3: Create helper function
CREATE OR REPLACE FUNCTION public.run_yurtici_tracking()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _k text := current_setting('app.settings.service_role_key', true);
BEGIN
  IF _k IS NULL OR _k = '' THEN RETURN; END IF;
  PERFORM net.http_post(
    url     := 'https://fghdumrgimoeqsafdhhh.supabase.co/functions/v1/track-yurtici',
    headers := jsonb_build_object('Authorization','Bearer '||_k,'Content-Type','application/json'),
    body    := '{}'::jsonb
  );
END;
$$;

-- Step 4: Remove old job if exists
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'track-yurtici-30min';

-- Step 5: Schedule every 30 minutes
SELECT cron.schedule('track-yurtici-30min','*/30 * * * *','SELECT public.run_yurtici_tracking()');

-- Verify
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'track-yurtici-30min';
