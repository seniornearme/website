-- City / ZIP boundary polygons for the map's boundary-outline view.
-- Sourced from Census cartographic boundary files (Places 2023 + ZCTA 2020).
-- Postal cities without an official Place polygon (e.g. LA neighborhoods like
-- Reseda) get a fallback geometry built from their facilities' ZIP ZCTAs.
-- geojson is stored pre-serialized (no PostGIS ops needed at read time).

create table public.boundaries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('city', 'zip')),
  slug text not null,            -- city slug (slugifyCity) or 5-digit ZIP
  name text not null,            -- display name ("Reseda", "91335")
  source text not null,          -- 'census_place' | 'zcta' | 'zcta_union'
  geojson jsonb not null,        -- GeoJSON Feature (Polygon/MultiPolygon)
  bbox jsonb not null,           -- [west, south, east, north]
  created_at timestamptz not null default now(),
  unique (kind, slug)
);

alter table public.boundaries enable row level security;

create policy "boundaries: public readable"
  on public.boundaries for select using (true);
