-- Backfilled 29 Oct 2026 from production supabase_migrations.schema_migrations (version 20261028214016).
-- Already applied to fghdumrgimoeqsafdhhh on 28 Oct 2026 21:40 UTC; this file only records it in the repo. Text is verbatim.
GRANT SELECT ON TABLE public.profiles TO authenticated;
DROP POLICY IF EXISTS profiles_select_own_for_login ON public.profiles;
CREATE POLICY profiles_select_own_for_login ON public.profiles FOR SELECT TO authenticated USING (id = (SELECT auth.uid()));
