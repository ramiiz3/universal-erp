-- Universal ERP: READ-ONLY live database audit
-- Run against the intended Supabase project (preferably via the connected
-- Supabase SQL/query tool). This script contains SELECT statements only.
-- It intentionally returns schema metadata and aggregate counts, not customer
-- names, employee data, invoices or other personal/business row contents.

-- 1) Migration history presence and applied migration identifiers.
select
  to_regclass('supabase_migrations.schema_migrations') as migration_history_table;

select version, name
from supabase_migrations.schema_migrations
order by version;

-- 2) Actual columns and data types for current product / inventory / sales tables.
select
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'companies',
    'branches',
    'products',
    'warehouses',
    'inventory_lots',
    'inventory_movements',
    'cloud_suppliers',
    'cloud_purchases',
    'cloud_purchase_lines',
    'cloud_purchase_receipts',
    'cloud_purchase_receipt_lines',
    'cloud_sales',
    'cloud_sale_lines',
    'cloud_sale_payments'
  )
order by table_name, ordinal_position;

-- 3) Constraints and referenced tables for the same core model.
select
  src.relname as table_name,
  con.conname as constraint_name,
  con.contype as constraint_type,
  pg_get_constraintdef(con.oid, true) as definition
from pg_constraint con
join pg_class src on src.oid = con.conrelid
join pg_namespace n on n.oid = src.relnamespace
where n.nspname = 'public'
  and src.relname in (
    'products','warehouses','inventory_lots','inventory_movements',
    'cloud_purchases','cloud_purchase_lines','cloud_purchase_receipts',
    'cloud_purchase_receipt_lines','cloud_sales','cloud_sale_lines',
    'cloud_sale_payments'
  )
order by src.relname, con.contype, con.conname;

-- 4) Indexes (especially unique SKU/barcode and company-scoping indexes).
select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'products','warehouses','inventory_lots','inventory_movements',
    'cloud_purchases','cloud_purchase_lines','cloud_purchase_receipts',
    'cloud_purchase_receipt_lines','cloud_sales','cloud_sale_lines',
    'cloud_sale_payments'
  )
order by tablename, indexname;

-- 5) RLS state and policies.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'products','warehouses','inventory_lots','inventory_movements',
    'cloud_suppliers','cloud_purchases','cloud_purchase_lines',
    'cloud_purchase_receipts','cloud_purchase_receipt_lines',
    'cloud_sales','cloud_sale_lines','cloud_sale_payments'
  )
order by c.relname;

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'products','warehouses','inventory_lots','inventory_movements',
    'cloud_suppliers','cloud_purchases','cloud_purchase_lines',
    'cloud_purchase_receipts','cloud_purchase_receipt_lines',
    'cloud_sales','cloud_sale_lines','cloud_sale_payments'
  )
order by tablename, policyname;

-- 6) Relevant workflow function signatures (no function bodies or secrets).
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as result_type,
  p.prosecdef as security_definer,
  p.proconfig as function_config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'create_company_with_owner',
    'create_inventory_lot_with_opening_stock',
    'record_inventory_movement',
    'receive_inventory_lot_once',
    'record_inventory_movement_once',
    'create_cloud_purchase',
    'receive_cloud_purchase_once',
    'checkout_cloud_sale_once',
    'record_cloud_sale_payment_once'
  )
order by p.proname, arguments;

-- 7) Aggregate row counts only. These counts help reconcile the live project
-- with the repository and migration rehearsal without exporting row contents.
select 'companies' as table_name, count(*)::bigint as row_count from public.companies
union all select 'branches', count(*)::bigint from public.branches
union all select 'products', count(*)::bigint from public.products
union all select 'warehouses', count(*)::bigint from public.warehouses
union all select 'inventory_lots', count(*)::bigint from public.inventory_lots
union all select 'inventory_movements', count(*)::bigint from public.inventory_movements
union all select 'cloud_suppliers', count(*)::bigint from public.cloud_suppliers
union all select 'cloud_purchases', count(*)::bigint from public.cloud_purchases
union all select 'cloud_purchase_lines', count(*)::bigint from public.cloud_purchase_lines
union all select 'cloud_purchase_receipts', count(*)::bigint from public.cloud_purchase_receipts
union all select 'cloud_purchase_receipt_lines', count(*)::bigint from public.cloud_purchase_receipt_lines
union all select 'cloud_sales', count(*)::bigint from public.cloud_sales
union all select 'cloud_sale_lines', count(*)::bigint from public.cloud_sale_lines
union all select 'cloud_sale_payments', count(*)::bigint from public.cloud_sale_payments
order by table_name;

-- 8) Distinct legacy category and unit labels with counts.
-- Values are labels only; review them before mapping. They are not converted
-- automatically by this audit.
select
  'category' as field_name,
  coalesce(nullif(btrim(category), ''), '[blank]') as legacy_value,
  count(*)::bigint as product_count
from public.products
group by coalesce(nullif(btrim(category), ''), '[blank]')
union all
select
  'unit' as field_name,
  coalesce(nullif(btrim(unit), ''), '[blank]') as legacy_value,
  count(*)::bigint as product_count
from public.products
group by coalesce(nullif(btrim(unit), ''), '[blank]')
order by field_name, legacy_value;

-- 9) Basic product-to-stock references. These are aggregate exception counts.
select
  count(*) filter (where p.id is null) as orphaned_lot_product_count
from public.inventory_lots l
left join public.products p
  on p.company_id = l.company_id
 and p.id = l.product_id;

select
  count(*) filter (where p.id is null) as orphaned_movement_product_count
from public.inventory_movements m
left join public.products p
  on p.company_id = m.company_id
 and p.id = m.product_id;
