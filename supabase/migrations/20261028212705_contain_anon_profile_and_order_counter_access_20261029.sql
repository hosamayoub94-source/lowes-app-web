-- Defense in depth: these tables are not intended for anonymous Data API access.
REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.order_code_counters FROM anon;

-- Remove legacy permissive profile policies; explicit access must be granted by current policies.
DROP POLICY IF EXISTS "Allow all" ON public.profiles;
DROP POLICY IF EXISTS "Read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Write profiles" ON public.profiles;
DROP POLICY IF EXISTS allow_all_anon_pr ON public.profiles;
DROP POLICY IF EXISTS allow_all_profiles ON public.profiles;
