/**
 * One-off experiment: pull RICH Google Places data for ~100 facilities so we can
 * prototype the facility detail page and decide what's worth showing.
 *
 * Sample = all 50 active Reseda facilities (we hand-verified their websites, so
 * they're ground truth for grading Google's matches) + 50 non-Reseda for variety.
 *
 * ToS posture:
 *   - Only `place_id` is written back to the DB (Google explicitly allows storing
 *     it indefinitely).
 *   - Everything else (name, address, website, rating, reviews, photos) is Google
 *     content that may NOT be cached in served data. It is dumped to a gitignored
 *     local JSON snapshot (data/google-places-sample.json) for local dev only.
 *
 * The key is HTTP-referrer restricted, so we send an allowlisted Referer header
 * (http://localhost:3000) — the same origin the app calls from in dev.
 *
 * Run: npx tsx scripts/experiment-google-100.ts
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { writeFileSync, mkdirSync } from "node:fs";

config({ path: ".env.local" });

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
if (!API_KEY) {
  console.error("Missing GOOGLE_MAPS_API_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const REFERER = "http://localhost:3000";
const CONCURRENCY = 8;

// Rich field mask (Enterprise + Atmosphere). 100 calls sits inside the monthly
// free allotment, so this experiment costs ~$0.
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.googleMapsUri",
  "places.businessStatus",
  "places.primaryType",
  "places.types",
  "places.rating",
  "places.userRatingCount",
  "places.regularOpeningHours",
  "places.editorialSummary",
  "places.reviews",
  "places.photos",
].join(",");

type Target = {
  id: string;
  license_number: string | null;
  name: string;
  street_address: string | null;
  city: string | null;
  zip: string | null;
  website: string | null;
};

async function fetchTargets(): Promise<Target[]> {
  const cols = "id, license_number, name, street_address, city, zip, website";
  const reseda = await supabase
    .from("facilities")
    .select(cols)
    .not("license_number", "is", null)
    .eq("status", "active")
    .ilike("city", "reseda")
    .order("name");
  if (reseda.error) throw reseda.error;

  const others = await supabase
    .from("facilities")
    .select(cols)
    .not("license_number", "is", null)
    .eq("status", "active")
    .not("city", "ilike", "reseda")
    .order("name")
    .limit(50);
  if (others.error) throw others.error;

  return [...(reseda.data as Target[]), ...(others.data as Target[])];
}

async function lookup(f: Target): Promise<Record<string, unknown> | null> {
  const query = `${f.name}, ${[f.street_address, f.city, "CA", f.zip]
    .filter(Boolean)
    .join(", ")}`;
  try {
    const res = await fetch(SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": API_KEY!,
        "X-Goog-FieldMask": FIELD_MASK,
        Referer: REFERER,
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 1, regionCode: "US" }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`  HTTP ${res.status} for ${f.name}: ${body.slice(0, 160)}`);
      return null;
    }
    const data = (await res.json()) as { places?: Record<string, unknown>[] };
    return data.places?.[0] ?? null;
  } catch (e) {
    console.error(`  ${f.name}:`, (e as Error).message);
    return null;
  }
}

function host(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function main() {
  const targets = await fetchTargets();
  console.log(`Pulling rich Google data for ${targets.length} facilities…`);

  const rows: Array<{ ours: Target; google: Record<string, unknown> | null }> = [];
  let matched = 0;

  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (f) => ({ ours: f, google: await lookup(f) })),
    );
    for (const r of results) {
      rows.push(r);
      if (r.google?.id) {
        matched++;
        await supabase
          .from("facilities")
          .update({ google_place_id: r.google.id as string, google_synced_at: new Date().toISOString() })
          .eq("id", r.ours.id);
      }
    }
    console.log(`  ${Math.min(i + CONCURRENCY, targets.length)}/${targets.length}  matched=${matched}`);
  }

  // Snapshot the full rich payload for local prototyping (gitignored).
  mkdirSync("data", { recursive: true });
  writeFileSync("data/google-places-sample.json", JSON.stringify(rows, null, 2));

  // ---- Summary ----
  const withSite = rows.filter((r) => r.google?.websiteUri).length;
  const withRating = rows.filter((r) => typeof r.google?.rating === "number").length;
  const withReviews = rows.filter((r) => Array.isArray(r.google?.reviews) && (r.google!.reviews as unknown[]).length).length;
  const withPhotos = rows.filter((r) => Array.isArray(r.google?.photos) && (r.google!.photos as unknown[]).length).length;

  console.log(`\n=== Google coverage across ${rows.length} facilities ===`);
  console.log(`  matched a place:      ${matched}`);
  console.log(`  has websiteUri:       ${withSite}`);
  console.log(`  has rating:           ${withRating}`);
  console.log(`  has ≥1 review:        ${withReviews}`);
  console.log(`  has ≥1 photo:         ${withPhotos}`);

  // Grade Google's website against our 20 hand-verified Reseda sites.
  const verified = rows.filter((r) => r.ours.website);
  let agree = 0;
  const disagreements: string[] = [];
  for (const r of verified) {
    const g = host(r.google?.websiteUri as string | undefined);
    const o = host(r.ours.website);
    if (g && g === o) agree++;
    else disagreements.push(`    ${r.ours.name}: ours=${o || "—"}  google=${g || "—"}`);
  }
  console.log(`\n=== Website cross-check vs our hand-verified sites (${verified.length}) ===`);
  console.log(`  same host: ${agree}/${verified.length}`);
  if (disagreements.length) {
    console.log("  differences:");
    console.log(disagreements.join("\n"));
  }

  console.log(`\nWrote rich snapshot → data/google-places-sample.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
