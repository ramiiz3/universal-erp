# Supabase development and security verification

UniversalERP uses Supabase Auth and a PostgreSQL database with RLS for the
authenticated company workspace. The authenticated workspace is separate from
the legacy local ERP; no legacy `localStorage` business records are migrated
automatically.

## Local development: Supabase CLI v3 Native Runtime

The repository config enables the **experimental** Supabase CLI v3 Native
Runtime. It is intended for local development and testing on supported macOS
Apple Silicon systems. It is not a production deployment target, and its
experimental status means behavior and support may change.

From the repository root:

```sh
npx supabase start --runtime native
npx supabase status
```

`status` reports the local API, database, Studio, and email-testing endpoints,
as well as local keys. Treat all output as sensitive; do not paste it into
source files, logs, or support requests. To apply pending migrations to the
local database:

```sh
npx supabase migration up
```

Supabase CLI v3 targets the local database by default. Do not pass `--remote`,
link a production project, or use production credentials for these procedures.
The security scripts independently obtain connection values from local
`supabase status` and refuse non-loopback hosts.

Start the web application in a separate terminal:

```sh
npm run dev
```

## Repeatable security verification

Install the project's declared dependencies, start the local Native Runtime,
and then run:

```sh
npm run test:db:security
npm run test:storage:security
```

The database runner executes each complete pgTAP SQL file on a single
connection, verifies all planned assertions, and confirms that each test
transaction rolled back. The Storage test creates temporary local users and
companies, authenticates through local Auth, tests private-file upload,
cross-company access and deletion through the Storage HTTP API, and cleans up
its temporary resources. Both scripts are local-only and must not be modified
to accept remote URLs or credentials.

## Keys and environment separation

Copy `.env.development.example` to `.env.local` for local browser development
and use the local API URL and **publishable** key reported by `npx supabase
status`. Publishable keys (and legacy anon/public keys) are intended for
browser clients; they do not grant database access by themselves. RLS and
grants must enforce access.

Production is a separate Supabase project and hosting environment. Configure
only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the frontend.
Never put a service-role key, Supabase secret key, database password, SMTP
credential, or other server secret in a `VITE_` variable, source file, or
committed environment file. Keep server secrets in a trusted server or
deployment secret store. The `.env*.example` files contain placeholders only.

The local config allows email signup without confirmation for development.
Configure production email confirmation, SMTP, site URL, and redirect URLs in
the separate production project after review. Platform Super Admin grants must
be provisioned through a reviewed administrative migration or trusted
server-side process; public registration and editable user metadata cannot
grant this privilege.

## Route and data boundaries

- `/auth/login`, `/auth/register`, `/auth/recover`, and `/auth/invite/:token`
  are public authentication and invitation routes.
- `/workspace` is the authenticated, membership-verified company workspace.
- The legacy ERP routes remain backed by the existing local ERP context and
  browser storage. They are not authenticated company data.
