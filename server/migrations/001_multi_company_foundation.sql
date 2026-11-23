-- Universal ERP multi-company platform foundation.
-- Run with a PostgreSQL migration/owner account. The API connects as a
-- separate non-owner role (erp_app) so row-level security is effective.

create schema if not exists erp_private;
revoke all on schema erp_private from public;

create table if not exists public.erp_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 200),
  legal_name text not null check (length(btrim(legal_name)) between 2 and 250),
  country char(2) not null,
  currency char(3) not null,
  tax_rate numeric(5,2) not null default 0 check (tax_rate between 0 and 100),
  address text not null default '',
  phone text not null default '',
  email text not null default '',
  tax_registration_number text not null default '',
  invoice_prefix text not null default 'INV',
  invoice_footer text not null default '',
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.erp_company_branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.erp_companies(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 150),
  code text not null check (length(btrim(code)) between 1 and 30),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, code)
);

create table if not exists public.erp_company_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.erp_companies(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('owner','admin','manager','staff')),
  branch_id uuid,
  status text not null default 'active' check (status in ('active','suspended','removed')),
  joined_at timestamptz not null default now(),
  unique (company_id, user_id),
  foreign key (company_id, branch_id)
    references public.erp_company_branches(company_id, id)
);
create index if not exists erp_memberships_user_status_idx
  on public.erp_company_memberships(user_id, status);
create index if not exists erp_memberships_company_role_idx
  on public.erp_company_memberships(company_id, role, status);

create table if not exists public.erp_company_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.erp_companies(id) on delete cascade,
  email text not null check (length(email) between 3 and 254),
  role text not null check (role in ('admin','manager','staff')),
  token_hash char(64) not null unique,
  invited_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  check (expires_at > created_at)
);
create index if not exists erp_invitations_company_email_idx
  on public.erp_company_invitations(company_id, lower(email))
  where accepted_at is null;

create table if not exists public.erp_company_records (
  company_id uuid not null references public.erp_companies(id) on delete cascade,
  entity_type text not null check (entity_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  record_id text not null check (length(record_id) between 1 and 160),
  data jsonb not null check (jsonb_typeof(data) in ('object','array')),
  revision bigint not null default 1 check (revision > 0),
  created_by uuid not null,
  updated_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, entity_type, record_id)
);
create index if not exists erp_records_company_type_updated_idx
  on public.erp_company_records(company_id, entity_type, updated_at desc);

