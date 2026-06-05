-- ============================================================
-- Track Yurtiçi Cron Job — every 30 minutes
-- Run ONCE in Supabase SQL Editor after deploying track-yurtici function
-- ============================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Helper function: calls track-yurtici edge function
--    Reads service_role key from app.settings (set via Dashboard → Database → Settings)
CREATE OR REPLACE FUNCTION public.run_yurtici_tracking()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _svc_key text := current_setting('app.settings.service_role_key', true);
BEGIN
  IF _svc_key IS NULL OR _svc_key = '' THEN
    RAISE WARNING 'run_yurtici_tracking: app.settings.service_role_key not set — skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := 'https://fghdumrgimoeqsafdhhh.supabase.co/functions/v1/track-yurtici',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || _svc_key,
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
END;
$$;

-- 3. Remove old cron job if it exists
SELECT cron.unschedule(jobid)
FROM   cron.job
WHERE  jobname = 'track-yurtici-30min';

-- 4. Schedule every 30 minutes
SELECT cron.schedule(
  'track-yurtici-30min',
  '*/30 * * * *',
  'SELECT public.run_yurtici_tracking()'
);

-- 5. One-time: set the service_role key in database settings
--    Replace <YOUR_SERVICE_ROLE_KEY> with the actual key from Supabase Dashboard → Settings → API
-- ALTER DATABASE postgres SET app.settings.service_role_key = '<YOUR_SERVICE_ROLE_KEY>';
-- SELECT pg_reload_conf();
