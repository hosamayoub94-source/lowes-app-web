-- These helper functions expose internal authorization/payroll state and are not public endpoints.
-- Applied to production on 2026-10-29 and verified by effective privilege checks.
REVOKE EXECUTE ON FUNCTION public.is_supervisor_of(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_supervisor_of(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.payroll_can_finalize() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payroll_can_finalize() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.payroll_has_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payroll_has_access() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.payroll_run_is_legacy(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payroll_run_is_legacy(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.payroll_run_is_locked_new(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payroll_run_is_locked_new(uuid) TO authenticated;
