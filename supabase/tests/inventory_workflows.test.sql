begin;

create extension if not exists pgtap with schema extensions;
select plan(36);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values
  ('51000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'workflow-owner-a@example.test', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Workflow Owner A"}'),
  ('51000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'workflow-manager-a@example.test', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Workflow Manager A"}'),
  ('51000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'workflow-cashier-a@example.test', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Workflow Cashier A"}'),
  ('51000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'workflow-owner-b@example.test', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Workflow Owner B"}')
on conflict (id) do nothing;

insert into public.companies (id, name, legal_name, country, currency, created_by) values
  ('52000000-0000-4000-8000-000000000001', 'Workflow Company A', 'Workflow Company A LLC', 'AE', 'AED', '51000000-0000-4000-8000-000000000001'),
  ('52000000-0000-4000-8000-000000000002', 'Workflow Company B', 'Workflow Company B LLC', 'AE', 'AED', '51000000-0000-4000-8000-000000000004')
on conflict (id) do nothing;

insert into public.branches (id, company_id, name, is_default, created_by) values
  ('53000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 'Workflow A Main', true, '51000000-0000-4000-8000-000000000001'),
  ('53000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000001', 'Workflow A Restricted', false, '51000000-0000-4000-8000-000000000001'),
  ('53000000-0000-4000-8000-000000000003', '52000000-0000-4000-8000-000000000002', 'Workflow B Main', true, '51000000-0000-4000-8000-000000000004')
on conflict (id) do nothing;

insert into public.company_memberships (company_id, user_id, role_id, branch_id, status, joined_at)
select fixture.company_id, fixture.user_id, roles.id, fixture.branch_id, 'active', now()
from (values
  ('52000000-0000-4000-8000-000000000001'::uuid, '51000000-0000-4000-8000-000000000001'::uuid, 'owner', null::uuid),
  ('52000000-0000-4000-8000-000000000001'::uuid, '51000000-0000-4000-8000-000000000002'::uuid, 'inventory_manager', '53000000-0000-4000-8000-000000000001'::uuid),
  ('52000000-0000-4000-8000-000000000001'::uuid, '51000000-0000-4000-8000-000000000003'::uuid, 'cashier', '53000000-0000-4000-8000-000000000001'::uuid),
  ('52000000-0000-4000-8000-000000000002'::uuid, '51000000-0000-4000-8000-000000000004'::uuid, 'owner', null::uuid)
) as fixture(company_id, user_id, role_key, branch_id)
join public.roles on roles.role_key = fixture.role_key
on conflict (company_id, user_id, branch_id) do nothing;

insert into public.warehouses (id, company_id, branch_id, name, is_default, created_by) values
  ('54000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000001', 'Workflow A Main Warehouse', true, '51000000-0000-4000-8000-000000000001'),
  ('54000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000002', 'Workflow A Restricted Warehouse', true, '51000000-0000-4000-8000-000000000001'),
  ('54000000-0000-4000-8000-000000000003', '52000000-0000-4000-8000-000000000002', '53000000-0000-4000-8000-000000000003', 'Workflow B Main Warehouse', true, '51000000-0000-4000-8000-000000000004')
on conflict (id) do nothing;

insert into public.products (
  id, company_id, name, sku, barcode, purchase_price, selling_price, unit, created_by
) values
  ('55000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 'Workflow Product A', 'WF-A', 'WF-BAR-A', 2, 3, 'each', '51000000-0000-4000-8000-000000000001'),
  ('55000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000002', 'Workflow Product B', 'WF-B', 'WF-BAR-B', 2, 3, 'each', '51000000-0000-4000-8000-000000000004')
on conflict (id) do nothing;

insert into public.inventory_lots (
  id, company_id, product_id, branch_id, warehouse_id, batch, quantity, purchase_price, created_by
) values
  ('56000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000001', '54000000-0000-4000-8000-000000000001', 'WF-A-LOT', 10, 2, '51000000-0000-4000-8000-000000000001'),
  ('56000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000002', '54000000-0000-4000-8000-000000000002', 'WF-A-RESTRICTED-LOT', 7, 2, '51000000-0000-4000-8000-000000000001'),
  ('56000000-0000-4000-8000-000000000003', '52000000-0000-4000-8000-000000000002', '55000000-0000-4000-8000-000000000002', '53000000-0000-4000-8000-000000000003', '54000000-0000-4000-8000-000000000003', 'WF-B-LOT', 4, 2, '51000000-0000-4000-8000-000000000004')
on conflict (id) do nothing;

select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"51000000-0000-4000-8000-000000000001","email":"workflow-owner-a@example.test","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select count(*)::integer from public.list_company_members('52000000-0000-4000-8000-000000000001')),
  3,
  'company owner can list only the company memberships'
);
select is(
  (select email from public.list_company_members('52000000-0000-4000-8000-000000000001')
   where user_id = '51000000-0000-4000-8000-000000000002'),
  'workflow-manager-a@example.test',
  'company member directory returns the account email'
);
select throws_ok(
  $$ select * from public.list_company_members('52000000-0000-4000-8000-000000000002') $$,
  '42501', 'Not authorized to view company members.',
  'company owner cannot list another company members'
);
select is((select count(*)::integer from public.products), 1, 'company owner reads only own-company products');
select throws_ok(
  $$ insert into public.products (company_id, name, created_by)
     values ('52000000-0000-4000-8000-000000000002', 'Cross-company product', auth.uid()) $$,
  '42501', null, 'company owner cannot insert into another company'
);
select lives_ok(
  $$ insert into public.products (company_id, name, description, sku, barcode, unit, created_by)
     values ('52000000-0000-4000-8000-000000000001', 'Workflow Product Created', 'Company catalog item', 'WF-NEW', 'WF-BAR-NEW', 'each', auth.uid()) $$,
  'authorized company owner can create a product'
);
select lives_ok(
  $$ update public.products set description = 'Updated detail', is_active = false
     where id = '55000000-0000-4000-8000-000000000001' $$,
  'authorized product edits and archive use company policy'
);
select is((select is_active from public.products where id = '55000000-0000-4000-8000-000000000001'), false, 'product archive state is persisted')
  ;
select lives_ok(
  $$ update public.products set is_active = true
     where id = '55000000-0000-4000-8000-000000000001' $$,
  'authorized company owner can reactivate an archived product'
);
select is((select is_active from public.products where id = '55000000-0000-4000-8000-000000000001'), true, 'product reactivation is persisted')
  ;

select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"51000000-0000-4000-8000-000000000002","email":"workflow-manager-a@example.test","role":"authenticated"}', true);
select is((select count(*)::integer from public.warehouses where company_id = '52000000-0000-4000-8000-000000000001'), 1, 'branch manager sees only assigned-branch warehouses')
  ;
