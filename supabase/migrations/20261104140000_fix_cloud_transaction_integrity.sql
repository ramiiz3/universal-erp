-- Correct Phase 2C transaction integrity without rewriting an applied migration.
-- Purchase numbers are company-wide, supplier ownership columns are immutable to clients,
-- and POS discount allocation is bounded to the remaining header discount.

begin;

-- Consolidate any existing per-branch counters before changing the key.
create temporary table _cloud_purchase_sequence_rollup on commit drop as
select company_id, max(next_number) as next_number
from public.cloud_purchase_sequences
group by company_id;

delete from public.cloud_purchase_sequences;
alter table public.cloud_purchase_sequences
  drop constraint if exists cloud_purchase_sequences_company_id_branch_id_fkey;
alter table public.cloud_purchase_sequences
  drop constraint if exists cloud_purchase_sequences_pkey;
alter table public.cloud_purchase_sequences
  drop column if exists branch_id;
alter table public.cloud_purchase_sequences
  add constraint cloud_purchase_sequences_pkey primary key (company_id);
insert into public.cloud_purchase_sequences (company_id, next_number)
select company_id, next_number from _cloud_purchase_sequence_rollup;

-- Remove table-wide UPDATE and permit updates only to supplier business fields.
revoke update on public.cloud_suppliers from authenticated;
grant update (
  name,
  email,
  phone,
  address,
  tax_registration_number,
  is_active,
  updated_at
) on public.cloud_suppliers to authenticated;

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
  v_product_id uuid;
  v_quantity numeric;
  v_unit_cost numeric;
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
    v_line_base := round(v_quantity * v_unit_cost, 2);
    v_vat_rate := case when v_product.vat_rate > 0
      then v_product.vat_rate else v_company.tax_rate end;
    v_line_vat := round((v_line_base - v_discount) * v_vat_rate / 100, 2);
    insert into public.cloud_purchase_lines (
      company_id, purchase_id, product_id, product_name, sku, unit,
      quantity_ordered, unit_cost, discount_amount, vat_rate, vat_amount, line_total
    ) values (
      p_company_id, v_purchase_id, v_product.id, v_product.name, v_product.sku,
      v_product.unit, v_quantity, v_unit_cost, v_discount, v_vat_rate,
      v_line_vat, v_line_base - v_discount + v_line_vat
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
      v_vat_rate := case when v_product.vat_rate > 0
        then v_product.vat_rate else v_company.tax_rate end;
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

revoke all on function public.create_cloud_purchase(uuid, uuid, uuid, uuid, text, jsonb, uuid)
  from public, anon;
revoke all on function public.checkout_cloud_sale_once(uuid, uuid, uuid, jsonb, jsonb, numeric, jsonb, uuid)
  from public, anon;
grant execute on function public.create_cloud_purchase(uuid, uuid, uuid, uuid, text, jsonb, uuid)
  to authenticated;
grant execute on function public.checkout_cloud_sale_once(uuid, uuid, uuid, jsonb, jsonb, numeric, jsonb, uuid)
  to authenticated;

commit;
