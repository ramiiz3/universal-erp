drop policy if exists "Company managers can upload private company files"
  on storage.objects;
drop policy if exists "Company managers can update private company files"
  on storage.objects;
drop policy if exists "Company managers can delete private company files"
  on storage.objects;

create policy "Company managers can upload private company files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'company-files'
  and exists (
    select 1
    from public.companies as companies
    where companies.id::text = (storage.foldername(storage.objects.name))[1]
      and private.has_company_permission(companies.id, 'manage_company')
  )
);

create policy "Company managers can update private company files"
on storage.objects for update to authenticated
using (
  bucket_id = 'company-files'
  and exists (
    select 1
    from public.companies as companies
    where companies.id::text = (storage.foldername(storage.objects.name))[1]
      and private.has_company_permission(companies.id, 'manage_company')
  )
)
with check (
  bucket_id = 'company-files'
  and exists (
    select 1
    from public.companies as companies
    where companies.id::text = (storage.foldername(storage.objects.name))[1]
      and private.has_company_permission(companies.id, 'manage_company')
  )
);

create policy "Company managers can delete private company files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'company-files'
  and exists (
    select 1
    from public.companies as companies
    where companies.id::text = (storage.foldername(storage.objects.name))[1]
      and private.has_company_permission(companies.id, 'manage_company')
  )
);
