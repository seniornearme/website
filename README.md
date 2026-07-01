# SeniorNearMe

California assisted living + RCFE directory. Consumer-facing map, owner claim flow, and Stripe-backed subscriptions + resident rent payments.

## Stack

| Layer | Choice |
|---|---|
| Hosting | Vercel |
| DB + Auth | Supabase (Postgres + PostGIS + Auth) |
| File storage | S3 + CloudFront (us-west-2) |
| Map | MapLibre GL JS + Protomaps (self-hosted) + US Census Geocoder |
| Payments | Stripe (Connect + Billing) |
| Email | Postmark |
| Domain / CDN | Cloudflare Registrar + Cloudflare in front of Vercel |

## Local setup

```bash
npm install
cp .env.example .env.local  # then fill in Supabase, Stripe, Postmark keys
npm run dev
```

Open http://localhost:3000.

## Database

Migrations live in `supabase/migrations/`. Apply with the Supabase CLI:

```bash
supabase link --project-ref <ref>
supabase db push
```

Schema highlights:
- `facilities` — seeded from CDSS Community Care Licensing, PostGIS `geography(point, 4326)` for "near me" queries, tsvector full-text search
- `profiles` — extends `auth.users` with `role` enum (`consumer` / `owner` / `admin`), auto-created via trigger on signup
- `facility_claims` — owners claim their listing, admin-verified
- `inquiries`, `saved_facilities`, `owner_subscriptions`, `rent_invoices`
- Row Level Security on every table; role checks via `public.current_role()`

## CDSS ETL

```bash
npx tsx scripts/etl-cdss.ts
```

Pulls the CA Community Care Licensing facility dataset, geocodes via the free US Census Geocoder, upserts to `facilities`. Schedule via GitHub Actions (monthly).

## Deployment

Vercel deploys on push to `main` from `seniornearme/website`. Preview deploys on every PR. Env vars set in the Vercel project settings.

DNS is on Cloudflare; the domain proxies through Cloudflare to Vercel (free DDoS + WAF).
