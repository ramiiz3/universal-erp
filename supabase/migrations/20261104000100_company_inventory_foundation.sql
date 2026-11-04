create table public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  source_legacy_id text,
  name text not null check (length(btrim(name)) between 1 and 300),
  category text not null default '',
  sku text not null default '',
  barcode text not null default '',
  purchase_price numeric(20, 6) not null default 0 check (purchase_price >= 0),
  selling_price numeric(20, 6) not null default 0 check (selling_price >= 0),
  minimum_stock numeric(20, 6) not null default 0 check (minimum_stock >= 0),
  vat_rate numeric(7, 4) not null default 0 check (vat_rate between 0 and 100),
  unit text not null default '',
  manufacturer text,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, source_legacy_id)
);

create unique index products_company_sku_unique
  on public.products (company_id, lower(sku))
  where btrim(sku) <> '';
create unique index products_company_barcode_unique
  on public.products (company_id, lower(barcode))
  where btrim(barcode) <> '';
create index products_company_name_idx
  on public.products (company_id, lower(name));

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  branch_id uuid not null,
  source_legacy_id text,
  name text not null check (length(btrim(name)) between 1 and 200),
  code text not null default '',
  address text not null default '',
  is_default boolean not null default false,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, branch_id, id),
  unique (company_id, source_legacy_id),
  unique (company_id, branch_id, name),
  foreign key (company_id, branch_id)
    references public.branches (company_id, id)
);

create unique index warehouses_one_default_per_branch
  on public.warehouses (company_id, branch_id)
  where is_default;
create index warehouses_company_branch_idx
  on public.warehouses (company_id, branch_id);

create table public.inventory_lots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  product_id uuid not null,
  branch_id uuid,
  warehouse_id uuid,
  source_legacy_id text,
  batch text not null default '',
  expiry date,
  quantity numeric(20, 6) not null default 0 check (quantity >= 0),
  purchase_price numeric(20, 6) not null default 0 check (purchase_price >= 0),
  selling_price numeric(20, 6) check (selling_price is null or selling_price >= 0),
  total_purchase_value numeric(20, 6) check (total_purchase_value is null or total_purchase_value >= 0),
  total_selling_value numeric(20, 6) check (total_selling_value is null or total_selling_value >= 0),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, product_id, id),
  unique (company_id, source_legacy_id),
  foreign key (company_id, product_id)
    references public.products (company_id, id),
  foreign key (company_id, branch_id)
    references public.branches (company_id, id),
  foreign key (company_id, branch_id, warehouse_id)
    references public.warehouses (company_id, branch_id, id),
  check (warehouse_id is null or branch_id is not null)
);

create index inventory_lots_company_product_idx
  on public.inventory_lots (company_id, product_id);
create index inventory_lots_company_branch_idx
  on public.inventory_lots (company_id, branch_id);
create index inventory_lots_company_warehouse_idx
  on public.inventory_lots (company_id, warehouse_id);
create index inventory_lots_expiry_idx
  on public.inventory_lots (company_id, expiry)
  where expiry is not null;

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  product_id uuid not null,
  lot_id uuid,
  branch_id uuid,
  warehouse_id uuid,
  source_legacy_id text,
  movement_type text not null check (
    movement_type in ('OPENING', 'RECEIPT', 'SALE', 'RETURN', 'ADJUSTMENT', 'DAMAGE', 'LOSS')
  ),
  quantity numeric(20, 6) not null check (quantity <> 0),
  reason text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, source_legacy_id),
  foreign key (company_id, product_id)
    references public.products (company_id, id),
  foreign key (company_id, product_id, lot_id)
    references public.inventory_lots (company_id, product_id, id),
  foreign key (company_id, branch_id)
    references public.branches (company_id, id),
  foreign key (company_id, branch_id, warehouse_id)
    references public.warehouses (company_id, branch_id, id),
  check (warehouse_id is null or branch_id is not null)
);

create index inventory_movements_company_product_created_idx
  on public.inventory_movements (company_id, product_id, created_at desc);
create index inventory_movements_company_lot_created_idx
  on public.inventory_movements (company_id, lot_id, created_at desc);
create index inventory_movements_company_branch_created_idx
  on public.inventory_movements (company_id, branch_id, created_at desc);

