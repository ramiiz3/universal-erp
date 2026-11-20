-- Package-aware cloud purchasing, receipts and sales.
-- All inventory lots and movement quantities remain in product base units.

alter table public.cloud_purchase_lines
  add column packaging_id uuid,
  add column entered_quantity numeric(20, 6) not null default 1 check (entered_quantity > 0),
  add column entered_unit_cost numeric(20, 6) not null default 0 check (entered_unit_cost >= 0),
  add column packaging_name_snapshot text not null default '',
  add column packaging_unit_snapshot text not null default '',
  add column conversion_factor_snapshot numeric(20, 6) not null default 1 check (conversion_factor_snapshot > 0),
  add column base_unit_snapshot text not null default '';

update public.cloud_purchase_lines
set entered_quantity = quantity_ordered,
    entered_unit_cost = unit_cost,
    packaging_name_snapshot = unit,
    packaging_unit_snapshot = unit,
    conversion_factor_snapshot = 1,
    base_unit_snapshot = unit;

alter table public.cloud_purchase_lines
  add constraint cloud_purchase_lines_packaging_fk
  foreign key (company_id, product_id, packaging_id)
  references public.product_packagings (company_id, product_id, id);
create index cloud_purchase_lines_packaging_idx
  on public.cloud_purchase_lines (company_id, packaging_id) where packaging_id is not null;

alter table public.cloud_purchase_receipt_lines
  add column packaging_id uuid,
  add column entered_quantity numeric(20, 6) not null default 1 check (entered_quantity > 0),
  add column entered_unit_cost numeric(20, 6) not null default 0 check (entered_unit_cost >= 0),
  add column entered_selling_price numeric(20, 6) check (entered_selling_price is null or entered_selling_price >= 0),
  add column packaging_name_snapshot text not null default '',
  add column packaging_unit_snapshot text not null default '',
  add column conversion_factor_snapshot numeric(20, 6) not null default 1 check (conversion_factor_snapshot > 0),
  add column base_unit_snapshot text not null default '';

update public.cloud_purchase_receipt_lines
set entered_quantity = quantity,
    entered_unit_cost = unit_cost,
    entered_selling_price = selling_price,
    conversion_factor_snapshot = 1;

alter table public.cloud_purchase_receipt_lines
  add constraint cloud_purchase_receipt_lines_packaging_fk
  foreign key (company_id, product_id, packaging_id)
  references public.product_packagings (company_id, product_id, id);
create index cloud_purchase_receipt_lines_packaging_idx
  on public.cloud_purchase_receipt_lines (company_id, packaging_id) where packaging_id is not null;

alter table public.cloud_sale_lines
  add column packaging_id uuid,
  add column entered_quantity numeric(20, 6) not null default 1 check (entered_quantity > 0),
  add column entered_unit_price numeric(20, 6) not null default 0 check (entered_unit_price >= 0),
  add column packaging_name_snapshot text not null default '',
  add column packaging_unit_snapshot text not null default '',
  add column conversion_factor_snapshot numeric(20, 6) not null default 1 check (conversion_factor_snapshot > 0),
  add column base_unit_snapshot text not null default '';

update public.cloud_sale_lines
set entered_quantity = quantity,
    entered_unit_price = unit_price,
    packaging_name_snapshot = unit,
    packaging_unit_snapshot = unit,
    conversion_factor_snapshot = 1,
    base_unit_snapshot = unit;

alter table public.cloud_sale_lines
  add constraint cloud_sale_lines_packaging_fk
  foreign key (company_id, product_id, packaging_id)
  references public.product_packagings (company_id, product_id, id);
create index cloud_sale_lines_packaging_idx
  on public.cloud_sale_lines (company_id, packaging_id) where packaging_id is not null;

