-- Owner compliance tracker: one row per tracked requirement instance.
-- form_key references the code-side library (src/lib/compliance-forms.ts).
-- Facility-level items have label null; per-staff / per-resident items carry
-- the person's name in label (one row per form per person).
create table public.compliance_items (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  form_key text not null,
  label text,
  last_completed date,
  due_date date,
  applies boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (facility_id, form_key, label)
);

create index compliance_items_facility_idx on public.compliance_items (facility_id);
create index compliance_items_due_idx on public.compliance_items (due_date)
  where due_date is not null and applies;

create trigger compliance_items_updated_at before update on public.compliance_items
  for each row execute function public.set_updated_at();

alter table public.compliance_items enable row level security;

create policy "compliance_items: owner all"
  on public.compliance_items for all
  using (
    exists (
      select 1 from public.facilities f
      where f.id = facility_id and f.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.facilities f
      where f.id = facility_id and f.owner_id = auth.uid()
    )
  );

create policy "compliance_items: admin all"
  on public.compliance_items for all
  using (public.current_role() = 'admin');
