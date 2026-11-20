-- Tenant-scoped catalog, product conversion, barcode and price-history tests.
begin;

create extension if not exists pgtap with schema extensions;
select plan(27);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values
  ('61000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'catalog-owner-a@example.test', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Catalog Owner A"}'),
  ('61000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'catalog-owner-b@example.test', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Catalog Owner B"}')
on conflict (id) do nothing;

insert into public.companies (id, name, legal_name, country, currency, created_by) values
  ('62000000-0000-4000-8000-000000000001', 'Catalog Company A', 'Catalog Company A LLC', 'AE', 'AED', '61000000-0000-4000-8000-000000000001'),
  ('62000000-0000-4000-8000-000000000002', 'Catalog Company B', 'Catalog Company B LLC', 'AE', 'AED', '61000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.branches (id, company_id, name, is_default, created_by) values
  ('63000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001', 'Catalog A Main', true, '61000000-0000-4000-8000-000000000001'),
  ('63000000-0000-4000-8000-000000000002', '62000000-0000-4000-8000-000000000002', 'Catalog B Main', true, '61000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.company_memberships (company_id, user_id, role_id, branch_id, status, joined_at)
select fixture.company_id, fixture.user_id, roles.id, null, 'active', now()
from (values
  ('62000000-0000-4000-8000-000000000001'::uuid, '61000000-0000-4000-8000-000000000001'::uuid, 'owner'),
  ('62000000-0000-4000-8000-000000000002'::uuid, '61000000-0000-4000-8000-000000000002'::uuid, 'owner')
) as fixture(company_id, user_id, role_key)
join public.roles on roles.role_key = fixture.role_key
on conflict (company_id, user_id, branch_id) do nothing;

insert into public.products (
  id, company_id, name, category, sku, barcode, purchase_price,
  selling_price, unit, created_by
) values
  ('64000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001',
   'Catalog Product A', 'OTC', 'CAT-A', '000123', 1.25, 2.50, 'tablet',
   '61000000-0000-4000-8000-000000000001'),
  ('64000000-0000-4000-8000-000000000002', '62000000-0000-4000-8000-000000000002',
   'Catalog Product B', 'OTC', 'CAT-B', '000456', 1.25, 2.50, 'tablet',
   '61000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

-- A known unit in company B verifies compound-tenant foreign keys.
insert into public.units_of_measure (
  id, company_id, code, name, symbol, dimension, created_by
) values (
  '65000000-0000-4000-8000-000000000002',
  '62000000-0000-4000-8000-000000000002',
  'case', 'Case', 'cs', 'count',
  '61000000-0000-4000-8000-000000000002'
) on conflict (id) do nothing;

select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"61000000-0000-4000-8000-000000000001","email":"catalog-owner-a@example.test","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::integer from public.product_categories), 1, 'company A sees its backfilled category only');
select is((select count(*)::integer from public.units_of_measure), 1, 'company A sees its backfilled unit only');
select is((select count(*)::integer from public.product_packagings), 1, 'legacy product receives one base packaging');
select is((select count(*)::integer from public.product_barcodes), 1, 'legacy product barcode is migrated');
select is((select count(*)::integer from public.product_prices), 2, 'legacy purchase and retail prices are migrated');
select is((select barcode_value from public.product_barcodes limit 1), '000123', 'barcode leading zeroes are preserved');
select is((select base_quantity from public.product_packagings limit 1), 1::numeric, 'legacy packaging has a factor of one');
select throws_ok(
  $test$ update public.product_packagings set is_active = false where is_base $test$,
  '22023',
  'The base packaging cannot be archived.',
  'the product base packaging cannot be archived'
);
select throws_ok(
  $test$ update public.products set unit = 'box'
     where id = '64000000-0000-4000-8000-000000000001' $test$,
  '22023',
  'A product base unit cannot be changed after creation. Create a new product or use a reviewed stock conversion workflow.',
  'base unit cannot be changed without a reviewed stock conversion'
);
select is((select count(*)::integer from public.product_categories where company_id = '62000000-0000-4000-8000-000000000002'), 0, 'company A cannot see company B catalog rows');

select lives_ok(
  $$ insert into public.product_categories (company_id, name, code, created_by)
     values ('62000000-0000-4000-8000-000000000001', 'Medicines', 'medicines', auth.uid()) $$,
  'catalog manager can add a company category'
);
select lives_ok(
  $$ insert into public.units_of_measure (company_id, code, name, symbol, dimension, created_by)
     values ('62000000-0000-4000-8000-000000000001', 'strip', 'Strip', 'strip', 'count', auth.uid()) $$,
  'catalog manager can add a product unit'
);
select lives_ok(
  $$ insert into public.product_packagings (
       company_id, product_id, unit_id, name, base_quantity, created_by
     )
     select '62000000-0000-4000-8000-000000000001',
            '64000000-0000-4000-8000-000000000001',
            id, 'Strip of 10', 10, auth.uid()
     from public.units_of_measure
     where company_id = '62000000-0000-4000-8000-000000000001'
       and code = 'strip' $$,
  'catalog manager can add a product-specific packaging conversion'
);
select is(
  (select base_quantity from public.product_packagings where name = 'Strip of 10'),
  10::numeric,
  'packaging conversion factor is stored on the product packaging'
);

select lives_ok(
  $test$ insert into public.product_barcodes (
       company_id, product_id, packaging_id, barcode_value, symbology, barcode_kind, created_by
     )
     select '62000000-0000-4000-8000-000000000001',
            '64000000-0000-4000-8000-000000000001',
            id, '0000001234567', 'EAN13', 'manufacturer_gtin', auth.uid()
     from public.product_packagings where name = 'Strip of 10' $test$,
  'catalog manager can attach a manufacturer barcode to a packaging level'
);
select throws_ok(
  $test$ update public.product_packagings set base_quantity = 20 where name = 'Strip of 10' $test$,
  '22023',
  'Packaging conversion is already referenced by a barcode or price. Archive it and create a new packaging level instead.',
  'a referenced packaging conversion cannot be silently changed'
);
select is(
  (select barcode_value from public.product_barcodes where barcode_value = '0000001234567'),
  '0000001234567',
  'packaging barcode leading zeroes are preserved'
);
select lives_ok(
  $test$ select public.set_product_price(
       '62000000-0000-4000-8000-000000000001',
       '64000000-0000-4000-8000-000000000001',
       (select id from public.product_packagings where name = 'Strip of 10'),
       'retail', 'AED', 12.50, false, null
     ) $test$,
  'catalog manager can set a package-specific retail price atomically'
);
select lives_ok(
  $test$ select public.set_product_price(
       '62000000-0000-4000-8000-000000000001',
       '64000000-0000-4000-8000-000000000001',
       (select id from public.product_packagings where name = 'Strip of 10'),
       'retail', 'AED', 13.75, true, null
     ) $test$,
  'catalog manager can revise a package-specific retail price atomically'
);
select is(
  (select count(*)::integer from public.product_prices
   where packaging_id = (select id from public.product_packagings where name = 'Strip of 10')
     and is_active),
  1,
  'package-specific price is active before archival'
);
select is(
  (select count(*)::integer from public.product_prices
   where packaging_id = (select id from public.product_packagings where name = 'Strip of 10')),
  2,
  'price revisions retain the previous price as history'
);
select lives_ok(
  $test$ update public.product_packagings set is_active = false where name = 'Strip of 10' $test$,
  'catalog manager can archive an unused or discontinued packaging level'
);
select is(
  (select is_active from public.product_barcodes where barcode_value = '0000001234567'),
  false,
  'archiving packaging automatically archives its barcodes'
);
select is(
  (select is_active from public.product_prices
   where packaging_id = (select id from public.product_packagings where name = 'Strip of 10')),
  false,
  'archiving packaging automatically closes its prices'
);
select is(
  (select is_active from public.product_packagings where name = 'Strip of 10'),
  false,
  'archived packaging remains in history'
);
select throws_ok(
  $$ insert into public.product_barcodes (
       company_id, product_id, packaging_id, barcode_value, symbology, barcode_kind, created_by
     )
     select '62000000-0000-4000-8000-000000000001',
            '64000000-0000-4000-8000-000000000001',
            id, '000123', 'OTHER', 'other', auth.uid()
     from public.product_packagings where is_base $$,
  '23505', null,
  'a barcode value cannot be duplicated within one company'
);
select throws_ok(
  $$ insert into public.product_packagings (
       company_id, product_id, unit_id, name, base_quantity, created_by
     ) values (
       '62000000-0000-4000-8000-000000000001',
       '64000000-0000-4000-8000-000000000001',
       '65000000-0000-4000-8000-000000000002',
       'Foreign unit package', 12, auth.uid()
     ) $$,
  '23503', null,
  'a product cannot use a unit owned by another company'
);

reset role;
rollback;