alter table public.products enable row level security;
alter table public.warehouses enable row level security;
alter table public.inventory_lots enable row level security;
alter table public.inventory_movements enable row level security;

create policy "Company members can view products"
on public.products for select to authenticated
using (private.is_company_member(company_id));

create policy "Inventory managers can create products"
on public.products for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.has_company_permission(company_id, 'manage_inventory')
);

create policy "Inventory managers can update products"
on public.products for update to authenticated
using (private.has_company_permission(company_id, 'manage_inventory'))
with check (private.has_company_permission(company_id, 'manage_inventory'));

create policy "Inventory managers can delete products"
on public.products for delete to authenticated
using (private.has_company_permission(company_id, 'manage_inventory'));

create policy "Members can view assigned warehouses"
on public.warehouses for select to authenticated
using (
  private.has_company_permission(company_id, 'view_company', branch_id)
);

create policy "Inventory managers can create warehouses"
on public.warehouses for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.has_company_permission(company_id, 'manage_inventory', branch_id)
);

create policy "Inventory managers can update warehouses"
on public.warehouses for update to authenticated
using (private.has_company_permission(company_id, 'manage_inventory', branch_id))
with check (private.has_company_permission(company_id, 'manage_inventory', branch_id));

create policy "Inventory managers can delete non-default warehouses"
on public.warehouses for delete to authenticated
using (
  not is_default
  and private.has_company_permission(company_id, 'manage_inventory', branch_id)
);

create policy "Members can view permitted inventory lots"
on public.inventory_lots for select to authenticated
using (
  private.has_company_permission(company_id, 'view_company', branch_id)
);

create policy "Inventory managers can create inventory lots"
on public.inventory_lots for insert to authenticated
with check (
  created_by = (select auth.uid())
  and quantity = 0
  and private.has_company_permission(company_id, 'manage_inventory', branch_id)
);

create policy "Inventory managers can update inventory lots"
on public.inventory_lots for update to authenticated
using (private.has_company_permission(company_id, 'manage_inventory', branch_id))
with check (private.has_company_permission(company_id, 'manage_inventory', branch_id));

create policy "Members can view permitted inventory movements"
on public.inventory_movements for select to authenticated
using (
  private.has_company_permission(company_id, 'view_company', branch_id)
);

