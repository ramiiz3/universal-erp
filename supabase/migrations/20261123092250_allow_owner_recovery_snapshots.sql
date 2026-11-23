create policy "Pharmacy owners can preserve a pre-sync recovery snapshot"
on public.legacy_erp_daily_snapshots for insert to authenticated
with check (private.has_company_permission(company_id, 'manage_company'));

grant insert on public.legacy_erp_daily_snapshots to authenticated;
