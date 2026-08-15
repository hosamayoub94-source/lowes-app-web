-- ============================================================
-- Re-enable retry-failed-syncs-10min after fixing the edge function
-- (now excludes delivered/settled/returned + only orders updated in the
-- last 72h — لا تلمس الطلبات القديمة يلي التسليمات ناقلاها يدوياً).
-- ============================================================

SELECT cron.unschedule(jobid)
FROM   cron.job
WHERE  jobname = 'retry-failed-syncs-10min';

SELECT cron.schedule(
  'retry-failed-syncs-10min',
  '*/10 * * * *',
  'SELECT public.run_retry_failed_syncs()'
);
