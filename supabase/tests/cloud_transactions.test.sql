begin;

create extension if not exists pgtap with schema extensions;
select plan(68);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values
  ('61000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cloud-owner-a@example.test', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Cloud Owner A"}'),
  ('61000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cloud-cashier-a@example.test', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Cloud Cashier A"}'),
  ('61000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cloud-manager-a@example.test', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Cloud Manager A"}'),
  ('61000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cloud-manager-a-restricted@example.test', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Cloud Restricted Manager A"}'),
  ('61000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cloud-owner-b@example.test', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Cloud Owner B"}')
on conflict (id) do nothing;

insert into public.companies (
  id, name, legal_name, country, currency, tax_rate, invoice_prefix, created_by
) values
  ('62000000-0000-4000-8000-000000000001', 'Cloud Company A', 'Cloud Company A LLC', 'AE', 'USD', 5, 'CA', '61000000-0000-4000-8000-000000000001'),
  ('62000000-0000-4000-8000-000000000002', 'Cloud Company B', 'Cloud Company B LLC', 'AE', 'USD', 5, 'CB', '61000000-0000-4000-8000-000000000005')
on conflict (id) do nothing;

insert into public.branches (id, company_id, name, is_default, created_by) values
  ('63000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001', 'Cloud A Main', true, '61000000-0000-4000-8000-000000000001'),
  ('63000000-0000-4000-8000-000000000002', '62000000-0000-4000-8000-000000000001', 'Cloud A Restricted', false, '61000000-0000-4000-8000-000000000001'),
  ('63000000-0000-4000-8000-000000000003', '62000000-0000-4000-8000-000000000002', 'Cloud B Main', true, '61000000-0000-4000-8000-000000000005')
on conflict (id) do nothing;

insert into public.company_memberships (company_id, user_id, role_id, branch_id, status, joined_at)
select fixture.company_id, fixture.user_id, roles.id, fixture.branch_id, 'active', now()
from (values
  ('62000000-0000-4000-8000-000000000001'::uuid, '61000000-0000-4000-8000-000000000001'::uuid, 'owner', null::uuid),
  ('62000000-0000-4000-8000-000000000001'::uuid, '61000000-0000-4000-8000-000000000002'::uuid, 'cashier', '63000000-0000-4000-8000-000000000001'::uuid),
  ('62000000-0000-4000-8000-000000000001'::uuid, '61000000-0000-4000-8000-000000000003'::uuid, 'manager', '63000000-0000-4000-8000-000000000001'::uuid),
  ('62000000-0000-4000-8000-000000000001'::uuid, '61000000-0000-4000-8000-000000000004'::uuid, 'manager', '63000000-0000-4000-8000-000000000002'::uuid),
  ('62000000-0000-4000-8000-000000000002'::uuid, '61000000-0000-4000-8000-000000000005'::uuid, 'owner', null::uuid)
) as fixture(company_id, user_id, role_key, branch_id)
join public.roles on roles.role_key = fixture.role_key
on conflict (company_id, user_id, branch_id) do nothing;

insert into public.warehouses (id, company_id, branch_id, name, is_default, created_by) values
  ('64000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000001', 'Cloud A Main Warehouse', true, '61000000-0000-4000-8000-000000000001'),
  ('64000000-0000-4000-8000-000000000002', '62000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000002', 'Cloud A Restricted Warehouse', true, '61000000-0000-4000-8000-000000000001'),
  ('64000000-0000-4000-8000-000000000003', '62000000-0000-4000-8000-000000000002', '63000000-0000-4000-8000-000000000003', 'Cloud B Main Warehouse', true, '61000000-0000-4000-8000-000000000005')
on conflict (id) do nothing;

insert into public.products (
  id, company_id, name, sku, barcode, purchase_price, selling_price,
  unit, vat_rate, created_by
) values
  ('65000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001', 'Cloud Product A', 'CLOUD-A', 'CLOUD-BAR-A', 2, 9, 'box', 5, '61000000-0000-4000-8000-000000000001'),
  ('65000000-0000-4000-8000-000000000002', '62000000-0000-4000-8000-000000000002', 'Cloud Product B', 'CLOUD-B', 'CLOUD-BAR-B', 1, 2, 'box', 5, '61000000-0000-4000-8000-000000000005'),
  ('65000000-0000-4000-8000-000000000003', '62000000-0000-4000-8000-000000000001', 'Cloud Rounding Product', 'CLOUD-C', 'CLOUD-BAR-C', 0.5, 1, 'piece', 5, '61000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into public.inventory_lots (
  id, company_id, product_id, branch_id, warehouse_id, batch, expiry,
  quantity, purchase_price, selling_price, created_by
) values
  ('66000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001', '65000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000001', 'CLOUD-FEFO-FIRST', '2099-01-01', 2, 1, 4, '61000000-0000-4000-8000-000000000001'),
  ('66000000-0000-4000-8000-000000000002', '62000000-0000-4000-8000-000000000001', '65000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000001', 'CLOUD-FEFO-NEXT', '2100-01-01', 2, 2, 8, '61000000-0000-4000-8000-000000000001'),
  ('66000000-0000-4000-8000-000000000003', '62000000-0000-4000-8000-000000000001', '65000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000001', 'CLOUD-EXPIRED', '2000-01-01', 50, 1, 1, '61000000-0000-4000-8000-000000000001'),
  ('66000000-0000-4000-8000-000000000004', '62000000-0000-4000-8000-000000000002', '65000000-0000-4000-8000-000000000002', '63000000-0000-4000-8000-000000000003', '64000000-0000-4000-8000-000000000003', 'CLOUD-B-LOT', '2099-01-01', 4, 1, 2, '61000000-0000-4000-8000-000000000005'),
  ('66000000-0000-4000-8000-000000000005', '62000000-0000-4000-8000-000000000001', '65000000-0000-4000-8000-000000000003', '63000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000001', 'CLOUD-ROUND-1', '2099-02-01', 1, 0.5, 1, '61000000-0000-4000-8000-000000000001'),
  ('66000000-0000-4000-8000-000000000006', '62000000-0000-4000-8000-000000000001', '65000000-0000-4000-8000-000000000003', '63000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000001', 'CLOUD-ROUND-2', '2099-02-01', 1, 0.5, 1, '61000000-0000-4000-8000-000000000001'),
  ('66000000-0000-4000-8000-000000000007', '62000000-0000-4000-8000-000000000001', '65000000-0000-4000-8000-000000000003', '63000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000001', 'CLOUD-ROUND-3', '2099-02-01', 1, 0.5, 1, '61000000-0000-4000-8000-000000000001'),
  ('66000000-0000-4000-8000-000000000008', '62000000-0000-4000-8000-000000000001', '65000000-0000-4000-8000-000000000003', '63000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000001', 'CLOUD-ROUND-4', '2099-02-01', 1, 0.5, 1, '61000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into public.cloud_suppliers (
  id, company_id, name, created_by
) values
  ('67000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001', 'Cloud Supplier A', '61000000-0000-4000-8000-000000000001'),
  ('67000000-0000-4000-8000-000000000002', '62000000-0000-4000-8000-000000000002', 'Cloud Supplier B', '61000000-0000-4000-8000-000000000005')
on conflict (id) do nothing;

select ok(not has_table_privilege('authenticated', 'public.cloud_sales', 'insert'), 'normal clients cannot insert cloud sales directly');
select ok(not has_table_privilege('authenticated', 'public.cloud_sales', 'update'), 'normal clients cannot edit cloud sales');
select ok(not has_table_privilege('authenticated', 'public.cloud_sale_payments', 'delete'), 'normal clients cannot delete payment history');
select ok(
  not has_column_privilege('authenticated', 'public.cloud_suppliers', 'company_id', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.cloud_suppliers', 'created_by', 'UPDATE'),
  'authenticated users cannot reassign supplier ownership fields'
);
select ok(
  not has_table_privilege('authenticated', 'public.cloud_purchase_sequences', 'select')
  and not has_table_privilege('authenticated', 'public.cloud_purchase_sequences', 'insert')
  and not has_table_privilege('authenticated', 'public.cloud_purchase_sequences', 'update')
  and not has_table_privilege('authenticated', 'public.cloud_purchase_sequences', 'delete'),
  'purchase number sequence has no direct client grants'
);

select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"61000000-0000-4000-8000-000000000001","email":"cloud-owner-a@example.test","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::integer from public.cloud_suppliers), 1, 'company owner reads only own-company suppliers');
select is((select count(*)::integer from public.cloud_suppliers where company_id = '62000000-0000-4000-8000-000000000002'), 0, 'supplier RLS blocks another company');
select is((select count(*)::integer from public.cloud_sales), 0, 'company owner begins with no cloud sales');

select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"61000000-0000-4000-8000-000000000003","email":"cloud-manager-a@example.test","role":"authenticated"}', true);
select lives_ok(
  $$ select public.create_cloud_purchase(
    '62000000-0000-4000-8000-000000000001',
    '63000000-0000-4000-8000-000000000001',
    '64000000-0000-4000-8000-000000000001',
    '67000000-0000-4000-8000-000000000001',
    'SUPPLIER-INV-1',
    '[{"product_id":"65000000-0000-4000-8000-000000000001","quantity":1.5,"unit_cost":2,"discount_amount":0.1}]',
    '68000000-0000-4000-8000-000000000001'
  ) $$,
  'authorized manager creates a cloud purchase order'
);
select set_config(
  'test.cloud_purchase_id',
  (select id::text from public.cloud_purchases where request_id = '68000000-0000-4000-8000-000000000001'),
  true
);
select is((select total from public.cloud_purchases where request_id = '68000000-0000-4000-8000-000000000001'), 3.05::numeric, 'purchase tax, discount, and total are calculated server-side');
select is((select count(*)::integer from public.inventory_lots where company_id = '62000000-0000-4000-8000-000000000001'), 7, 'creating a purchase order does not change stock');
select is(
  public.create_cloud_purchase(
    '62000000-0000-4000-8000-000000000001',
    '63000000-0000-4000-8000-000000000001',
    '64000000-0000-4000-8000-000000000001',
    '67000000-0000-4000-8000-000000000001',
    'SUPPLIER-INV-1',
    '[{"product_id":"65000000-0000-4000-8000-000000000001","quantity":1.5,"unit_cost":2,"discount_amount":0.1}]',
    '68000000-0000-4000-8000-000000000001'
  )->>'purchase_id',
  (select id::text from public.cloud_purchases where request_id = '68000000-0000-4000-8000-000000000001'),
  'repeated purchase request returns the existing order'
);
select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"61000000-0000-4000-8000-000000000004","email":"cloud-manager-a-restricted@example.test","role":"authenticated"}', true);
select lives_ok(
  $$ select public.create_cloud_purchase(
    '62000000-0000-4000-8000-000000000001',
    '63000000-0000-4000-8000-000000000002',
    '64000000-0000-4000-8000-000000000002',
    '67000000-0000-4000-8000-000000000001',
    'SUPPLIER-INV-BRANCH-2',
    '[{"product_id":"65000000-0000-4000-8000-000000000001","quantity":1,"unit_cost":2}]',
    '68000000-0000-4000-8000-000000000019'
  ) $$,
  'manager on a second branch can create a purchase order'
);
select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"61000000-0000-4000-8000-000000000001","email":"cloud-owner-a@example.test","role":"authenticated"}', true);
select is(
  (select count(distinct purchase_number)::integer from public.cloud_purchases
   where request_id in ('68000000-0000-4000-8000-000000000001', '68000000-0000-4000-8000-000000000019')),
  2,
  'purchase numbers are unique across company branches'
);
select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"61000000-0000-4000-8000-000000000003","email":"cloud-manager-a@example.test","role":"authenticated"}', true);
select throws_ok(
  $$ select public.create_cloud_purchase(
    '62000000-0000-4000-8000-000000000001',
    '63000000-0000-4000-8000-000000000001',
    '64000000-0000-4000-8000-000000000001',
    '67000000-0000-4000-8000-000000000001',
    'SUPPLIER-INV-1',
    '[{"product_id":"65000000-0000-4000-8000-000000000001","quantity":1.25,"unit_cost":2,"discount_amount":0.1}]',
    '68000000-0000-4000-8000-000000000001'
  ) $$,
  '22023', null, 'purchase request ID cannot be reused with changed values'
);
select throws_ok(
  $$ select public.create_cloud_purchase(
    '62000000-0000-4000-8000-000000000001',
    '63000000-0000-4000-8000-000000000002',
    '64000000-0000-4000-8000-000000000002',
    '67000000-0000-4000-8000-000000000001',
    '',
    '[{"product_id":"65000000-0000-4000-8000-000000000001","quantity":1,"unit_cost":2}]',
    '68000000-0000-4000-8000-000000000002'
  ) $$,
  '42501', null, 'branch manager cannot create a purchase in an unassigned branch'
);
select throws_ok(
  $$ select public.create_cloud_purchase(
    '62000000-0000-4000-8000-000000000002',
    '63000000-0000-4000-8000-000000000003',
    '64000000-0000-4000-8000-000000000003',
    '67000000-0000-4000-8000-000000000002',
    '',
    '[{"product_id":"65000000-0000-4000-8000-000000000002","quantity":1,"unit_cost":1}]',
    '68000000-0000-4000-8000-000000000003'
  ) $$,
  '42501', null, 'company manager cannot create a purchase for another company'
);
select is((select count(*)::integer from public.cloud_suppliers where company_id = '62000000-0000-4000-8000-000000000002'), 0, 'company manager cannot read another company supplier');

select lives_ok(
  $$ select public.receive_cloud_purchase_once(
    '62000000-0000-4000-8000-000000000001',
    current_setting('test.cloud_purchase_id')::uuid,
    jsonb_build_array(jsonb_build_object(
      'purchase_line_id', (select id from public.cloud_purchase_lines where purchase_id = (select id from public.cloud_purchases where request_id = '68000000-0000-4000-8000-000000000001')),
      'quantity', 0.75, 'unit_cost', 2.25, 'selling_price', 7,
      'batch', 'CLOUD-PO-FIRST', 'expiry', '2101-01-01'
    )),
    '68000000-0000-4000-8000-000000000004'
  ) $$,
  'authorized manager receives part of a purchase into a new lot'
);
select is(
  public.receive_cloud_purchase_once(
    '62000000-0000-4000-8000-000000000001',
    (select id from public.cloud_purchases where request_id = '68000000-0000-4000-8000-000000000001'),
    jsonb_build_array(jsonb_build_object(
      'purchase_line_id', (select id from public.cloud_purchase_lines where purchase_id = (select id from public.cloud_purchases where request_id = '68000000-0000-4000-8000-000000000001')),
      'quantity', 0.75, 'unit_cost', 2.25, 'selling_price', 7,
      'batch', 'CLOUD-PO-FIRST', 'expiry', '2101-01-01'
    )),
    '68000000-0000-4000-8000-000000000004'
  )->>'receipt_id',
  (select id::text from public.cloud_purchase_receipts where request_id = '68000000-0000-4000-8000-000000000004'),
  'repeated goods receipt request returns the original receipt'
);
select is((select count(*)::integer from public.cloud_purchase_receipts where request_id = '68000000-0000-4000-8000-000000000004'), 1, 'receipt retry creates no duplicate receipt');
select is(
  (select quantity || ':' || purchase_price || ':' || selling_price from public.inventory_lots where batch = 'CLOUD-PO-FIRST'),
  '0.750000:2.250000:7.000000',
  'received lot preserves fractional quantity and actual lot prices'
);
select is(
  (select (metadata->>'resulting_quantity')::numeric from public.inventory_movements where reason = 'Purchase received' and lot_id = (select id from public.inventory_lots where batch = 'CLOUD-PO-FIRST')),
  0.75::numeric,
  'purchase receipt movement records its resulting balance'
);
select is((select status from public.cloud_purchases where request_id = '68000000-0000-4000-8000-000000000001'), 'partially_received', 'partial delivery leaves the purchase open');
select throws_ok(
  $$ select public.receive_cloud_purchase_once(
    '62000000-0000-4000-8000-000000000001',
    current_setting('test.cloud_purchase_id')::uuid,
    jsonb_build_array(jsonb_build_object(
      'purchase_line_id', (select id from public.cloud_purchase_lines where purchase_id = (select id from public.cloud_purchases where request_id = '68000000-0000-4000-8000-000000000001')),
      'quantity', 0.76, 'unit_cost', 2.25, 'selling_price', 7,
      'batch', 'TOO-MUCH', 'expiry', '2101-01-01'
    )),
    '68000000-0000-4000-8000-000000000005'
  ) $$,
  '22023', null, 'over-receiving a purchase line is rejected'
);
select lives_ok(
  $$ select public.receive_cloud_purchase_once(
    '62000000-0000-4000-8000-000000000001',
    (select id from public.cloud_purchases where request_id = '68000000-0000-4000-8000-000000000001'),
    jsonb_build_array(jsonb_build_object(
      'purchase_line_id', (select id from public.cloud_purchase_lines where purchase_id = (select id from public.cloud_purchases where request_id = '68000000-0000-4000-8000-000000000001')),
      'quantity', 0.75, 'unit_cost', 2.25, 'selling_price', 7,
      'batch', 'CLOUD-PO-SECOND', 'expiry', '2102-01-01'
    )),
    '68000000-0000-4000-8000-000000000006'
  ) $$,
  'subsequent partial receipt completes the purchase'
);
select is((select status from public.cloud_purchases where request_id = '68000000-0000-4000-8000-000000000001'), 'received', 'purchase status changes when ordered quantities are fully received');
select is((select count(*)::integer from public.inventory_lots where batch in ('CLOUD-PO-FIRST', 'CLOUD-PO-SECOND')), 2, 'separate purchase receipts create separate lots');
select is((select sum(quantity) from public.inventory_lots where batch in ('CLOUD-PO-FIRST', 'CLOUD-PO-SECOND')), 1.5::numeric, 'fractional received quantities are preserved across lots');

select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"61000000-0000-4000-8000-000000000002","email":"cloud-cashier-a@example.test","role":"authenticated"}', true);
select throws_ok(
  $$ select public.receive_cloud_purchase_once(
    '62000000-0000-4000-8000-000000000001',
    current_setting('test.cloud_purchase_id')::uuid,
    jsonb_build_array(jsonb_build_object(
      'purchase_line_id', (select id from public.cloud_purchase_lines where purchase_id = (select id from public.cloud_purchases where request_id = '68000000-0000-4000-8000-000000000001')),
      'quantity', 0.1
    )),
    '68000000-0000-4000-8000-000000000007'
  ) $$,
  '42501', null, 'cashier cannot receive purchasing stock'
);
select throws_ok(
  $$ select public.checkout_cloud_sale_once(
    '62000000-0000-4000-8000-000000000001',
    '63000000-0000-4000-8000-000000000001',
    '64000000-0000-4000-8000-000000000001',
    '{}'::jsonb,
    '[{"product_id":"65000000-0000-4000-8000-000000000001","quantity":1}]',
    0.01,
    '[]'::jsonb,
    '68000000-0000-4000-8000-000000000008'
  ) $$,
  '42501', null, 'cashier cannot apply a finance-controlled discount'
);
select throws_ok(
  $$ select public.checkout_cloud_sale_once(
    '62000000-0000-4000-8000-000000000001',
    '63000000-0000-4000-8000-000000000002',
    '64000000-0000-4000-8000-000000000002',
    '{}'::jsonb,
    '[{"product_id":"65000000-0000-4000-8000-000000000001","quantity":1}]',
    0,
    '[]'::jsonb,
    '68000000-0000-4000-8000-000000000009'
  ) $$,
  '42501', null, 'cashier cannot create a sale in an unassigned branch'
);

select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"61000000-0000-4000-8000-000000000001","email":"cloud-owner-a@example.test","role":"authenticated"}', true);
select lives_ok(
  $$ select public.checkout_cloud_sale_once(
    '62000000-0000-4000-8000-000000000001',
    '63000000-0000-4000-8000-000000000001',
    '64000000-0000-4000-8000-000000000001',
    '{"name":"Test Customer","phone":"555-0100","email":"customer@example.test"}',
    '[{"product_id":"65000000-0000-4000-8000-000000000001","quantity":2.5}]',
    0.5,
    '[{"method":"cash","amount":6,"reference":"cash-ref"}]',
    '68000000-0000-4000-8000-000000000010'
  ) $$,
  'authorized checkout commits invoice, FEFO stock, movements, and payment'
);
select set_config(
  'test.cloud_sale_id',
  (select id::text from public.cloud_sales where request_id = '68000000-0000-4000-8000-000000000010'),
  true
);
select is((select subtotal from public.cloud_sales where request_id = '68000000-0000-4000-8000-000000000010'), 12::numeric, 'checkout prices the FEFO lots independently');
select is((select vat_total from public.cloud_sales where request_id = '68000000-0000-4000-8000-000000000010'), 0.57::numeric, 'checkout calculates VAT after allocating the discount');
select is((select total from public.cloud_sales where request_id = '68000000-0000-4000-8000-000000000010'), 12.07::numeric, 'invoice total includes discount and VAT');
select is((select amount_paid || ':' || payment_status from public.cloud_sales where request_id = '68000000-0000-4000-8000-000000000010'), '6.00:partial', 'partial tender is stored on the invoice');
select lives_ok(
  $$ select public.record_cloud_sale_payment_once(
    '62000000-0000-4000-8000-000000000001',
    current_setting('test.cloud_sale_id')::uuid,
    'card', 2, 'later-payment',
    '68000000-0000-4000-8000-000000000014'
  ) $$,
  'authorized owner records a follow-up payment'
);
select is(
  public.record_cloud_sale_payment_once(
    '62000000-0000-4000-8000-000000000001',
    current_setting('test.cloud_sale_id')::uuid,
    'card', 2, 'later-payment',
    '68000000-0000-4000-8000-000000000014'
  )->>'payment_id',
  (select id::text from public.cloud_sale_payments where request_id = '68000000-0000-4000-8000-000000000014'),
  'payment retry returns its original record'
);
select is((select amount_paid || ':' || payment_status from public.cloud_sales where id = current_setting('test.cloud_sale_id')::uuid), '8.00:partial', 'follow-up payment atomically updates the invoice balance');
select is((select count(*)::integer from public.cloud_sale_payments where sale_id = current_setting('test.cloud_sale_id')::uuid), 2, 'payment retry does not append a duplicate');
select throws_ok(
  $$ select public.record_cloud_sale_payment_once(
    '62000000-0000-4000-8000-000000000001',
    current_setting('test.cloud_sale_id')::uuid,
    'cash', 5, '',
    '68000000-0000-4000-8000-000000000016'
  ) $$,
  '23514', null, 'payment cannot exceed the remaining invoice balance'
);
select is((select invoice_number from public.cloud_sales where request_id = '68000000-0000-4000-8000-000000000010'), 'CA-00000001', 'invoice number uses the company sequence and prefix');
select is((select count(*)::integer from public.cloud_sale_lines where sale_id = (select id from public.cloud_sales where request_id = '68000000-0000-4000-8000-000000000010')), 2, 'FEFO allocation produces one immutable line per lot');
select is((select quantity from public.inventory_lots where id = '66000000-0000-4000-8000-000000000001'), 0::numeric, 'checkout exhausts the earliest eligible lot first');
select is((select quantity from public.inventory_lots where id = '66000000-0000-4000-8000-000000000002'), 1.5::numeric, 'checkout preserves the remaining fractional next-lot balance');
select is((select quantity from public.inventory_lots where id = '66000000-0000-4000-8000-000000000003'), 50::numeric, 'checkout never allocates expired stock');
select is((select count(*)::integer from public.inventory_movements where movement_type = 'SALE' and metadata->>'invoice_number' = 'CA-00000001'), 2, 'checkout appends a movement for every allocated lot');
select is(
  public.checkout_cloud_sale_once(
    '62000000-0000-4000-8000-000000000001',
    '63000000-0000-4000-8000-000000000001',
    '64000000-0000-4000-8000-000000000001',
    '{"name":"Test Customer","phone":"555-0100","email":"customer@example.test"}',
    '[{"product_id":"65000000-0000-4000-8000-000000000001","quantity":2.5}]',
    0.5,
    '[{"method":"cash","amount":6,"reference":"cash-ref"}]',
    '68000000-0000-4000-8000-000000000010'
  )->>'sale_id',
  (select id::text from public.cloud_sales where request_id = '68000000-0000-4000-8000-000000000010'),
  'sale retry returns the original invoice'
);
select is((select count(*)::integer from public.inventory_movements where movement_type = 'SALE' and metadata->>'invoice_number' = 'CA-00000001'), 2, 'sale retry does not duplicate stock movements');
select throws_ok(
  $$ select public.checkout_cloud_sale_once(
    '62000000-0000-4000-8000-000000000001',
    '63000000-0000-4000-8000-000000000001',
    '64000000-0000-4000-8000-000000000001',
    '{"name":"Test Customer","phone":"555-0100","email":"customer@example.test"}',
    '[{"product_id":"65000000-0000-4000-8000-000000000001","quantity":2.5}]',
    0,
    '[{"method":"cash","amount":6,"reference":"cash-ref"}]',
    '68000000-0000-4000-8000-000000000010'
  ) $$,
  '22023', null, 'sale request ID cannot be reused with changed values'
);
select throws_ok(
  $$ select public.checkout_cloud_sale_once(
    '62000000-0000-4000-8000-000000000001',
    '63000000-0000-4000-8000-000000000001',
    '64000000-0000-4000-8000-000000000001',
    '{}'::jsonb,
    '[{"product_id":"65000000-0000-4000-8000-000000000001","quantity":999}]',
    0,
    '[]'::jsonb,
    '68000000-0000-4000-8000-000000000011'
  ) $$,
  '23514', null, 'checkout rejects stock shortages'
);
select is((select count(*)::integer from public.cloud_sales where company_id = '62000000-0000-4000-8000-000000000001'), 1, 'failed checkout does not persist a partial invoice');
select lives_ok(
  $$ select public.checkout_cloud_sale_once(
    '62000000-0000-4000-8000-000000000001',
    '63000000-0000-4000-8000-000000000001',
    '64000000-0000-4000-8000-000000000001',
    '{"name":"Rounding Test"}'::jsonb,
    '[{"product_id":"65000000-0000-4000-8000-000000000003","quantity":4}]',
    0.02,
    '[]'::jsonb,
    '68000000-0000-4000-8000-000000000018'
  ) $$,
  'small discount succeeds across four equal FEFO lot allocations'
);
select is(
  (select sum(discount_amount) from public.cloud_sale_lines
   where sale_id = (select id from public.cloud_sales where request_id = '68000000-0000-4000-8000-000000000018')),
  0.02::numeric,
  'per-lot discount shares add up exactly to the invoice discount'
);
select ok(
  (select min(discount_amount) >= 0 from public.cloud_sale_lines
   where sale_id = (select id from public.cloud_sales where request_id = '68000000-0000-4000-8000-000000000018')),
  'per-lot discount shares are never negative'
);
select throws_ok(
  $$ select public.checkout_cloud_sale_once(
    '62000000-0000-4000-8000-000000000002',
    '63000000-0000-4000-8000-000000000003',
    '64000000-0000-4000-8000-000000000003',
    '{}'::jsonb,
    '[{"product_id":"65000000-0000-4000-8000-000000000002","quantity":1}]',
    0,
    '[]'::jsonb,
    '68000000-0000-4000-8000-000000000012'
  ) $$,
  '42501', null, 'company owner cannot create a sale for another tenant'
);

