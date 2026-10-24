-- Rollback for 20261023_hosam_exclude_from_payroll.
-- Restores the exact manual zero entry and the profile flag from the backups.
-- Only valid while the backup tables exist; drop them after you are sure.
begin;

do $$
declare n int;
begin
  update public.profiles p
     set payroll_excluded = b.payroll_excluded
    from public.payroll_backup_hosam_profile_20261023 b
   where p.id = b.id;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'profile restore affected % rows (expected 1)', n; end if;

  -- the run must still be a draft, otherwise restoring would contradict its state
  if not exists (select 1 from public.payroll_runs where id = '0d65a1ec-bbbb-46e5-934a-646b4dace00e' and status = 'draft') then
    raise exception 'September run is no longer a draft; restore the entry manually';
  end if;

  insert into public.payroll_entries select * from public.payroll_backup_hosam_entry_20261023
   on conflict (id) do nothing;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'entry restore inserted % rows (expected 1; already present?)', n; end if;
end $$;

commit;
-- Optional cleanup afterwards:
-- drop table public.payroll_backup_hosam_entry_20261023;
-- drop table public.payroll_backup_hosam_profile_20261023;
