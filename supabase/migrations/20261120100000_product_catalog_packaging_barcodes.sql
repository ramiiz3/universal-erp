-- Universal ERP: structured catalog, units, packaging, barcodes and prices.
-- Additive migration. Existing stock quantities remain in products.unit's legacy unit.
-- No production database is changed by committing this file.

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  parent_id uuid,
  name text not null check (length(btrim(name)) between 1 and 160),
  code text not null default '',
  description text not null default '',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, parent_id)
    references public.product_categories (company_id, id),
  check (parent_id is null or parent_id <> id)
);

create unique index product_categories_company_name_scope_uidx
  on public.product_categories (
    company_id,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(name))
  );
create index product_categories_company_parent_idx
  on public.product_categories (company_id, parent_id, sort_order, lower(name));

create table public.units_of_measure (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  code text not null check (length(btrim(code)) between 1 and 40),
  name text not null check (length(btrim(name)) between 1 and 100),
  symbol text not null default '',
  dimension text not null default 'custom'
    check (dimension in ('count', 'mass', 'volume', 'length', 'area', 'time', 'service', 'custom')),
  allow_fractional boolean not null default true,
  decimal_places smallint not null default 6 check (decimal_places between 0 and 6),
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);

create unique index units_of_measure_company_code_uidx
  on public.units_of_measure (company_id, lower(btrim(code)));

alter table public.products
  add column category_id uuid,
  add column base_unit_id uuid,
  add column product_type text not null default 'stock'
    check (product_type in ('stock', 'non_stock', 'service'));

alter table public.products
  add constraint products_company_category_fk
    foreign key (company_id, category_id)
    references public.product_categories (company_id, id),
  add constraint products_company_base_unit_fk
    foreign key (company_id, base_unit_id)
    references public.units_of_measure (company_id, id);

create index products_company_category_idx
  on public.products (company_id, category_id);
create index products_company_base_unit_idx
  on public.products (company_id, base_unit_id);

-- Preserve existing free-text labels exactly; dimension is custom until reviewed.
insert into public.product_categories (
  company_id, name, code, created_by
)
select distinct on (products.company_id, lower(btrim(products.category)))
  products.company_id,
  btrim(products.category),
  left(regexp_replace(lower(btrim(products.category)), '[^a-z0-9]+', '-', 'g'), 40),
  products.created_by
from public.products as products
where nullif(btrim(products.category), '') is not null
order by products.company_id, lower(btrim(products.category)), products.created_at
on conflict do nothing;

insert into public.units_of_measure (
  company_id, code, name, symbol, dimension, allow_fractional,
  decimal_places, is_system, created_by
)
select distinct on (products.company_id, lower(btrim(products.unit)))
  products.company_id,
  left(lower(btrim(products.unit)), 40),
  left(btrim(products.unit), 100),
  left(btrim(products.unit), 100),
  'custom',
  true,
  6,
  true,
  products.created_by
from public.products as products
where nullif(btrim(products.unit), '') is not null
order by products.company_id, lower(btrim(products.unit)), products.created_at
on conflict do nothing;

update public.products as products
set category_id = categories.id
from public.product_categories as categories
where products.category_id is null
  and nullif(btrim(products.category), '') is not null
  and categories.company_id = products.company_id
  and categories.parent_id is null
  and lower(btrim(categories.name)) = lower(btrim(products.category));

update public.products as products
set base_unit_id = units.id
from public.units_of_measure as units
where products.base_unit_id is null
  and nullif(btrim(products.unit), '') is not null
  and units.company_id = products.company_id
  and lower(btrim(units.code)) = lower(btrim(products.unit));

create table public.product_packagings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  product_id uuid not null,
  unit_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 120),
  base_quantity numeric(20, 6) not null check (base_quantity > 0),
  is_base boolean not null default false,
  is_purchase_unit boolean not null default true,
  is_sales_unit boolean not null default true,
  allow_fractional_quantity boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, product_id, id),
  foreign key (company_id, product_id)
    references public.products (company_id, id) on delete cascade,
  foreign key (company_id, unit_id)
    references public.units_of_measure (company_id, id),
  check (not is_base or base_quantity = 1)
);

create unique index product_packagings_one_base_uidx
  on public.product_packagings (company_id, product_id)
  where is_base and is_active;
create unique index product_packagings_product_unit_name_uidx
  on public.product_packagings (company_id, product_id, unit_id, lower(btrim(name)))
  where is_active;
create index product_packagings_product_active_idx
  on public.product_packagings (company_id, product_id, is_active, sort_order);