create or replace function private.protect_product_packaging_conversion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $guard$
begin
  if old.is_base and not new.is_active then
    raise exception using errcode = '22023', message = 'The base packaging cannot be archived.';
  end if;

  if old.is_active and not new.is_active and exists (
    select 1 from public.cloud_purchase_lines as lines
    where lines.company_id = old.company_id
      and lines.packaging_id = old.id
      and lines.quantity_received < lines.quantity_ordered
  ) then
    raise exception using errcode = '22023',
      message = 'Packaging cannot be archived while a purchase order is still outstanding.';
  end if;

  if new.unit_id is distinct from old.unit_id
     or new.base_quantity is distinct from old.base_quantity
     or new.is_base is distinct from old.is_base then
    if exists (select 1 from public.product_barcodes where company_id = old.company_id and packaging_id = old.id)
       or exists (select 1 from public.product_prices where company_id = old.company_id and packaging_id = old.id)
       or exists (select 1 from public.cloud_purchase_lines where company_id = old.company_id and packaging_id = old.id)
       or exists (select 1 from public.cloud_purchase_receipt_lines where company_id = old.company_id and packaging_id = old.id)
       or exists (select 1 from public.cloud_sale_lines where company_id = old.company_id and packaging_id = old.id) then
      raise exception using errcode = '22023',
        message = 'Packaging conversion is already referenced by a barcode or price. Create a new packaging level instead.';
    end if;
  end if;
  return new;
end;
$guard$;
drop trigger if exists protect_product_packaging_conversion on public.product_packagings;
create trigger protect_product_packaging_conversion
before update on public.product_packagings
for each row execute function private.protect_product_packaging_conversion();


