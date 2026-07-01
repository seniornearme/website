-- View exposing lat/lng from the PostGIS location column, so the JS client
-- can consume facilities as flat rows instead of parsing WKT/WKB.

create view public.facilities_search as
select
  id,
  name,
  slug,
  facility_type,
  status,
  city,
  county,
  capacity,
  st_x(location::geometry) as lng,
  st_y(location::geometry) as lat
from public.facilities
where location is not null;

grant select on public.facilities_search to anon, authenticated;