create table public.product_barcodes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  product_id uuid not null,
  packaging_id uuid not null,
  barcode_value text not null check (length(btrim(barcode_value)) between 1 and 128),
  symbology text not null default 'OTHER'
    check (symbology in ('EAN13', 'EAN8', 'UPCA', 'UPCE', 'CODE128', 'QR', 'DATAMATRIX', 'GS1_128', 'OTHER')),
  barcode_kind text not null default 'internal'
    check (barcode_kind in ('manufacturer_gtin', 'internal', 'supplier', 'other')),
  is_primary boolean not null default false,
  is_active boolean not null default true,
  source_note text not null default '',
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, product_id, packaging_id)
    references public.product_packagings (company_id, product_id, id) on delete cascade
);

create unique index product_barcodes_company_value_uidx
  on public.product_barcodes (company_id, lower(btrim(barcode_value)))
  where is_active;
create unique index product_barcodes_one_primary_per_pack_uidx
  on public.product_barcodes (company_id, product_id, packaging_id)
  where is_primary and is_active;
create index product_barcodes_product_pack_idx
  on public.product_barcodes (company_id, product_id, packaging_id)
  where is_active;

create table public.product_prices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  product_id uuid not null,
  packaging_id uuid not null,
  branch_id uuid,
  price_type text not null
    check (price_type in ('purchase', 'retail', 'wholesale', 'minimum_selling', 'other')),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  amount numeric(20, 6) not null check (amount >= 0),
  tax_inclusive boolean not null default false,
  valid_from date not null default current_date,
  valid_to date,
  is_active boolean not null default true,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, product_id, packaging_id)
    references public.product_packagings (company_id, product_id, id) on delete cascade,
  foreign key (company_id, branch_id)
    references public.branches (company_id, id),
  check (valid_to is null or valid_to >= valid_from)
);

create unique index product_prices_default_active_uidx
  on public.product_prices (company_id, product_id, packaging_id, price_type, currency_code)
  where branch_id is null and is_active;
create unique index product_prices_branch_active_uidx
  on public.product_prices (company_id, product_id, packaging_id, price_type, currency_code, branch_id)
  where branch_id is not null and is_active;
create index product_prices_lookup_idx
  on public.product_prices (company_id, product_id, packaging_id, price_type, valid_from desc);

-- Existing inventory quantities are interpreted in products.unit. The base pack
-- therefore has a factor of exactly one; no inventory quantity is rewritten.
insert into public.product_packagings (
  company_id, product_id, unit_id, name, base_quantity, is_base,
  is_purchase_unit, is_sales_unit, allow_fractional_quantity, created_by
)
select
  products.company_id, products.id, products.base_unit_id,
  coalesce(nullif(btrim(products.unit), ''), 'Base unit'),
  1, true, true, true, true, products.created_by
from public.products as products
where products.base_unit_id is not null
  and not exists (
    select 1 from public.product_packagings as existing
    where existing.company_id = products.company_id
      and existing.product_id = products.id
      and existing.is_base
      and existing.is_active
  );

-- Keep legacy barcodes available while introducing package-aware lookups.
insert into public.product_barcodes (
  company_id, product_id, packaging_id, barcode_value, symbology,
  barcode_kind, is_primary, created_by
)
select
  products.company_id,
  products.id,
  packagings.id,
  products.barcode,
  'OTHER',
  'other',
  true,
  products.created_by
from public.products as products
join public.product_packagings as packagings
  on packagings.company_id = products.company_id
 and packagings.product_id = products.id
 and packagings.is_base
 and packagings.is_active
where nullif(btrim(products.barcode), '') is not null
on conflict do nothing;

-- Preserve current product-level prices as the initial base-package defaults.
insert into public.product_prices (
  company_id, product_id, packaging_id, price_type, currency_code,
  amount, tax_inclusive, valid_from, created_by
)
select
  products.company_id,
  products.id,
  packagings.id,
  price_row.price_type,
  companies.currency,
  price_row.amount,
  false,
  current_date,
  products.created_by
from public.products as products
join public.companies as companies on companies.id = products.company_id
join public.product_packagings as packagings
  on packagings.company_id = products.company_id
 and packagings.product_id = products.id
 and packagings.is_base
 and packagings.is_active
cross join lateral (
  values
    ('purchase'::text, products.purchase_price),
    ('retail'::text, products.selling_price)
) as price_row(price_type, amount)
where price_row.amount >= 0
on conflict do nothing;

-- Company-wide catalog access is limited to active company members.
alter table public.product_categories enable row level security;
alter table public.units_of_measure enable row level security;
alter table public.product_packagings enable row level security;
alter table public.product_barcodes enable row level security;
alter table public.product_prices enable row level security;

