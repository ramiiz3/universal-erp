-- Product-level VAT applicability.
-- Existing products remain taxable under their current company/product rate by default.
-- A product marked exempt is persisted at 0% and the cloud checkout RPC enforces it.

begin;

alter table public.products
  add column if not exists vat_applicable boolean not null default true;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.products'::regclass
      and conname = 'products_vat_applicable_rate_check'
  ) then
    alter table public.products
      add constraint products_vat_applicable_rate_check
      check (vat_applicable or vat_rate = 0);
  end if;
end;
$$;

create or replace function public.import_company_catalog(
  p_company_id uuid,
  p_warehouse_id uuid,
  p_rows jsonb,
  p_request_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $catalog_import$
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
  v_vat_applicable boolean := true;
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
  v_cached public.company_catalog_import_requests%rowtype;
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
  from public.company_catalog_import_requests
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
    v_vat_applicable := coalesce(nullif(v_row ->> 'vatApplicable', '')::boolean, true);
    if not v_vat_applicable then v_vat_rate := 0; end if;
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
        purchase_price, selling_price, minimum_stock, vat_rate, vat_applicable, created_by
      ) values (
        p_company_id, v_name, v_category, v_sku, v_barcode, v_description,
        v_manufacturer, v_unit, v_purchase_price, v_selling_price,
        v_minimum_stock, v_vat_rate, v_vat_applicable, v_user_id
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
      limit 1;

      if v_lot_id is not null then
        perform public.record_inventory_movement(
          p_company_id,
          v_lot_id,
          'OPENING',
          v_stock_quantity,
          'Opening stock imported',
          jsonb_build_object('source', 'company_catalog_import', 'request_id', p_request_id)
        );
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

  insert into public.company_catalog_import_requests (
    company_id, request_id, created_by, result
  ) values (
    p_company_id, p_request_id, v_user_id, v_result
  );

  return v_result;
end;
$catalog_import$;

create or replace function public.checkout_cloud_sale_once(
  p_company_id uuid,
  p_branch_id uuid,
  p_warehouse_id uuid,
  p_customer jsonb,
  p_items jsonb,
  p_discount numeric,
  p_payments jsonb,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company public.companies%rowtype;
  v_existing public.cloud_sales%rowtype;
  v_product public.products%rowtype;
  v_lot public.inventory_lots%rowtype;
  v_item jsonb;
  v_payment jsonb;
  v_alloc jsonb;
  v_allocations jsonb := '[]'::jsonb;
  v_customer jsonb := coalesce(p_customer, '{}'::jsonb);
  v_payload jsonb;
  v_sale_id uuid;
  v_invoice_number text;
  v_item_qty numeric;
  v_remaining numeric;
  v_alloc_qty numeric;
  v_price numeric;
  v_vat_rate numeric;
  v_gross numeric(20, 2);
  v_subtotal numeric(20, 2) := 0;
  v_discount numeric(20, 2);
  v_discount_share numeric(20, 2);
  v_discount_used numeric(20, 2) := 0;
  v_vat numeric(20, 2) := 0;
  v_total numeric(20, 2);
  v_paid numeric(20, 2) := 0;
  v_line_vat numeric(20, 2);
  v_line_total numeric(20, 2);
  v_previous numeric(20, 6);
  v_resulting numeric(20, 6);
  v_index integer := 0;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_request_id is null
     or p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 100
     or jsonb_typeof(coalesce(p_payments, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_payments, '[]'::jsonb)) > 20
     or p_discount is null or p_discount < 0
     or p_discount <> round(p_discount, 2) then
    raise exception 'Sale request values are invalid' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) as item
    group by item.value->>'product_id'
    having count(*) > 1
  ) then
    raise exception 'Each product may appear only once in a sale request'
      using errcode = '22023';
  end if;

  if jsonb_typeof(v_customer) <> 'object' then
    raise exception 'Customer details must be an object' using errcode = '22023';
  end if;
  v_payload := jsonb_build_object(
    'branch_id', p_branch_id,
    'warehouse_id', p_warehouse_id,
    'customer', v_customer,
    'items', p_items,
    'discount', p_discount,
    'payments', coalesce(p_payments, '[]'::jsonb)
  );
  perform pg_advisory_xact_lock(
    hashtextextended(p_company_id::text || ':sale:' || p_request_id::text, 0)
  );
  if not private.has_company_permission(p_company_id, 'create_sales', p_branch_id) then
    raise exception 'Insufficient sales permission' using errcode = '42501';
  end if;
  if p_discount > 0
     and not private.has_company_permission(p_company_id, 'manage_finance', p_branch_id) then
    raise exception 'Finance permission is required to apply discounts'
      using errcode = '42501';
  end if;
  select * into v_existing from public.cloud_sales
  where company_id = p_company_id and request_id = p_request_id;
  if found then
    if v_existing.created_by <> auth.uid()
       or v_existing.request_payload <> v_payload then
      raise exception 'Request identifier was already used for a different sale'
        using errcode = '22023';
    end if;
    return jsonb_build_object(
      'sale_id', v_existing.id,
      'invoice_number', v_existing.invoice_number,
      'subtotal', v_existing.subtotal,
      'discount_total', v_existing.discount_total,
      'vat_total', v_existing.vat_total,
      'total', v_existing.total,
      'amount_paid', v_existing.amount_paid,
      'payment_status', v_existing.payment_status
    );
  end if;

  select * into v_company from public.companies where id = p_company_id for update;
  if not found then
    raise exception 'Company not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.warehouses
    where id = p_warehouse_id and company_id = p_company_id and branch_id = p_branch_id
  ) then
    raise exception 'Warehouse is not in the selected company branch'
      using errcode = '23503';
  end if;
  if char_length(coalesce(v_customer->>'name', '')) > 200
     or char_length(coalesce(v_customer->>'phone', '')) > 100
     or char_length(coalesce(v_customer->>'email', '')) > 254 then
    raise exception 'Customer details exceed supported lengths'
      using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_item_qty := (v_item->>'quantity')::numeric;
    if v_item_qty <= 0 then
      raise exception 'Sale quantity must be greater than zero' using errcode = '22023';
    end if;
    select * into v_product from public.products
    where id = (v_item->>'product_id')::uuid
      and company_id = p_company_id and is_active;
    if not found then
      raise exception 'Active company product not found' using errcode = 'P0002';
    end if;
    v_remaining := v_item_qty;
    for v_lot in
      select lots.*
      from public.inventory_lots as lots
      where lots.company_id = p_company_id
        and lots.product_id = v_product.id
        and lots.warehouse_id = p_warehouse_id
        and lots.quantity > 0
        and (lots.expiry is null or lots.expiry >= current_date)
      order by lots.expiry nulls last, lots.created_at, lots.id
      for update
    loop
      exit when v_remaining <= 0;
      v_alloc_qty := least(v_remaining, v_lot.quantity);
      v_price := coalesce(v_lot.selling_price, v_product.selling_price);
      if v_price < 0 then
        raise exception 'Resolved lot selling price is invalid' using errcode = '22023';
      end if;
      v_vat_rate := case
        when not v_product.vat_applicable then 0
        when v_product.vat_rate > 0 then v_product.vat_rate
        else v_company.tax_rate
      end;
      v_gross := round(v_alloc_qty * v_price, 2);
      v_allocations := v_allocations || jsonb_build_array(jsonb_build_object(
        'product_id', v_product.id,
        'product_name', v_product.name,
        'sku', v_product.sku,
        'unit', v_product.unit,
        'lot_id', v_lot.id,
        'batch', v_lot.batch,
        'expiry', v_lot.expiry,
        'quantity', v_alloc_qty,
        'unit_price', v_price,
        'unit_cost', v_lot.purchase_price,
        'vat_rate', v_vat_rate,
        'gross', v_gross
      ));
      v_subtotal := v_subtotal + v_gross;
      v_remaining := v_remaining - v_alloc_qty;
    end loop;
    if v_remaining > 0 then
      raise exception 'Insufficient eligible stock for product %', v_product.name
        using errcode = '23514';
    end if;
  end loop;
  if p_discount > v_subtotal then
    raise exception 'Sale discount cannot exceed subtotal' using errcode = '22023';
  end if;
  v_discount := p_discount;

  for v_payment in select value from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb))
  loop
    if v_payment->>'method' not in ('cash', 'card', 'bank_transfer', 'other')
       or (v_payment->>'amount')::numeric <= 0
       or (v_payment->>'amount')::numeric <> round((v_payment->>'amount')::numeric, 2)
       or char_length(coalesce(v_payment->>'reference', '')) > 200 then
      raise exception 'Payment method, amount, or reference is invalid'
        using errcode = '22023';
    end if;
    v_paid := v_paid + (v_payment->>'amount')::numeric;
  end loop;

  v_total := v_subtotal - v_discount;
  for v_alloc in select value from jsonb_array_elements(v_allocations)
  loop
    v_index := v_index + 1;
    v_gross := (v_alloc->>'gross')::numeric;
    if v_index = jsonb_array_length(v_allocations) then
      v_discount_share := v_discount - v_discount_used;
    elsif v_subtotal = 0 then
      v_discount_share := 0;
    else
      v_discount_share := least(
        greatest(round(v_discount * v_gross / v_subtotal, 2), 0),
        greatest(v_discount - v_discount_used, 0)
      );
    end if;
    v_discount_used := v_discount_used + v_discount_share;
    v_line_vat := round((v_gross - v_discount_share) * (v_alloc->>'vat_rate')::numeric / 100, 2);
    v_line_total := v_gross - v_discount_share + v_line_vat;
    v_vat := v_vat + v_line_vat;
    v_total := v_total + v_line_vat;
  end loop;
  if v_paid > v_total then
    raise exception 'Payments cannot exceed the amount due' using errcode = '22023';
  end if;

  v_invoice_number := v_company.invoice_prefix || '-' ||
    lpad(v_company.invoice_next_number::text, 8, '0');
  update public.companies
  set invoice_next_number = invoice_next_number + 1, updated_at = now()
  where id = p_company_id;

  insert into public.cloud_sales (
    company_id, branch_id, warehouse_id, invoice_number,
    customer_name, customer_phone, customer_email, subtotal,
    discount_total, vat_total, total, amount_paid, payment_status,
    currency, request_id, request_payload, created_by
  ) values (
    p_company_id, p_branch_id, p_warehouse_id, v_invoice_number,
    btrim(coalesce(v_customer->>'name', '')),
    btrim(coalesce(v_customer->>'phone', '')),
    btrim(coalesce(v_customer->>'email', '')),
    v_subtotal, v_discount, v_vat, v_total, v_paid,
    case when v_paid = 0 then 'unpaid' when v_paid < v_total then 'partial' else 'paid' end,
    v_company.currency, p_request_id, v_payload, auth.uid()
  ) returning id into v_sale_id;

  v_index := 0;
  v_discount_used := 0;
  for v_alloc in select value from jsonb_array_elements(v_allocations)
  loop
    v_index := v_index + 1;
    v_gross := (v_alloc->>'gross')::numeric;
    if v_index = jsonb_array_length(v_allocations) then
      v_discount_share := v_discount - v_discount_used;
    elsif v_subtotal = 0 then
      v_discount_share := 0;
    else
      v_discount_share := least(
        greatest(round(v_discount * v_gross / v_subtotal, 2), 0),
        greatest(v_discount - v_discount_used, 0)
      );
    end if;
    v_discount_used := v_discount_used + v_discount_share;
    v_line_vat := round((v_gross - v_discount_share) * (v_alloc->>'vat_rate')::numeric / 100, 2);
    v_line_total := v_gross - v_discount_share + v_line_vat;

    insert into public.cloud_sale_lines (
      company_id, sale_id, product_id, lot_id, product_name, sku, unit,
      batch, expiry, quantity, unit_price, unit_cost, discount_amount,
      vat_rate, vat_amount, line_total
    ) values (
      p_company_id, v_sale_id, (v_alloc->>'product_id')::uuid,
      (v_alloc->>'lot_id')::uuid, v_alloc->>'product_name',
      v_alloc->>'sku', v_alloc->>'unit', v_alloc->>'batch',
      nullif(v_alloc->>'expiry', '')::date, (v_alloc->>'quantity')::numeric,
      (v_alloc->>'unit_price')::numeric, (v_alloc->>'unit_cost')::numeric,
      v_discount_share, (v_alloc->>'vat_rate')::numeric, v_line_vat, v_line_total
    );

    select quantity into v_previous
    from public.inventory_lots
    where id = (v_alloc->>'lot_id')::uuid and company_id = p_company_id;
    v_resulting := v_previous - (v_alloc->>'quantity')::numeric;
    if v_resulting < 0 then
      raise exception 'Insufficient stock due to a concurrent update' using errcode = '23514';
    end if;
    update public.inventory_lots
    set quantity = v_resulting, updated_at = now()
    where id = (v_alloc->>'lot_id')::uuid and company_id = p_company_id;
    insert into public.inventory_movements (
      company_id, product_id, lot_id, branch_id, warehouse_id,
      movement_type, quantity, reason, metadata, created_by
    ) values (
      p_company_id, (v_alloc->>'product_id')::uuid,
      (v_alloc->>'lot_id')::uuid, p_branch_id, p_warehouse_id,
      'SALE', -(v_alloc->>'quantity')::numeric, 'Cloud sale ' || v_invoice_number,
      jsonb_build_object(
        'previous_quantity', v_previous,
        'resulting_quantity', v_resulting,
        'sale_id', v_sale_id,
        'invoice_number', v_invoice_number
      ),
      auth.uid()
    );
  end loop;

  for v_payment in select value from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb))
  loop
    insert into public.cloud_sale_payments (
      company_id, sale_id, method, amount, reference, received_by
    ) values (
      p_company_id, v_sale_id, v_payment->>'method',
      (v_payment->>'amount')::numeric,
      btrim(coalesce(v_payment->>'reference', '')), auth.uid()
    );
  end loop;

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'invoice_number', v_invoice_number,
    'subtotal', v_subtotal,
    'discount_total', v_discount,
    'vat_total', v_vat,
    'total', v_total,
    'amount_paid', v_paid,
    'payment_status', case when v_paid = 0 then 'unpaid' when v_paid < v_total then 'partial' else 'paid' end
  );
end;
$$;

revoke all on function public.checkout_cloud_sale_once(uuid, uuid, uuid, jsonb, jsonb, numeric, jsonb, uuid)
  from public, anon;
grant execute on function public.checkout_cloud_sale_once(uuid, uuid, uuid, jsonb, jsonb, numeric, jsonb, uuid)
  to authenticated;

comment on column public.products.vat_applicable is
  'When false, the product is VAT-exempt and vat_rate must be zero. When true, a zero rate inherits the company tax rate.';

commit;
