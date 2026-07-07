-- Owner-provided pricing. Estimates are computed at read time from county +
-- capacity (src/lib/pricing.ts) and are never stored; these columns hold
-- real figures entered by the facility owner, which replace estimates.
alter table public.facilities
  add column if not exists price_min integer,
  add column if not exists price_max integer,
  add column if not exists pricing_source text
    check (pricing_source in ('owner'));
