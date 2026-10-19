# Default-privilege confirmation — read-only (2026-10-19)

## Scope

Read-only catalog inspection only. Queries ran inside `BEGIN READ ONLY` / `ROLLBACK`. No database changes were made.

## Confirmed default ACLs

In both `lowes-production` and `lowes-attendance`, the `public` schema has default ACL entries for both grantors `postgres` and `supabase_admin` that grant privileges to `anon` and `authenticated` for future objects:

- **Tables (`r`)**: SELECT, INSERT, UPDATE, DELETE, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE.
- **Sequences (`S`)**: SELECT, UPDATE, USAGE.
- **Functions (`f`)**: EXECUTE.

The ACL inspection found these grants for each grantor/role/object-type/privilege combination in both projects. This confirms that correcting existing table ACLs alone would leave a path for newly created objects to inherit broad permissions unless the default privileges are also addressed.

## Remediation implications

1. The rehearsal must inspect and change default privileges for every relevant grantor that can create objects; the currently confirmed grantors are `postgres` and `supabase_admin`.
2. Do not blindly revoke all default privileges. Determine which roles need which permissions for normal Supabase operation, and preserve application functionality through explicit least-privilege grants.
3. Validate both catalog ACLs and effective privilege checks after the rehearsal. In particular, test a newly created disposable table/sequence/function to ensure the defaults no longer reintroduce dangerous grants.
4. The existing candidate SQL is still a proposal, not a production migration. No production changes, deployments, or paid Supabase branches are authorized by this document.
