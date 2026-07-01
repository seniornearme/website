-- Track website discovery: when we last checked, and where the URL came from
-- (brave | owner | manual). Lets the Brave lookup be resumable and lets an
-- owner-supplied URL override a scraped guess later.
alter table public.facilities
  add column if not exists website_checked_at timestamptz,
  add column if not exists website_source text;
