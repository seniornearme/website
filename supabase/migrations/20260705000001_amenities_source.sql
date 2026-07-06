-- Provenance for facilities.amenities: 'scrape' (detected from the facility's
-- website by the photo/content pipeline) or 'owner' (curated via checkboxes on
-- the manage page). The pipeline never overwrites owner-curated sets.
alter table public.facilities
  add column if not exists amenities_source text
  check (amenities_source in ('scrape', 'owner'));

-- Everything populated so far came from website scraping.
update public.facilities
  set amenities_source = 'scrape'
  where amenities_source is null and jsonb_array_length(amenities) > 0;