create or replace function public.create_cloud_purchase(
  p_company_id uuid,
  p_branch_id uuid,
  p_warehouse_id uuid,
  p_supplier_id uuid,
  p_supplier_invoice_reference text,
  p_lines jsonb,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company public.companies%rowtype;
  v_warehouse public.warehouses%rowtype;
  v_supplier public.cloud_suppliers%rowtype;
  v_purchase_id uuid;
  v_purchase_number text;
  v_existing public.cloud_purchases%rowtype;
  v_line jsonb;
  v_product public.products%rowtype;
  v_packaging public.product_packagings%rowtype;
  v_product_id uuid;
  v_packaging_id uuid;
  v_quantity numeric;
  v_base_quantity numeric;
  v_factor numeric;
  v_unit_cost numeric;
  v_base_unit_cost numeric;
  v_packaging_name text;
  v_packaging_unit text;
  v_discount numeric;
  v_vat_rate numeric;
  v_subtotal numeric(20, 2) := 0;
  v_discount_total numeric(20, 2) := 0;
  v_vat_total numeric(20, 2) := 0;
  v_total numeric(20, 2) := 0;
  v_line_base numeric(20, 2);
  v_line_vat numeric(20, 2);
  v_payload jsonb;
  v_sequence bigint;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_request_id is null or p_lines is null or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) not between 1 and 100 then
    raise exception 'A request ID and between 1 and 100 purchase lines are required'
      using errcode = '22023';
  end if;

  v_payload := jsonb_build_object(
    'branch_id', p_branch_id,
    'warehouse_id', p_warehouse_id,
    'supplier_id', p_supplier_id,
    'supplier_invoice_reference', coalesce(btrim(p_supplier_invoice_reference), ''),
    'lines', p_lines
  );
  perform pg_advisory_xact_lock(
    hashtextextended(p_company_id::text || ':purchase:' || p_request_id::text, 0)
  );
  if not private.has_company_permission(p_company_id, 'manage_purchasing', p_branch_id) then
    raise exception 'Insufficient purchasing permission' using errcode = '42501';
  end if;
  select * into v_existing
  from public.cloud_purchases
  where company_id = p_company_id and request_id = p_request_id;
  if found then
    if v_existing.created_by <> auth.uid()
       or v_existing.request_payload <> v_payload then
      raise exception 'Request identifier was already used for a different purchase'
        using errcode = '22023';
    end if;
    return jsonb_build_object(
      'purchase_id', v_existing.id,
      'purchase_number', v_existing.purchase_number,
      'subtotal', v_existing.subtotal,
      'discount_total', v_existing.discount_total,
      'vat_total', v_existing.vat_total,
      'total', v_existing.total,
      'status', v_existing.status
    );
  end if;

  select * into v_company from public.companies where id = p_company_id;
  if not found then
    raise exception 'Company not found' using errcode = 'P0002';
  end if;
  select * into v_warehouse from public.warehouses
  where id = p_warehouse_id and company_id = p_company_id
    and branch_id = p_branch_id;
  if not found then
    raise exception 'Warehouse is not in the selected company branch'
      using errcode = '23503';
  end if;
  select * into v_supplier from public.cloud_suppliers
  where id = p_supplier_id and company_id = p_company_id and is_active;
  if not found then
    raise exception 'Active company supplier not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) as item
    group by item.value->>'product_id'
    having count(*) > 1
  ) then
    raise exception 'Each product may appear only once in a purchase'
      using errcode = '22023';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_product_id := (v_line->>'product_id')::uuid;
    v_quantity := (v_line->>'quantity')::numeric;
    v_unit_cost := (v_line->>'unit_cost')::numeric;
    v_discount := round(coalesce((v_line->>'discount_amount')::numeric, 0), 2);
    if v_quantity <= 0 or v_unit_cost < 0 or v_discount < 0
       or coalesce((v_line->>'discount_amount')::numeric, 0) <> v_discount then
      raise exception 'Purchase quantities, costs, or discounts are invalid'
        using errcode = '22023';
    end if;
    select * into v_product from public.products
    where id = v_product_id and company_id = p_company_id and is_active;
    if not found then
      raise exception 'Active company product not found' using errcode = 'P0002';
    end if;
    v_packaging_id := nullif(v_line->>'packaging_id', '')::uuid;
    if v_packaging_id is not null then
      select * into v_packaging
      from public.product_packagings
      where id = v_packaging_id and company_id = p_company_id
        and product_id = v_product_id and is_active and is_purchase_unit
      for share;
      if not found then
        raise exception 'Active purchase packaging not found for this product'
          using errcode = 'P0002';
      end if;
      if not v_packaging.allow_fractional_quantity and v_quantity <> trunc(v_quantity) then
        raise exception 'This packaging does not allow fractional quantities'
          using errcode = '22023';
      end if;
      v_factor := v_packaging.base_quantity;
      v_packaging_name := v_packaging.name;
      select coalesce(nullif(units.symbol, ''), units.name)
      into v_packaging_unit
      from public.units_of_measure as units
      where units.company_id = p_company_id and units.id = v_packaging.unit_id;
    else
      v_factor := 1;
      v_packaging_name := v_product.unit;
      v_packaging_unit := v_product.unit;
    end if;
    v_base_quantity := round(v_quantity * v_factor, 6);
    v_base_unit_cost := round(v_unit_cost / v_factor, 6);
    v_line_base := round(v_quantity * v_unit_cost, 2);
    if v_discount > v_line_base then
      raise exception 'Line discount cannot exceed its gross amount'
        using errcode = '22023';
    end if;
    v_vat_rate := case when v_product.vat_rate > 0
      then v_product.vat_rate else v_company.tax_rate end;
    v_line_vat := round((v_line_base - v_discount) * v_vat_rate / 100, 2);
    v_subtotal := v_subtotal + v_line_base;
    v_discount_total := v_discount_total + v_discount;
    v_vat_total := v_vat_total + v_line_vat;
  end loop;
  v_total := v_subtotal - v_discount_total + v_vat_total;

  insert into public.cloud_purchase_sequences (company_id, next_number)
  values (p_company_id, 2)
  on conflict (company_id)
  do update set next_number = public.cloud_purchase_sequences.next_number + 1
  returning next_number - 1 into v_sequence;
  v_purchase_number := 'PO-' || to_char(current_date, 'YYYYMMDD') || '-'
    || lpad(v_sequence::text, 6, '0');

  insert into public.cloud_purchases (
    company_id, branch_id, warehouse_id, supplier_id, purchase_number,
    supplier_invoice_reference, subtotal, discount_total, vat_total, total,
    currency, request_id, request_payload, created_by
  ) values (
    p_company_id, p_branch_id, p_warehouse_id, p_supplier_id, v_purchase_number,
    coalesce(btrim(p_supplier_invoice_reference), ''), v_subtotal,
    v_discount_total, v_vat_total, v_total, v_company.currency,
    p_request_id, v_payload, auth.uid()
  ) returning id into v_purchase_id;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_product_id := (v_line->>'product_id')::uuid;
    v_quantity := (v_line->>'quantity')::numeric;
    v_unit_cost := (v_line->>'unit_cost')::numeric;
    v_discount := round(coalesce((v_line->>'discount_amount')::numeric, 0), 2);
    select * into v_product from public.products
    where id = v_product_id and company_id = p_company_id;
    v_packaging_id := nullif(v_line->>'packaging_id', '')::uuid;
    if v_packaging_id is not null then
      select * into v_packaging
      from public.product_packagings
      where id = v_packaging_id and company_id = p_company_id
        and product_id = v_product_id and is_active and is_purchase_unit
      for share;
      if not found then
        raise exception 'Active purchase packaging not found for this product'
          using errcode = 'P0002';
      end if;
      if not v_packaging.allow_fractional_quantity and v_quantity <> trunc(v_quantity) then
        raise exception 'This packaging does not allow fractional quantities'
          using errcode = '22023';
      end if;
      v_factor := v_packaging.base_quantity;
      v_packaging_name := v_packaging.name;
      select coalesce(nullif(units.symbol, ''), units.name)
      into v_packaging_unit
      from public.units_of_measure as units
      where units.company_id = p_company_id and units.id = v_packaging.unit_id;
    else
      v_factor := 1;
      v_packaging_name := v_product.unit;
      v_packaging_unit := v_product.unit;
    end if;
    v_base_quantity := round(v_quantity * v_factor, 6);
    v_base_unit_cost := round(v_unit_cost / v_factor, 6);
    v_line_base := round(v_quantity * v_unit_cost, 2);
    v_vat_rate := case when v_product.vat_rate > 0
      then v_product.vat_rate else v_company.tax_rate end;
    v_line_vat := round((v_line_base - v_discount) * v_vat_rate / 100, 2);
    insert into public.cloud_purchase_lines (
      company_id, purchase_id, product_id, product_name, sku, unit,
      quantity_ordered, unit_cost, discount_amount, vat_rate, vat_amount, line_total,
      packaging_id, entered_quantity, entered_unit_cost,
      packaging_name_snapshot, packaging_unit_snapshot,
      conversion_factor_snapshot, base_unit_snapshot
    ) values (
      p_company_id, v_purchase_id, v_product.id, v_product.name, v_product.sku,
      v_product.unit, v_base_quantity, v_base_unit_cost, v_discount, v_vat_rate,
      v_line_vat, v_line_base - v_discount + v_line_vat,
      v_packaging_id, v_quantity, v_unit_cost,
      coalesce(v_packaging_name, v_product.unit),
      coalesce(v_packaging_unit, v_product.unit),
      v_factor, v_product.unit
    );
  end loop;

  return jsonb_build_object(
    'purchase_id', v_purchase_id,
    'purchase_number', v_purchase_number,
    'subtotal', v_subtotal,
    'discount_total', v_discount_total,
    'vat_total', v_vat_total,
    'total', v_total,
    'status', 'ordered'
  );
