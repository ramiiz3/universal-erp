-- Durable, company-scoped storage for the single-workstation Zaky Pharmacy ERP.
-- The browser remains a local cache/recovery copy; the database is authoritative.
create table public.legacy_erp_state (
  company_id uuid primary key references public.companies(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index legacy_erp_state_updated_at_idx
  on public.legacy_erp_state(updated_at desc);

alter table public.legacy_erp_state enable row level security;

create policy "Pharmacy owners can read ERP state"
on public.legacy_erp_state for select to authenticated
using (private.has_company_permission(company_id, 'manage_company'));

create policy "Pharmacy owners can create ERP state"
on public.legacy_erp_state for insert to authenticated
with check (
  updated_by = (select auth.uid())
  and private.has_company_permission(company_id, 'manage_company')
);

create policy "Pharmacy owners can update ERP state"
on public.legacy_erp_state for update to authenticated
using (private.has_company_permission(company_id, 'manage_company'))
with check (
  updated_by = (select auth.uid())
  and private.has_company_permission(company_id, 'manage_company')
);

grant select, insert, update on public.legacy_erp_state to authenticated;
revoke all on public.legacy_erp_state from anon;

create or replace function public.save_legacy_erp_state(
  p_company_id uuid,
  p_expected_revision bigint,
  p_state jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_revision bigint;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '28000', message = 'Sign in before saving pharmacy data.';
  end if;

  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception using errcode = '22023', message = 'Invalid ERP revision.';
  end if;

  if p_state is null
     or jsonb_typeof(p_state) <> 'object'
     or pg_column_size(p_state) > 20 * 1024 * 1024 then
    raise exception using errcode = '22023', message = 'ERP data is invalid or exceeds the 20 MB sync limit.';
  end if;

  if not private.has_company_permission(p_company_id, 'manage_company') then
    raise exception using errcode = '42501', message = 'You are not authorized to save this pharmacy ERP.';
  end if;

  if p_expected_revision = 0 then
    insert into public.legacy_erp_state (
      company_id, revision, state, updated_by
    )
    values (
      p_company_id, 1, p_state, (select auth.uid())
    )
    on conflict (company_id) do nothing
    returning revision into v_revision;
  else
    update public.legacy_erp_state
    set
      state = p_state,
      revision = revision + 1,
      updated_by = (select auth.uid()),
      updated_at = now()
    where company_id = p_company_id
      and revision = p_expected_revision
    returning revision into v_revision;
  end if;

  if v_revision is null then
    raise exception using
      errcode = '40001',
      message = 'ERP_STATE_REVISION_CONFLICT: pharmacy data changed elsewhere. Reload before saving.';
  end if;

  return v_revision;
end;
$function$;

revoke all on function public.save_legacy_erp_state(uuid, bigint, jsonb) from public, anon;
grant execute on function public.save_legacy_erp_state(uuid, bigint, jsonb) to authenticated;

-- Daily point-in-time snapshots are queryable only by the pharmacy owner.
-- They are separate from the live state row and are retained for 90 days.
create table public.legacy_erp_daily_snapshots (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  business_date date not null,
  revision bigint not null,
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  created_at timestamptz not null default now(),
  unique (company_id, business_date)
);

create index legacy_erp_daily_snapshots_company_date_idx
  on public.legacy_erp_daily_snapshots(company_id, business_date desc);

alter table public.legacy_erp_daily_snapshots enable row level security;

create policy "Pharmacy owners can download daily ERP snapshots"
on public.legacy_erp_daily_snapshots for select to authenticated
using (private.has_company_permission(company_id, 'manage_company'));

grant select on public.legacy_erp_daily_snapshots to authenticated;
revoke all on public.legacy_erp_daily_snapshots from anon;

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

  return v_inserted;
end;
$function$;

revoke all on function private.create_daily_legacy_erp_snapshots() from public, anon, authenticated;

-- Supabase Cron uses UTC on this project. 20:05 UTC is 00:05 in Dubai.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;

do $block$
begin
  if not exists (
    select 1 from cron.job where jobname = 'zaky-pharmacy-daily-erp-snapshot'
  ) then
    perform cron.schedule(
      'zaky-pharmacy-daily-erp-snapshot',
      '5 20 * * *',
      'select private.create_daily_legacy_erp_snapshots();'
    );
  end if;
end;
$block$;