create table if not exists public.erp_audit_events (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.erp_companies(id) on delete cascade,
  actor_user_id uuid not null,
  action text not null check (length(action) between 1 and 100),
  entity_type text not null check (length(entity_type) between 1 and 64),
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists erp_audit_company_created_idx
  on public.erp_audit_events(company_id, created_at desc);

create or replace function erp_private.current_user_id()
returns uuid language sql stable
as $$ select nullif(current_setting('erp.user_id', true), '')::uuid $$;

create or replace function erp_private.is_company_member(p_company_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, erp_private
as $$
  select exists (
    select 1 from public.erp_company_memberships m
     where m.company_id = p_company_id
       and m.user_id = p_user_id
       and m.status = 'active'
  )
$$;

create or replace function erp_private.has_company_role(p_company_id uuid, p_user_id uuid, p_roles text[])
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, erp_private
as $$
  select exists (
    select 1 from public.erp_company_memberships m
     where m.company_id = p_company_id
       and m.user_id = p_user_id
       and m.status = 'active'
       and m.role = any(p_roles)
  )
$$;

create or replace function erp_private.create_company_with_owner(
  p_name text, p_legal_name text, p_country text, p_currency text,
  p_tax_rate numeric, p_address text, p_phone text, p_email text,
  p_tax_registration_number text, p_invoice_prefix text, p_invoice_footer text,
  p_default_branch_name text
)
returns uuid language plpgsql security definer
set search_path = pg_catalog, public, erp_private
as $$
declare
  v_user_id uuid := erp_private.current_user_id();
  v_company_id uuid;
  v_branch_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to create a company' using errcode = '42501';
  end if;
  insert into public.erp_companies (
    name, legal_name, country, currency, tax_rate, address, phone, email,
    tax_registration_number, invoice_prefix, invoice_footer, created_by
  ) values (
    p_name, p_legal_name, p_country, p_currency, p_tax_rate, coalesce(p_address,''),
    coalesce(p_phone,''), coalesce(p_email,''), coalesce(p_tax_registration_number,''),
    coalesce(p_invoice_prefix,'INV'), coalesce(p_invoice_footer,''), v_user_id
  ) returning id into v_company_id;
  insert into public.erp_company_branches(company_id, name, code, is_default)
  values (v_company_id, coalesce(nullif(btrim(p_default_branch_name), ''), 'Main'), 'MAIN', true)
  returning id into v_branch_id;
  insert into public.erp_company_memberships(company_id, user_id, role, branch_id, status)
  values (v_company_id, v_user_id, 'owner', v_branch_id, 'active');
  return v_company_id;
end
$$;

create or replace function erp_private.accept_company_invitation(
  p_token_hash text, p_user_id uuid, p_email text
)
returns uuid language plpgsql security definer
set search_path = pg_catalog, public, erp_private
as $$
declare
  v_invitation public.erp_company_invitations%rowtype;
  v_current_user uuid := erp_private.current_user_id();
begin
  if v_current_user is null or v_current_user <> p_user_id then
    raise exception 'Invitation acceptance user mismatch' using errcode = '42501';
  end if;
  select * into v_invitation
    from public.erp_company_invitations
   where token_hash = p_token_hash and accepted_at is null
     and expires_at > now() and lower(email) = lower(p_email)
   for update;
  if not found then return null; end if;
  insert into public.erp_company_memberships(company_id, user_id, role, status)
  values (v_invitation.company_id, p_user_id, v_invitation.role, 'active')
  on conflict (company_id, user_id) do nothing;
  update public.erp_company_invitations set accepted_at = now() where id = v_invitation.id;
  return v_invitation.company_id;
end
$$;

alter table public.erp_companies enable row level security;
create policy erp_companies_member_read on public.erp_companies
  for select to erp_app
  using (erp_private.is_company_member(id, erp_private.current_user_id()));

alter table public.erp_company_branches enable row level security;
create policy erp_company_branches_member_read on public.erp_company_branches
  for select to erp_app
  using (erp_private.is_company_member(company_id, erp_private.current_user_id()));

alter table public.erp_company_memberships enable row level security;
create policy erp_memberships_self_or_admin_read on public.erp_company_memberships
  for select to erp_app
  using (
    user_id = erp_private.current_user_id()
    or erp_private.has_company_role(company_id, erp_private.current_user_id(), array['owner','admin'])
  );

alter table public.erp_company_invitations enable row level security;
create policy erp_invitations_admin_read on public.erp_company_invitations
  for select to erp_app
  using (erp_private.has_company_role(company_id, erp_private.current_user_id(), array['owner','admin']));
create policy erp_invitations_admin_insert on public.erp_company_invitations
  for insert to erp_app
  with check (
    invited_by = erp_private.current_user_id()
    and erp_private.has_company_role(company_id, erp_private.current_user_id(), array['owner','admin'])
  );

alter table public.erp_company_records enable row level security;
alter table public.erp_company_records force row level security;
create policy erp_company_records_member_read on public.erp_company_records
  for select to erp_app
  using (
    company_id = nullif(current_setting('erp.company_id', true), '')::uuid
    and erp_private.is_company_member(company_id, erp_private.current_user_id())
  );
create policy erp_company_records_manager_insert on public.erp_company_records
  for insert to erp_app
  with check (
    company_id = nullif(current_setting('erp.company_id', true), '')::uuid
    and created_by = erp_private.current_user_id()
    and updated_by = erp_private.current_user_id()
    and erp_private.has_company_role(company_id, erp_private.current_user_id(), array['owner','admin','manager'])
  );
create policy erp_company_records_manager_update on public.erp_company_records
  for update to erp_app
  using (
    company_id = nullif(current_setting('erp.company_id', true), '')::uuid
    and erp_private.has_company_role(company_id, erp_private.current_user_id(), array['owner','admin','manager'])
  )
  with check (
    company_id = nullif(current_setting('erp.company_id', true), '')::uuid
    and updated_by = erp_private.current_user_id()
    and erp_private.has_company_role(company_id, erp_private.current_user_id(), array['owner','admin','manager'])
  );
create policy erp_company_records_owner_delete on public.erp_company_records
  for delete to erp_app
  using (
    company_id = nullif(current_setting('erp.company_id', true), '')::uuid
    and erp_private.has_company_role(company_id, erp_private.current_user_id(), array['owner','admin'])
  );

alter table public.erp_audit_events enable row level security;
alter table public.erp_audit_events force row level security;
create policy erp_audit_admin_read on public.erp_audit_events
  for select to erp_app
  using (erp_private.has_company_role(company_id, erp_private.current_user_id(), array['owner','admin']));
create policy erp_audit_member_insert on public.erp_audit_events
  for insert to erp_app
  with check (
    actor_user_id = erp_private.current_user_id()
    and erp_private.is_company_member(company_id, erp_private.current_user_id())
  );

-- Create erp_app as a distinct, non-owner login before applying this migration.
-- Never run the API with the migration/admin account.
grant usage on schema public, erp_private to erp_app;
grant select on public.erp_companies to erp_app;
grant select on public.erp_company_memberships to erp_app;
grant select on public.erp_company_branches to erp_app;
grant select, insert on public.erp_company_invitations to erp_app;
grant select, insert, update, delete on public.erp_company_records to erp_app;
grant select, insert on public.erp_audit_events to erp_app;
grant usage, select on sequence public.erp_audit_events_id_seq to erp_app;
grant execute on function erp_private.current_user_id() to erp_app;
grant execute on function erp_private.is_company_member(uuid, uuid) to erp_app;
grant execute on function erp_private.has_company_role(uuid, uuid, text[]) to erp_app;
grant execute on function erp_private.create_company_with_owner(text,text,text,text,numeric,text,text,text,text,text,text,text) to erp_app;
grant execute on function erp_private.accept_company_invitation(text,uuid,text) to erp_app;

revoke all on function erp_private.create_company_with_owner(text,text,text,text,numeric,text,text,text,text,text,text,text) from public;
revoke all on function erp_private.accept_company_invitation(text,uuid,text) from public;