select is((select count(*)::integer from public.inventory_lots where company_id = '52000000-0000-4000-8000-000000000001'), 1, 'branch manager sees only assigned-branch lots')
  ;
select is((select count(*)::integer from public.inventory_movements where company_id = '52000000-0000-4000-8000-000000000001'), 0, 'branch manager sees no movements from an unassigned branch')
  ;
select ok(not has_table_privilege('authenticated', 'public.inventory_movements', 'insert'), 'normal authenticated client cannot insert movement rows directly');
select throws_ok(
  $$ select public.receive_inventory_lot(
       '52000000-0000-4000-8000-000000000001',
       '55000000-0000-4000-8000-000000000001',
       '53000000-0000-4000-8000-000000000002',
       '54000000-0000-4000-8000-000000000002',
       'UNAUTHORIZED-BRANCH',
       null,
       1,
       1
     ) $$,
  '42501', null, 'branch manager cannot receive stock in an unassigned branch'
);
select lives_ok(
  $$ select public.receive_inventory_lot_once(
       '52000000-0000-4000-8000-000000000001',
       '55000000-0000-4000-8000-000000000001',
       '53000000-0000-4000-8000-000000000001',
       '54000000-0000-4000-8000-000000000001',
       'WF-RECEIPT-1',
       '2027-12-31',
       2.75,
       1.25,
       3.50,
       'Fractional receipt',
       '57000000-0000-4000-8000-000000000001'
     ) $$,
  'authorized fractional stock receiving succeeds'
);
select is(
  public.receive_inventory_lot_once(
    '52000000-0000-4000-8000-000000000001',
    '55000000-0000-4000-8000-000000000001',
    '53000000-0000-4000-8000-000000000001',
    '54000000-0000-4000-8000-000000000001',
    'WF-RECEIPT-1',
    '2027-12-31',
    2.75,
    1.25,
    3.50,
    'Fractional receipt',
    '57000000-0000-4000-8000-000000000001'
  ),
  (select id from public.inventory_lots where batch = 'WF-RECEIPT-1'),
  'repeated receipt request returns the original lot'
);
select is((select count(*)::integer from public.inventory_movements where request_id = '57000000-0000-4000-8000-000000000001'), 1, 'repeated receipt request does not append another movement')
  ;
select throws_ok(
  $$ select public.receive_inventory_lot_once(
       '52000000-0000-4000-8000-000000000001',
       '55000000-0000-4000-8000-000000000001',
       '53000000-0000-4000-8000-000000000001',
       '54000000-0000-4000-8000-000000000001',
       'WF-RECEIPT-1',
       '2027-12-31',
       3,
       1.25,
       3.50,
       'Fractional receipt',
       '57000000-0000-4000-8000-000000000001'
     ) $$,
  '22023', null, 'receipt request identifier cannot be reused with changed values'
);
select is((select quantity from public.inventory_lots where batch = 'WF-RECEIPT-1'), 2.75::numeric, 'fractional receipt quantity is preserved')
  ;
