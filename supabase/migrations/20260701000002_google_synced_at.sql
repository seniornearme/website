-- Track which facilities have been checked against Google Places (so the
-- place-id lookup is resumable and never re-queries a facility unnecessarily).
alter table public.facilities
  add column if not exists google_synced_at timestamptz;