create or replace function public.create_inventory_lot_with_opening_stock(
  p_company_id uuid,
  p_product_id uuid,
  p_branch_id uuid,
  p_warehouse_id uuid,
  p_source_legacy_id text,
  p_batch text,
  p_expiry date,
  p_quantity numeric,
  p_purchase_price numeric,
  p_selling_price numeric default null,
  p_total_purchase_value numeric default null,
  p_total_selling_value numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_lot_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;
  if not private.has_company_permission(
    p_company_id, 'manage_inventory', p_branch_id
  ) then
    raise exception using errcode = '42501', message = 'Not authorized to create inventory for this company or branch.';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception using errcode = '22023', message = 'Opening quantity must be greater than zero.';
  end if;
  if p_purchase_price is null or p_purchase_price < 0
     or (p_selling_price is not null and p_selling_price < 0)
     or (p_total_purchase_value is not null and p_total_purchase_value < 0)
     or (p_total_selling_value is not null and p_total_selling_value < 0) then
    raise exception using errcode = '22023', message = 'Inventory lot prices and totals must be non-negative.';
  end if;

  insert into public.inventory_lots (
    company_id, product_id, branch_id, warehouse_id, source_legacy_id,
    batch, expiry, quantity, purchase_price, selling_price,
    total_purchase_value, total_selling_value, created_by
  )
  values (
    p_company_id, p_product_id, p_branch_id, p_warehouse_id, p_source_legacy_id,
    coalesce(p_batch, ''), p_expiry, p_quantity, p_purchase_price, p_selling_price,
    p_total_purchase_value, p_total_selling_value, v_user_id
  )
  returning id into v_lot_id;

  insert into public.inventory_movements (
    company_id, product_id, lot_id, branch_id, warehouse_id,
    movement_type, quantity, reason, created_by
  )
  values (
    p_company_id, p_product_id, v_lot_id, p_branch_id, p_warehouse_id,
    'OPENING', p_quantity, 'Opening stock', v_user_id
  );

  return v_lot_id;
end;
$$;

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
  v_user_id uuid := (select auth.uid());
  v_lot public.inventory_lots%rowtype;
  v_movement_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;
  if p_movement_type is null
     or p_movement_type not in ('OPENING', 'RECEIPT', 'SALE', 'RETURN', 'ADJUSTMENT', 'DAMAGE', 'LOSS')
     or p_quantity_delta is null or p_quantity_delta = 0 then
    raise exception using errcode = '22023', message = 'Movement type or quantity is invalid.';
  end if;

  select lots.* into v_lot
  from public.inventory_lots as lots
  where lots.id = p_lot_id
    and lots.company_id = p_company_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Inventory lot not found in this company.';
  end if;
  if not private.has_company_permission(
    v_lot.company_id, 'manage_inventory', v_lot.branch_id
  ) then
    raise exception using errcode = '42501', message = 'Not authorized to change inventory for this company or branch.';
  end if;
  if (
    p_movement_type in ('OPENING', 'RECEIPT', 'RETURN') and p_quantity_delta < 0
  ) or (
    p_movement_type in ('SALE', 'DAMAGE', 'LOSS') and p_quantity_delta > 0
  ) then
    raise exception using errcode = '22023', message = 'Movement quantity direction does not match its type.';
  end if;
  if v_lot.quantity + p_quantity_delta < 0 then
    raise exception using errcode = '23514', message = 'Movement would make lot quantity negative.';
  end if;

  update public.inventory_lots
  set quantity = quantity + p_quantity_delta,
      updated_at = now()
  where id = v_lot.id;

  insert into public.inventory_movements (
    company_id, product_id, lot_id, branch_id, warehouse_id,
    movement_type, quantity, reason, metadata, created_by
  )
  values (
    v_lot.company_id, v_lot.product_id, v_lot.id, v_lot.branch_id, v_lot.warehouse_id,
    p_movement_type, p_quantity_delta, coalesce(p_reason, ''),
    coalesce(p_metadata, '{}'::jsonb), v_user_id
  )
  returning id into v_movement_id;

  return v_movement_id;
end;
$$;

revoke all on function public.create_inventory_lot_with_opening_stock(
  uuid, uuid, uuid, uuid, text, text, date, numeric, numeric, numeric, numeric, numeric
) from public, anon;
revoke all on function public.record_inventory_movement(
  uuid, uuid, text, numeric, text, jsonb
) from public, anon;
grant execute on function public.create_inventory_lot_with_opening_stock(
  uuid, uuid, uuid, uuid, text, text, date, numeric, numeric, numeric, numeric, numeric
) to authenticated;
grant execute on function public.record_inventory_movement(
  uuid, uuid, text, numeric, text, jsonb
) to authenticated;

revoke all on public.products, public.warehouses, public.inventory_lots,
  public.inventory_movements
from public, anon, authenticated;

grant select, insert, update, delete on public.products to authenticated;
revoke update on public.products from authenticated;
grant update (
  name, category, sku, barcode, purchase_price, selling_price,
  minimum_stock, vat_rate, unit, manufacturer, updated_at
) on public.products to authenticated;
grant select, insert, delete on public.warehouses to authenticated;
grant update (
  name, code, address, is_default, updated_at
) on public.warehouses to authenticated;
grant select on public.inventory_lots to authenticated;
grant insert (
  company_id, product_id, branch_id, warehouse_id, source_legacy_id,
  batch, expiry, purchase_price, selling_price, total_purchase_value,
  total_selling_value, created_by
) on public.inventory_lots to authenticated;
grant update (
  batch, expiry, purchase_price, selling_price, total_purchase_value,
  total_selling_value, updated_at
) on public.inventory_lots to authenticated;
grant select on public.inventory_movements to authenticated;

comment on table public.products is
  'Company-scoped product master. source_legacy_id supports a reviewed migration without trusting legacy IDs as tenant ownership.';
comment on table public.warehouses is
  'Company-scoped stock locations linked to a branch in the same company.';
comment on table public.inventory_lots is
  'Company-scoped stock lots. Decimal quantities and prices preserve fractional and lot-specific values.';
comment on table public.inventory_movements is
  'Append-only company-scoped stock movement history. Update/delete are not granted to authenticated clients.';
