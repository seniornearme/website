-- Completed-form attachments for compliance items: private storage bucket,
-- owner-scoped by the first path segment (facility id).
insert into storage.buckets (id, name, public)
values ('compliance-docs', 'compliance-docs', false)
on conflict (id) do nothing;

-- NB: inside the EXISTS subquery an unqualified `name` binds to f.name, so
-- the objects column must be written as storage.objects.name.
create policy "compliance docs: owner all"
  on storage.objects for all
  using (
    bucket_id = 'compliance-docs'
    and exists (
      select 1 from public.facilities f
      where f.id::text = (storage.foldername(storage.objects.name))[1]
        and f.owner_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'compliance-docs'
    and exists (
      select 1 from public.facilities f
      where f.id::text = (storage.foldername(storage.objects.name))[1]
        and f.owner_id = auth.uid()
    )
  );

alter table public.compliance_items
  add column if not exists document_path text;
