-- رجوع لوحة الميديا باير v2 — يحذف الأعمدة الستة (يفقد الميزانيات/تواريخ الوقف/الحذف الناعم المسجّلة بعدها).
-- قبل التشغيل: ارجع الواجهة لنسخة ما قبل v2، وإلا الإعلانات المحذوفة ناعماً ترجع تظهر للموظفات.
alter table public.campaigns
  drop column if exists daily_budget_try,
  drop column if exists cost_per_message_try,
  drop column if exists paused_at;
alter table public.campaign_ads
  drop column if exists added_by,
  drop column if exists deleted_at,
  drop column if exists deleted_by;
