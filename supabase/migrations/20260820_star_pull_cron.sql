-- ============================================================
-- Star Network Pull Cron — كل دقيقتين
-- يسحب طلبات تركيا الجديدة من شبكة النجوم (kesoqnwyydycuyifqfhl).
--
-- ⚠️ الجدولة **معطَّلة** بهذا الملف عمداً (SELECT cron.schedule مُعلَّق بالأسفل).
--    شغّل خطوات التحقق أولاً (HANDOFFlowes.md § جسر شبكة النجوم) ثم فعّلها.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ⚠️⚠️ اكتشاف 20 آب 2026 (تحديث): ALTER DATABASE ... SET app.settings.*
-- يرجع صراحةً خطأ صلاحيات حتى لدور postgres بواجهة SQL Editor على Supabase
-- السحابي — منصّة مُدارة، لا صلاحية GUC على مستوى القاعدة لأي دور غير
-- مضيف الخدمة. هذا هو السبب الجذري الحقيقي وراء سكوت run_retry_failed_syncs
-- منذ 15 آب 2026 (D-050): لم يكن ممكناً ضبط الإعداد بالطريقة الموثَّقة أصلاً
-- — ليس فقط أن أحداً لم يضبطها.
--
-- البديل المدعوم فعلياً هنا: Supabase Vault (supabase_vault v0.3.1، مفعَّل
-- بالمشروع). دورا postgres وservice_role فقط يقرآن vault.decrypted_secrets
-- (authenticated ممنوعة) — يكفي تماماً لدالة SECURITY DEFINER بدور المالك.
--
-- الخطوة الوحيدة المتبقية على المالك، بـSQL Editor (قيمة سرّية، لا تمرّ من
-- أي جلسة آلية ولا تُكتب هنا):
--
--   select vault.create_secret(
--     'قيمة مفتاح الخدمة لمشروع fghdumrgimoeqsafdhhh',
--     'app_service_role_key',
--     'مفتاح داخلي يستدعيه pg_cron لطلب edge functions (pull-star-orders، retry-failed-syncs)'
--   );
--
-- (2) مهلة net.http_post الافتراضية 5000ms وكل استدعاءات pg_net بهذا
--     المشروع تفشل عليها (13/13 آخر ردّ بوظيفة track-yurtici-30min، D-050).
--     نمرّر timeout_milliseconds صراحةً أدناه.

CREATE OR REPLACE FUNCTION public.run_pull_star_orders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _svc_key text;
BEGIN
  SELECT decrypted_secret INTO _svc_key
  FROM vault.decrypted_secrets
  WHERE name = 'app_service_role_key'
  LIMIT 1;

  -- فشل صامت = ما صار مع retry-failed-syncs (خمسة أيام بلا أثر ولا أحد لاحظ).
  -- نكتب السبب بـintegration_state ليظهر بأي فحص بدل RAISE WARNING لا يقرأه أحد.
  IF _svc_key IS NULL OR _svc_key = '' THEN
    UPDATE public.integration_state
       SET last_run_at = now(),
           last_error  = 'سرّ app_service_role_key غير موجود بـVault — لم يُستدعَ الساحب إطلاقاً'
     WHERE id = 'star_network';
    RAISE WARNING 'run_pull_star_orders: vault secret app_service_role_key not found — skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := 'https://fghdumrgimoeqsafdhhh.supabase.co/functions/v1/pull-star-orders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || _svc_key,
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
END;
$$;

-- نفس الإصلاح لـretry-failed-syncs — كان يعتمد على نفس مسار GUC المسدود
-- منصّياً، فكان ميتاً بصمت منذ إنشائه 15 آب 2026 (D-050). يُعاد تعريفها هنا
-- (لا تُنشئ جدولة جديدة — jobname الأصلي retry-failed-syncs-10min يبقى كما هو).
CREATE OR REPLACE FUNCTION public.run_retry_failed_syncs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _svc_key text;
BEGIN
  SELECT decrypted_secret INTO _svc_key
  FROM vault.decrypted_secrets
  WHERE name = 'app_service_role_key'
  LIMIT 1;

  IF _svc_key IS NULL OR _svc_key = '' THEN
    RAISE WARNING 'run_retry_failed_syncs: vault secret app_service_role_key not found — skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := 'https://fghdumrgimoeqsafdhhh.supabase.co/functions/v1/retry-failed-syncs',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || _svc_key,
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
END;
$$;

SELECT cron.unschedule(jobid)
FROM   cron.job
WHERE  jobname = 'pull-star-orders-2min';

-- فعّل هذا السطر بعد ضبط سرّ Vault وسرّ STAR_KEY ونجاح التحقق:
-- SELECT cron.schedule(
--   'pull-star-orders-2min',
--   '*/2 * * * *',
--   'SELECT public.run_pull_star_orders()'
-- );

-- إيقاف طارئ (لو قفز Egress شبكة النجوم فوق ~10 ميغا/يوم):
--   SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'pull-star-orders-2min';
