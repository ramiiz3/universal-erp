create or replace function public.list_company_members(p_company_id uuid)
returns table (
  membership_id uuid,
  user_id uuid,
  full_name text,
  email text,
  role_key text,
  role_name text,
  branch_id uuid,
  branch_name text,
  status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.company_memberships as actor_memberships
    join public.role_permissions as actor_permissions
      on actor_permissions.role_id = actor_memberships.role_id
    join public.permissions as permissions
      on permissions.id = actor_permissions.permission_id
    where actor_memberships.company_id = p_company_id
      and actor_memberships.user_id = (select auth.uid())
      and actor_memberships.status = 'active'
      and permissions.permission_key = 'manage_members'
  ) then
    raise exception using errcode = '42501', message = 'Not authorized to view company members.';
  end if;

  return query
  select
    memberships.id,
    memberships.user_id,
    coalesce(nullif(btrim(profiles.full_name), ''), ''),
    coalesce(auth_users.email::text, ''),
    roles.role_key,
    roles.display_name,
    memberships.branch_id,
    branches.name,
    memberships.status
  from public.company_memberships as memberships
  join public.roles as roles on roles.id = memberships.role_id
  join auth.users as auth_users on auth_users.id = memberships.user_id
  left join public.profiles as profiles on profiles.id = memberships.user_id
  left join public.branches as branches
    on branches.company_id = memberships.company_id
   and branches.id = memberships.branch_id
  where memberships.company_id = p_company_id
    and private.has_company_permission(
      p_company_id,
      'manage_members',
      memberships.branch_id
    )
  order by memberships.created_at, memberships.id;
end;
$$;

revoke all on function public.list_company_members(uuid) from public, anon;
grant execute on function public.list_company_members(uuid) to authenticated;
