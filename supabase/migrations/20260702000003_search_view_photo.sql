-- Add each facility's primary photo (lowest-position VISIBLE photo) to the
-- search view. Owners curate position/visibility after claiming, so the map
-- hover card and list thumbnails follow their choice automatically.

create or replace view public.facilities_search as
select
  f.id,
  f.name,
  f.slug,
  f.facility_type,
  f.status,
  f.city,
  f.county,
  f.capacity,
  st_x(f.location::geometry) as lng,
  st_y(f.location::geometry) as lat,
  (
    select p.thumb_url
    from public.facility_photos p
    where p.facility_id = f.id and p.visible
    order by p.position
    limit 1
  ) as photo
from public.facilities f
where f.location is not null;

grant select on public.facilities_search to anon, authenticated;
