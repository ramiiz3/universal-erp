alter table public.products
  add column description text not null default '',
  add column is_active boolean not null default true,
  add constraint products_description_length
    check (char_length(description) <= 5000);

grant update (description, is_active)
  on public.products to authenticated;

create or replace function public.record_inventory_movement(
  p_company_id uuid,
  p_lot_id uuid,
  p_movement_type text,
  p_quantity_delta numeric,
  p_reason text default '',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lot public.inventory_lots%rowtype;
  v_previous_quantity numeric;
  v_resulting_quantity numeric;
  v_movement_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_movement_type not in ('OPENING', 'RECEIPT', 'SALE', 'RETURN', 'ADJUSTMENT', 'DAMAGE', 'LOSS')
     or p_movement_type is null
     or p_quantity_delta is null
     or p_quantity_delta = 0 then
    raise exception 'Invalid movement type or quantity' using errcode = '22023';
  end if;

  select *
    into v_lot
    from public.inventory_lots
   where id = p_lot_id
     and company_id = p_company_id
   for update;

  if not found then
    raise exception 'Inventory lot not found' using errcode = 'P0002';
  end if;

  if not private.has_company_permission(p_company_id, 'manage_inventory', v_lot.branch_id) then
    raise exception 'Insufficient inventory permission' using errcode = '42501';
  end if;

  if p_movement_type in ('OPENING', 'RECEIPT', 'RETURN') and p_quantity_delta < 0 then
    raise exception 'This movement type requires a positive quantity' using errcode = '22023';
  end if;
  if p_movement_type in ('SALE', 'DAMAGE', 'LOSS') and p_quantity_delta > 0 then
    raise exception 'This movement type requires a negative quantity' using errcode = '22023';
  end if;

  v_previous_quantity := v_lot.quantity;
  v_resulting_quantity := v_previous_quantity + p_quantity_delta;
  if v_resulting_quantity < 0 then
    raise exception 'Inventory quantity cannot become negative' using errcode = '23514';
  end if;

  update public.inventory_lots
     set quantity = v_resulting_quantity,
         updated_at = now()
   where id = v_lot.id;

  insert into public.inventory_movements (
    company_id,
    product_id,
    lot_id,
    branch_id,
    warehouse_id,
    movement_type,
    quantity,
    reason,
    metadata,
    created_by
  ) values (
    v_lot.company_id,
    v_lot.product_id,
    v_lot.id,
    v_lot.branch_id,
    v_lot.warehouse_id,
    p_movement_type,
    p_quantity_delta,
    coalesce(p_reason, ''),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'previous_quantity', v_previous_quantity,
      'resulting_quantity', v_resulting_quantity
    ),
    auth.uid()
  )
  returning id into v_movement_id;

  return v_movement_id;
end;
$$;

create or replace function public.receive_inventory_lot(
  p_company_id uuid,
  p_product_id uuid,
  p_branch_id uuid,
  p_warehouse_id uuid,
  p_batch text,
  p_expiry date,
  p_quantity numeric,
  p_purchase_price numeric,
  p_selling_price numeric default null,
  p_reason text default 'Stock received'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lot_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_quantity is null or p_quantity <= 0
     or p_purchase_price is null or p_purchase_price < 0
     or (p_selling_price is not null and p_selling_price < 0)
     or p_branch_id is null or p_warehouse_id is null then
    raise exception 'Invalid stock receipt values' using errcode = '22023';
  end if;
  if not private.has_company_permission(p_company_id, 'manage_inventory', p_branch_id) then
    raise exception 'Insufficient inventory permission' using errcode = '42501';
  end if;
  if not exists (
    select 1
      from public.products
     where id = p_product_id
       and company_id = p_company_id
       and is_active
  ) then
    raise exception 'Active company product not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1
      from public.warehouses
     where id = p_warehouse_id
       and company_id = p_company_id
       and branch_id = p_branch_id
  ) then
    raise exception 'Company warehouse not found for branch' using errcode = '23503';
  end if;

  insert into public.inventory_lots (
    company_id,
    product_id,
    branch_id,
    warehouse_id,
    batch,
    expiry,
    quantity,
    purchase_price,
    selling_price,
    created_by
  ) values (
    p_company_id,
    p_product_id,
    p_branch_id,
    p_warehouse_id,
    coalesce(p_batch, ''),
    p_expiry,
    p_quantity,
    p_purchase_price,
    p_selling_price,
    auth.uid()
  )
  returning id into v_lot_id;

  insert into public.inventory_movements (
    company_id,
    product_id,
    lot_id,
    branch_id,
    warehouse_id,
    movement_type,
    quantity,
    reason,
    metadata,
    created_by
  ) values (
    p_company_id,
    p_product_id,
    v_lot_id,
    p_branch_id,
    p_warehouse_id,
    'RECEIPT',
    p_quantity,
    coalesce(nullif(btrim(p_reason), ''), 'Stock received'),
    jsonb_build_object(
      'previous_quantity', 0,
      'resulting_quantity', p_quantity
    ),
    auth.uid()
  );

  return v_lot_id;
end;
$$;

create or replace function public.set_default_inventory_warehouse(
  p_company_id uuid,
  p_warehouse_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select branch_id
    into v_branch_id
    from public.warehouses
   where id = p_warehouse_id
     and company_id = p_company_id;
  if not found then
    raise exception 'Company warehouse not found' using errcode = 'P0002';
  end if;
  if not private.has_company_permission(p_company_id, 'manage_inventory', v_branch_id) then
    raise exception 'Insufficient inventory permission' using errcode = '42501';
  end if;

  perform 1
    from public.branches
   where id = v_branch_id
     and company_id = p_company_id
   for update;

  if not found then
    raise exception 'Company branch not found' using errcode = '23503';
  end if;

  update public.warehouses
     set is_default = (id = p_warehouse_id),
         updated_at = now()
   where company_id = p_company_id
     and branch_id = v_branch_id;
end;
$$;

revoke all on function public.receive_inventory_lot(uuid, uuid, uuid, uuid, text, date, numeric, numeric, numeric, text) from public, anon;
revoke all on function public.set_default_inventory_warehouse(uuid, uuid) from public, anon;
grant execute on function public.receive_inventory_lot(uuid, uuid, uuid, uuid, text, date, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.set_default_inventory_warehouse(uuid, uuid) to authenticated;
