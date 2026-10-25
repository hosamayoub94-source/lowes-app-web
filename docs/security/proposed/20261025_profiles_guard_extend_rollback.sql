-- Rollback of 20261025_profiles_guard_extend.sql: restores the exact function body captured from production on 2026-10-25.
create or replace function public.guard_profiles_write()
 returns trigger
 language plpgsql
as $function$
declare
  _row record;
begin
  if current_user not in ('anon', 'authenticated') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if coalesce(public.current_role_type(), '') = 'admin' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    if public._profile_name_exists(new.employee_name) then
      return new;
    end if;
    raise exception 'profiles: only an admin can create profiles' using errcode = '42501';
  elsif tg_op = 'DELETE' then
    raise exception 'profiles: only an admin can delete profiles' using errcode = '42501';
  end if;

  if (new.role_type, new.extra_permissions, new.denied_permissions, new.is_active, new.auth_id,
      new.employment_status, new.resigned_at, new.resign_reason, new.pin, new.password, new.qr_token,
      new.base_salary_usd, new.housing_allowance_usd, new.transport_allowance_usd, new.salary_currency,
      new.commission_pct, new.payroll_commission_exempt, new.order_role, new.order_market,
      new.manager_scope, new.wallet_balance)
     is distinct from
     (old.role_type, old.extra_permissions, old.denied_permissions, old.is_active, old.auth_id,
      old.employment_status, old.resigned_at, old.resign_reason, old.pin, old.password, old.qr_token,
      old.base_salary_usd, old.housing_allowance_usd, old.transport_allowance_usd, old.salary_currency,
      old.commission_pct, old.payroll_commission_exempt, old.order_role, old.order_market,
      old.manager_scope, old.wallet_balance) then
    raise exception 'profiles: only an admin can change role, permissions, status, credentials, pay or wallet' using errcode = '42501';
  end if;
  return new;
end $function$;
