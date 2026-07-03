-- Owner-authorized Google Business Profile connections (the Birdeye pattern):
-- a claimed facility's owner OAuths their Business Profile so we can read its
-- reviews through the official GBP API as their agent. One connection per
-- facility. Tokens are written by the OAuth callback under the owner's session.

create table public.google_business_connections (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null unique references public.facilities(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,

  refresh_token text not null,
  google_email text,
  google_location text,   -- GBP location resource name once matched
  status text not null default 'pending_api_approval'
    check (status in ('connected', 'pending_api_approval', 'error', 'revoked')),

  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger gbc_updated_at before update on public.google_business_connections
  for each row execute function public.set_updated_at();

alter table public.google_business_connections enable row level security;

-- Owners manage the connection for facilities they own.
create policy "gbc: owner read"
  on public.google_business_connections for select using (auth.uid() = owner_id);

create policy "gbc: owner connect own facility"
  on public.google_business_connections for insert with check (
    auth.uid() = owner_id
    and exists (
      select 1 from public.facilities f
      where f.id = facility_id and f.owner_id = auth.uid()
    )
  );

create policy "gbc: owner update"
  on public.google_business_connections for update using (auth.uid() = owner_id);

create policy "gbc: owner disconnect"
  on public.google_business_connections for delete using (auth.uid() = owner_id);

create policy "gbc: admin all"
  on public.google_business_connections for all using (public.current_role() = 'admin');
