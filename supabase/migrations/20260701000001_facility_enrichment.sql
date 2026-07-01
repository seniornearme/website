-- Facility enrichment: CDSS inspection/complaint summary + report index + external ids.
-- CDSS data source: https://www.ccld.dss.ca.gov/transparencyapi/api/ (public, no auth).

alter table public.facilities
  add column if not exists npi text,
  add column if not exists google_place_id text,
  add column if not exists cdss_last_visit_date date,
  add column if not exists cdss_num_visits int,
  add column if not exists cdss_num_inspections int,
  add column if not exists cdss_num_complaints int,
  add column if not exists cdss_citations_type_a int,
  add column if not exists cdss_citations_type_b int,
  add column if not exists cdss_substantiated_allegations int,
  add column if not exists cdss_synced_at timestamptz;

-- Individual inspection / complaint / evaluation reports (metadata; the HTML
-- narrative is fetched on demand from CCLD by report_index).
create table if not exists public.facility_reports (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  report_index int not null,
  report_date date,
  report_title text,
  report_type text,          -- Inspection | Complaint | Other
  control_number text,
  created_at timestamptz not null default now(),
  unique (facility_id, report_index)
);

create index if not exists facility_reports_facility_idx
  on public.facility_reports (facility_id);

alter table public.facility_reports enable row level security;

create policy "facility_reports: public readable"
  on public.facility_reports for select using (true);

grant select on public.facility_reports to anon, authenticated;
