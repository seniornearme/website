-- SeniorNearMe initial schema
-- Facilities directory + auth roles + claims + inquiries + subscriptions + rent invoices

create extension if not exists postgis;
create extension if not exists pg_trgm;
create extension if not exists citext;

-- ============================================================================
-- Enum types
-- ============================================================================

create type user_role as enum ('consumer', 'owner', 'admin');
create type facility_type as enum ('rcfe', 'arf', 'other');
create type facility_status as enum ('active', 'pending', 'closed', 'suspended', 'unknown');
create type claim_status as enum ('pending', 'verifying', 'approved', 'rejected');
create type inquiry_status as enum ('new', 'read', 'replied', 'archived');
create type verification_method as enum ('postcard', 'phone_callback', 'manual');

-- ============================================================================
-- profiles: extends auth.users with app-level fields
-- ============================================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role user_role not null default 'consumer',
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- facilities: seeded from CDSS Community Care Licensing, enriched by curation/owners
-- ============================================================================

create table public.facilities (
  id uuid primary key default gen_random_uuid(),

  -- CDSS identifiers
  license_number text unique,
  facility_type facility_type not null,
  status facility_status not null default 'unknown',

  -- Naming
  name text not null,
  slug text unique not null,

  -- Address
  street_address text,
  city text,
  county text,
  state text not null default 'CA',
  zip text,

  -- Geospatial (PostGIS)
  location geography(point, 4326),

  -- Contact
  phone text,
  email text,
  website text,

  -- CDSS-sourced details
  capacity int,
  administrator text,
  licensee text,
  license_issue_date date,

  -- Curated / owner-enriched
  description text,
  amenities jsonb not null default '[]'::jsonb,
  photos jsonb not null default '[]'::jsonb,  -- array of S3/CloudFront URLs

  -- Ownership
  owner_id uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz,

  -- Full-text search
  search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(city, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(county, '')), 'C')
  ) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index facilities_location_idx on public.facilities using gist (location);
create index facilities_search_idx on public.facilities using gin (search_vector);
create index facilities_city_idx on public.facilities (city);
create index facilities_county_idx on public.facilities (county);
create index facilities_owner_idx on public.facilities (owner_id) where owner_id is not null;

-- ============================================================================
-- facility_claims: owner requests to claim a facility listing
-- ============================================================================

