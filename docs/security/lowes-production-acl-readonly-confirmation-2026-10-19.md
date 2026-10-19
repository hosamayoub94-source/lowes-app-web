# P0 privilege rehearsal — read-only ACL confirmation (2026-10-19)

## Scope and safety

This is a read-only confirmation of the current catalog state for the two LOWE'S Supabase projects. The queries were wrapped in `BEGIN READ ONLY` / `ROLLBACK`. No privileges were changed, no migration was applied, and no production rows or application behavior were modified. No paid branch was created.

## Direct ACL result

The query expanded each public table's ACL and counted explicit grants of dangerous table privileges to `anon` and `authenticated`.

| Project | Role | Tables with explicit TRUNCATE grant | Tables with explicit TRIGGER grant | Tables with explicit REFERENCES grant |
|---|---|---:|---:|---:|
| `lowes-production` (`kesoqnwyydycuyifqfhl`) | `anon` | 63 | 63 | 63 |
| `lowes-production` (`kesoqnwyydycuyifqfhl`) | `authenticated` | 63 | 63 | 63 |
| `lowes-attendance` (`fghdumrgimoeqsafdhhh`) | `anon` | 166 | 166 | 166 |
| `lowes-attendance` (`fghdumrgimoeqsafdhhh`) | `authenticated` | 174 | 174 | 174 |

These counts are consistent with the earlier effective-privilege findings and confirm that the problem is not merely a dashboard advisor warning: the current catalog ACLs explicitly grant these privileges to the API roles on public tables.

## What this does and does not prove

- It confirms the catalog grants listed above at the time of inspection.
- It does not prove that an unauthenticated HTTP request can successfully execute every operation; PostgREST exposure, RLS, object ownership, role membership, and endpoint behavior must be evaluated separately.
- Revoking only from `anon` and `authenticated` may not be sufficient if privileges are inherited through `PUBLIC`, role membership, or other grant paths. Any rehearsal must check effective privileges after the candidate change, not just whether direct ACL entries disappeared.
- Default privileges must be reviewed separately from existing-object ACLs; changing defaults does not retroactively repair existing tables.
- The candidate SQL remains a proposal for a disposable/local rehearsal only. It is not approved for production and must not be moved into `supabase/migrations/` or executed against production without explicit owner approval and a tested rollback.

## CI status

GitHub Actions `Application CI` for the PR head commit `f3d74d2f0b99f7ff292969b6ecd08c7bc052ef68` completed successfully. This confirms the repository's configured CI checks passed; it is not a live database rehearsal and does not validate production behavior.

## Next safe step

Use the existing local PostgreSQL rehearsal environment (if still available) to apply the candidate SQL to a disposable reconstructed schema, then compare `has_table_privilege` results before/after for `anon` and `authenticated`, including inherited grants and default privileges. If the local environment is not available, keep the SQL as a reviewed proposal and do not create a billable Supabase branch merely to continue.