select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"61000000-0000-4000-8000-000000000002","email":"cloud-cashier-a@example.test","role":"authenticated"}', true);
select is((select count(*)::integer from public.cloud_sales where company_id = '62000000-0000-4000-8000-000000000001'), 2, 'cashier can view assigned-branch sales');
select lives_ok(
  $$ select public.record_cloud_sale_payment_once(
    '62000000-0000-4000-8000-000000000001',
    current_setting('test.cloud_sale_id')::uuid,
    'cash', 4.07, 'close-out',
    '68000000-0000-4000-8000-000000000015'
  ) $$,
  'cashier with branch sales permission collects the remaining balance'
);
select is((select payment_status from public.cloud_sales where id = current_setting('test.cloud_sale_id')::uuid), 'paid', 'final payment closes the invoice balance');
select throws_ok(
  $$ insert into public.cloud_sales (company_id, branch_id, warehouse_id, invoice_number, subtotal, discount_total, vat_total, total, amount_paid, payment_status, currency, request_id, request_payload, created_by)
     values ('62000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000001', 'DIRECT-1', 1, 0, 0, 1, 0, 'unpaid', 'USD', '68000000-0000-4000-8000-000000000013', '{}'::jsonb, auth.uid()) $$,
  '42501', null, 'cashier cannot create invoices by direct table insert'
);
select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"61000000-0000-4000-8000-000000000004","email":"cloud-manager-a-restricted@example.test","role":"authenticated"}', true);
select is((select count(*)::integer from public.cloud_sales where company_id = '62000000-0000-4000-8000-000000000001'), 0, 'branch-restricted manager cannot view another branch invoices');
select throws_ok(
  $$ select public.record_cloud_sale_payment_once(
    '62000000-0000-4000-8000-000000000001',
    current_setting('test.cloud_sale_id')::uuid,
    'cash', 0.01, '',
    '68000000-0000-4000-8000-000000000017'
  ) $$,
  '42501', null, 'branch-restricted manager cannot collect a payment for another branch'
);
select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claims', '{"sub":"61000000-0000-4000-8000-000000000005","email":"cloud-owner-b@example.test","role":"authenticated"}', true);
select is((select count(*)::integer from public.cloud_sales), 0, 'Company B cannot read Company A sales');
select is((select count(*)::integer from public.cloud_purchases), 0, 'Company B cannot read Company A purchases');
select is((select count(*)::integer from public.cloud_suppliers), 1, 'Company B supplier list contains only its own supplier');
select is((select count(*)::integer from public.inventory_movements where company_id = '62000000-0000-4000-8000-000000000001'), 0, 'Company B cannot read Company A movements');

reset role;
select throws_ok(
  $$ insert into public.cloud_purchase_lines (
       company_id, purchase_id, product_id, product_name, quantity_ordered,
       unit_cost, discount_amount, vat_rate, vat_amount, line_total
     ) values (
       '62000000-0000-4000-8000-000000000002',
       (select id from public.cloud_purchases where request_id = '68000000-0000-4000-8000-000000000001'),
       '65000000-0000-4000-8000-000000000002',
       'Cross-tenant line', 1, 1, 0, 0, 0, 1
     ) $$,
  '23503', null, 'composite foreign key prevents cross-company purchase lines'
);

select * from finish();
rollback;
