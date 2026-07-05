-- SeniorNearMe is senior care: ARFs (adult residential facilities for ages
-- 18-59 with developmental/mental-health disabilities) are out of scope.
-- Filter them from the serving views; rows stay in the facilities table.

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
    select coalesce(p.thumb_url, p.url)
    from public.facility_photos p
    where p.facility_id = f.id and p.visible
    order by p.position
    limit 1
  ) as photo
from public.facilities f
where f.location is not null
  and f.facility_type <> 'arf';

create or replace view public.city_stats
with (security_invoker = true) as
select
  city,
  min(county) as county,
  count(*)::int as facility_count
from public.facilities
where status = 'active'
  and city is not null and city <> ''
  and facility_type <> 'arf'
group by city;

grant select on public.facilities_search to anon, authenticated;
grant select on public.city_stats to anon, authenticated;
