-- Provenance for facilities.description: 'scrape' (site meta/JSON-LD),
-- 'ai' (synthesized from the facility's own site text), or 'owner'.
-- The pipeline never overwrites owner-written descriptions.
alter table public.facilities
  add column if not exists description_source text
  check (description_source in ('scrape', 'ai', 'owner'));

update public.facilities
  set description_source = 'scrape'
  where description_source is null and description is not null;
