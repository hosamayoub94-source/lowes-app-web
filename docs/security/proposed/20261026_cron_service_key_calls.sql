-- 20261026_cron_service_key_calls.sql  (audit F-07 companion)
-- Four scheduled jobs called Edge Functions with the PUBLIC anon key (lozy-kpi-coach, daily-analytics-snapshot, generate-quiz via
-- run_quiz_generation) or with NO credential at all (shift-report-reminder). Once those functions authenticate their caller
-- (serveGuarded), the jobs must present the service key -- read from Vault exactly like run_retry_failed_syncs / run_pull_star_orders do.
-- Order of rollout (so nothing 401s): 1) this migration  2) redeploy the guarded functions  3) check the next cron ticks.
-- Rollback: 20261026_cron_service_key_calls_rollback.sql
create or replace function public.run_cron_function(p_slug text, p_timeout_ms integer default 60000)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare _svc_key text;
begin
  if p_slug is null or p_slug !~ '^[a-z0-9-]+$' then
    raise exception 'invalid function slug';
  end if;
  select decrypted_secret into _svc_key from vault.decrypted_secrets where name = 'app_service_role_key' limit 1;
  if _svc_key is null or _svc_key = '' then
    raise warning 'run_cron_function(%): vault secret app_service_role_key not found - skipping', p_slug;
    return;
  end if;
  perform net.http_post(
    url     := 'https://fghdumrgimoeqsafdhhh.supabase.co/functions/v1/' || p_slug,
    headers := jsonb_build_object('Authorization', 'Bearer ' || _svc_key, 'Content-Type', 'application/json'),
    body    := '{}'::jsonb,
    timeout_milliseconds := p_timeout_ms
  );
end;
$function$;
revoke all on function public.run_cron_function(text, integer) from public, anon, authenticated;

create or replace function public.run_quiz_generation()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform public.run_cron_function('generate-quiz', 120000);
end;
$function$;

select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'lozy-kpi-coach-daily'),         command := $cmd$select public.run_cron_function('lozy-kpi-coach')$cmd$);
select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'daily-analytics-snapshot'),     command := $cmd$select public.run_cron_function('daily-analytics-snapshot')$cmd$);
select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'shift-report-reminder'),        command := $cmd$select public.run_cron_function('shift-report-reminder')$cmd$);
