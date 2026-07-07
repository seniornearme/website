-- Room-type pricing: board-and-care homes quote private vs shared rooms
-- separately (shared typically runs 25-40% below private). price_min/max
-- keep their meaning as the private-room range; shared gets its own pair.
alter table public.facilities
  add column if not exists price_shared_min integer,
  add column if not exists price_shared_max integer;

comment on column public.facilities.price_min is 'owner-provided private-room monthly minimum';
comment on column public.facilities.price_max is 'owner-provided private-room monthly maximum';
comment on column public.facilities.price_shared_min is 'owner-provided shared-room monthly minimum';
comment on column public.facilities.price_shared_max is 'owner-provided shared-room monthly maximum';
