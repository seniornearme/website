/**
 * Google Place ID enrichment — free (ID-only tier).
 *
 * Matches each facility to its Google Place by name + address and stores ONLY
 * the place_id, which Google explicitly permits storing indefinitely (it is
 * exempt from the caching restrictions). Nothing else from Google is stored.
 *
 * Uses Places API (New) Text Search with an `places.id`-only field mask — the
 * cheapest SKU. Stay within Google's monthly free allotment (run in batches;
 * this is resumable) and set a Google Cloud budget cap to guarantee $0.
 *
 * Run:  npx tsx scripts/enrich-google-placeid.ts --limit 100   # test first!
 *       npx tsx scripts/enrich-google-placeid.ts               # all un-checked
 *       npx tsx scripts/enrich-google-placeid.ts --city reseda
 *       npx tsx scripts/enrich-google-placeid.ts --force
 *
 * Env:  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_MAPS_API_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const CITY_FILTER = flag("--city");
const FORCE = args.includes("--force");
const LIMIT = flag("--limit") ? parseInt(flag("--limit")!, 10) : undefined;

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
if (!API_KEY) {
  console.error(
    "Missing GOOGLE_MAPS_API_KEY in .env.local. Create a Google Cloud project,\n" +
      "enable the Places API (New), make an API key, enable billing, and set a\n" +
      "budget cap. Then add GOOGLE_MAPS_API_KEY=... to .env.local.",
  );
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const CONCURRENCY = 8;

type Target = {
  id: string;
  name: string;
  street_address: string | null;
  city: string | null;
  zip: string | null;
};

async function fetchTargets(): Promise<Target[]> {
  const PAGE = 1000;
  const out: Target[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from("facilities")
      .select("id, name, street_address, city, zip")
      .not("license_number", "is", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (CITY_FILTER) q = q.ilike("city", CITY_FILTER);
    if (!FORCE) q = q.is("google_synced_at", null);
    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) break;
    out.push(...(data as Target[]));
    if (LIMIT && out.length >= LIMIT) return out.slice(0, LIMIT);
    if (data.length < PAGE) break;
  }
  return out;
}

async function findPlaceId(f: Target): Promise<string | null> {
  const query = `${f.name}, ${[f.street_address, f.city, "CA", f.zip]
    .filter(Boolean)
    .join(", ")}`;
  try {
    const res = await fetch(SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": API_KEY!,
        "X-Goog-FieldMask": "places.id",
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: 1,
        regionCode: "US",
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      // Surface the first error loudly (bad key, API not enabled, billing off).
      const body = await res.text();
      console.error(`  HTTP ${res.status}: ${body.slice(0, 200)}`);
      return null;
    }
    const data = (await res.json()) as { places?: { id?: string }[] };
    return data.places?.[0]?.id ?? null;
  } catch (e) {
    console.error(`  ${f.name}:`, (e as Error).message);
    return null;
  }
}

async function main() {
  const scope = CITY_FILTER ? `city="${CITY_FILTER}"` : "all CA facilities";
  console.log(`Looking up Google place IDs for ${scope}…`);
  const facilities = await fetchTargets();
  if (!facilities.length) {
    console.log("Nothing to look up.");
    return;
  }
  console.log(`  ${facilities.length} facilities to check`);

  let matched = 0;
  let done = 0;

  const processOne = async (f: Target) => {
    const placeId = await findPlaceId(f);
    const { error } = await supabase
      .from("facilities")
      .update({
        google_place_id: placeId,
        google_synced_at: new Date().toISOString(),
      })
      .eq("id", f.id);
    if (error) console.error(`  update ${f.name}:`, error.message);
    else if (placeId) matched++;
  };

  for (let i = 0; i < facilities.length; i += CONCURRENCY) {
    await Promise.all(facilities.slice(i, i + CONCURRENCY).map(processOne));
    done += Math.min(CONCURRENCY, facilities.length - i);
    if (done % 500 < CONCURRENCY || done >= facilities.length) {
      console.log(`  ${done}/${facilities.length}  matched=${matched}`);
    }
  }

  console.log("Done.");
  console.log(`  matched=${matched} / ${facilities.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
