-- Photo pipeline v2: per-photo rows with ranking + owner-curated visibility.
--
-- The judge step now RANKS photos (kind + score -> default visibility and
-- order); it no longer decides what gets stored. Everything harvested that is
-- a real image is stored; `visible` controls what renders. Owners curate
-- `visible`/`position` after claiming. Changing facilities.website re-queues
-- the facility for harvest via trigger (photos_synced_at -> null).

create table public.facility_photos (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,

  storage_key text not null,          -- S3 key under seniornearme-media
  url text not null,                  -- CloudFront URL (1600px webp)
  thumb_url text,                     -- CloudFront URL (480px webp)
  origin_url text,                    -- where the image was harvested from (provenance/takedown)
  source text not null default 'site_scrape' check (source in ('site_scrape', 'owner_upload')),

  kind text not null default 'facility' check (kind in ('facility', 'stock')),
  label text,                         -- vision label ("bedroom", "exterior", ...) for alt text
  score numeric not null default 0,   -- ranking score (heuristic + optional vision)
  position int not null default 0,    -- display order; owner-reorderable
  visible boolean not null default true,

  width int,
  created_at timestamptz not null default now()
);

create index facility_photos_facility_idx
  on public.facility_photos (facility_id, visible, position);

alter table public.facilities add column if not exists photos_synced_at timestamptz;

-- Owner adds or changes the website -> photos re-harvest on the next pipeline run.
create or replace function public.reset_photos_sync()
returns trigger language plpgsql as $$
begin
  if new.website is distinct from old.website then
    new.photos_synced_at := null;
  end if;
  return new;
end;
$$;

create trigger facilities_website_change
  before update on public.facilities
  for each row execute function public.reset_photos_sync();

-- RLS: the public sees only visible photos; owners see all of theirs and curate.
alter table public.facility_photos enable row level security;

create policy "facility_photos: visible public read"
  on public.facility_photos for select using (visible);

create policy "facility_photos: owner read all"
  on public.facility_photos for select using (
    exists (select 1 from public.facilities f where f.id = facility_id and f.owner_id = auth.uid())
  );

create policy "facility_photos: owner curate"
  on public.facility_photos for update using (
    exists (select 1 from public.facilities f where f.id = facility_id and f.owner_id = auth.uid())
  );

create policy "facility_photos: owner upload"
  on public.facility_photos for insert with check (
    source = 'owner_upload'
    and exists (select 1 from public.facilities f where f.id = facility_id and f.owner_id = auth.uid())
  );

create policy "facility_photos: owner delete own uploads"
  on public.facility_photos for delete using (
    source = 'owner_upload'
    and exists (select 1 from public.facilities f where f.id = facility_id and f.owner_id = auth.uid())
  );

create policy "facility_photos: admin all"
  on public.facility_photos for all using (public.current_role() = 'admin');

-- Backfill the vision-judged photos currently in facilities.photos (all real).
insert into public.facility_photos
  (facility_id, storage_key, url, source, kind, position, visible, width)
select
  f.id,
  regexp_replace(p.elem->>'url', '^https?://[^/]+/', ''),
  p.elem->>'url',
  'site_scrape',
  coalesce(p.elem->>'kind', 'facility'),
  (p.ord - 1)::int,
  true,
  nullif(p.elem->>'w', '')::int
from public.facilities f
cross join lateral jsonb_array_elements(f.photos) with ordinality as p(elem, ord)
where jsonb_typeof(f.photos) = 'array' and jsonb_array_length(f.photos) > 0;

-- Mark backfilled facilities as synced so the pipeline doesn't redo them.
update public.facilities set photos_synced_at = now()
where jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) > 0;

comment on column public.facilities.photos is
  'DEPRECATED: superseded by the facility_photos table.';
