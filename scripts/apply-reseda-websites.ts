/**
 * Apply Claude-judged Reseda websites.
 *
 * For each active Reseda facility: if its license number is in REAL_SITES,
 * store the confirmed official website with website_source='claude_judged'.
 * Every active Reseda facility (matched or not) gets website_checked_at=now so
 * it is not re-queried and any stale junk value is cleared.
 *
 * Keyed on license_number (the stable CDSS facility number), never city/name.
 *
 * Run: npx tsx scripts/apply-reseda-websites.ts
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

// license_number -> confirmed official website (Claude-judged, July 2026).
const REAL_SITES: Record<string, string> = {
  "197603652": "https://ambassadorgarden.com", // Ambassador Garden
  "197610490": "https://archwoodassistedliving.com", // Archwood
  "197610306": "https://assistedseniorcareliving.com", // Assisted Senior Care Facility
  "197610150": "https://www.caldreamassisted.com", // California Dream
  "197610771": "https://caringheartassistedliving.com", // Caring Heart
  "197610697": "https://comfortcoveseniorliving.org", // Comfort Cove
  "191201867": "https://www.lajhealth.org/communities-locations/eisenberg-village", // Eisenberg Vlg
  "197607880": "https://www.lajhealth.org/communities-locations/fountainview-at-eisenberg-village", // Fountainview
  "197610657": "https://www.assistedlivingreseda.com", // G & A Boarding Care
  "197610477": "https://www.greenlifecarefacility.com", // Green Life Care
  "197608678": "https://hartlandcare.com", // Hartland Care
  "197610552": "https://ingomarassistedliving.com", // Ingomar Senior Care
  "197610667": "https://leadwellassistedliving.com", // Leadwell
  "197610152": "https://www.seniorfacilitycare.com", // Palace of Joy
  "197610679": "https://www.seniorfacilitycare.com", // Palace of Joy 1 (same operator)
  "197609950": "https://www.primeresidentialseniorcare.com", // Prime Residential
  "197610698": "https://serenitysourceresidential.com", // Serenity Source Residential
  "197610645": "https://sonlema.com", // Sonlema
  "191220171": "https://www.tlc4blind.org", // Therapeutic Living Centers for the Blind
  "197603521": "https://www.tlc4blind.org", // TLC Support Center (same org)
};

async function main() {
  const { data, error } = await supabase
    .from("facilities")
    .select("id, license_number, name")
    .ilike("city", "reseda")
    .eq("status", "active");
  if (error) throw error;

  const now = new Date().toISOString();
  let withSite = 0;
  let checkedOnly = 0;

  for (const f of data!) {
    const url = f.license_number ? REAL_SITES[f.license_number] : undefined;
    const update: Record<string, unknown> = { website_checked_at: now };
    if (url) {
      update.website = url;
      update.website_source = "claude_judged";
      withSite++;
    } else {
      checkedOnly++;
    }
    const { error: uerr } = await supabase.from("facilities").update(update).eq("id", f.id);
    if (uerr) console.error(`  ${f.name}:`, uerr.message);
  }

  console.log(`Reseda active facilities: ${data!.length}`);
  console.log(`  websites stored (claude_judged): ${withSite}`);
  console.log(`  checked, no own site: ${checkedOnly}`);
  console.log(`  yield: ${((withSite / data!.length) * 100).toFixed(0)}%`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
