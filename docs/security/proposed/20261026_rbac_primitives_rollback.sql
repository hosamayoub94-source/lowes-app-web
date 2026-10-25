-- Rollback of 20261026_rbac_primitives.sql (only valid if no policy/function depends on the primitives any more)
drop function if exists public.app_require_permission(text[]);
drop function if exists public.app_require_authenticated();
drop function if exists public.app_has_permission(text);
drop function if exists public.app_role();
drop function if exists public.app_profile_ok();
drop function if exists public.app_caller_kind();
drop table if exists public.app_role_permissions;
