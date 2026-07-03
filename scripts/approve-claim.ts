/**
 * Approve a pending facility claim (manual admin action for v1).
 *
 * Sets the claim to approved and assigns the facility's owner_id to the
 * claimant — which activates all owner permissions (listing edits, photo
 * curation, Google/website connects).
 *
 * Run:  npx tsx scripts/approve-claim.ts --license 197610490
 *       npx tsx scripts/approve-claim.ts --license 197610490 --email owner@x.com
 *       npx tsx scripts/approve-claim.ts --list         # show pending claims
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const args = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

async function main() {
  if (args.includes("--list")) {
    const { data } = await supabase
      .from("facility_claims")
      .select("id, status, claimant_name, claimant_role, created_at, facilities(name, license_number), profiles!facility_claims_claimant_id_fkey(email)")
      .eq("status", "pending")
      .order("created_at");
    for (const c of (data ?? []) as unknown as {
      facilities: { name: string; license_number: string };
      profiles: { email: string };
      claimant_name: string;
      claimant_role: string;
    }[]) {
      console.log(
        `  #${c.facilities?.license_number}  ${c.facilities?.name}  <- ${c.claimant_name} (${c.claimant_role}) ${c.profiles?.email}`,
      );
    }
    if (!data?.length) console.log("No pending claims.");
    return;
  }

  const license = flag("--license");
  if (!license) {
    console.error("Usage: --license <num> [--email <claimant email>] | --list");
    process.exit(1);
  }

  const { data: facility } = await supabase
    .from("facilities")
    .select("id, name, owner_id")
    .eq("license_number", license)
    .single();
  if (!facility) throw new Error(`No facility with license ${license}`);

  let q = supabase
    .from("facility_claims")
    .select("id, claimant_id, claimant_name, profiles!facility_claims_claimant_id_fkey(email)")
    .eq("facility_id", facility.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  const { data: claims } = await q;
  const email = flag("--email");
  const claim = (claims ?? []).find((c) =>
    email ? (c.profiles as unknown as { email: string })?.email === email : true,
  );
  if (!claim) throw new Error(`No pending claim for ${facility.name}${email ? ` from ${email}` : ""}`);

  const { error: cErr } = await supabase
    .from("facility_claims")
    .update({ status: "approved", verified_at: new Date().toISOString(), verification_method: "manual" })
    .eq("id", claim.id);
  if (cErr) throw cErr;
  const { error: fErr } = await supabase
    .from("facilities")
    .update({ owner_id: claim.claimant_id, claimed_at: new Date().toISOString() })
    .eq("id", facility.id);
  if (fErr) throw fErr;

  console.log(`Approved: ${facility.name} -> ${claim.claimant_name} (${(claim.profiles as unknown as { email: string })?.email})`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
