create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  permission_key text not null unique,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  role_key text not null unique,
  display_name text not null,
  is_system boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 200),
  legal_name text not null check (length(btrim(legal_name)) between 1 and 250),
  logo_path text,
  address text not null default '',
  phone text not null default '',
  email text not null default '',
  tax_registration_number text not null default '',
  country text not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  tax_rate numeric(7, 4) not null default 0 check (tax_rate between 0 and 100),
  invoice_prefix text not null default 'INV' check (length(btrim(invoice_prefix)) between 1 and 20),
  invoice_footer text not null default '',
  invoice_next_number bigint not null default 1 check (invoice_next_number > 0),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, name)
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 160),
  address text not null default '',
  phone text not null default '',
  is_default boolean not null default false,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, name)
);

create unique index branches_one_default_per_company
  on public.branches (company_id)
  where is_default;

create table public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role_id uuid not null references public.roles (id),
  branch_id uuid,
  status text not null default 'active' check (status in ('active', 'revoked')),
  invited_by uuid references auth.users (id),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, branch_id)
    references public.branches (company_id, id),
  unique nulls not distinct (company_id, user_id, branch_id)
);

create table public.company_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  email text not null check (position('@' in email) > 1),
  role_id uuid not null references public.roles (id),
  branch_id uuid,
  token_hash bytea not null unique,
  invited_by uuid not null references auth.users (id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (company_id, branch_id)
    references public.branches (company_id, id),
  check (expires_at > created_at)
);

create table public.platform_super_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_by uuid references auth.users (id),
  grant_reason text not null,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  branch_id uuid,
  actor_id uuid references auth.users (id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (company_id, branch_id)
    references public.branches (company_id, id)
);

create index company_memberships_user_status_idx
  on public.company_memberships (user_id, status);
create index company_memberships_company_status_idx
  on public.company_memberships (company_id, status);
create index company_invitations_email_expiry_idx
  on public.company_invitations (lower(email), expires_at)
  where accepted_at is null and revoked_at is null;
create index audit_logs_company_created_idx
  on public.audit_logs (company_id, created_at desc);

insert into public.permissions (permission_key, description) values
  ('view_company', 'View company and branch information'),
  ('manage_company', 'Edit company profile and company files'),
  ('manage_members', 'Invite and revoke company members'),
  ('manage_branches', 'Create and manage branches'),
  ('view_sales', 'View sales and invoices'),
  ('create_sales', 'Create sales'),
  ('manage_inventory', 'Manage inventory'),
  ('manage_purchasing', 'Manage suppliers and purchasing'),
  ('view_reports', 'View business reports'),
  ('manage_finance', 'Manage financial records'),
  ('view_audit_logs', 'View company audit history')
on conflict (permission_key) do nothing;

insert into public.roles (role_key, display_name) values
  ('owner', 'Company Owner'),
  ('admin', 'Company Admin'),
  ('manager', 'Manager'),
  ('cashier', 'Cashier'),
  ('inventory_manager', 'Inventory Manager'),
  ('accountant', 'Accountant'),
  ('read_only', 'Read-only')
on conflict (role_key) do nothing;

with grants(role_key, permission_key) as (
  values
    ('owner', 'view_company'), ('owner', 'manage_company'),
    ('owner', 'manage_members'), ('owner', 'manage_branches'),
    ('owner', 'view_sales'), ('owner', 'create_sales'),
    ('owner', 'manage_inventory'), ('owner', 'manage_purchasing'),
    ('owner', 'view_reports'), ('owner', 'manage_finance'),
    ('owner', 'view_audit_logs'),
    ('admin', 'view_company'), ('admin', 'manage_company'),
    ('admin', 'manage_members'), ('admin', 'manage_branches'),
    ('admin', 'view_sales'), ('admin', 'create_sales'),
    ('admin', 'manage_inventory'), ('admin', 'manage_purchasing'),
    ('admin', 'view_reports'), ('admin', 'manage_finance'),
    ('admin', 'view_audit_logs'),
    ('manager', 'view_company'), ('manager', 'view_sales'),
    ('manager', 'create_sales'), ('manager', 'manage_inventory'),
    ('manager', 'manage_purchasing'), ('manager', 'view_reports'),
    ('cashier', 'view_company'), ('cashier', 'view_sales'),
    ('cashier', 'create_sales'),
    ('inventory_manager', 'view_company'),
    ('inventory_manager', 'manage_inventory'),
    ('accountant', 'view_company'), ('accountant', 'view_sales'),
    ('accountant', 'view_reports'), ('accountant', 'manage_finance'),
    ('accountant', 'view_audit_logs'),
    ('read_only', 'view_company'), ('read_only', 'view_sales'),
    ('read_only', 'view_reports')
)
insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from grants
join public.roles on roles.role_key = grants.role_key
join public.permissions on permissions.permission_key = grants.permission_key
on conflict do nothing;

