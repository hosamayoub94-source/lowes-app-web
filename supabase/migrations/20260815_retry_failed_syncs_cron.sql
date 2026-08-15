-- ============================================================
-- Retry Failed Syncs Cron Job — every 10 minutes
-- يعيد محاولة مزامنة الطلبات sync_status='failed' تلقائياً بدون تدخل المالك.
-- Run ONCE in Supabase SQL Editor after deploying retry-failed-syncs function.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.run_retry_failed_syncs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _svc_key text := current_setting('app.settings.service_role_key', true);
BEGIN
  IF _svc_key IS NULL OR _svc_key = '' THEN
    RAISE WARNING 'run_retry_failed_syncs: app.settings.service_role_key not set — skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := 'https://fghdumrgimoeqsafdhhh.supabase.co/functions/v1/retry-failed-syncs',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || _svc_key,
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
END;
$$;

SELECT cron.unschedule(jobid)
FROM   cron.job
WHERE  jobname = 'retry-failed-syncs-10min';

SELECT cron.schedule(
  'retry-failed-syncs-10min',
  '*/10 * * * *',
  'SELECT public.run_retry_failed_syncs()'
);
