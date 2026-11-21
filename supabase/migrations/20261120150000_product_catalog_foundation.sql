-- Universal ERP: company-scoped product catalog foundation.
-- Adds categories, units, product packaging, package barcodes and package prices.
-- Existing products.category/unit/barcode and all inventory quantities are retained.
-- Legacy products are backfilled with one base packaging level at a conversion factor of 1.

begin;

-- -----------------------------------------------------------------------------
-- 1. Category master (supports parent/child categories)
-- -----------------------------------------------------------------------------
create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  parent_id uuid,
  name text not null check (length(btrim(name)) between 1 and 160),
  code text not null default '',
  description text not null default '',
  is_active boolean not null default true,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, parent_id)
    references public.product_categories (company_id, id)
    on delete restrict,
  check (parent_id is null or parent_id <> id)
);

create unique index product_categories_company_parent_name_unique
  on public.product_categories (
    company_id,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(name))
  );

create unique index product_categories_company_code_unique
  on public.product_categories (company_id, lower(btrim(code)))
  where btrim(code) <> '';

create index product_categories_company_parent_idx
  on public.product_categories (company_id, parent_id, lower(name));

-- -----------------------------------------------------------------------------
-- 2. Units of measure
-- Conversion between packaging levels is stored separately in product_packagings.
-- factor_to_base is for compatible measurement-unit conversions (e.g. kg to g).
-- Legacy units are imported as "other" so no unknown conversion is assumed.
-- -----------------------------------------------------------------------------
create table public.units_of_measure (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 100),
  symbol text not null check (length(btrim(symbol)) between 1 and 32),
  unit_type text not null default 'other'
    check (unit_type in ('count', 'mass', 'volume', 'length', 'area', 'time', 'other')),
  factor_to_base numeric(20, 10) not null default 1 check (factor_to_base > 0),
  is_active boolean not null default true,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);

create unique index units_of_measure_company_symbol_unique
  on public.units_of_measure (company_id, lower(btrim(symbol)));

create index units_of_measure_company_name_idx
  on public.units_of_measure (company_id, lower(name));

-- -----------------------------------------------------------------------------
-- 3. Link product records to catalog masters.
-- These are initially nullable to preserve compatibility while the UI is updated.
-- Every existing product receives a base_unit_id in the backfill below.
-- -----------------------------------------------------------------------------
alter table public.products
  add column category_id uuid,
  add column base_unit_id uuid;

alter table public.products
  add constraint products_company_category_fkey
    foreign key (company_id, category_id)
    references public.product_categories (company_id, id)
    on delete restrict,
  add constraint products_company_base_unit_fkey
    foreign key (company_id, base_unit_id)
    references public.units_of_measure (company_id, id)
    on delete restrict;

create index products_company_category_idx
  on public.products (company_id, category_id)
  where category_id is not null;

create index products_company_base_unit_idx
  on public.products (company_id, base_unit_id)
  where base_unit_id is not null;

-- -----------------------------------------------------------------------------
-- 4. Product packaging levels.
-- base_quantity means: one package contains this many base-stock units.
-- A product has exactly one base packaging record with base_quantity = 1.
-- -----------------------------------------------------------------------------
create table public.product_packagings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  product_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 100),
  base_quantity numeric(20, 6) not null check (base_quantity > 0),
  is_base_unit boolean not null default false,
  allow_fractional boolean not null default false,
  is_purchase_enabled boolean not null default true,
  is_sale_enabled boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, product_id, id),
  foreign key (company_id, product_id)
    references public.products (company_id, id)
    on delete cascade,
  check (not is_base_unit or base_quantity = 1)
);

create unique index product_packagings_product_name_unique
  on public.product_packagings (company_id, product_id, lower(btrim(name)));

create unique index product_packagings_one_base_unit_unique
  on public.product_packagings (company_id, product_id)
  where is_base_unit;

create index product_packagings_company_product_active_idx
  on public.product_packagings (company_id, product_id, is_active, sort_order);

-- -----------------------------------------------------------------------------
-- 5. Multiple barcodes per product/package.
-- The same barcode cannot be assigned twice within one company.
-- -----------------------------------------------------------------------------
create table public.product_barcodes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  product_id uuid not null,
  packaging_id uuid not null,
  barcode text not null check (length(btrim(barcode)) between 1 and 128),
  barcode_type text not null default 'other'
    check (barcode_type in ('ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'qr', 'internal', 'other')),
  is_primary boolean not null default false,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, product_id, packaging_id)
    references public.product_packagings (company_id, product_id, id)
    on delete restrict
);

