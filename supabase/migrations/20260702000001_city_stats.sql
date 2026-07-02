-- Aggregated per-city counts for browse pages and the sitemap.
-- security_invoker so the view respects facilities' RLS (public readable).

create view public.city_stats
with (security_invoker = true) as
select
  city,
  min(county) as county,
  count(*)::int as facility_count
from public.facilities
where status = 'active' and city is not null and city <> ''
group by city;

grant select on public.city_stats to anon, authenticated;