select is((select movement_type from public.inventory_movements where reason = 'Fractional receipt'), 'RECEIPT', 'stock receiving creates a receipt ledger entry')
  ;
select is((select (metadata->>'previous_quantity')::numeric from public.inventory_movements where reason = 'Fractional receipt'), 0::numeric, 'receipt stores its previous balance')
  ;
select is((select (metadata->>'resulting_quantity')::numeric from public.inventory_movements where reason = 'Fractional receipt'), 2.75::numeric, 'receipt stores its resulting balance')
  ;
select lives_ok(
  $$ select public.record_inventory_movement_once(
       '52000000-0000-4000-8000-000000000001',
       (select id from public.inventory_lots where batch = 'WF-RECEIPT-1'),
       -0.5,
       'Cycle count',
       '{}'::jsonb,
       '57000000-0000-4000-8000-000000000002'
     ) $$,
  'authorized stock adjustment succeeds through the stock RPC'
);
select is((select quantity from public.inventory_lots where batch = 'WF-RECEIPT-1'), 2.25::numeric, 'adjustment atomically changes fractional lot balance')
  ;
select is(
  public.record_inventory_movement_once(
    '52000000-0000-4000-8000-000000000001',
    (select id from public.inventory_lots where batch = 'WF-RECEIPT-1'),
    -0.5,
    'Cycle count',
    '{}'::jsonb,
    '57000000-0000-4000-8000-000000000002'
  ),
  (select id from public.inventory_movements where reason = 'Cycle count'),
  'repeated adjustment request returns its original movement'
);
select is((select quantity from public.inventory_lots where batch = 'WF-RECEIPT-1'), 2.25::numeric, 'repeated adjustment request does not apply the delta twice')
  ;
select throws_ok(
  $$ select public.record_inventory_movement_once(
       '52000000-0000-4000-8000-000000000001',
       (select id from public.inventory_lots where batch = 'WF-RECEIPT-1'),
       -0.25,
       'Cycle count',
       '{}'::jsonb,
       '57000000-0000-4000-8000-000000000002'
     ) $$,
  '22023', null, 'adjustment request identifier cannot be reused with changed values'
);
select is((select (metadata->>'previous_quantity')::numeric from public.inventory_movements where reason = 'Cycle count'), 2.75::numeric, 'adjustment records previous balance')
  ;
select throws_ok(
  $$ select public.record_inventory_movement(
       '52000000-0000-4000-8000-000000000001',
       (select id from public.inventory_lots where batch = 'WF-RECEIPT-1'),
       'ADJUSTMENT',
       -10,
       'Invalid negative stock',
       '{}'::jsonb
     ) $$,
  '23514', null, 'adjustment cannot create negative stock'
);
select is((select quantity from public.inventory_lots where batch = 'WF-RECEIPT-1'), 2.25::numeric, 'rejected adjustment leaves the lot balance unchanged')
  ;

select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"51000000-0000-4000-8000-000000000003","email":"workflow-cashier-a@example.test","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.list_company_members('52000000-0000-4000-8000-000000000001') $$,
  '42501', 'Not authorized to view company members.',
  'company member without manage-members permission cannot list colleagues'
);
select throws_ok(
  $$ select public.record_inventory_movement_once(
       '52000000-0000-4000-8000-000000000001',
       (select id from public.inventory_lots where batch = 'WF-RECEIPT-1'),
       -0.5,
       'Cycle count',
       '{}'::jsonb,
       '57000000-0000-4000-8000-000000000002'
     ) $$,
  '42501', null, 'idempotent adjustment retry rechecks active inventory permission'
);
select throws_ok(
  $$ select public.record_inventory_movement(
       '52000000-0000-4000-8000-000000000001',
       '56000000-0000-4000-8000-000000000001',
       'ADJUSTMENT',
       1,
       'Unauthorized cashier',
       '{}'::jsonb
     ) $$,
  '42501', null, 'cashier cannot mutate stock without inventory permission'
);

select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"51000000-0000-4000-8000-000000000002","email":"workflow-manager-a@example.test","role":"authenticated"}', true);
select lives_ok(
  $$ select public.set_default_inventory_warehouse('52000000-0000-4000-8000-000000000001', '54000000-0000-4000-8000-000000000001') $$,
  'branch manager can set a default warehouse for their assigned branch'
);
select is((select count(*)::integer from public.warehouses where company_id = '52000000-0000-4000-8000-000000000001' and branch_id = '53000000-0000-4000-8000-000000000001' and is_default), 1, 'default warehouse remains unique within its branch')
  ;

reset role;
rollback;
