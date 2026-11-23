create table public.legacy_erp_recovery_snapshots (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  reason text not null check (length(btrim(reason)) between 1 and 160),
  revision bigint,
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index legacy_erp_recovery_snapshots_company_created_idx
  on public.legacy_erp_recovery_snapshots(company_id, created_at desc);

alter table public.legacy_erp_recovery_snapshots enable row level security;

create policy "Pharmacy owners can read recovery snapshots"
on public.legacy_erp_recovery_snapshots for select to authenticated
using (private.has_company_permission(company_id, 'manage_company'));

create policy "Pharmacy owners can create recovery snapshots"
on public.legacy_erp_recovery_snapshots for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.has_company_permission(company_id, 'manage_company')
);

grant select, insert on public.legacy_erp_recovery_snapshots to authenticated;
revoke update, delete on public.legacy_erp_recovery_snapshots from authenticated, anon;
revoke all on public.legacy_erp_recovery_snapshots from anon;
