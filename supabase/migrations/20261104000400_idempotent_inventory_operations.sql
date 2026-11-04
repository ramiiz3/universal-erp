alter table public.inventory_lots
  add column request_id uuid;

alter table public.inventory_movements
  add column request_id uuid;

create unique index inventory_lots_company_request_id_uidx
  on public.inventory_lots (company_id, request_id)
  where request_id is not null;

create unique index inventory_movements_company_request_id_uidx
  on public.inventory_movements (company_id, request_id)
  where request_id is not null;

create function public.receive_inventory_lot_once(
  p_company_id uuid,
  p_product_id uuid,
  p_branch_id uuid,
  p_warehouse_id uuid,
  p_batch text,
  p_expiry date,
  p_quantity numeric,
  p_purchase_price numeric,
  p_selling_price numeric,
  p_reason text,
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lot_id uuid;
  v_existing public.inventory_lots%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_request_id is null
     or p_quantity is null or p_quantity <= 0
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
    created_by,
    request_id
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
    auth.uid(),
    p_request_id
  )
  on conflict (company_id, request_id) where request_id is not null do nothing
  returning id into v_lot_id;

  if v_lot_id is null then
    select *
      into v_existing
      from public.inventory_lots
     where company_id = p_company_id
       and request_id = p_request_id
     for update;
    if not found then
      raise exception 'Could not resolve repeated stock receipt' using errcode = '40001';
    end if;
    if v_existing.created_by <> auth.uid()
       or v_existing.product_id <> p_product_id
       or v_existing.branch_id <> p_branch_id
       or v_existing.warehouse_id <> p_warehouse_id
       or v_existing.batch <> coalesce(p_batch, '')
       or v_existing.expiry is distinct from p_expiry
       or v_existing.quantity <> p_quantity
       or v_existing.purchase_price <> p_purchase_price
       or v_existing.selling_price is distinct from p_selling_price
       or not exists (
         select 1
           from public.inventory_movements
          where company_id = p_company_id
            and request_id = p_request_id
            and reason = coalesce(nullif(btrim(p_reason), ''), 'Stock received')
       ) then
      raise exception 'Request identifier was already used for a different receipt' using errcode = '22023';
    end if;
    return v_existing.id;
  end if;

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
    created_by,
    request_id
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
    auth.uid(),
    p_request_id
  );

  return v_lot_id;
end;
$$;

create function public.record_inventory_movement_once(
  p_company_id uuid,
  p_lot_id uuid,
  p_quantity_delta numeric,
  p_reason text,
  p_metadata jsonb,
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_movement public.inventory_movements%rowtype;
  v_movement_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_request_id is null or p_quantity_delta is null or p_quantity_delta = 0 then
    raise exception 'Invalid stock adjustment values' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_company_id::text || ':' || p_request_id::text, 0)
  );

  select *
    into v_movement
    from public.inventory_movements
   where company_id = p_company_id
     and request_id = p_request_id;
  if found then
    if not private.has_company_permission(p_company_id, 'manage_inventory', v_movement.branch_id) then
      raise exception 'Insufficient inventory permission' using errcode = '42501';
    end if;
    if v_movement.created_by <> auth.uid()
       or v_movement.lot_id <> p_lot_id
       or v_movement.movement_type <> 'ADJUSTMENT'
       or v_movement.quantity <> p_quantity_delta
       or v_movement.reason <> coalesce(p_reason, '') then
      raise exception 'Request identifier was already used for a different adjustment' using errcode = '22023';
    end if;
    return v_movement.id;
  end if;

  v_movement_id := public.record_inventory_movement(
    p_company_id,
    p_lot_id,
    'ADJUSTMENT',
    p_quantity_delta,
    p_reason,
    coalesce(p_metadata, '{}'::jsonb)
  );

  update public.inventory_movements
     set request_id = p_request_id
   where id = v_movement_id
     and company_id = p_company_id;

  return v_movement_id;
end;
$$;

revoke all on function public.receive_inventory_lot_once(uuid, uuid, uuid, uuid, text, date, numeric, numeric, numeric, text, uuid) from public, anon;
revoke all on function public.record_inventory_movement_once(uuid, uuid, numeric, text, jsonb, uuid) from public, anon;
grant execute on function public.receive_inventory_lot_once(uuid, uuid, uuid, uuid, text, date, numeric, numeric, numeric, text, uuid) to authenticated;
grant execute on function public.record_inventory_movement_once(uuid, uuid, numeric, text, jsonb, uuid) to authenticated;
