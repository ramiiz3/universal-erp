begin;

create extension if not exists pgtap with schema extensions;
select plan(39);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@example.test', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Owner A"}'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-a@example.test', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Admin A"}'),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'branch-a@example.test', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Branch User"}'),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@example.test', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Owner B"}'),
  ('10000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'multi@example.test', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Multi Company"}'),
  ('10000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'invitee@example.test', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Invitee"}'),
  ('10000000-0000-4000-8000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'expired@example.test', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Expired"}'),
  ('10000000-0000-4000-8000-000000000008', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'platform-admin@example.test', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Platform Admin"}')
on conflict (id) do nothing;

insert into public.companies (
  id, name, legal_name, country, currency, created_by
) values
  ('20000000-0000-4000-8000-000000000001', 'Company A', 'Company A LLC', 'AE', 'AED', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002', 'Company B', 'Company B LLC', 'AE', 'AED', '10000000-0000-4000-8000-000000000004'),
  ('20000000-0000-4000-8000-000000000003', 'Company C', 'Company C LLC', 'AE', 'AED', '10000000-0000-4000-8000-000000000005')
on conflict (id) do nothing;

insert into public.platform_super_admins (user_id, granted_by, grant_reason)
values (
  '10000000-0000-4000-8000-000000000008',
  '10000000-0000-4000-8000-000000000001',
  'pgTAP platform-admin fixture'
)
on conflict (user_id) do nothing;

insert into public.branches (
  id, company_id, name, is_default, created_by
) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'A Main', true, '10000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'A Second', false, '10000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', 'B Main', true, '10000000-0000-4000-8000-000000000004')
on conflict (id) do nothing;

insert into public.company_memberships (
  company_id, user_id, role_id, branch_id, status, joined_at
)
select fixtures.company_id, fixtures.user_id, roles.id, fixtures.branch_id, 'active', now()
from (values
  ('20000000-0000-4000-8000-000000000001'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, 'owner', null::uuid),
  ('20000000-0000-4000-8000-000000000001'::uuid, '10000000-0000-4000-8000-000000000002'::uuid, 'admin', null::uuid),
  ('20000000-0000-4000-8000-000000000001'::uuid, '10000000-0000-4000-8000-000000000003'::uuid, 'inventory_manager', '30000000-0000-4000-8000-000000000001'::uuid),
  ('20000000-0000-4000-8000-000000000002'::uuid, '10000000-0000-4000-8000-000000000004'::uuid, 'owner', null::uuid),
  ('20000000-0000-4000-8000-000000000001'::uuid, '10000000-0000-4000-8000-000000000005'::uuid, 'read_only', null::uuid),
  ('20000000-0000-4000-8000-000000000003'::uuid, '10000000-0000-4000-8000-000000000005'::uuid, 'read_only', null::uuid)
) as fixtures(company_id, user_id, role_key, branch_id)
join public.roles on roles.role_key = fixtures.role_key
on conflict (company_id, user_id, branch_id) do nothing;

insert into public.audit_logs (
  company_id, branch_id, actor_id, action, entity_type
) values (
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  'test.branch_reference',
  'branch'
);

insert into storage.objects (bucket_id, name)
values
  ('company-files', '20000000-0000-4000-8000-000000000001/test.txt'),
  ('company-files', '20000000-0000-4000-8000-000000000002/test.txt')
on conflict do nothing;

select ok(
  not has_table_privilege('anon', 'public.companies', 'select'),
  'anonymous role has no direct access to tenant tables'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
select is((select count(*)::integer from public.companies), 0, 'anonymous JWT has no company rows');
select throws_ok(
  $$ select public.create_company_with_owner(
    'Unauthenticated', 'Unauthenticated LLC', 'AE', 'AED'
  ) $$,
  '28000',
  'Authentication required.',
  'company registration RPC requires an authenticated user'
);
reset role;
set local role anon;
select throws_ok(
  $$ select * from public.companies $$,
  '42501',
  null,
  'anonymous SQL role cannot select protected companies'
);
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002","email":"admin-a@example.test","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::integer from public.companies where id = '20000000-0000-4000-8000-000000000002'), 0, 'Company A cannot read Company B');
with changed as (
  update public.companies
  set name = 'Hacked'
  where id = '20000000-0000-4000-8000-000000000002'
  returning 1
)
select is(
  (select count(*)::integer from changed),
  0,
  'Company A cannot modify Company B'
);
select throws_ok(
  $$ insert into public.companies (name, legal_name, country, currency, created_by) values ('Forged', 'Forged LLC', 'AE', 'AED', auth.uid()) $$,
  '42501',
  'permission denied for table companies',
  'company creation cannot bypass the registration RPC'
);
reset role;
select throws_ok(
  $$ insert into public.audit_logs (
    company_id, branch_id, actor_id, action, entity_type
  ) values (
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000003',
    null, 'test.cross_company_branch', 'branch'
  ) $$,
  '23503',
  null,
  'company-scoped branch foreign key rejects cross-company branch IDs'
);
set local role authenticated;
select throws_ok(
  $$ update public.company_memberships set role_id = (select id from public.roles where role_key = 'owner') where user_id = auth.uid() $$,
  '42501',
  'permission denied for table company_memberships',
  'users cannot directly promote themselves'
);
select throws_ok(
  $$ insert into public.platform_super_admins (user_id, grant_reason) values (auth.uid(), 'self promotion') $$,
  '42501',
  'permission denied for table platform_super_admins',
  'company administrators cannot grant platform super admin'
);
select is((select count(*)::integer from public.roles where role_key = 'platform_super_admin'), 0, 'platform super admin is not a public company role');
select is((select count(*)::integer from public.branches
  where company_id = '20000000-0000-4000-8000-000000000001'
    and id in (
      '30000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000002'
    )), 2, 'company admin sees both company branches');
select throws_ok(
  $$ delete from public.branches where id = '30000000-0000-4000-8000-000000000002' $$,
  '23503',
  null,
  'branch deletion cannot cascade into audit history'
);
select is(
  (select count(*)::integer from storage.objects
   where bucket_id = 'company-files'
     and name = '20000000-0000-4000-8000-000000000001/test.txt') = 1
    and (select count(*)::integer from storage.objects
         where bucket_id = 'company-files'
           and name like '20000000-0000-4000-8000-000000000002/%') = 0,
  true,
  'Company A can read its own private file but not Company B storage'
);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
  values ('company-files', '20000000-0000-4000-8000-000000000001/authorized.txt') $$,
  'Company A can upload a file into its own private company storage'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('company-files', '20000000-0000-4000-8000-000000000002/forbidden.txt') $$,
  '42501',
  null,
  'Company A cannot upload into Company B storage'
);
with changed as (
  update storage.objects
  set metadata = '{"changed":true}'
  where bucket_id = 'company-files'
    and name in (
      '20000000-0000-4000-8000-000000000001/test.txt',
      '20000000-0000-4000-8000-000000000002/test.txt'
    )
  returning name
)
select is(
  (select count(*)::integer from changed
   where name = '20000000-0000-4000-8000-000000000001/test.txt') = 1
    and (select count(*)::integer from changed) = 1,
  true,
  'Company A can update its own storage but not Company B storage'
);
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Company managers can delete private company files'
      and cmd = 'DELETE'
      and qual ilike '%foldername(objects.name)%'
      and qual ilike '%has_company_permission%'
  ),
  'storage delete policy scopes company authorization to the object path'
);
select throws_ok(
  $$ delete from storage.objects
  where bucket_id = 'company-files'
    and name = '20000000-0000-4000-8000-000000000001/test.txt' $$,
  '42501',
  'Direct deletion from storage tables is not allowed. Use the Storage API instead.',
  'Storage extension blocks direct SQL deletion before company RLS is evaluated'
);
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","email":"branch-a@example.test","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::integer from public.branches where company_id = '20000000-0000-4000-8000-000000000001'), 1, 'branch-scoped inventory manager sees only its assigned branch');
with changed as (
  update public.companies
  set name = 'Not Allowed'
  where id = '20000000-0000-4000-8000-000000000001'
  returning 1
)
select is(
  (select count(*)::integer from changed),
  0,
  'branch-scoped user cannot change company settings'
);
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000005","email":"multi@example.test","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select count(*)::integer from public.companies
   where id in (
     '20000000-0000-4000-8000-000000000001',
     '20000000-0000-4000-8000-000000000002',
     '20000000-0000-4000-8000-000000000003'
   )) = 2
    and (select count(*)::integer from public.companies where id = '20000000-0000-4000-8000-000000000002') = 0,
  true,
  'multi-company user sees only companies with active membership'
);
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000008', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000008","email":"platform-admin@example.test","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select count(*)::integer from public.companies where id in (
     '20000000-0000-4000-8000-000000000001',
     '20000000-0000-4000-8000-000000000002',
     '20000000-0000-4000-8000-000000000003'
   )) = 3
    and (select count(*)::integer from public.branches where id in (
      '30000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000003'
    )) = 3,
  true,
  'provisioned platform admin can inspect all companies and branches'
);
with changed as (
  update public.companies
  set name = 'Platform write blocked'
  returning 1
)
select is(
  (select count(*)::integer from changed),
  0,
  'platform admin inspection access does not permit direct company edits'
);
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","email":"owner-a@example.test","role":"authenticated"}', true);
set local role authenticated;
select ok(
  length(set_config(
    'test.invite_token',
    public.create_company_invitation('20000000-0000-4000-8000-000000000001', 'invitee@example.test', 'cashier', null, 72),
    true
  )) = 64,
  'authorized owner can create a time-limited invitation token'
);
select ok(
  length(set_config(
    'test.expired_token',
    public.create_company_invitation('20000000-0000-4000-8000-000000000001', 'expired@example.test', 'read_only', null, 72),
    true
  )) = 64,
  'owner can create a second invitation for expiry testing'
);
select throws_ok(
  $$ select public.create_company_invitation('20000000-0000-4000-8000-000000000001', 'no-owner@example.test', 'owner', null, 72) $$,
  '22023',
  'This role cannot be granted by invitation.',
  'invitation cannot assign the owner role'
);
reset role;

