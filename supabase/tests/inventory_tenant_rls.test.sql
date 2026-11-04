begin;

create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values
  ('41000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inventory-owner-a@example.test', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Inventory Owner A"}'),
  ('41000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inventory-manager-a@example.test', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Inventory Manager A"}'),
  ('41000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inventory-cashier-a@example.test', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Inventory Cashier A"}'),
  ('41000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inventory-owner-b@example.test', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Inventory Owner B"}')
on conflict (id) do nothing;

insert into public.companies (
  id, name, legal_name, country, currency, created_by
) values
  ('42000000-0000-4000-8000-000000000001', 'Inventory Company A', 'Inventory Company A LLC', 'AE', 'AED', '41000000-0000-4000-8000-000000000001'),
  ('42000000-0000-4000-8000-000000000002', 'Inventory Company B', 'Inventory Company B LLC', 'AE', 'AED', '41000000-0000-4000-8000-000000000004')
on conflict (id) do nothing;

insert into public.branches (id, company_id, name, is_default, created_by) values
  ('43000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000001', 'A Main', true, '41000000-0000-4000-8000-000000000001'),
  ('43000000-0000-4000-8000-000000000002', '42000000-0000-4000-8000-000000000001', 'A Second', false, '41000000-0000-4000-8000-000000000001'),
  ('43000000-0000-4000-8000-000000000003', '42000000-0000-4000-8000-000000000002', 'B Main', true, '41000000-0000-4000-8000-000000000004')
on conflict (id) do nothing;

insert into public.company_memberships (company_id, user_id, role_id, branch_id, status, joined_at)
select fixture.company_id, fixture.user_id, roles.id, fixture.branch_id, 'active', now()
from (values
  ('42000000-0000-4000-8000-000000000001'::uuid, '41000000-0000-4000-8000-000000000001'::uuid, 'owner', null::uuid),
  ('42000000-0000-4000-8000-000000000001'::uuid, '41000000-0000-4000-8000-000000000002'::uuid, 'inventory_manager', '43000000-0000-4000-8000-000000000001'::uuid),
  ('42000000-0000-4000-8000-000000000001'::uuid, '41000000-0000-4000-8000-000000000003'::uuid, 'cashier', null::uuid),
  ('42000000-0000-4000-8000-000000000002'::uuid, '41000000-0000-4000-8000-000000000004'::uuid, 'owner', null::uuid)
) as fixture(company_id, user_id, role_key, branch_id)
join public.roles on roles.role_key = fixture.role_key
on conflict (company_id, user_id, branch_id) do nothing;

insert into public.warehouses (
  id, company_id, branch_id, name, is_default, created_by
) values
  ('44000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000001', 'A Main Warehouse', true, '41000000-0000-4000-8000-000000000001'),
  ('44000000-0000-4000-8000-000000000002', '42000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000002', 'A Second Warehouse', true, '41000000-0000-4000-8000-000000000001'),
  ('44000000-0000-4000-8000-000000000003', '42000000-0000-4000-8000-000000000002', '43000000-0000-4000-8000-000000000003', 'B Main Warehouse', true, '41000000-0000-4000-8000-000000000004')
on conflict (id) do nothing;

insert into public.products (
  id, company_id, name, sku, barcode, purchase_price, selling_price, unit, created_by
) values
  ('45000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000001', 'Company A Product', 'A-1', 'A-BAR-1', 2, 3, 'each', '41000000-0000-4000-8000-000000000001'),
  ('45000000-0000-4000-8000-000000000002', '42000000-0000-4000-8000-000000000002', 'Company B Product', 'B-1', 'B-BAR-1', 2, 3, 'each', '41000000-0000-4000-8000-000000000004')
on conflict (id) do nothing;

insert into public.inventory_lots (
  id, company_id, product_id, branch_id, warehouse_id, batch, quantity, purchase_price, created_by
) values
  ('46000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000001', '45000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000001', '44000000-0000-4000-8000-000000000001', 'A-LOT-1', 12.5, 2, '41000000-0000-4000-8000-000000000001'),
  ('46000000-0000-4000-8000-000000000002', '42000000-0000-4000-8000-000000000001', '45000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000002', '44000000-0000-4000-8000-000000000002', 'A-LOT-2', 4, 2, '41000000-0000-4000-8000-000000000001'),
  ('46000000-0000-4000-8000-000000000003', '42000000-0000-4000-8000-000000000002', '45000000-0000-4000-8000-000000000002', '43000000-0000-4000-8000-000000000003', '44000000-0000-4000-8000-000000000003', 'B-LOT-1', 9, 2, '41000000-0000-4000-8000-000000000004')
on conflict (id) do nothing;

select ok(
  not has_table_privilege('anon', 'public.inventory_lots', 'select'),
  'anonymous role has no direct inventory table access'
);

select set_config('request.jwt.claim.sub', '41000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"41000000-0000-4000-8000-000000000001","email":"inventory-owner-a@example.test","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::integer from public.products), 1, 'company A sees only its product');
select is((select count(*)::integer from public.products where id = '45000000-0000-4000-8000-000000000002'), 0, 'company A cannot select company B product');
select is((select count(*)::integer from public.inventory_lots), 2, 'company A sees only its lots');
select is((select count(*)::integer from public.warehouses where company_id = '42000000-0000-4000-8000-000000000002'), 0, 'company A cannot select company B warehouse');
select throws_ok(
  $$ insert into public.inventory_lots (
    company_id, product_id, batch, created_by
  ) values (
    '42000000-0000-4000-8000-000000000001',
    '45000000-0000-4000-8000-000000000002',
    'CROSS-COMPANY', auth.uid()
  ) $$,
  '23503',
  null,
  'company-scoped product foreign key rejects cross-company lot inserts'
);
select throws_ok(
  $$ insert into public.warehouses (
    company_id, branch_id, name, created_by
  ) values (
    '42000000-0000-4000-8000-000000000001',
    '43000000-0000-4000-8000-000000000003',
    'Cross-company warehouse', auth.uid()
  ) $$,
  '23503',
  null,
  'warehouse branch foreign key rejects cross-company relationships'
);
with changed as (
  update public.products set name = 'Cross-company update'
  where id = '45000000-0000-4000-8000-000000000002' returning 1
) select is((select count(*)::integer from changed), 0, 'company A cannot update company B products');
with removed as (
  delete from public.products where id = '45000000-0000-4000-8000-000000000002' returning 1
) select is((select count(*)::integer from removed), 0, 'company A cannot delete company B products');
select throws_ok(
  $$ update public.products
  set company_id = '42000000-0000-4000-8000-000000000002'
  where id = '45000000-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'product tenant ownership cannot be changed through the client'
);
select throws_ok(
  $$ update public.warehouses
  set branch_id = '43000000-0000-4000-8000-000000000003'
  where id = '44000000-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'warehouse tenant and branch ownership cannot be changed through the client'
);
select throws_ok(
  $$ insert into public.products (company_id, name, created_by)
  values ('42000000-0000-4000-8000-000000000002', 'Forged company B product', auth.uid()) $$,
  '42501',
  null,
  'company A cannot insert a product for company B'
);
select throws_ok(
  $$ insert into public.inventory_movements (
    company_id, product_id, lot_id, movement_type, quantity, created_by
  ) values (
    '42000000-0000-4000-8000-000000000001',
    '45000000-0000-4000-8000-000000000002',
    '46000000-0000-4000-8000-000000000003',
    'ADJUSTMENT', 1, auth.uid()
  ) $$,
  '42501',
  null,
  'direct movement inserts are denied so stock changes must use the atomic RPC'
);
select lives_ok(
  $$ select public.record_inventory_movement(
    '42000000-0000-4000-8000-000000000001',
    '46000000-0000-4000-8000-000000000001',
    'ADJUSTMENT', 1.25, 'Tenant test', '{}'::jsonb
  ) $$,
  'authorized inventory manager can atomically record decimal stock and movement'
);
select is(
  (select count(*)::integer from public.inventory_movements
   where lot_id = '46000000-0000-4000-8000-000000000001'
     and movement_type = 'ADJUSTMENT' and quantity = 1.25),
  1,
  'successful stock update and its movement are committed together'
);
select throws_ok(
  $$ update public.inventory_movements set reason = 'edited' $$,
  '42501',
  null,
  'authenticated users cannot update append-only inventory movements'
);
select throws_ok(
  $$ delete from public.inventory_movements $$,
  '42501',
  null,
  'authenticated users cannot delete inventory movement history'
);
reset role;

select set_config('request.jwt.claim.sub', '41000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"41000000-0000-4000-8000-000000000002","email":"inventory-manager-a@example.test","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::integer from public.inventory_lots), 1, 'branch manager sees only lots assigned to its branch');
select is((select count(*)::integer from public.warehouses), 1, 'branch manager sees only its branch warehouse');
select lives_ok(
  $$ select public.create_inventory_lot_with_opening_stock(
    '42000000-0000-4000-8000-000000000001',
    '45000000-0000-4000-8000-000000000001',
    '43000000-0000-4000-8000-000000000001',
    '44000000-0000-4000-8000-000000000001',
    null, 'BRANCH-OK', null, 0.5, 1
  ) $$,
  'branch inventory manager can atomically create an opening lot and movement'
);
select throws_ok(
  $$ select public.create_inventory_lot_with_opening_stock(
    '42000000-0000-4000-8000-000000000001',
    '45000000-0000-4000-8000-000000000001',
    '43000000-0000-4000-8000-000000000002',
    '44000000-0000-4000-8000-000000000002',
    null, 'BRANCH-FORBIDDEN', null, 1, 1
  ) $$,
  '42501',
  null,
  'branch inventory manager cannot write a lot into another branch'
);
select throws_ok(
  $$ select public.record_inventory_movement(
    '42000000-0000-4000-8000-000000000001',
    '46000000-0000-4000-8000-000000000001',
    'SALE', -20, 'Oversell test', '{}'::jsonb
  ) $$,
  '23514',
  null,
  'inventory RPC rejects movements that would make stock negative'
);
select throws_ok(
  $$ insert into public.inventory_lots (
    company_id, product_id, batch, quantity, purchase_price, created_by
  ) values (
    '42000000-0000-4000-8000-000000000001',
    '45000000-0000-4000-8000-000000000001',
    'DIRECT-STOCK', 10, 1, auth.uid()
  ) $$,
  '42501',
  null,
  'direct lot inserts cannot bypass the opening movement RPC'
);
reset role;

select set_config('request.jwt.claim.sub', '41000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"41000000-0000-4000-8000-000000000003","email":"inventory-cashier-a@example.test","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$ select public.record_inventory_movement(
    '42000000-0000-4000-8000-000000000001',
    '46000000-0000-4000-8000-000000000001',
    'ADJUSTMENT', 1, 'Unauthorized test', '{}'::jsonb
  ) $$,
  '42501',
  null,
  'cashier cannot change inventory through the security-definer RPC'
);
select throws_ok(
  $$ insert into public.products (company_id, name, created_by)
  values ('42000000-0000-4000-8000-000000000001', 'Cashier-forbidden product', auth.uid()) $$,
  '42501',
  null,
  'cashier cannot create products without inventory permission'
);
select throws_ok(
  $$ update public.inventory_lots set quantity = 999
  where id = '46000000-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'cashier cannot update inventory quantities'
);
reset role;

select * from finish();
rollback;
