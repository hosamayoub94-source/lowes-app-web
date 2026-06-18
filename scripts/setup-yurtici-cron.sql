-- ============================================================
-- RUN THIS ONCE in Supabase SQL Editor
-- شغّل مرة واحدة في SQL Editor بعد إضافة Yurtiçi credentials
-- ============================================================

-- Step 1: Set service_role key in DB settings
-- ⚠️ SECURITY: never commit the real key. Paste your CURRENT (rotated) service_role
-- key below only in your local SQL Editor session. The previously committed literal
-- has been removed and MUST be rotated in the Supabase dashboard.
ALTER DATABASE postgres SET "app.settings.service_role_key" = '<PASTE_ROTATED_SERVICE_ROLE_KEY_HERE>';
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
