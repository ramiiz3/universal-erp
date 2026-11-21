-- Universal ERP: keep new products catalog-ready and maintain effective-dated prices.
-- Run after 20261120150000_product_catalog_foundation.sql.
-- This migration does not change inventory quantities or existing transaction rows.

begin;

-- ----------------------------------------------------------------------------
-- 1. Create a default base unit, category link, base package, barcode and prices
-- for products created after the catalog foundation migration.
-- ----------------------------------------------------------------------------
create or replace function private.ensure_product_catalog_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit_symbol text;
  v_unit_id uuid;
  v_category_id uuid;
  v_packaging_id uuid;
  v_currency text;
begin
  v_unit_symbol := coalesce(nullif(btrim(new.unit), ''), 'each');

  if new.base_unit_id is not null then
    v_unit_id := new.base_unit_id;
  else
    insert into public.units_of_measure (
      company_id, name, symbol, unit_type, factor_to_base, created_by
    ) values (
      new.company_id, v_unit_symbol, v_unit_symbol, 'other', 1, new.created_by
    ) on conflict do nothing;

    select u.id into v_unit_id
    from public.units_of_measure as u
    where u.company_id = new.company_id
      and lower(btrim(u.symbol)) = lower(v_unit_symbol)
    order by u.created_at, u.id
    limit 1;

    if v_unit_id is null then
      raise exception 'Could not resolve the product base unit';
    end if;
  end if;

  if new.category_id is not null then
    v_category_id := new.category_id;
  elsif btrim(coalesce(new.category, '')) <> '' then
    insert into public.product_categories (company_id, name, created_by)
    values (new.company_id, btrim(new.category), new.created_by)
    on conflict do nothing;

    select c.id into v_category_id
    from public.product_categories as c
    where c.company_id = new.company_id
      and lower(btrim(c.name)) = lower(btrim(new.category))
    order by c.created_at, c.id
    limit 1;
  end if;

  update public.products
  set base_unit_id = v_unit_id,
      category_id = v_category_id
  where id = new.id and company_id = new.company_id;

  insert into public.product_packagings (
    company_id, product_id, name, base_quantity, is_base_unit,
    allow_fractional, is_purchase_enabled, is_sale_enabled,
    sort_order, created_by
  ) values (
    new.company_id, new.id, v_unit_symbol, 1, true,
    true, true, true, 0, new.created_by
  ) on conflict do nothing;

  select p.id into v_packaging_id
  from public.product_packagings as p
  where p.company_id = new.company_id
    and p.product_id = new.id
    and p.is_base_unit
  limit 1;

  if v_packaging_id is null then
    raise exception 'Could not create the product base packaging';
  end if;

  if btrim(coalesce(new.barcode, '')) <> '' then
    insert into public.product_barcodes (
      company_id, product_id, packaging_id, barcode, barcode_type,
      is_primary, created_by
    ) values (
      new.company_id, new.id, v_packaging_id, btrim(new.barcode), 'other',
      true, new.created_by
    ) on conflict do nothing;
  end if;

  select upper(coalesce(nullif(btrim(c.currency), ''), 'AED'))
  into v_currency
  from public.companies as c
  where c.id = new.company_id;

  insert into public.product_prices (
    company_id, product_id, packaging_id, branch_id, price_type,
    amount, currency, created_by
  ) values
    (new.company_id, new.id, v_packaging_id, null, 'purchase', new.purchase_price, v_currency, new.created_by),
    (new.company_id, new.id, v_packaging_id, null, 'selling', new.selling_price, v_currency, new.created_by)
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function private.ensure_product_catalog_defaults() from public, anon, authenticated;

drop trigger if exists products_ensure_catalog_defaults on public.products;
create trigger products_ensure_catalog_defaults
after insert on public.products
for each row execute function private.ensure_product_catalog_defaults();

-- ----------------------------------------------------------------------------
-- 2. Atomically close the current price row and insert a new price row.
-- Base-package company prices also update legacy products price columns so
-- existing transaction workflows continue to see the current base-unit price.
-- ----------------------------------------------------------------------------
create or replace function public.set_product_price(
  p_company_id uuid,
  p_product_id uuid,
  p_packaging_id uuid,
  p_branch_id uuid,
  p_price_type text,
  p_amount numeric,
  p_currency text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_packaging public.product_packagings%rowtype;
  v_price_id uuid;
  v_now timestamptz;
  v_currency text := upper(btrim(coalesce(p_currency, '')));
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_price_type is null or p_price_type not in ('purchase', 'selling')
     or p_amount is null or p_amount < 0 or p_amount = 'NaN'::numeric
     or v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Price type, amount or currency is invalid' using errcode = '22023';
  end if;
  if not private.has_company_permission(
    p_company_id, 'manage_inventory', p_branch_id
  ) then
    raise exception 'Insufficient inventory permission' using errcode = '42501';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id and company_id = p_company_id and is_active
  for update;
  if not found then
    raise exception 'Active company product not found' using errcode = 'P0002';
  end if;

  select * into v_packaging
  from public.product_packagings
  where id = p_packaging_id
    and company_id = p_company_id
    and product_id = p_product_id
    and is_active
  for update;
  if not found then
    raise exception 'Active product packaging not found' using errcode = 'P0002';
  end if;

  if p_branch_id is not null and not exists (
    select 1 from public.branches
    where id = p_branch_id and company_id = p_company_id
  ) then
    raise exception 'Branch does not belong to this company' using errcode = '23503';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_company_id::text || ':' || p_product_id::text || ':' || p_packaging_id::text || ':' ||
    coalesce(p_branch_id::text, 'company') || ':' || p_price_type,
    0
  ));
  v_now := clock_timestamp();

  update public.product_prices
  set effective_to = v_now
  where company_id = p_company_id
    and product_id = p_product_id
    and packaging_id = p_packaging_id
    and branch_id is not distinct from p_branch_id
    and price_type = p_price_type
    and effective_to is null
    and effective_from < v_now;

  insert into public.product_prices (
    company_id, product_id, packaging_id, branch_id,
    price_type, amount, currency, effective_from, created_by
  ) values (
    p_company_id, p_product_id, p_packaging_id, p_branch_id,
    p_price_type, p_amount, v_currency, v_now, auth.uid()
  ) returning id into v_price_id;

  if p_branch_id is null and v_packaging.is_base_unit then
    if p_price_type = 'purchase' then
      update public.products
      set purchase_price = p_amount, updated_at = now()
      where id = p_product_id and company_id = p_company_id;
    else
      update public.products
      set selling_price = p_amount, updated_at = now()
      where id = p_product_id and company_id = p_company_id;
    end if;
  end if;

  return v_price_id;
end;
$$;

revoke all on function public.set_product_price(uuid, uuid, uuid, uuid, text, numeric, text)
  from public, anon;
grant execute on function public.set_product_price(uuid, uuid, uuid, uuid, text, numeric, text)
  to authenticated;

commit;