create policy "Company members can view product categories"
on public.product_categories for select to authenticated
using (private.is_company_member(company_id));
create policy "Inventory managers can insert product categories"
on public.product_categories for insert to authenticated
with check (created_by = (select auth.uid()) and private.has_company_permission(company_id, 'manage_inventory'));
create policy "Inventory managers can update product categories"
on public.product_categories for update to authenticated
using (private.has_company_permission(company_id, 'manage_inventory'))
with check (private.has_company_permission(company_id, 'manage_inventory'));
create policy "Inventory managers can delete product categories"
on public.product_categories for delete to authenticated
using (private.has_company_permission(company_id, 'manage_inventory'));

create policy "Company members can view units of measure"
on public.units_of_measure for select to authenticated
using (private.is_company_member(company_id));
create policy "Inventory managers can insert units of measure"
on public.units_of_measure for insert to authenticated
with check (created_by = (select auth.uid()) and private.has_company_permission(company_id, 'manage_inventory'));
create policy "Inventory managers can update units of measure"
on public.units_of_measure for update to authenticated
using (private.has_company_permission(company_id, 'manage_inventory'))
with check (private.has_company_permission(company_id, 'manage_inventory'));
create policy "Inventory managers can delete units of measure"
on public.units_of_measure for delete to authenticated
using (private.has_company_permission(company_id, 'manage_inventory'));

create policy "Company members can view product packagings"
on public.product_packagings for select to authenticated
using (private.is_company_member(company_id));
create policy "Inventory managers can insert product packagings"
on public.product_packagings for insert to authenticated
with check (created_by = (select auth.uid()) and private.has_company_permission(company_id, 'manage_inventory'));
create policy "Inventory managers can update product packagings"
on public.product_packagings for update to authenticated
using (private.has_company_permission(company_id, 'manage_inventory'))
with check (private.has_company_permission(company_id, 'manage_inventory'));
create policy "Inventory managers can delete product packagings"
on public.product_packagings for delete to authenticated
using (private.has_company_permission(company_id, 'manage_inventory'));

create policy "Company members can view product barcodes"
on public.product_barcodes for select to authenticated
using (private.is_company_member(company_id));
create policy "Inventory managers can insert product barcodes"
on public.product_barcodes for insert to authenticated
with check (created_by = (select auth.uid()) and private.has_company_permission(company_id, 'manage_inventory'));
create policy "Inventory managers can update product barcodes"
on public.product_barcodes for update to authenticated
using (private.has_company_permission(company_id, 'manage_inventory'))
with check (private.has_company_permission(company_id, 'manage_inventory'));
create policy "Inventory managers can delete product barcodes"
on public.product_barcodes for delete to authenticated
using (private.has_company_permission(company_id, 'manage_inventory'));

create policy "Company members can view product prices"
on public.product_prices for select to authenticated
using (
  (branch_id is null and private.is_company_member(company_id))
  or private.has_company_permission(company_id, 'view_company', branch_id)
);
create policy "Inventory managers can insert product prices"
on public.product_prices for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (
    (branch_id is null and private.has_company_permission(company_id, 'manage_inventory'))
    or private.has_company_permission(company_id, 'manage_inventory', branch_id)
  )
);
create policy "Inventory managers can update product prices"
on public.product_prices for update to authenticated
using (
  (branch_id is null and private.has_company_permission(company_id, 'manage_inventory'))
  or private.has_company_permission(company_id, 'manage_inventory', branch_id)
)
with check (
  (branch_id is null and private.has_company_permission(company_id, 'manage_inventory'))
  or private.has_company_permission(company_id, 'manage_inventory', branch_id)
);
create policy "Inventory managers can delete product prices"
on public.product_prices for delete to authenticated
using (
  (branch_id is null and private.has_company_permission(company_id, 'manage_inventory'))
  or private.has_company_permission(company_id, 'manage_inventory', branch_id)
);

revoke all on public.product_categories, public.units_of_measure,
  public.product_packagings, public.product_barcodes, public.product_prices
from public, anon, authenticated;
grant select, insert, update, delete on public.product_categories,
  public.units_of_measure, public.product_packagings, public.product_barcodes,
  public.product_prices to authenticated;

grant update (category_id, base_unit_id, product_type)
on public.products to authenticated;

-- Maintain compatibility with the existing product form and direct inserts.
-- New products get a company category and base UOM when legacy labels are supplied.
create or replace function private.prepare_product_catalog_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category_id uuid;
  v_unit_id uuid;
  v_code text;
