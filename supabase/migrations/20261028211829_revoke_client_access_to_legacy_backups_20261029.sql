-- Defense-in-depth: legacy backup and archived-log tables must not be client API surfaces.
-- Applied to production on 2026-10-29 and verified through effective privilege checks.
REVOKE ALL PRIVILEGES ON TABLE
  public.accounting_entries_bak_0006,
  public.ad_campaigns_backup_20260607,
  public.handler_name_backup_20260607,
  public.zz_bak_product_economics_20261018,
  public.zz_bak_product_economics_history_20261018,
  public.zz_bak_product_name_map_20261018,
  public.activity_logs_archive
FROM anon, authenticated;