create unique index product_barcodes_company_barcode_unique
  on public.product_barcodes (company_id, lower(btrim(barcode)));

create unique index product_barcodes_one_primary_per_product_unique
  on public.product_barcodes (company_id, product_id)
  where is_primary;

create index product_barcodes_company_product_idx
  on public.product_barcodes (company_id, product_id);

-- -----------------------------------------------------------------------------
-- 6. Package-specific prices with effective dating and optional branch override.
-- One open-ended price is allowed for each company/product/package/branch/type.
-- -----------------------------------------------------------------------------
create table public.product_prices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  product_id uuid not null,
  packaging_id uuid not null,
  branch_id uuid,
  price_type text not null check (price_type in ('purchase', 'selling')),
  amount numeric(20, 6) not null check (amount >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from),
  foreign key (company_id, product_id, packaging_id)
    references public.product_packagings (company_id, product_id, id)
    on delete restrict,
  foreign key (company_id, branch_id)
    references public.branches (company_id, id)
    on delete restrict
);

create unique index product_prices_one_open_price_unique
  on public.product_prices (
    company_id,
    product_id,
    packaging_id,
    coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
    price_type
  )
  where effective_to is null;

create index product_prices_lookup_idx
  on public.product_prices (
    company_id, product_id, packaging_id, price_type, effective_from desc
  );

-- -----------------------------------------------------------------------------
-- 7. Backfill old categories and units without changing old product text values.
-- -----------------------------------------------------------------------------
insert into public.product_categories (company_id, name, created_by)
select
  p.company_id,
  min(btrim(p.category)) as name,
  min(p.created_by::text)::uuid as created_by
from public.products as p
where btrim(p.category) <> ''
group by p.company_id, lower(btrim(p.category))
on conflict do nothing;

insert into public.units_of_measure (
  company_id, name, symbol, unit_type, factor_to_base, created_by
)
select
  p.company_id,
  min(coalesce(nullif(btrim(p.unit), ''), 'each')) as name,
  min(coalesce(nullif(btrim(p.unit), ''), 'each')) as symbol,
  'other',
  1,
  min(p.created_by::text)::uuid as created_by
from public.products as p
group by p.company_id, lower(coalesce(nullif(btrim(p.unit), ''), 'each'))
on conflict do nothing;

update public.products as p
set category_id = c.id
from public.product_categories as c
where c.company_id = p.company_id
  and lower(btrim(c.name)) = lower(btrim(p.category))
  and btrim(p.category) <> ''
  and p.category_id is null;

update public.products as p
set base_unit_id = u.id
from public.units_of_measure as u
where u.company_id = p.company_id
  and lower(btrim(u.symbol)) = lower(coalesce(nullif(btrim(p.unit), ''), 'each'))
  and p.base_unit_id is null;

-- Existing stock is already recorded in products.unit. Its conversion remains 1:1.
insert into public.product_packagings (
  company_id, product_id, name, base_quantity, is_base_unit,
  allow_fractional, is_purchase_enabled, is_sale_enabled,
  sort_order, created_by
)
select
  p.company_id,
  p.id,
  coalesce(nullif(btrim(p.unit), ''), 'each'),
  1,
  true,
  true,
  true,
  true,
  0,
  p.created_by
from public.products as p
on conflict do nothing;

-- Migrate each legacy primary barcode onto the product's base packaging.
insert into public.product_barcodes (
  company_id, product_id, packaging_id, barcode, barcode_type,
  is_primary, created_by
)
select
  p.company_id,
  p.id,
  pack.id,
  btrim(p.barcode),
  'other',
  true,
  p.created_by
from public.products as p
join public.product_packagings as pack
  on pack.company_id = p.company_id
 and pack.product_id = p.id
 and pack.is_base_unit
where btrim(p.barcode) <> ''
on conflict do nothing;

-- Preserve the existing company currency when migrating old default prices.
insert into public.product_prices (
  company_id, product_id, packaging_id, branch_id, price_type,
  amount, currency, effective_from, created_by
)
select
  p.company_id,
  p.id,
  pack.id,
  null,
  price_row.price_type,
  price_row.amount,
  coalesce(nullif(upper(c.currency), ''), 'AED'),
  now(),
  p.created_by
