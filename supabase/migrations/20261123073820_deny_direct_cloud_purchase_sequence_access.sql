-- Defense in depth: even if a table grant is accidentally reintroduced later,
-- authenticated and anonymous clients still cannot read or write purchase counters.
-- The controlled postgres-owned create_cloud_purchase RPC remains the mutation path.

begin;

drop policy if exists "No direct API access to purchase sequences"
  on public.cloud_purchase_sequences;

create policy "No direct API access to purchase sequences"
on public.cloud_purchase_sequences
for all
to anon, authenticated
using (false)
with check (false);

revoke all on public.cloud_purchase_sequences
  from public, anon, authenticated;

commit;
