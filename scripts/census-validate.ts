/**
 * Census address validation pass (mostly READ-ONLY).
 *
 * Batch-geocodes every facility through the free US Census geocoder and:
 *   - FLAGS city/ZIP discrepancies (ours vs the Census-standardized match) for
 *     review — does NOT overwrite address fields.
 *   - REPORTS addresses Census couldn't match (possible bad/closed addresses).
 *   - APPLIES pins only to facilities that currently have NO location (pure win).
 *
 * Run:  npx tsx scripts/census-validate.ts
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { geocodeBatch, type AddressInput } from "./lib/geocode-census";

config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

type Row = {
  id: string;
  name: string;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

async function fetchAll<T>(cols: string, nullLocationOnly = false): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from("facilities").select(cols).order("id").range(from, from + PAGE - 1);
    if (nullLocationOnly) q = q.is("location", null);
    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) break;
    out.push(...(data as T[]));
    if (data.length < PAGE) break;
  }
  return out;
}

function parseCensus(matched: string): { city: string; zip: string } | null {
  const parts = matched.split(",").map((s) => s.trim());
  if (parts.length < 3) return null;
  return {
    city: (parts[parts.length - 3] ?? "").toUpperCase(),
    zip: (parts[parts.length - 1] ?? "").slice(0, 5),
  };
}

async function main() {
  console.log("Loading facilities…");
  const rows = await fetchAll<Row>("id, name, street_address, city, state, zip");
  const nullPin = await fetchAll<{ id: string }>("id", true);
  const nullPinIds = new Set(nullPin.map((r) => r.id));
  console.log(`  ${rows.length} facilities (${nullPinIds.size} with no pin)`);

  const inputs: AddressInput[] = [];
  let insufficient = 0;
  for (const r of rows) {
    if (r.street_address && r.city && r.zip) {
      inputs.push({
        id: r.id,
        street: r.street_address,
        city: r.city,
        state: r.state ?? "CA",
        zip: r.zip,
      });
    } else insufficient++;
  }
  console.log(`Geocoding ${inputs.length} addresses via Census…`);
  const results = await geocodeBatch(inputs);
  console.log(`  ${results.size} / ${inputs.length} matched\n`);

  const byId = new Map(rows.map((r) => [r.id, r]));
  const cityFlags: { name: string; ours: string; census: string; zip: string }[] = [];
  const zipFlags: { name: string; ours: string; census: string }[] = [];
  const unmatched: Row[] = [];
  const pinFills: { id: string; location: string }[] = [];

  for (const r of rows) {
    if (!(r.street_address && r.city && r.zip)) continue;
    const g = results.get(r.id);
    if (!g) {
      unmatched.push(r);
      continue;
    }
    if (nullPinIds.has(r.id)) {
      pinFills.push({ id: r.id, location: `SRID=4326;POINT(${g.lng} ${g.lat})` });
    }
    const c = parseCensus(g.matched_address);
    if (!c) continue;
    const ourCity = (r.city ?? "").trim().toUpperCase();
    const ourZip = (r.zip ?? "").trim().slice(0, 5);
    if (c.city && ourCity && c.city !== ourCity)
      cityFlags.push({ name: r.name, ours: ourCity, census: c.city, zip: ourZip });
    if (c.zip && ourZip && c.zip !== ourZip)
      zipFlags.push({ name: r.name, ours: ourZip, census: c.zip });
  }

  console.log("=== SUMMARY ===");
  console.log(`  Matched by Census: ${results.size}`);
  console.log(`  Unmatched (possible bad address): ${unmatched.length}`);
  console.log(`  Insufficient address (missing street/city/zip): ${insufficient}`);
  console.log(`  City discrepancies (ours vs Census): ${cityFlags.length}`);
  console.log(`  ZIP discrepancies (ours vs Census): ${zipFlags.length}`);
  console.log(`  Pins to fill (had none, Census matched): ${pinFills.length}\n`);

  console.log("=== CITY DISCREPANCIES (first 40 — review before correcting) ===");
  cityFlags.slice(0, 40).forEach((f) =>
    console.log(`  ${f.name}: "${f.ours}" → Census "${f.census}" [${f.zip}]`),
  );
  console.log("\n=== ZIP DISCREPANCIES (first 25) ===");
  zipFlags.slice(0, 25).forEach((f) =>
    console.log(`  ${f.name}: "${f.ours}" → Census "${f.census}"`),
  );
  console.log("\n=== UNMATCHED (first 25) ===");
  unmatched.slice(0, 25).forEach((r) =>
    console.log(`  ${r.name} — ${r.street_address}, ${r.city} CA ${r.zip}`),
  );

  if (pinFills.length) {
    console.log(`\nFilling ${pinFills.length} missing pins…`);
    let filled = 0;
    for (let i = 0; i < pinFills.length; i += 20) {
      await Promise.all(
        pinFills.slice(i, i + 20).map(async (p) => {
          const { error } = await supabase
            .from("facilities")
            .update({ location: p.location })
            .eq("id", p.id);
          if (!error) filled++;
        }),
      );
    }
    console.log(`  Filled ${filled} pins.`);
  }
  console.log("\nDone. Address-field corrections are FLAGGED above, not applied.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
