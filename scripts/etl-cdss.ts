/**
 * CDSS Community Care Licensing ETL.
 *
 * Pulls RCFE + ARF facility datasets from CHHS CKAN DataStore, geocodes
 * addresses via the free US Census batch geocoder, and upserts into
 * public.facilities using license_number as the conflict key.
 *
 * Run:
 *   npm run seed:facilities
 *
 * Env required:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (bypasses RLS — server only, never client-side)
 *
 * ~23K rows total (12.5K RCFE + 10.5K ARF). First run: ~5-10 min end-to-end.
 * Subsequent runs upsert-by-license-number, so re-running is idempotent.
 */

import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import {
  ARF_RESOURCE_ID,
  RCFE_RESOURCE_ID,
  fetchAllRecords,
  mapCdssRow,
  type FacilityRow,
} from "./lib/cdss-api";
import { geocodeBatch, type AddressInput } from "./lib/geocode-census";

loadEnv({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (put them in .env.local)",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const UPSERT_CHUNK = 500;

async function upsertChunked(rows: (FacilityRow & { location?: string | null })[]) {
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await supabase
      .from("facilities")
      .upsert(chunk, { onConflict: "license_number" });
    if (error) {
      console.error(`Upsert error on chunk ${i / UPSERT_CHUNK}:`, error);
      throw error;
    }
    console.log(`  upserted ${i + chunk.length} / ${rows.length}`);
  }
}

async function main() {
  console.log("Fetching CDSS RCFE…");
  const rcfeRaw = await fetchAllRecords(RCFE_RESOURCE_ID);
  console.log(`  fetched ${rcfeRaw.length} RCFE records`);

  console.log("Fetching CDSS ARF…");
  const arfRaw = await fetchAllRecords(ARF_RESOURCE_ID);
  console.log(`  fetched ${arfRaw.length} ARF records`);

  console.log("Mapping to facilities schema…");
  const mapped = [
    ...rcfeRaw.map((r) => mapCdssRow(r, "rcfe")),
    ...arfRaw.map((r) => mapCdssRow(r, "arf")),
  ].filter((r): r is FacilityRow => r !== null);
  console.log(`  ${mapped.length} rows mapped (dropped ${rcfeRaw.length + arfRaw.length - mapped.length} invalid)`);

  // Dedupe by license_number: some records exist in both feeds due to overlap
  const byLicense = new Map<string, FacilityRow>();
  for (const r of mapped) byLicense.set(r.license_number, r);
  const deduped = [...byLicense.values()];
  console.log(`  ${deduped.length} unique after dedup`);

  console.log("Geocoding addresses (US Census)…");
  const geocodeInput: AddressInput[] = deduped
    .filter((r) => r.street_address && r.city && r.state && r.zip)
    .map((r) => ({
      id: r.license_number,
      street: r.street_address!,
      city: r.city!,
      state: r.state,
      zip: r.zip!,
    }));
  const geocoded = await geocodeBatch(geocodeInput);
  console.log(`  geocoded ${geocoded.size} / ${geocodeInput.length}`);

  // Attach PostGIS EWKT WKT to each row
  const withLocation = deduped.map((r) => {
    const g = geocoded.get(r.license_number);
    return {
      ...r,
      location: g ? `SRID=4326;POINT(${g.lng} ${g.lat})` : null,
    };
  });

  console.log("Upserting to facilities…");
  await upsertChunked(withLocation);

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
