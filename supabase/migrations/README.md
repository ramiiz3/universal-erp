# Supabase database migrations

These are append-only, versioned schema migrations. Do not rewrite or remove a
migration that has already been applied; prepare a new migration for a schema
correction.

| Migration | Purpose |
| --- | --- |
| `20261103000100_company_auth_foundation.sql` | Profiles, companies, branches, memberships, roles and permissions, invitations, platform-admin separation, company creation and invitation RPCs, private company-file storage, grants, and RLS. |
| `20261104000100_company_inventory_foundation.sql` | Company-scoped products, warehouses, inventory lots and movements; company/branch constraints, permission-checked stock mutations, indexes, grants, and RLS. |
| `20261104000200_fix_company_storage_rls.sql` | Corrects company-file Storage policies to validate company-scoped object paths against the actual Storage object name. |

Use the local Native Runtime for development and security tests. See
[`../../docs/supabase-development.md`](../../docs/supabase-development.md) for
startup, migration, and verification commands. Do not apply these migrations to
production as part of local development.
