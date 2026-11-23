-- Keep internal purchase numbering inaccessible through direct Data API access.
-- The purchase creation RPC is PostgreSQL-owned, uses SECURITY DEFINER with an empty
-- search_path, and validates the caller's company/branch purchasing permission.

begin;

alter table public.cloud_purchase_sequences
  enable row level security;

revoke all on public.cloud_purchase_sequences
  from public, anon, authenticated;

comment on table public.cloud_purchase_sequences is
  'Internal purchase-number sequence. Direct API access is revoked; sequence mutation is performed only by the permission-checked create_cloud_purchase SECURITY DEFINER RPC.';

commit;