end;
$$;

create or replace function public.receive_cloud_purchase_once(
  p_company_id uuid,
  p_purchase_id uuid,
  p_lines jsonb,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase public.cloud_purchases%rowtype;
  v_existing public.cloud_purchase_receipts%rowtype;
  v_line jsonb;
  v_purchase_line public.cloud_purchase_lines%rowtype;
  v_receipt_id uuid;
  v_lot_id uuid;
  v_quantity numeric;
  v_base_quantity numeric;
  v_factor numeric;
  v_unit_cost numeric;
  v_entered_unit_cost numeric;
  v_selling_price numeric;
  v_entered_selling_price numeric;
  v_allow_fractional boolean := true;
  v_expiry date;
  v_batch text;
  v_previous numeric;
  v_resulting numeric;
  v_count integer := 0;
  v_payload jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_request_id is null or p_lines is null or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) not between 1 and 100 then
    raise exception 'A request ID and between 1 and 100 received lines are required'
      using errcode = '22023';
  end if;

  v_payload := jsonb_build_object('purchase_id', p_purchase_id, 'lines', p_lines);
  perform pg_advisory_xact_lock(
    hashtextextended(p_company_id::text || ':receipt:' || p_request_id::text, 0)
  );
  select * into v_purchase from public.cloud_purchases
  where id = p_purchase_id and company_id = p_company_id;
  if not found then
    raise exception 'Company purchase not found' using errcode = 'P0002';
  end if;
  if not private.has_company_permission(
    p_company_id, 'manage_purchasing', v_purchase.branch_id
  ) or not private.has_company_permission(
    p_company_id, 'manage_inventory', v_purchase.branch_id
  ) then
    raise exception 'Purchasing and inventory permissions are required'
      using errcode = '42501';
  end if;
  select * into v_existing from public.cloud_purchase_receipts
  where company_id = p_company_id and request_id = p_request_id;
  if found then
    if v_existing.received_by <> auth.uid()
       or v_existing.purchase_id <> p_purchase_id
       or v_existing.request_payload <> v_payload then
      raise exception 'Request identifier was already used for a different receipt'
        using errcode = '22023';
    end if;
    return jsonb_build_object(
      'receipt_id', v_existing.id,
      'purchase_id', v_existing.purchase_id,
      'received_at', v_existing.received_at
    );
  end if;

  select * into v_purchase from public.cloud_purchases
  where id = p_purchase_id and company_id = p_company_id
  for update;
  if not found then
    raise exception 'Company purchase not found' using errcode = 'P0002';
  end if;
  if v_purchase.status = 'received' then
    raise exception 'Purchase has already been fully received' using errcode = '23514';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) as item
    group by item.value->>'purchase_line_id'
    having count(*) > 1
  ) then
    raise exception 'A purchase line may appear only once per receipt'
      using errcode = '22023';
  end if;

  insert into public.cloud_purchase_receipts (
    company_id, purchase_id, request_id, request_payload, received_by
  ) values (
    p_company_id, p_purchase_id, p_request_id, v_payload, auth.uid()
  ) returning id into v_receipt_id;

  for v_line in
    select value from jsonb_array_elements(p_lines)
    order by value->>'purchase_line_id'
  loop
    select * into v_purchase_line
    from public.cloud_purchase_lines
    where id = (v_line->>'purchase_line_id')::uuid
      and company_id = p_company_id
      and purchase_id = p_purchase_id
    for update;
    if not found then
      raise exception 'Purchase line not found in this purchase' using errcode = 'P0002';
    end if;
    v_quantity := (v_line->>'quantity')::numeric;
    v_allow_fractional := true;
    if v_purchase_line.packaging_id is not null then
      select packagings.allow_fractional_quantity into v_allow_fractional
      from public.product_packagings as packagings
      where packagings.id = v_purchase_line.packaging_id
        and packagings.company_id = p_company_id
        and packagings.product_id = v_purchase_line.product_id;
      if not found then
        raise exception 'Purchase packaging record is unavailable' using errcode = 'P0002';
      end if;
      if not v_allow_fractional and v_quantity <> trunc(v_quantity) then
        raise exception 'This packaging does not allow fractional received quantities'
          using errcode = '22023';
      end if;
    end if;
    if nullif(v_line->>'packaging_id', '') is not null
       and (v_line->>'packaging_id')::uuid is distinct from v_purchase_line.packaging_id then
      raise exception 'Receipt packaging must match the purchase order packaging'
        using errcode = '22023';
    end if;
    v_factor := coalesce(v_purchase_line.conversion_factor_snapshot, 1);
    v_base_quantity := round(v_quantity * v_factor, 6);
    v_entered_unit_cost := coalesce(
      nullif(v_line->>'unit_cost', '')::numeric,
      v_purchase_line.entered_unit_cost,
      v_purchase_line.unit_cost * v_factor
    );
    v_unit_cost := round(v_entered_unit_cost / v_factor, 6);
    v_entered_selling_price := nullif(v_line->>'selling_price', '')::numeric;
    v_selling_price := case when v_entered_selling_price is null then null
      else round(v_entered_selling_price / v_factor, 6) end;
    v_expiry := nullif(v_line->>'expiry', '')::date;
    v_batch := coalesce(btrim(v_line->>'batch'), '');
    if v_quantity <= 0 or v_unit_cost < 0
       or (v_entered_selling_price is not null and v_entered_selling_price < 0)
       or v_purchase_line.quantity_received + v_base_quantity > v_purchase_line.quantity_ordered then
      raise exception 'Received quantity or lot prices are invalid' using errcode = '22023';
    end if;
    insert into public.inventory_lots (
      company_id, product_id, branch_id, warehouse_id, batch, expiry,
      quantity, purchase_price, selling_price, created_by
    ) values (
      p_company_id, v_purchase_line.product_id, v_purchase.branch_id,
      v_purchase.warehouse_id, v_batch, v_expiry, 0, v_unit_cost,
      v_selling_price, auth.uid()
    ) returning id into v_lot_id;

    v_resulting := v_base_quantity;
    update public.inventory_lots
    set quantity = v_resulting, updated_at = now()
    where id = v_lot_id and company_id = p_company_id;

    insert into public.inventory_movements (
      company_id, product_id, lot_id, branch_id, warehouse_id,
      movement_type, quantity, reason, metadata, created_by
    ) values (
      p_company_id, v_purchase_line.product_id, v_lot_id,
      v_purchase.branch_id, v_purchase.warehouse_id, 'RECEIPT',
      v_base_quantity, 'Purchase received',
      jsonb_build_object(
        'previous_quantity', 0,
        'resulting_quantity', v_resulting,
        'purchase_id', p_purchase_id,
        'purchase_number', v_purchase.purchase_number,
        'receipt_id', v_receipt_id
      ),
      auth.uid()
    );

    insert into public.cloud_purchase_receipt_lines (
      company_id, receipt_id, purchase_line_id, product_id, lot_id,
      quantity, unit_cost, selling_price, batch, expiry,
      packaging_id, entered_quantity, entered_unit_cost, entered_selling_price,
      packaging_name_snapshot, packaging_unit_snapshot,
      conversion_factor_snapshot, base_unit_snapshot
    ) values (
      p_company_id, v_receipt_id, v_purchase_line.id,
      v_purchase_line.product_id, v_lot_id, v_base_quantity, v_unit_cost,
      v_selling_price, v_batch, v_expiry,
      v_purchase_line.packaging_id, v_quantity, v_entered_unit_cost,
      v_entered_selling_price, v_purchase_line.packaging_name_snapshot,
      v_purchase_line.packaging_unit_snapshot, v_factor,
      v_purchase_line.base_unit_snapshot
    );
    update public.cloud_purchase_lines
    set quantity_received = quantity_received + v_base_quantity
    where id = v_purchase_line.id and company_id = p_company_id;
    v_count := v_count + 1;
  end loop;

  update public.cloud_purchases
  set status = case
    when not exists (
      select 1 from public.cloud_purchase_lines
      where company_id = p_company_id
        and purchase_id = p_purchase_id
        and quantity_received < quantity_ordered
    ) then 'received'
    else 'partially_received'
  end
  where id = p_purchase_id and company_id = p_company_id
  returning status into v_purchase.status;

  return jsonb_build_object(
    'receipt_id', v_receipt_id,
    'purchase_id', p_purchase_id,
    'received_lines', v_count,
    'status', v_purchase.status
  );