create or replace function private.is_platform_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_super_admins as admins
    where admins.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_company_member(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_memberships as memberships
    where memberships.company_id = p_company_id
      and memberships.user_id = (select auth.uid())
      and memberships.status = 'active'
  );
$$;

create or replace function private.shares_active_company(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_memberships as own_memberships
    join public.company_memberships as target_memberships
      on target_memberships.company_id = own_memberships.company_id
    where own_memberships.user_id = (select auth.uid())
      and target_memberships.user_id = p_user_id
      and own_memberships.status = 'active'
      and target_memberships.status = 'active'
  );
$$;

create or replace function private.has_company_permission(
  p_company_id uuid,
  p_permission_key text,
  p_branch_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_memberships as memberships
    join public.role_permissions as role_permissions
      on role_permissions.role_id = memberships.role_id
    join public.permissions as permissions
      on permissions.id = role_permissions.permission_id
    where memberships.company_id = p_company_id
      and memberships.user_id = (select auth.uid())
      and memberships.status = 'active'
      and permissions.permission_key = p_permission_key
      and (
        (p_branch_id is null and memberships.branch_id is null)
        or (
          p_branch_id is not null
          and (memberships.branch_id is null or memberships.branch_id = p_branch_id)
        )
      )
  );
$$;

create or replace function private.can_access_company_folder(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.companies as companies
    where companies.id::text = (storage.foldername(p_name))[1]
      and (
        private.is_company_member(companies.id)
        or private.is_platform_super_admin()
      )
  );
$$;

