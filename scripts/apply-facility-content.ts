/**
 * Write scraped site content (description, amenities, photos) into facilities.
 *
 * Reads data/facility-content.json (from extract-photos.ts) and updates each
 * facility by license_number. Photos are stored as objects with provenance so
 * we know they're hotlinked from the facility's own site (source='site_scrape')
 * vs. future owner-uploaded S3 images.
 *
 * Run: npx tsx scripts/apply-facility-content.ts
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { readFileSync } from "node:fs";

config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

type Content = {
  license: string | null;
  name: string;
  website: string;
  reachable: boolean;
  description: string;
  amenities: string[];
  photos: { url: string; w: number; score: number }[];
};

async function main() {
  const rows: Content[] = JSON.parse(readFileSync("data/facility-content.json", "utf8"));
  let updated = 0;

  for (const r of rows) {
    if (!r.license) continue;
    const photos = r.photos.map((p) => ({ url: p.url, source: "site_scrape", w: p.w || null }));
    const update: Record<string, unknown> = {};
    if (r.description) update.description = r.description;
    if (r.amenities.length) update.amenities = r.amenities;
    if (photos.length) update.photos = photos;
    if (!Object.keys(update).length) continue;

    const { data, error } = await supabase
      .from("facilities")
      .update(update)
      .eq("license_number", r.license)
      .select("slug")
      .single();
    if (error) {
      console.error(`  ${r.name}:`, error.message);
      continue;
    }
    updated++;
    console.log(
      `  ${r.photos.length.toString().padStart(2)}📷  ${r.amenities.length}amen  /facilities/${data!.slug}  (${r.name})`,
    );
  }

  console.log(`\nUpdated ${updated} facilities.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