update public.company_invitations
set created_at = now() - interval '2 hours',
    expires_at = now() - interval '1 hour'
where lower(email) = 'expired@example.test';

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000007', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000007","email":"expired@example.test","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$ select public.accept_company_invitation(current_setting('test.invite_token')) $$,
  '42501',
  'Sign in with the email address this invitation was sent to.',
  'invitation cannot be accepted by a different email address'
);
select throws_ok(
  $$ select public.accept_company_invitation(
    case
      when left(current_setting('test.invite_token'), 1) = 'a'
        then 'b' || substr(current_setting('test.invite_token'), 2)
      else 'a' || substr(current_setting('test.invite_token'), 2)
    end
  ) $$,
  'P0001',
  'Invitation is invalid or already used.',
  'altered invitation token is rejected'
);
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000006', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000006","email":"invitee@example.test","role":"authenticated"}', true);
set local role authenticated;
select is(
  public.accept_company_invitation(current_setting('test.invite_token')),
  '20000000-0000-4000-8000-000000000001'::uuid,
  'invitation acceptance creates the intended company membership'
);
select throws_ok(
  $$ select public.accept_company_invitation(current_setting('test.invite_token')) $$,
  'P0001',
  'Invitation has already been used.',
  'accepted invitation cannot be reused'
);
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000007', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000007","email":"expired@example.test","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$ select public.accept_company_invitation(current_setting('test.expired_token')) $$,
  'P0001',
  'Invitation has expired.',
  'expired invitation cannot be accepted'
);
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","email":"owner-a@example.test","role":"authenticated"}', true);
set local role authenticated;
select ok(
  length(set_config(
    'test.revoked_token',
    public.create_company_invitation('20000000-0000-4000-8000-000000000001', 'expired@example.test', 'read_only', null, 72),
    true
  )) = 64,
  'authorized owner can create a revocable invitation'
);
select lives_ok(
  $$ select public.revoke_company_invitation((
    select id from public.company_invitations
    where token_hash = extensions.digest(
      convert_to(current_setting('test.revoked_token'), 'UTF8'), 'sha256'
    )
  )) $$,
  'authorized owner can revoke a pending invitation'
);
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000007', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000007","email":"expired@example.test","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$ select public.accept_company_invitation(current_setting('test.revoked_token')) $$,
  'P0001',
  'Invitation was revoked.',
  'revoked invitation cannot be accepted'
);
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000007', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000007","email":"expired@example.test","role":"authenticated"}', true);
set local role authenticated;
select is(
  public.create_company_with_owner(
    'New Company', 'New Company LLC', 'AE', 'AED', 5,
    '', '', '', '', 'INV', '', 'Main'
  ) is not null,
  true,
  'registration RPC creates a company without accepting a client-supplied role'
);
select is(
  (select count(*)::integer
   from public.company_memberships as memberships
   join public.roles on roles.id = memberships.role_id
   where memberships.user_id = auth.uid()
     and roles.role_key = 'owner'
     and memberships.status = 'active'),
  1,
  'company registration atomically creates the initial owner membership'
);
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","email":"owner-a@example.test","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$ select public.revoke_company_membership((select id from public.company_memberships where user_id = '10000000-0000-4000-8000-000000000003' and company_id = '20000000-0000-4000-8000-000000000001')) $$,
  'owner can revoke a branch membership'
);
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","email":"branch-a@example.test","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::integer from public.branches where company_id = '20000000-0000-4000-8000-000000000001'), 0, 'revoked membership immediately loses branch access');
reset role;

select * from finish();
rollback;