revoke all on function private.is_platform_super_admin() from public, anon, authenticated;
revoke all on function private.is_company_member(uuid) from public, anon, authenticated;
revoke all on function private.shares_active_company(uuid) from public, anon, authenticated;
revoke all on function private.has_company_permission(uuid, text, uuid) from public, anon, authenticated;
revoke all on function private.can_access_company_folder(text) from public, anon, authenticated;
grant execute on function private.is_platform_super_admin() to authenticated;
grant execute on function private.is_company_member(uuid) to authenticated;
grant execute on function private.shares_active_company(uuid) to authenticated;
grant execute on function private.has_company_permission(uuid, text, uuid) to authenticated;
grant execute on function private.can_access_company_folder(text) to authenticated;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.create_company_with_owner(
  p_name text,
  p_legal_name text,
  p_country text,
  p_currency text,
  p_tax_rate numeric default 0,
  p_address text default '',
  p_phone text default '',
  p_email text default '',
  p_tax_registration_number text default '',
  p_invoice_prefix text default 'INV',
  p_invoice_footer text default '',
  p_default_branch_name text default 'Main'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid;
  v_owner_role_id uuid;
  v_branch_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;
  if length(btrim(coalesce(p_name, ''))) not between 1 and 200
     or length(btrim(coalesce(p_legal_name, ''))) not between 1 and 250 then
    raise exception using errcode = '22023', message = 'Company and legal names are required.';
  end if;
  if p_currency !~ '^[A-Z]{3}$' or p_tax_rate not between 0 and 100 then
    raise exception using errcode = '22023', message = 'Currency or tax rate is invalid.';
  end if;
  if length(btrim(coalesce(p_default_branch_name, ''))) not between 1 and 160 then
    raise exception using errcode = '22023', message = 'A default branch name is required.';
  end if;

  select roles.id into strict v_owner_role_id
  from public.roles as roles
  where roles.role_key = 'owner';

  insert into public.companies (
    name, legal_name, country, currency, tax_rate, address, phone, email,
    tax_registration_number, invoice_prefix, invoice_footer, created_by
  )
  values (
    btrim(p_name), btrim(p_legal_name), btrim(p_country), p_currency, p_tax_rate,
    coalesce(p_address, ''), coalesce(p_phone, ''), lower(btrim(coalesce(p_email, ''))),
    coalesce(p_tax_registration_number, ''), coalesce(nullif(btrim(p_invoice_prefix), ''), 'INV'),
    coalesce(p_invoice_footer, ''), v_user_id
  )
  returning id into v_company_id;

  insert into public.branches (company_id, name, is_default, created_by)
  values (v_company_id, btrim(p_default_branch_name), true, v_user_id)
  returning id into v_branch_id;

  insert into public.company_memberships (
    company_id, user_id, role_id, branch_id, status, joined_at
  )
  values (v_company_id, v_user_id, v_owner_role_id, null, 'active', now());

  insert into public.audit_logs (
    company_id, actor_id, action, entity_type, entity_id, details
  )
  values (
    v_company_id, v_user_id, 'company.created', 'company', v_company_id,
    jsonb_build_object('default_branch_id', v_branch_id)
  );

  return v_company_id;
end;
$$;

create or replace function public.create_company_invitation(
  p_company_id uuid,
  p_email text,
  p_role_key text,
  p_branch_id uuid default null,
  p_expires_in_hours integer default 72
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_role_id uuid;
  v_actor_role_key text;
  v_token text;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;
  if not private.has_company_permission(
    p_company_id, 'manage_members', p_branch_id
  ) then
    raise exception using errcode = '42501', message = 'Not authorized to invite members.';
  end if;
  if p_role_key not in (
    'admin', 'manager', 'cashier', 'inventory_manager', 'accountant', 'read_only'
  ) then
    raise exception using errcode = '22023', message = 'This role cannot be granted by invitation.';
  end if;
  select roles.role_key into v_actor_role_key
  from public.company_memberships as memberships
  join public.roles as roles on roles.id = memberships.role_id
  where memberships.company_id = p_company_id
    and memberships.user_id = v_user_id
    and memberships.status = 'active'
    and (memberships.branch_id is null or memberships.branch_id = p_branch_id)
    and roles.role_key in ('owner', 'admin')
  limit 1;
  if v_actor_role_key is null
     or (p_role_key = 'admin' and v_actor_role_key <> 'owner') then
    raise exception using errcode = '42501', message = 'Not authorized to grant this role.';
  end if;
  if p_expires_in_hours not between 1 and 168 then
    raise exception using errcode = '22023', message = 'Invitation expiry must be 1 to 168 hours.';
  end if;
  if p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using errcode = '22023', message = 'A valid invitation email is required.';
  end if;

  select roles.id into strict v_role_id
  from public.roles as roles
  where roles.role_key = p_role_key;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.company_invitations (
    company_id, email, role_id, branch_id, token_hash, invited_by, expires_at
  )
  values (
    p_company_id, lower(btrim(p_email)), v_role_id, p_branch_id,
    extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'),
    v_user_id, now() + make_interval(hours => p_expires_in_hours)
  );
  insert into public.audit_logs (
    company_id, branch_id, actor_id, action, entity_type, details
  )
  values (
    p_company_id, p_branch_id, v_user_id, 'membership.invited',
    'invitation', jsonb_build_object('email', lower(btrim(p_email)), 'role', p_role_key)
  );
  return v_token;
end;
$$;

create or replace function public.accept_company_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email text := lower(btrim(coalesce((select auth.jwt() ->> 'email'), '')));
  v_invitation public.company_invitations%rowtype;
  v_existing_status text;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;
  if p_token is null or length(p_token) <> 64 or p_token !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Invitation token is invalid.';
  end if;

  select invitations.* into v_invitation
  from public.company_invitations as invitations
  where invitations.token_hash =
    extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'Invitation is invalid or already used.';
  end if;
  if v_invitation.accepted_at is not null then
    raise exception using errcode = 'P0001', message = 'Invitation has already been used.';
  end if;
  if v_invitation.revoked_at is not null then
    raise exception using errcode = 'P0001', message = 'Invitation was revoked.';
  end if;
  if v_invitation.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'Invitation has expired.';
  end if;
  if v_email = '' or v_email <> lower(v_invitation.email) then
    raise exception using errcode = '42501', message = 'Sign in with the email address this invitation was sent to.';
  end if;
  if not exists (
    select 1
    from auth.users as auth_users
    where auth_users.id = v_user_id
      and auth_users.email_confirmed_at is not null
  ) then
    raise exception using errcode = '42501', message = 'Confirm your email address before accepting this invitation.';
  end if;

  select memberships.status into v_existing_status
  from public.company_memberships as memberships
  where memberships.company_id = v_invitation.company_id
    and memberships.user_id = v_user_id
    and memberships.branch_id is not distinct from v_invitation.branch_id
  for update;
  if v_existing_status = 'active' then
    raise exception using errcode = 'P0001', message = 'An active membership already exists.';
  end if;

  insert into public.company_memberships (
    company_id, user_id, role_id, branch_id, status, invited_by, joined_at
  )
  values (
    v_invitation.company_id, v_user_id, v_invitation.role_id,
    v_invitation.branch_id, 'active', v_invitation.invited_by, now()
  )
  on conflict (company_id, user_id, branch_id)
  do update set
    role_id = excluded.role_id,
    status = 'active',
    invited_by = excluded.invited_by,
    joined_at = now(),
    updated_at = now();

  update public.company_invitations
  set accepted_at = now()
  where id = v_invitation.id;

  insert into public.audit_logs (
    company_id, branch_id, actor_id, action, entity_type, entity_id, details
  )
  values (
    v_invitation.company_id, v_invitation.branch_id, v_user_id,
    'membership.invitation_accepted', 'membership', v_user_id,
    jsonb_build_object('invitation_id', v_invitation.id)
  );

  return v_invitation.company_id;
end;
$$;

create or replace function public.revoke_company_membership(
  p_membership_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership public.company_memberships%rowtype;
  v_actor_role_key text;
begin
  select memberships.* into v_membership
  from public.company_memberships as memberships
  where memberships.id = p_membership_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Membership not found.';
  end if;
  if not private.has_company_permission(
    v_membership.company_id, 'manage_members', v_membership.branch_id
  ) then
    raise exception using errcode = '42501', message = 'Not authorized to revoke this membership.';
  end if;
  select roles.role_key into v_actor_role_key
  from public.company_memberships as memberships
  join public.roles as roles on roles.id = memberships.role_id
  where memberships.company_id = v_membership.company_id
    and memberships.user_id = (select auth.uid())
    and memberships.status = 'active'
    and (memberships.branch_id is null or memberships.branch_id = v_membership.branch_id)
  limit 1;
  if v_actor_role_key is null
     or (v_membership.role_id = (select roles.id from public.roles as roles where roles.role_key = 'owner'))
     or (v_membership.role_id = (select roles.id from public.roles as roles where roles.role_key = 'admin')
         and v_actor_role_key <> 'owner') then
    raise exception using errcode = '42501', message = 'Not authorized to revoke this role.';
  end if;
  if v_membership.status = 'revoked' then
    return;
  end if;

  update public.company_memberships
  set status = 'revoked', updated_at = now()
  where id = v_membership.id;

  insert into public.audit_logs (
    company_id, branch_id, actor_id, action, entity_type, entity_id
  )
  values (
    v_membership.company_id, v_membership.branch_id, (select auth.uid()),
    'membership.revoked', 'membership', v_membership.id
  );
end;
$$;

create or replace function public.revoke_company_invitation(
  p_invitation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.company_invitations%rowtype;
begin
  select invitations.* into v_invitation
  from public.company_invitations as invitations
  where invitations.id = p_invitation_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Invitation not found.';
  end if;
  if not private.has_company_permission(
    v_invitation.company_id, 'manage_members', v_invitation.branch_id
  ) then
    raise exception using errcode = '42501', message = 'Not authorized to revoke this invitation.';
  end if;
  if v_invitation.accepted_at is not null then
    raise exception using errcode = 'P0001', message = 'Accepted invitations cannot be revoked.';
  end if;
  if v_invitation.revoked_at is null then
    update public.company_invitations
    set revoked_at = now()
    where id = v_invitation.id;

    insert into public.audit_logs (
      company_id, branch_id, actor_id, action, entity_type, entity_id
    )
    values (
      v_invitation.company_id, v_invitation.branch_id, (select auth.uid()),
      'membership.invitation_revoked', 'invitation', v_invitation.id
    );
  end if;
end;
$$;

revoke all on function public.create_company_with_owner(text, text, text, text, numeric, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.create_company_invitation(uuid, text, text, uuid, integer) from public, anon;
revoke all on function public.accept_company_invitation(text) from public, anon;
revoke all on function public.revoke_company_membership(uuid) from public, anon;
revoke all on function public.revoke_company_invitation(uuid) from public, anon;
grant execute on function public.create_company_with_owner(text, text, text, text, numeric, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.create_company_invitation(uuid, text, text, uuid, integer) to authenticated;
grant execute on function public.accept_company_invitation(text) to authenticated;
grant execute on function public.revoke_company_membership(uuid) to authenticated;
grant execute on function public.revoke_company_invitation(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.companies enable row level security;
alter table public.branches enable row level security;
alter table public.company_memberships enable row level security;
alter table public.company_invitations enable row level security;
alter table public.platform_super_admins enable row level security;
alter table public.audit_logs enable row level security;

create policy "Profiles are visible to self or active company colleagues"
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or private.is_platform_super_admin()
  or private.shares_active_company(id)
);

create policy "Users may update their own profile"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "Authenticated users can view permission definitions"
on public.permissions for select to authenticated
using (true);

create policy "Authenticated users can view role definitions"
on public.roles for select to authenticated
using (true);

create policy "Authenticated users can view role permission definitions"
on public.role_permissions for select to authenticated
using (true);

create policy "Active company members can view their companies"
on public.companies for select to authenticated
using (
  private.is_platform_super_admin()
  or private.is_company_member(id)
);

create policy "Company managers can update company settings"
on public.companies for update to authenticated
using (private.has_company_permission(id, 'manage_company'))
with check (private.has_company_permission(id, 'manage_company'));

create policy "Active members can view assigned branches"
on public.branches for select to authenticated
using (
  private.is_platform_super_admin()
  or private.has_company_permission(company_id, 'view_company', id)
);

create policy "Company managers can create branches"
on public.branches for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.has_company_permission(company_id, 'manage_branches')
);

create policy "Company managers can update branches"
on public.branches for update to authenticated
using (private.has_company_permission(company_id, 'manage_branches', id))
with check (private.has_company_permission(company_id, 'manage_branches', id));

create policy "Company managers can delete non-default branches"
on public.branches for delete to authenticated
using (
  not is_default
  and private.has_company_permission(company_id, 'manage_branches', id)
);

create policy "Members can view own membership or members when authorized"
on public.company_memberships for select to authenticated
using (
  user_id = (select auth.uid())
  or private.is_platform_super_admin()
  or private.has_company_permission(company_id, 'manage_members', branch_id)
);

create policy "Authorized members can view invitations"
on public.company_invitations for select to authenticated
using (
  private.is_platform_super_admin()
  or private.has_company_permission(company_id, 'manage_members', branch_id)
);

create policy "Authorized members can view audit logs"
on public.audit_logs for select to authenticated
using (
  private.is_platform_super_admin()
  or private.has_company_permission(company_id, 'view_audit_logs', branch_id)
);

create policy "Platform administrators can inspect platform grants"
on public.platform_super_admins for select to authenticated
using (
  user_id = (select auth.uid())
  or private.is_platform_super_admin()
);

create policy "Company members can view private company files"
on storage.objects for select to authenticated
using (
  bucket_id = 'company-files'
  and private.can_access_company_folder(name)
);

create policy "Company managers can upload private company files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'company-files'
  and exists (
    select 1
    from public.companies as companies
    where companies.id::text = (storage.foldername(name))[1]
      and private.has_company_permission(companies.id, 'manage_company')
  )
);

create policy "Company managers can update private company files"
on storage.objects for update to authenticated
using (
  bucket_id = 'company-files'
  and exists (
    select 1
    from public.companies as companies
    where companies.id::text = (storage.foldername(name))[1]
      and private.has_company_permission(companies.id, 'manage_company')
  )
)
with check (
  bucket_id = 'company-files'
  and exists (
    select 1
    from public.companies as companies
    where companies.id::text = (storage.foldername(name))[1]
      and private.has_company_permission(companies.id, 'manage_company')
  )
);

create policy "Company managers can delete private company files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'company-files'
  and exists (
    select 1
    from public.companies as companies
    where companies.id::text = (storage.foldername(name))[1]
      and private.has_company_permission(companies.id, 'manage_company')
  )
);

insert into storage.buckets (id, name, public, file_size_limit)
values ('company-files', 'company-files', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

revoke all on public.profiles, public.permissions, public.roles, public.role_permissions,
  public.companies, public.branches, public.company_memberships,
  public.company_invitations, public.platform_super_admins, public.audit_logs
from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, avatar_path, updated_at) on public.profiles to authenticated;
grant select on public.permissions, public.roles, public.role_permissions to authenticated;
grant select on public.companies to authenticated;
grant update (
  name, legal_name, logo_path, address, phone, email, tax_registration_number,
  country, currency, tax_rate, invoice_prefix, invoice_footer, updated_at
) on public.companies to authenticated;
grant select, insert, delete on public.branches to authenticated;
grant update (name, address, phone, updated_at) on public.branches to authenticated;
grant select on public.company_memberships, public.company_invitations, public.audit_logs,
  public.platform_super_admins to authenticated;
grant select on storage.objects to authenticated;
grant insert, update, delete on storage.objects to authenticated;

comment on table public.platform_super_admins is
  'Provision only through a reviewed administrative migration or trusted server-side process. Never from browser metadata or company-admin RPCs.';
