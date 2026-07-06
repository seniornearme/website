-- Per-report summaries extracted from the official CCLD report documents
-- (LIC809 evaluation / complaint forms): the visit type and the opening of
-- the inspector's narrative. Filled lazily when a facility page is viewed.
alter table public.facility_reports
  add column if not exists visit_type text,
  add column if not exists summary text,
  add column if not exists summarized_at timestamptz;
