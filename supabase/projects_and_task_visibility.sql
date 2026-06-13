-- =============================================================
-- Projects + Task visibility (tabs by team/project + sensitive flag)
-- Idempotent. Paste once into Supabase SQL Editor (owner session).
--
-- Adds:
--   • projects            — registry of projects (e.g. معرض دمشق)
--   • project_members     — who belongs to each project (explicit)
--   • tasks.project_id    — which project a task belongs to (nullable)
--   • tasks.is_sensitive  — admin-only task (Hosam/Amany/Reem)
-- Plus seeds the Damascus Expo project, its members, and tags the
-- 15 expo tasks already created.
--
-- RLS = USING(true) + GRANT anon/authenticated — consistent with the
-- app's mixed PIN/anon auth model (visibility is enforced app-side).
-- =============================================================

-- ── 1) projects ──────────────────────────────────────────────
create table if not exists public.projects (
  id         uuid primary key default gen_random_uuid(),
  key        text unique not null,
  name       text not null,
  icon       text default '📁',
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── 2) project_members ───────────────────────────────────────
create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, profile_id)
);

-- ── 3) tasks columns ─────────────────────────────────────────
alter table public.tasks add column if not exists project_id   uuid references public.projects(id) on delete set null;
alter table public.tasks add column if not exists is_sensitive  boolean not null default false;

-- ── 4) RLS + grants (permissive — app-layer enforces visibility) ──
alter table public.projects        enable row level security;
alter table public.project_members enable row level security;

drop policy if exists projects_all on public.projects;
create policy projects_all on public.projects for all using (true) with check (true);

drop policy if exists project_members_all on public.project_members;
create policy project_members_all on public.project_members for all using (true) with check (true);

grant all on public.projects        to anon, authenticated;
grant all on public.project_members to anon, authenticated;

-- ── 5) seed: Damascus Expo project ───────────────────────────
insert into public.projects (key, name, icon)
values ('damascus_expo', 'معرض دمشق', '🎪')
on conflict (key) do nothing;

-- ── 6) seed: members (Hosam, Amany, Reem, Diana, Natalia, Alice) ──
insert into public.project_members (project_id, profile_id)
select p.id, m.profile_id
from public.projects p
cross join (values
  ('a68d72e4-8c88-4554-a8c4-70f5ac813a20'::uuid),  -- hosam ayoub (admin)
  ('cc450ee7-b2ea-40c4-9d4c-3e9fcc016123'::uuid),  -- Amany alkshki (admin)
  ('c7f2b17b-9e41-421a-bb0b-eadbaee5afde'::uuid),  -- Reem alkshki (admin)
  ('8a08f722-c383-468a-a786-b958dbc9ff7e'::uuid),  -- Diana Hasan (employee → سوبرفايزر)
  ('32ddbd3f-3512-4ee7-a00f-086b8f74c6e5'::uuid),  -- Natalie alhaddad (sales_manager)
  ('ecd0af3c-fe63-4e99-b3b5-513d78d601c6'::uuid)   -- alic kanaan (social_manager)
) as m(profile_id)
where p.key = 'damascus_expo'
on conflict do nothing;

-- ── 7) tag the 15 expo tasks → damascus_expo project ─────────
update public.tasks t
set project_id = (select id from public.projects where key = 'damascus_expo')
where t.created_by = 'a68d72e4-8c88-4554-a8c4-70f5ac813a20'
  and t.project_id is null
  and t.title in (
    'إرسال ملفات ريم على واتساب + قراءتها',
    'تفعيل مسارات الشراكة الثلاثة + غرفة البيانات',
    'اعتماد قائمة الدائرة الذهبية الـ40',
    'قيادة الصيد الكبير B2B (وكلاء/موزّعون)',
    'إرسال ملفات ديانا على واتساب + قراءتها',
    'إعداد محتوى مؤتمر الصيادلة (الاستشارة العلمية)',
    'تجهيز «خزانة البرهان» وبار التجربة علمياً',
    'دور السوبرفايزر التشغيلي أيام المعرض',
    'إرسال ملفات ناتاليا على واتساب + قراءتها',
    'إتقان رحلة الزائر الـ7 محطات',
    'إتقان آلية تسجيل الليدز',
    'إرسال ملفات أليس على واتساب + قراءتها',
    'مكالمة أرمادا — الطلبات الأربعة (مع أماني)',
    'تشغيل حملة التسويق قبل المعرض (25 يوماً)',
    'تنسيق التواصل الإعلامي والعلاقات للـ74 جهة'
  );

-- ── 8) index for visibility filtering ────────────────────────
create index if not exists idx_tasks_project_id on public.tasks(project_id);
create index if not exists idx_project_members_profile on public.project_members(profile_id);
