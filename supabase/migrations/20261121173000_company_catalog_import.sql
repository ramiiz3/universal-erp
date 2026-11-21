-- Company-scoped product catalog and opening-stock import.
-- Every imported opening quantity is recorded in the inventory movement ledger.
-- The function is idempotent per company + request id and commits as one transaction.

begin;

create schema if not exists private;

create table if not exists private.company_catalog_import_requests (
  company_id uuid not null references public.companies(id) on delete cascade,
  request_id uuid not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (company_id, request_id)
);

alter table private.company_catalog_import_requests enable row level security;
revoke all on private.company_catalog_import_requests from public, anon, authenticated;

create or replace function public.import_company_catalog(
  p_company_id uuid,
  p_warehouse_id uuid,
  p_rows jsonb,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_row jsonb;
  v_name text;
  v_sku text;
  v_barcode text;
  v_category text;
  v_manufacturer text;
  v_description text;
  v_unit text;
  v_batch text;
  v_expiry date;
  v_purchase_price numeric;
  v_selling_price numeric;
  v_minimum_stock numeric;
  v_vat_rate numeric;
  v_stock_quantity numeric;
  v_lot_purchase_price numeric;
  v_lot_selling_price numeric;
  v_barcode_product_id uuid;
  v_sku_product_id uuid;
  v_product_id uuid;
  v_lot_id uuid;
  v_warehouse_branch_id uuid;
  v_name_match_count integer;
  v_processed_product_ids uuid[] := array[]::uuid[];
  v_product_was_created boolean;
  v_created_products integer := 0;
  v_matched_products integer := 0;
  v_created_lots integer := 0;
  v_updated_lots integer := 0;
  v_imported_rows integer := 0;
  v_opening_stock_quantity numeric := 0;
  v_result jsonb;
  v_cached private.company_catalog_import_requests%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;
  if p_company_id is null or p_request_id is null then
    raise exception using errcode = '22023', message = 'Company and import request identifiers are required.';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception using errcode = '22023', message = 'Import rows must be a JSON array.';
  end if;
  if jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 1000 then
    raise exception using errcode = '22023', message = 'Import must contain between 1 and 1,000 validated rows.';
  end if;
  if not private.has_company_permission(p_company_id, 'manage_inventory') then
    raise exception using errcode = '42501', message = 'You do not have permission to import products for this company.';
  end if;

  -- Serialize catalog imports for a company, then return the previous result
  -- when a browser retries the same request after a network interruption.
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':catalog-import', 0));
  select * into v_cached
  from private.company_catalog_import_requests
  where company_id = p_company_id and request_id = p_request_id;
  if found then
    if v_cached.created_by <> v_user_id then
      raise exception using errcode = '42501', message = 'This import request belongs to another user.';
    end if;
    return v_cached.result;
  end if;

  if p_warehouse_id is not null then
    select warehouses.branch_id into v_warehouse_branch_id
    from public.warehouses as warehouses
    where warehouses.id = p_warehouse_id
      and warehouses.company_id = p_company_id;
    if not found then
      raise exception using errcode = '23503', message = 'The selected warehouse does not belong to this company.';
    end if;
    if not private.has_company_permission(p_company_id, 'manage_inventory', v_warehouse_branch_id) then
      raise exception using errcode = '42501', message = 'You do not have permission to import stock into the selected warehouse.';
    end if;
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    if jsonb_typeof(v_row) <> 'object' then
      raise exception using errcode = '22023', message = 'Every import row must be a product record.';
    end if;

    v_name := btrim(coalesce(v_row ->> 'name', ''));
    v_sku := btrim(coalesce(v_row ->> 'sku', ''));
    v_barcode := btrim(coalesce(v_row ->> 'barcode', ''));
    v_category := btrim(coalesce(v_row ->> 'category', ''));
    v_manufacturer := nullif(btrim(coalesce(v_row ->> 'manufacturer', '')), '');
    v_description := btrim(coalesce(v_row ->> 'description', ''));
    v_unit := coalesce(nullif(btrim(coalesce(v_row ->> 'unit', '')), ''), 'each');
    v_batch := btrim(coalesce(v_row ->> 'batch', ''));
    v_expiry := nullif(btrim(coalesce(v_row ->> 'expiry', '')), '')::date;
    v_purchase_price := coalesce(nullif(v_row ->> 'purchasePrice', '')::numeric, 0);
    v_selling_price := coalesce(nullif(v_row ->> 'sellingPrice', '')::numeric, 0);
    v_minimum_stock := coalesce(nullif(v_row ->> 'minimumStock', '')::numeric, 0);
    v_vat_rate := coalesce(nullif(v_row ->> 'vatRate', '')::numeric, 0);
    v_stock_quantity := coalesce(nullif(v_row ->> 'stockQuantity', '')::numeric, 0);
    v_lot_purchase_price := coalesce(nullif(v_row ->> 'lotPurchasePrice', '')::numeric, v_purchase_price);
    v_lot_selling_price := nullif(v_row ->> 'lotSellingPrice', '')::numeric;

    if v_name = '' or length(v_name) > 300 or length(v_category) > 160 or length(v_unit) > 100 or length(v_description) > 5000 then
      raise exception using errcode = '22023', message = 'Product name, category, unit or description is missing or exceeds the allowed length.';
    end if;
    if v_purchase_price < 0 or v_selling_price < 0 or v_minimum_stock < 0
       or v_vat_rate < 0 or v_vat_rate > 100
       or v_stock_quantity < 0 or v_lot_purchase_price < 0
       or (v_lot_selling_price is not null and v_lot_selling_price < 0)
       or v_purchase_price::text in ('NaN', 'Infinity', '-Infinity')
       or v_selling_price::text in ('NaN', 'Infinity', '-Infinity')
       or v_minimum_stock::text in ('NaN', 'Infinity', '-Infinity')
       or v_vat_rate::text in ('NaN', 'Infinity', '-Infinity')
       or v_stock_quantity::text in ('NaN', 'Infinity', '-Infinity')
       or v_lot_purchase_price::text in ('NaN', 'Infinity', '-Infinity')
       or (v_lot_selling_price is not null and v_lot_selling_price::text in ('NaN', 'Infinity', '-Infinity'))
       then
      raise exception using errcode = '22023', message = 'Prices, quantities, minimum stock and VAT must be valid non-negative numbers.';
    end if;
    if v_stock_quantity > 0 and p_warehouse_id is null then
      raise exception using errcode = '22023', message = 'Select a company warehouse before importing opening stock.';
    end if;

    v_barcode_product_id := null;
    v_sku_product_id := null;
    v_product_id := null;
    v_product_was_created := false;

    if v_barcode <> '' then
      select products.id into v_barcode_product_id
      from public.products as products
      where products.company_id = p_company_id
        and lower(btrim(products.barcode)) = lower(v_barcode)
      order by products.created_at, products.id
      limit 1;
    end if;
    if v_sku <> '' then
      select products.id into v_sku_product_id
      from public.products as products
      where products.company_id = p_company_id
        and lower(btrim(products.sku)) = lower(v_sku)
      order by products.created_at, products.id
      limit 1;
    end if;
    if v_barcode_product_id is not null
       and v_sku_product_id is not null
       and v_barcode_product_id <> v_sku_product_id then
      raise exception using errcode = '23505', message = 'An imported barcode and SKU match two different existing products. Resolve the duplicate before importing.';
    end if;

    v_product_id := coalesce(v_barcode_product_id, v_sku_product_id);
    if v_product_id is null then
      select count(*) into v_name_match_count
      from public.products as products
      where products.company_id = p_company_id
        and lower(btrim(products.name)) = lower(v_name)
        and lower(btrim(products.category)) = lower(v_category);
      if v_name_match_count > 1 then
        raise exception using errcode = '23505', message = 'Product name and category match multiple existing records. Add a unique SKU or barcode to the import file.';
      elsif v_name_match_count = 1 then
        select products.id into v_product_id
        from public.products as products
        where products.company_id = p_company_id
          and lower(btrim(products.name)) = lower(v_name)
          and lower(btrim(products.category)) = lower(v_category)
        order by products.created_at, products.id
        limit 1;
      end if;
    end if;

    if v_product_id is null then
      insert into public.products (
        company_id, name, category, sku, barcode, description, manufacturer, unit,
        purchase_price, selling_price, minimum_stock, vat_rate, created_by
      ) values (
        p_company_id, v_name, v_category, v_sku, v_barcode, v_description,
        v_manufacturer, v_unit, v_purchase_price, v_selling_price,
        v_minimum_stock, v_vat_rate, v_user_id
      )
      returning id into v_product_id;
      v_product_was_created := true;
    end if;

    if not (v_product_id = any(v_processed_product_ids)) then
      if v_product_was_created then
        v_created_products := v_created_products + 1;
      else
        v_matched_products := v_matched_products + 1;
      end if;
      v_processed_product_ids := array_append(v_processed_product_ids, v_product_id);
    end if;

    if v_stock_quantity > 0 then
      v_opening_stock_quantity := v_opening_stock_quantity + v_stock_quantity;
      select lots.id into v_lot_id
      from public.inventory_lots as lots
      where lots.company_id = p_company_id
        and lots.product_id = v_product_id
        and lots.branch_id = v_warehouse_branch_id
        and lots.warehouse_id = p_warehouse_id
        and lower(btrim(lots.batch)) = lower(v_batch)
        and lots.expiry is not distinct from v_expiry
        and lots.purchase_price = v_lot_purchase_price
      order by lots.created_at, lots.id
      limit 1
      for update;

      if v_lot_id is not null then
        perform public.record_inventory_movement(
          p_company_id,
          v_lot_id,
          'OPENING',
          v_stock_quantity,
          'Opening stock imported',
          jsonb_build_object('source', 'company_catalog_import', 'request_id', p_request_id)
        );
        update public.inventory_lots
        set selling_price = coalesce(v_lot_selling_price, selling_price),
            total_purchase_value = quantity * purchase_price,
            total_selling_value = case
              when coalesce(v_lot_selling_price, selling_price) is null then null
              else quantity * coalesce(v_lot_selling_price, selling_price)
            end,
            updated_at = now()
        where id = v_lot_id and company_id = p_company_id;
        v_updated_lots := v_updated_lots + 1;
      else
        v_lot_id := public.create_inventory_lot_with_opening_stock(
          p_company_id,
          v_product_id,
          v_warehouse_branch_id,
          p_warehouse_id,
          null,
          v_batch,
          v_expiry,
          v_stock_quantity,
          v_lot_purchase_price,
          v_lot_selling_price,
          v_stock_quantity * v_lot_purchase_price,
          case when v_lot_selling_price is null then null else v_stock_quantity * v_lot_selling_price end
        );
        v_created_lots := v_created_lots + 1;
      end if;
    end if;

    v_imported_rows := v_imported_rows + 1;
  end loop;

  v_result := jsonb_build_object(
    'rowsImported', v_imported_rows,
    'createdProducts', v_created_products,
    'matchedProducts', v_matched_products,
    'createdLots', v_created_lots,
    'updatedLots', v_updated_lots,
    'openingStockQuantity', v_opening_stock_quantity
  );

  insert into private.company_catalog_import_requests (
    company_id, request_id, created_by, result
  ) values (
    p_company_id, p_request_id, v_user_id, v_result
  );

  insert into public.audit_logs (
    company_id, branch_id, actor_id, action, entity_type, details
  ) values (
    p_company_id, v_warehouse_branch_id, v_user_id, 'catalog.imported',
    'product_catalog', jsonb_build_object('request_id', p_request_id, 'result', v_result)
  );

  return v_result;
end;
$$;

revoke all on function public.import_company_catalog(uuid, uuid, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.import_company_catalog(uuid, uuid, jsonb, uuid)
  to authenticated;

comment on function public.import_company_catalog(uuid, uuid, jsonb, uuid) is
  'Imports company-scoped products and optional opening inventory in one transaction. Matches products by barcode/SKU/name-category, never overwrites existing master data, and records opening movements. Idempotent by company and request UUID.';

commit;