end;
$$;

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
  v_packaging public.product_packagings%rowtype;
  v_item jsonb;
  v_payment jsonb;
  v_alloc jsonb;
  v_allocations jsonb := '[]'::jsonb;
  v_customer jsonb := coalesce(p_customer, '{}'::jsonb);
  v_payload jsonb;
  v_sale_id uuid;
  v_invoice_number text;
  v_item_qty numeric;
  v_entered_qty numeric;
  v_packaging_id uuid;
  v_factor numeric;
  v_packaging_price numeric;
  v_packaging_price_inclusive boolean := false;
  v_packaging_name text;
  v_packaging_unit text;
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
    v_entered_qty := (v_item->>'quantity')::numeric;
    v_packaging_id := nullif(v_item->>'packaging_id', '')::uuid;
    if v_entered_qty <= 0 then
      raise exception 'Sale quantity must be greater than zero' using errcode = '22023';
    end if;
    select * into v_product from public.products
    where id = (v_item->>'product_id')::uuid
      and company_id = p_company_id and is_active;
    if not found then
      raise exception 'Active company product not found' using errcode = 'P0002';
    end if;
    v_packaging_price := null;
    v_packaging_price_inclusive := false;
    if v_packaging_id is not null then
      select * into v_packaging
      from public.product_packagings
      where id = v_packaging_id
        and company_id = p_company_id
        and product_id = v_product.id
        and is_active
        and is_sales_unit
      for share;
      if not found then
        raise exception 'Active sales packaging not found for this product'
          using errcode = 'P0002';
      end if;
      if not v_packaging.allow_fractional_quantity and v_entered_qty <> trunc(v_entered_qty) then
        raise exception 'This packaging does not allow fractional quantities'
          using errcode = '22023';
      end if;
      v_factor := v_packaging.base_quantity;
      v_packaging_name := v_packaging.name;
      select coalesce(nullif(units.symbol, ''), units.name)
      into v_packaging_unit
      from public.units_of_measure as units
      where units.company_id = p_company_id and units.id = v_packaging.unit_id;

      select prices.amount, prices.tax_inclusive
      into v_packaging_price, v_packaging_price_inclusive
      from public.product_prices as prices
      where prices.company_id = p_company_id
        and prices.product_id = v_product.id
        and prices.packaging_id = v_packaging_id
        and prices.price_type = 'retail'
        and prices.currency_code = v_company.currency
        and prices.is_active
        and prices.valid_from <= current_date
        and (prices.valid_to is null or prices.valid_to >= current_date)
        and (prices.branch_id = p_branch_id or prices.branch_id is null)
      order by case when prices.branch_id = p_branch_id then 0 else 1 end,
        prices.valid_from desc, prices.created_at desc
      limit 1;
    else
      v_factor := 1;
      v_packaging_name := v_product.unit;
      v_packaging_unit := v_product.unit;
    end if;
    v_item_qty := round(v_entered_qty * v_factor, 6);
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
      v_vat_rate := case when v_product.vat_rate > 0
        then v_product.vat_rate else v_company.tax_rate end;
      if v_factor > 1 and v_packaging_price is not null then
        v_price := case when v_packaging_price_inclusive
          then v_packaging_price / (1 + v_vat_rate / 100) / v_factor
          else v_packaging_price / v_factor
        end;
      else
        v_price := coalesce(v_lot.selling_price, v_product.selling_price);
      end if;
      if v_price < 0 then
        raise exception 'Resolved lot selling price is invalid' using errcode = '22023';
      end if;
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
        'packaging_id', v_packaging_id,
        'entered_quantity', v_alloc_qty / v_factor,
        'entered_unit_price', v_price * v_factor,
        'packaging_name_snapshot', v_packaging_name,
        'packaging_unit_snapshot', v_packaging_unit,
        'conversion_factor_snapshot', v_factor,
        'base_unit_snapshot', v_product.unit,
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
      vat_rate, vat_amount, line_total,
      packaging_id, entered_quantity, entered_unit_price,
      packaging_name_snapshot, packaging_unit_snapshot,
      conversion_factor_snapshot, base_unit_snapshot
    ) values (
      p_company_id, v_sale_id, (v_alloc->>'product_id')::uuid,
      (v_alloc->>'lot_id')::uuid, v_alloc->>'product_name',
      v_alloc->>'sku', v_alloc->>'unit', v_alloc->>'batch',
      nullif(v_alloc->>'expiry', '')::date, (v_alloc->>'quantity')::numeric,
      (v_alloc->>'unit_price')::numeric, (v_alloc->>'unit_cost')::numeric,
      v_discount_share, (v_alloc->>'vat_rate')::numeric, v_line_vat, v_line_total,
      nullif(v_alloc->>'packaging_id', '')::uuid,
      (v_alloc->>'entered_quantity')::numeric,
      (v_alloc->>'entered_unit_price')::numeric,
      v_alloc->>'packaging_name_snapshot',
      v_alloc->>'packaging_unit_snapshot',
      (v_alloc->>'conversion_factor_snapshot')::numeric,
      v_alloc->>'base_unit_snapshot'
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

revoke all on function public.create_cloud_purchase(uuid, uuid, uuid, uuid, text, jsonb, uuid)
  from public, anon;
revoke all on function public.receive_cloud_purchase_once(uuid, uuid, jsonb, uuid)
  from public, anon;
revoke all on function public.checkout_cloud_sale_once(uuid, uuid, uuid, jsonb, jsonb, numeric, jsonb, uuid)
  from public, anon;
grant execute on function public.create_cloud_purchase(uuid, uuid, uuid, uuid, text, jsonb, uuid)
  to authenticated;
grant execute on function public.receive_cloud_purchase_once(uuid, uuid, jsonb, uuid)
  to authenticated;
grant execute on function public.checkout_cloud_sale_once(uuid, uuid, uuid, jsonb, jsonb, numeric, jsonb, uuid)
  to authenticated;
