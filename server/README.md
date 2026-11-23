# Universal ERP platform API

This is the first server-side foundation for the commercial multi-company ERP.
It is intentionally additive: the current React pharmacy application continues
to run in local-only mode until its data layer is migrated and verified.

## Architecture

- **Identity:** Supabase Auth handles sign-in, password recovery and user identity.
- **API:** this Node.js service verifies each access token against the Supabase
  Auth user endpoint and derives the user ID from the verified response.
- **Business data:** a separate PostgreSQL database stores companies,
  memberships, invitations, company records and audit events.
- **Tenant isolation:** every data request resolves the user's active company
  membership on the server. PostgreSQL row-level security independently checks
  company and role context.
- **Concurrency:** records carry a revision. Updates must send the revision
  they read; stale writes return HTTP 409 instead of silently overwriting work.
- **Backups:** backup.sh encrypts a custom-format database dump with age and
  streams it to an off-host rclone destination.

Supabase Auth is not the business-data database in this arrangement. The API
only uses the Supabase project URL and publishable key to validate access
tokens; it never uses a service-role or secret key in the browser.

## Database roles — important

Use two separate PostgreSQL connection strings:

1. MIGRATIONS_DATABASE_URL: an administrator/owner connection used only to
   apply SQL migrations.
2. DATABASE_URL: a dedicated login role called erp_app for the running API. It
   must **not** own these tables, be a superuser, or have BYPASSRLS.

Create the API role with your PostgreSQL administrator before running the
migration. Set a strong, unique password and use the provider's private-network
connection URL whenever possible:

    create role erp_app login password 'REPLACE_WITH_A_LONG_RANDOM_PASSWORD'
      nosuperuser nocreatedb nocreaterole noinherit nobypassrls;

Grant it connect to the ERP database, then configure DATABASE_URL with that
role. The migration grants only the table and function permissions the API
needs. Do not use the administrator URL as the API's DATABASE_URL.

Run migrations:

    npm run db:migrate

Migrations are tracked in erp_private.schema_migrations. They are safe to run
repeatedly. Back up an existing database before applying schema changes.

## Environment

Copy .env.example to .env for local work and set:

- SUPABASE_URL: project URL used by Supabase Auth.
- SUPABASE_PUBLISHABLE_KEY: publishable key (not a secret/service key).
- DATABASE_URL: PostgreSQL URL for the non-owner erp_app role.
- MIGRATIONS_DATABASE_URL: administrator URL, used only by the migration
  command and never by the API process.
- FRONTEND_ORIGIN: comma-separated exact frontend origins. Do not use * for
  production.
- PGSSLMODE=require when required by the PostgreSQL host.

## API routes

All routes below require Authorization: Bearer <Supabase access token> unless
noted.

- GET /health/live — process health (public).
- GET /health/ready — database readiness (public).
- GET /api/v1/me — verified user and active company memberships.
- POST /api/v1/companies — create a company and its owner membership in one
  database function/transaction.
- POST /api/v1/companies/:companyId/invitations — owner/admin creates an
  invitation for an existing or future Supabase user. It returns a one-time
  seven-day link for the owner to share; email delivery is not configured yet.
- POST /api/v1/invitations/accept — the invited user accepts the link after
  signing in with the same email address.
- GET /api/v1/companies/:companyId/records/:entityType — list company records
  (maximum 500 per request).
- GET /api/v1/companies/:companyId/records/:entityType/:recordId — read a
  record.
- PUT /api/v1/companies/:companyId/records/:entityType/:recordId — create or
  update { "data": {...}, "expectedRevision": 0 }. For an update, pass the
  revision returned by the previous read.
- DELETE /api/v1/companies/:companyId/records/:entityType/:recordId — owner
  or admin only.

Roles:
- Owner and admin: read/write/delete records and invite employees.
- Manager: read/write records.
- Staff: read records only.

The record endpoint is a tenant-isolated persistence primitive, not yet the
final normalized schema for every ERP module. Inventory, sales, purchasing,
accounting, tax, stock and invoice workflows still need dedicated relational
tables, transactional service operations and end-to-end module integration
before this can replace the local pharmacy application in production.

## Encrypted off-host backup

Install pg_dump, age and rclone on the backup runner. Generate an age key pair
and keep the private key outside the ERP host. Configure:

- DATABASE_URL
- AGE_RECIPIENT with the age public recipient
- BACKUP_REMOTE with an rclone remote/path

Run bash server/backup.sh once daily through the host scheduler. The file is
encrypted before it leaves the process and streamed directly to the remote
destination. Restrict the remote bucket/account and test restore procedures
regularly. A successful upload is not a restore test.

## Current release boundary

This foundation does not yet:
- move existing localStorage pharmacy data into PostgreSQL;
- switch the existing ERP screens to the new API;
- configure Supabase email templates or email invitation delivery;
- provision the production PostgreSQL host, DNS, secrets, or backup remote;
- automatically create tenant databases or bill customers.

Those steps must be completed and verified before onboarding paying clients.
