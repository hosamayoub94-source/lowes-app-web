-- Restore full customer visibility for privileged profiles.
-- auth_id is NULL across the current profiles table; current_role_type and app identity
-- use profiles.id = auth.uid(), so the old auth_id lookup always returned false.
CREATE OR REPLACE FUNCTION public.auth_is_full_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT COALESCE(
    (SELECT role_type IN ('admin','manager','headsup','sales_manager')
     FROM public.profiles
     WHERE id = auth.uid()
     LIMIT 1),
    false
  )
$function$;
