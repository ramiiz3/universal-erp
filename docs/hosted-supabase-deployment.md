# Hosted Supabase deployment

UniversalERP's production Supabase project is connected to the
`ramiiz3/universal-erp` GitHub repository.

The production deployment is configured to deploy from `main`, with the
Supabase working directory set to `.` because the `supabase/` directory is
at the repository root.

On pushes to the configured production branch, the Supabase GitHub integration
applies migrations in `supabase/migrations/` that are not yet present in the
remote migration history. It also deploys changed Edge Functions and declared
Storage buckets.

## Safe deployment checks

- Check the Supabase deployment workflow logs before investigating application
  authentication failures.
- Confirm every migration step succeeds and that the remote migration history
  contains the migrations from this repository.
- Do not reset the production database to retry a deployment.
- Keep Render's `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY` set to this hosted project's URL and
  publishable key.
- Configure the live Render site URL in Supabase Auth's Site URL and allowed
  redirect URLs. Do not use the local Native Runtime URL in Render.
