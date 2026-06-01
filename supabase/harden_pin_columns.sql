-- ============================================================
-- Harden sensitive columns: stop anon/authenticated from reading
-- profiles.pin, profiles.password, employees.pin.
--
-- Postgres column privileges: a table-level SELECT grant lets the
-- role read EVERY column, so we must REVOKE table SELECT and re-GRANT
-- only the non-sensitive columns. RLS (USING(true)) is unaffected.
--
-- PIN verification now happens server-side in the verify-pin Edge
-- Function (service_role), which still can read the column.
-- ============================================================

-- ── profiles ────────────────────────────────────────────────
REVOKE SELECT ON public.profiles FROM anon, authenticated;

GRANT SELECT (
  id, employee_name, team, email, address, shift,
  work_hours_start, work_hours_end, off_days, join_date,
  pre_approved_leaves, admin_notes, created_at, updated_at,
  job_title, page_name, work_phone, work_email, bio, avatar_url,
  birthday, weekly_dayoff, manager_scope, total_points, role_type,
  is_active, sales_provisional_try, sales_provisional_syp,
  sales_provisional_usd, sales_confirmed_try, sales_confirmed_syp,
  sales_confirmed_usd, department, late_tolerance_minutes,
  shift_start, shift_end, can_work_remote, face_photo_url, qr_token,
  two_fa_enabled, last_login_at, last_ip, hire_date, shift_type,
  work_start, work_end, rest_day, phone, personal_email,
  work_location, skills, order_role, order_market
) ON public.profiles TO anon, authenticated;

-- ── employees ───────────────────────────────────────────────
REVOKE SELECT ON public.employees FROM anon, authenticated;

GRANT SELECT (
  id, name, team, is_active, created_at
) ON public.employees TO anon, authenticated;

-- ⚠️⚠️ IMPORTANT — because profiles now uses COLUMN-level grants,
-- ANY new column you ADD to profiles is NOT readable by anon until you
-- GRANT it explicitly. Forgetting this breaks the login name-picker and
-- anything that selects the new column. Template:
--   GRANT SELECT (my_new_col) ON public.profiles TO anon, authenticated;
--
-- Columns granted after the initial hardening:
GRANT SELECT (
  extra_permissions, denied_permissions,
  base_salary_usd, housing_allowance_usd, transport_allowance_usd
) ON public.profiles TO anon, authenticated;
