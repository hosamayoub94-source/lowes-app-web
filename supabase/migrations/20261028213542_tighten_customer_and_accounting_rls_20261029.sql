-- Backfilled 29 Oct 2026 from production supabase_migrations.schema_migrations (version 20261028213542).
-- Already applied to fghdumrgimoeqsafdhhh on 28 Oct 2026 21:35 UTC; this file only records it in the repo. Text is verbatim.
-- ⚠️ Side effect found 29 Oct: dropping acc_entries_all / accounting_channels_write_all / acc_cats_all left only the older
-- admin/manager-only policies, so finance staff outside those two roles (Fadi, hr_manager + view_finance) saw an empty
-- «المصاريف والشحن» screen and could not record entries. Fixed by 20261029700000_restore_finance_staff_accounting_access.
REVOKE ALL PRIVILEGES ON TABLE public.customers FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.customer_contacts FROM anon;
DROP POLICY IF EXISTS customers_select_all ON public.customers;
DROP POLICY IF EXISTS customers_write_all ON public.customers;
DROP POLICY IF EXISTS customer_contacts_select_all ON public.customer_contacts;
DROP POLICY IF EXISTS customer_contacts_write_all ON public.customer_contacts;
DROP POLICY IF EXISTS acc_entries_all ON public.accounting_entries;
DROP POLICY IF EXISTS accounting_channels_write_all ON public.accounting_channels;
DROP POLICY IF EXISTS acc_cats_all ON public.accounting_categories;
