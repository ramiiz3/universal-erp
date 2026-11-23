create or replace function private.create_daily_legacy_erp_snapshots()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_snapshot_date date := (timezone('Asia/Dubai', now())::date - 1);
  v_inserted integer := 0;
begin
  insert into public.legacy_erp_daily_snapshots (
    company_id, business_date, revision, state
  )
  select
    company_id, v_snapshot_date, revision, state
  from public.legacy_erp_state
  on conflict (company_id, business_date) do nothing;

  get diagnostics v_inserted = row_count;

  delete from public.legacy_erp_daily_snapshots
  where business_date < (timezone('Asia/Dubai', now())::date - 90);

  delete from public.legacy_erp_recovery_snapshots
  where created_at < now() - interval '90 days';

  return v_inserted;
end;
$function$;

revoke all on function private.create_daily_legacy_erp_snapshots() from public, anon, authenticated;
