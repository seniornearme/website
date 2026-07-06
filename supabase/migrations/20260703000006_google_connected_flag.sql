-- Public-readable flag: has this facility's owner linked their Google
-- Business Profile? (The connections table itself is owner-only because it
-- holds tokens.) Used to gate the on-page Google reviews section.
alter table public.facilities
  add column if not exists google_connected boolean not null default false;
