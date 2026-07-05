-- Structured tour-request fields on inquiries (Mirador-style scheduling),
-- so owners see requested date/time instead of parsing free text.
alter table public.inquiries
  add column if not exists tour_date date,
  add column if not exists tour_time_window text
    check (tour_time_window in ('morning', 'afternoon', 'evening') or tour_time_window is null),
  add column if not exists tour_type text
    check (tour_type in ('in_person', 'video') or tour_type is null);
