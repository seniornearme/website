/**
 * CDSS Community Care Licensing ETL
 *
 * Pulls the public CA RCFE + ARF facility dataset, geocodes street addresses
 * via the US Census Geocoder, and upserts into public.facilities.
 *
 * Run:
 *   npx tsx scripts/etl-cdss.ts
 *
 * Env required:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (bypasses RLS — service role only, never client-side)
 *
 * TODO(phase-1):
 *   - Confirm the current CDSS download URL (rotates periodically)
 *   - Parse the CDSS Excel / CSV format
 *   - Batch geocode via Census `/geocoder/locations/addressbatch` (10k rows/req)
 *   - Diff against existing rows and update status transitions (active → closed)
 */

import { createClient } from "@supabase/supabase-js";

const CDSS_DATASET_URL = "";  // TODO: fill in current CDSS download URL

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type CdssRow = {
  license_number: string;
  facility_type: "rcfe" | "arf" | "other";
  status: "active" | "pending" | "closed" | "suspended" | "unknown";
  name: string;
  street_address: string | null;
  city: string | null;
  county: string | null;
  zip: string | null;
  phone: string | null;
  capacity: number | null;
  administrator: string | null;
  licensee: string | null;
  license_issue_date: string | null;
};

async function fetchCdssRows(): Promise<CdssRow[]> {
  if (!CDSS_DATASET_URL) {
    throw new Error("CDSS_DATASET_URL not set");
  }
  // TODO: fetch + parse CDSS dataset
  return [];
}

type Geocoded = { lat: number; lng: number };

async function geocodeBatch(
  rows: CdssRow[],
): Promise<Map<string, Geocoded>> {
  // TODO: US Census batch geocoder — https://geocoding.geo.census.gov/geocoder/locations/addressbatch
  return new Map();
}

function slugify(name: string, licenseNumber: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${base}-${licenseNumber}`;
}

async function upsertFacilities(rows: CdssRow[], geocoded: Map<string, Geocoded>) {
  const payload = rows.map((r) => {
    const g = geocoded.get(r.license_number);
    return {
      license_number: r.license_number,
      facility_type: r.facility_type,
      status: r.status,
      name: r.name,
      slug: slugify(r.name, r.license_number),
      street_address: r.street_address,
      city: r.city,
      county: r.county,
      zip: r.zip,
      phone: r.phone,
      capacity: r.capacity,
      administrator: r.administrator,
      licensee: r.licensee,
      license_issue_date: r.license_issue_date,
      location: g ? `SRID=4326;POINT(${g.lng} ${g.lat})` : null,
    };
  });

  const { error } = await supabase
    .from("facilities")
    .upsert(payload, { onConflict: "license_number" });

  if (error) throw error;
}

async function main() {
  console.log("Fetching CDSS dataset…");
  const rows = await fetchCdssRows();
  console.log(`Fetched ${rows.length} rows`);

  console.log("Geocoding via US Census…");
  const geocoded = await geocodeBatch(rows);
  console.log(`Geocoded ${geocoded.size} / ${rows.length}`);

  console.log("Upserting to facilities…");
  await upsertFacilities(rows, geocoded);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