create table public.facility_claims (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  claimant_id uuid not null references public.profiles(id) on delete cascade,
  status claim_status not null default 'pending',
  verification_method verification_method,

  claimant_name text not null,
  claimant_phone text,
  claimant_role text,  -- 'owner', 'administrator', 'manager', etc.
  proof_document_url text,  -- S3 URL to license/ID doc

  admin_notes text,
  verified_at timestamptz,
  verified_by uuid references public.profiles(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index claims_facility_idx on public.facility_claims (facility_id);
create index claims_claimant_idx on public.facility_claims (claimant_id);
create index claims_status_idx on public.facility_claims (status);

-- ============================================================================
-- inquiries: consumer contacts facility (authenticated or anonymous)
-- ============================================================================

create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  consumer_id uuid references public.profiles(id) on delete set null,

  contact_name text not null,
  contact_email text not null,
  contact_phone text,
  message text not null,

  care_type_needed text,
  move_in_timeframe text,
  budget_range text,

  status inquiry_status not null default 'new',
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

create index inquiries_facility_idx on public.inquiries (facility_id);
create index inquiries_consumer_idx on public.inquiries (consumer_id) where consumer_id is not null;
create index inquiries_status_idx on public.inquiries (status);

-- ============================================================================
-- saved_facilities: consumer favorites
-- ============================================================================

create table public.saved_facilities (
  consumer_id uuid not null references public.profiles(id) on delete cascade,
  facility_id uuid not null references public.facilities(id) on delete cascade,
  notes text,
  created_at timestamptz not null default now(),
  primary key (consumer_id, facility_id)
);

-- ============================================================================
-- owner_subscriptions: Stripe subscription for owner platform features
-- ============================================================================

create table public.owner_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  facility_id uuid not null references public.facilities(id) on delete cascade,

  stripe_customer_id text not null,
  stripe_subscription_id text unique not null,
  stripe_price_id text not null,
  plan_tier text not null,  -- 'free_claimed', 'featured', 'premium'
  status text not null,  -- Stripe subscription status

  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subs_owner_idx on public.owner_subscriptions (owner_id);
create index subs_facility_idx on public.owner_subscriptions (facility_id);

-- ============================================================================
-- rent_invoices: family pays facility monthly via Stripe Connect
-- ============================================================================

create table public.rent_invoices (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  payer_id uuid references public.profiles(id) on delete set null,
  resident_name text not null,

  stripe_invoice_id text unique not null,
  stripe_payment_intent_id text,

  amount_cents int not null,
  platform_fee_cents int not null,
  currency text not null default 'usd',
  status text not null,

  billing_period_start date,
  billing_period_end date,
  paid_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invoices_facility_idx on public.rent_invoices (facility_id);
create index invoices_payer_idx on public.rent_invoices (payer_id) where payer_id is not null;
create index invoices_status_idx on public.rent_invoices (status);

-- ============================================================================
-- Triggers: updated_at + new-user profile creation
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger facilities_updated_at before update on public.facilities
  for each row execute function public.set_updated_at();

create trigger facility_claims_updated_at before update on public.facility_claims
  for each row execute function public.set_updated_at();

create trigger owner_subscriptions_updated_at before update on public.owner_subscriptions
  for each row execute function public.set_updated_at();

create trigger rent_invoices_updated_at before update on public.rent_invoices
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.facilities enable row level security;
alter table public.facility_claims enable row level security;
alter table public.inquiries enable row level security;
alter table public.saved_facilities enable row level security;
alter table public.owner_subscriptions enable row level security;
alter table public.rent_invoices enable row level security;

-- Helper: role lookup that avoids RLS recursion
create or replace function public.current_role()
returns user_role language sql security definer stable set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

-- profiles
create policy "profiles: own record readable"
  on public.profiles for select using (auth.uid() = id);
create policy "profiles: admin readable"
  on public.profiles for select using (public.current_role() = 'admin');
create policy "profiles: own record updatable"
  on public.profiles for update using (auth.uid() = id);

-- facilities (public directory, owners edit their own, admins do all)
create policy "facilities: public readable"
  on public.facilities for select using (true);
create policy "facilities: owner updates own"
  on public.facilities for update using (auth.uid() = owner_id);
create policy "facilities: admin all"
  on public.facilities for all using (public.current_role() = 'admin');

-- facility_claims
create policy "claims: own readable"
  on public.facility_claims for select using (auth.uid() = claimant_id);
create policy "claims: admin readable"
  on public.facility_claims for select using (public.current_role() = 'admin');
create policy "claims: authenticated insert"
  on public.facility_claims for insert with check (auth.uid() = claimant_id);
create policy "claims: admin update"
  on public.facility_claims for update using (public.current_role() = 'admin');

-- inquiries (anyone can send, facility owner + admin can read)
create policy "inquiries: public insert"
  on public.inquiries for insert with check (true);
create policy "inquiries: own readable"
  on public.inquiries for select using (auth.uid() = consumer_id);
create policy "inquiries: facility owner readable"
  on public.inquiries for select using (
    exists (
      select 1 from public.facilities f
      where f.id = facility_id and f.owner_id = auth.uid()
    )
  );
create policy "inquiries: admin all"
  on public.inquiries for all using (public.current_role() = 'admin');

-- saved_facilities
create policy "saved: own all"
  on public.saved_facilities for all using (auth.uid() = consumer_id);

-- owner_subscriptions
create policy "subs: own readable"
  on public.owner_subscriptions for select using (auth.uid() = owner_id);
create policy "subs: admin all"
  on public.owner_subscriptions for all using (public.current_role() = 'admin');

-- rent_invoices
create policy "invoices: payer readable"
  on public.rent_invoices for select using (auth.uid() = payer_id);
create policy "invoices: facility owner readable"
  on public.rent_invoices for select using (
    exists (
      select 1 from public.facilities f
      where f.id = facility_id and f.owner_id = auth.uid()
    )
  );
create policy "invoices: admin all"
  on public.rent_invoices for all using (public.current_role() = 'admin');
