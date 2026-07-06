-- SeniorNearMe Inspection Record Score: disclosed arithmetic over official
-- CDSS records. Score = 100 - 20*min(TypeA,3) - 5*min(TypeB,4)
-- - 12*min(Substantiated,4), floored at 0; null when no CDSS sync.
-- Only state-confirmed items are scored — raw complaint counts are shown on
-- pages but never scored (anyone can file a complaint).
--
-- Defined as a row-type function so PostgREST exposes it as a computed field
-- (select "...,inspection_score") on facilities, and reused by the search
-- view. Because it computes from cdss_* columns at read time, the weekly
-- CDSS refresh automatically refreshes every score — no separate scoring job.

create or replace function public.inspection_score(f public.facilities)
returns int
language sql
stable
as $$
  select case
    when f.cdss_synced_at is null then null
    else greatest(
      0,
      100
        - 20 * least(coalesce(f.cdss_citations_type_a, 0), 3)
        - 5  * least(coalesce(f.cdss_citations_type_b, 0), 4)
        - 12 * least(coalesce(f.cdss_substantiated_allegations, 0), 4)
    )
  end
$$;

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
  ) as photo,
  public.inspection_score(f) as inspection_score
from public.facilities f
where f.location is not null
  and f.facility_type <> 'arf';

grant select on public.facilities_search to anon, authenticated;
grant execute on function public.inspection_score(public.facilities) to anon, authenticated;
