alter table public.cloud_sale_payments
  add column request_id uuid,
  add column request_payload jsonb not null default '{}'::jsonb;

create unique index cloud_sale_payments_company_request_uidx
  on public.cloud_sale_payments (company_id, request_id)
  where request_id is not null;

create function public.record_cloud_sale_payment_once(
  p_company_id uuid,
  p_sale_id uuid,
  p_method text,
  p_amount numeric,
  p_reference text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.cloud_sales%rowtype;
  v_payment public.cloud_sale_payments%rowtype;
  v_payload jsonb;
  v_payment_id uuid;
  v_new_amount_paid numeric(20, 2);
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_request_id is null
     or p_method is null
     or p_method not in ('cash', 'card', 'bank_transfer', 'other')
     or p_amount is null or p_amount <= 0
     or p_amount <> round(p_amount, 2)
     or char_length(coalesce(p_reference, '')) > 200 then
    raise exception 'Payment method, amount, reference, or request ID is invalid'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_company_id::text || ':payment:' || p_request_id::text, 0)
  );
  select * into v_sale
  from public.cloud_sales
  where id = p_sale_id and company_id = p_company_id
  for update;
  if not found then
    raise exception 'Company invoice not found' using errcode = 'P0002';
  end if;
  if not private.has_company_permission(
    p_company_id, 'create_sales', v_sale.branch_id
  ) and not private.has_company_permission(
    p_company_id, 'manage_finance', v_sale.branch_id
  ) then
    raise exception 'Sales or finance permission is required to record payment'
      using errcode = '42501';
  end if;

  v_payload := jsonb_build_object(
    'sale_id', p_sale_id,
    'method', p_method,
    'amount', p_amount,
    'reference', coalesce(btrim(p_reference), '')
  );
  select * into v_payment
  from public.cloud_sale_payments
  where company_id = p_company_id and request_id = p_request_id;
  if found then
    if v_payment.received_by <> auth.uid()
       or v_payment.request_payload <> v_payload then
      raise exception 'Request identifier was already used for a different payment'
        using errcode = '22023';
    end if;
    return jsonb_build_object(
      'payment_id', v_payment.id,
      'sale_id', v_sale.id,
      'amount_paid', v_sale.amount_paid,
      'payment_status', v_sale.payment_status
    );
  end if;
  if v_sale.amount_paid + p_amount > v_sale.total then
    raise exception 'Payment cannot exceed the remaining invoice balance'
      using errcode = '23514';
  end if;

  insert into public.cloud_sale_payments (
    company_id, sale_id, method, amount, reference, received_by,
    request_id, request_payload
  ) values (
    p_company_id, p_sale_id, p_method, p_amount,
    coalesce(btrim(p_reference), ''), auth.uid(), p_request_id, v_payload
  ) returning id into v_payment_id;

  v_new_amount_paid := v_sale.amount_paid + p_amount;
  v_status := case
    when v_new_amount_paid = 0 then 'unpaid'
    when v_new_amount_paid < v_sale.total then 'partial'
    else 'paid'
  end;
  update public.cloud_sales
  set amount_paid = v_new_amount_paid,
      payment_status = v_status
  where id = p_sale_id and company_id = p_company_id;

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'sale_id', p_sale_id,
    'amount_paid', v_new_amount_paid,
    'payment_status', v_status
  );
end;
$$;

revoke all on function public.record_cloud_sale_payment_once(uuid, uuid, text, numeric, text, uuid)
  from public, anon;
grant execute on function public.record_cloud_sale_payment_once(uuid, uuid, text, numeric, text, uuid)
  to authenticated;

comment on function public.record_cloud_sale_payment_once(uuid, uuid, text, numeric, text, uuid) is
  'Append an idempotent payment and update invoice balance atomically, guarded by active company or branch sales/finance permissions.';