begin
  if tg_op = 'INSERT' then
    v_category_id := null;
  else
    v_category_id := case when new.category is distinct from old.category then null else new.category_id end;
  end if;

  if nullif(btrim(new.category), '') is not null
     and (tg_op = 'INSERT' or v_category_id is null) then
    select categories.id into v_category_id
    from public.product_categories as categories
    where categories.company_id = new.company_id
      and categories.parent_id is null
      and lower(btrim(categories.name)) = lower(btrim(new.category))
    limit 1;
    if v_category_id is null then
      insert into public.product_categories (
        company_id, name, code, created_by
      ) values (
        new.company_id,
        btrim(new.category),
        left(regexp_replace(lower(btrim(new.category)), '[^a-z0-9]+', '-', 'g'), 40),
        new.created_by
      )
      returning id into v_category_id;
    end if;
    new.category_id := v_category_id;
  end if;

  if tg_op = 'INSERT' and new.base_unit_id is null
     and nullif(btrim(new.unit), '') is not null then
    v_code := lower(btrim(new.unit));
    select units.id into v_unit_id
    from public.units_of_measure as units
    where units.company_id = new.company_id
      and lower(btrim(units.code)) = v_code
    limit 1;
    if v_unit_id is null then
      insert into public.units_of_measure (
        company_id, code, name, symbol, dimension, allow_fractional,
        decimal_places, is_system, created_by
      ) values (
        new.company_id, left(v_code, 40), left(btrim(new.unit), 100),
        left(btrim(new.unit), 100), 'custom', true, 6, false, new.created_by
      )
      returning id into v_unit_id;
    end if;
    new.base_unit_id := v_unit_id;
  end if;

  return new;
end;
$$;

create or replace function private.sync_product_catalog_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_packaging_id uuid;
  v_currency text;
begin
  if new.base_unit_id is null then
    return new;
  end if;

  select packagings.id into v_packaging_id
  from public.product_packagings as packagings
  where packagings.company_id = new.company_id
    and packagings.product_id = new.id
    and packagings.is_base
    and packagings.is_active
  limit 1;

  if v_packaging_id is null then
    insert into public.product_packagings (
      company_id, product_id, unit_id, name, base_quantity, is_base,
      is_purchase_unit, is_sales_unit, allow_fractional_quantity, created_by
    ) values (
      new.company_id, new.id, new.base_unit_id,
      coalesce(nullif(btrim(new.unit), ''), 'Base unit'),
      1, true, true, true, true, new.created_by
    )
    returning id into v_packaging_id;
  end if;

  if nullif(btrim(new.barcode), '') is not null then
    insert into public.product_barcodes (
      company_id, product_id, packaging_id, barcode_value, symbology,
      barcode_kind, is_primary, created_by
    ) values (
      new.company_id, new.id, v_packaging_id, btrim(new.barcode),
      'OTHER', 'other', true, new.created_by
    )
    on conflict do nothing;
  end if;

  select companies.currency into v_currency
  from public.companies as companies
  where companies.id = new.company_id;

  update public.product_prices as prices
  set is_active = false, valid_to = current_date, updated_at = now()
  where prices.company_id = new.company_id
    and prices.product_id = new.id
    and prices.packaging_id = v_packaging_id
    and prices.branch_id is null
    and prices.is_active
    and (
      (prices.price_type = 'purchase' and prices.amount <> new.purchase_price)
      or (prices.price_type = 'retail' and prices.amount <> new.selling_price)
    );

  insert into public.product_prices (
    company_id, product_id, packaging_id, price_type, currency_code,
    amount, tax_inclusive, valid_from, created_by
  ) values
    (new.company_id, new.id, v_packaging_id, 'purchase', v_currency,
      new.purchase_price, false, current_date, new.created_by),
    (new.company_id, new.id, v_packaging_id, 'retail', v_currency,
      new.selling_price, false, current_date, new.created_by)
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function private.prepare_product_catalog_defaults() from public, anon, authenticated;
revoke all on function private.sync_product_catalog_defaults() from public, anon, authenticated;

drop trigger if exists prepare_product_catalog_defaults on public.products;
create trigger prepare_product_catalog_defaults
before insert or update of category on public.products
for each row execute function private.prepare_product_catalog_defaults();

drop trigger if exists sync_product_catalog_defaults on public.products;
create trigger sync_product_catalog_defaults
after insert or update of barcode, purchase_price, selling_price, base_unit_id
on public.products
for each row execute function private.sync_product_catalog_defaults();

comment on table public.product_categories is
  'Tenant-scoped product category hierarchy. Legacy products.category is retained during compatibility transition.';
comment on table public.units_of_measure is
  'Tenant-scoped unit labels. Physical dimensions/conversions are explicit; legacy labels are backfilled as custom pending review.';
comment on table public.product_packagings is
  'Product-specific trade units. base_quantity is the direct quantity in the product stock base unit.';
comment on table public.product_barcodes is
  'Multiple scannable barcode values per product packaging level. Values are stored as text to preserve leading zeros.';
comment on table public.product_prices is
  'Effective-dated prices for one packaging unit, with optional branch-specific overrides.';
