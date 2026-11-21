-- Company dashboard summaries for the Universal ERP workspace.
-- SECURITY INVOKER intentionally preserves the existing table RLS policies.

begin;

create or replace function public.get_company_dashboard_summary(
  p_company_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_month_start timestamptz := date_trunc('month', now());
  v_next_month timestamptz := date_trunc('month', now()) + interval '1 month';
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_company_id is null or not private.is_company_member(p_company_id) then
    raise exception 'Company membership is required' using errcode = '42501';
  end if;

  with stock_by_product as (
    select
      p.id,
      p.minimum_stock,
      coalesce(sum(l.quantity), 0) as on_hand
    from public.products as p
    left join public.inventory_lots as l
      on l.company_id = p.company_id
     and l.product_id = p.id
    where p.company_id = p_company_id
      and p.is_active
    group by p.id, p.minimum_stock
  ), monthly_sales as (
    select
      date_trunc('month', s.created_at) as month_start,
      sum(s.total) as amount
    from public.cloud_sales as s
    where s.company_id = p_company_id
      and s.created_at >= v_month_start - interval '5 months'
      and s.created_at < v_next_month
    group by date_trunc('month', s.created_at)
  )
  select jsonb_build_object(
    'sales_this_month', coalesce((
      select sum(s.total)
      from public.cloud_sales as s
      where s.company_id = p_company_id
        and s.created_at >= v_month_start
        and s.created_at < v_next_month
    ), 0),
    'purchases_this_month', coalesce((
      select sum(p.total)
      from public.cloud_purchases as p
      where p.company_id = p_company_id
        and p.created_at >= v_month_start
        and p.created_at < v_next_month
    ), 0),
    'outstanding_receivables', coalesce((
      select sum(greatest(s.total - s.amount_paid, 0))
      from public.cloud_sales as s
      where s.company_id = p_company_id
        and s.payment_status in ('unpaid', 'partial')
    ), 0),
    'inventory_cost_value', coalesce((
      select sum(l.quantity * l.purchase_price)
      from public.inventory_lots as l
      where l.company_id = p_company_id
    ), 0),
    'active_products', (select count(*) from public.products as p
      where p.company_id = p_company_id and p.is_active),
    'low_stock_products', (select count(*) from stock_by_product as s
      where s.minimum_stock > 0 and s.on_hand > 0 and s.on_hand <= s.minimum_stock),
    'out_of_stock_products', (select count(*) from stock_by_product as s
      where s.on_hand <= 0),
    'expiring_lots_30_days', (select count(*) from public.inventory_lots as l
      where l.company_id = p_company_id
        and l.quantity > 0
        and l.expiry between current_date and current_date + 30),
    'pending_purchase_orders', (select count(*) from public.cloud_purchases as p
      where p.company_id = p_company_id
        and p.status in ('ordered', 'partially_received')),
    'warehouse_count', (select count(*) from public.warehouses as w
      where w.company_id = p_company_id),
    'monthly_sales', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month', to_char(months.month_start, 'Mon'),
        'amount', coalesce(ms.amount, 0)
      ) order by months.month_start)
      from generate_series(
        v_month_start - interval '5 months',
        v_month_start,
        interval '1 month'
      ) as months(month_start)
      left join monthly_sales as ms on ms.month_start = months.month_start
    ), '[]'::jsonb),
    'recent_sales', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', recent.id,
        'invoice_number', recent.invoice_number,
        'customer_name', recent.customer_name,
        'total', recent.total,
        'amount_paid', recent.amount_paid,
        'payment_status', recent.payment_status,
        'created_at', recent.created_at
      ) order by recent.created_at desc)
      from (
        select s.id, s.invoice_number, s.customer_name, s.total,
          s.amount_paid, s.payment_status, s.created_at
        from public.cloud_sales as s
        where s.company_id = p_company_id
        order by s.created_at desc
        limit 6
      ) as recent
    ), '[]'::jsonb),
    'recent_purchases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', recent.id,
        'purchase_number', recent.purchase_number,
        'status', recent.status,
        'total', recent.total,
        'created_at', recent.created_at
      ) order by recent.created_at desc)
      from (
        select p.id, p.purchase_number, p.status, p.total, p.created_at
        from public.cloud_purchases as p
        where p.company_id = p_company_id
        order by p.created_at desc
        limit 6
      ) as recent
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.get_company_dashboard_summary(uuid)
  from public, anon;
grant execute on function public.get_company_dashboard_summary(uuid)
  to authenticated;

commit;
