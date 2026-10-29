-- 20261030_d175_close_write_holes_rollback.sql — restores EXACTLY the state read from production on 2026-10-30 (policies + table privileges).
-- Note: this re-opens the holes described in D-175. Use only if the app breaks and the cause is this migration.

-- order_status_history
drop policy if exists osh_select_staff on public.order_status_history;
drop policy if exists osh_insert_staff on public.order_status_history;
drop policy if exists osh_all on public.order_status_history;
create policy osh_all on public.order_status_history for all to public using (true) with check (true);
grant update, delete, truncate, references, trigger on public.order_status_history to authenticated;

-- exchange_rates
drop policy if exists exrates_all on public.exchange_rates;
create policy exrates_all on public.exchange_rates for all to public using (true) with check (true);
grant update, delete, truncate, references, trigger on public.exchange_rates to authenticated;

-- commission_rules
drop policy if exists commission_rules_insert_managers on public.commission_rules;
drop policy if exists commission_rules_update_managers on public.commission_rules;
drop policy if exists "admin write commission_rules" on public.commission_rules;
create policy "admin write commission_rules" on public.commission_rules for all to public using (true);
grant delete, truncate, references, trigger on public.commission_rules to authenticated;
grant insert, update, delete on public.commission_rules to anon;

-- monthly_commission_adjustments
drop policy if exists mca_insert_admin on public.monthly_commission_adjustments;
drop policy if exists mca_update_admin on public.monthly_commission_adjustments;
drop policy if exists "admin write adjustments" on public.monthly_commission_adjustments;
create policy "admin write adjustments" on public.monthly_commission_adjustments for all to public using (true);
grant delete, truncate, references, trigger on public.monthly_commission_adjustments to authenticated;
grant insert, update, delete on public.monthly_commission_adjustments to anon;