from public.products as p
join public.product_packagings as pack
  on pack.company_id = p.company_id
 and pack.product_id = p.id
 and pack.is_base_unit
join public.companies as c on c.id = p.company_id
cross join lateral (
  values
    ('purchase'::text, p.purchase_price),
    ('selling'::text, p.selling_price)
) as price_row(price_type, amount)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 8. Row-level security. Read follows company membership; writes require
-- manage_inventory permission. Catalog records are archived, not hard-deleted.
-- -----------------------------------------------------------------------------
alter table public.product_categories enable row level security;
alter table public.units_of_measure enable row level security;
alter table public.product_packagings enable row level security;
alter table public.product_barcodes enable row level security;
alter table public.product_prices enable row level security;

create policy "Company members can view product categories"
on public.product_categories for select to authenticated
using (private.is_company_member(company_id));

create policy "Inventory managers can create product categories"
on public.product_categories for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.has_company_permission(company_id, 'manage_inventory')
);

create policy "Inventory managers can update product categories"
on public.product_categories for update to authenticated
using (private.has_company_permission(company_id, 'manage_inventory'))
with check (private.has_company_permission(company_id, 'manage_inventory'));

create policy "Company members can view units of measure"
on public.units_of_measure for select to authenticated
using (private.is_company_member(company_id));

create policy "Inventory managers can create units of measure"
on public.units_of_measure for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.has_company_permission(company_id, 'manage_inventory')
);

create policy "Inventory managers can update units of measure"
on public.units_of_measure for update to authenticated
using (private.has_company_permission(company_id, 'manage_inventory'))
with check (private.has_company_permission(company_id, 'manage_inventory'));

create policy "Company members can view product packagings"
on public.product_packagings for select to authenticated
using (private.is_company_member(company_id));

create policy "Inventory managers can create product packagings"
on public.product_packagings for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.has_company_permission(company_id, 'manage_inventory')
);

create policy "Inventory managers can update product packagings"
on public.product_packagings for update to authenticated
using (private.has_company_permission(company_id, 'manage_inventory'))
with check (private.has_company_permission(company_id, 'manage_inventory'));

create policy "Company members can view product barcodes"
on public.product_barcodes for select to authenticated
using (private.is_company_member(company_id));

create policy "Inventory managers can create product barcodes"
on public.product_barcodes for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.has_company_permission(company_id, 'manage_inventory')
);

create policy "Inventory managers can update product barcodes"
on public.product_barcodes for update to authenticated
using (private.has_company_permission(company_id, 'manage_inventory'))
with check (private.has_company_permission(company_id, 'manage_inventory'));

create policy "Inventory managers can delete product barcodes"
on public.product_barcodes for delete to authenticated
using (private.has_company_permission(company_id, 'manage_inventory'));

create policy "Company members can view product prices"
on public.product_prices for select to authenticated
using (private.is_company_member(company_id));

create policy "Inventory managers can create product prices"
on public.product_prices for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.has_company_permission(company_id, 'manage_inventory')
);

create policy "Inventory managers can update product prices"
on public.product_prices for update to authenticated
using (private.has_company_permission(company_id, 'manage_inventory'))
with check (private.has_company_permission(company_id, 'manage_inventory'));

-- Supabase projects commonly grant public-schema table privileges by default, but
-- declare authenticated privileges explicitly; RLS remains the authorization layer.
grant select, insert, update on public.product_categories to authenticated;
grant select, insert, update on public.units_of_measure to authenticated;
grant select, insert, update on public.product_packagings to authenticated;
grant select, insert, update, delete on public.product_barcodes to authenticated;
grant select, insert, update on public.product_prices to authenticated;

comment on table public.product_categories is
  'Company-scoped product category hierarchy for the Universal ERP catalog.';
comment on table public.units_of_measure is
  'Company-scoped measurement units. Packaging-to-stock conversion is stored on product_packagings.';
comment on table public.product_packagings is
  'Product-specific packaging levels; base_quantity is the quantity in the product base stock unit.';
comment on table public.product_barcodes is
  'Company-unique barcodes mapped to a product packaging level.';
comment on table public.product_prices is
  'Effective-dated purchase and selling prices for a product packaging level, optionally overridden per branch.';

commit;
