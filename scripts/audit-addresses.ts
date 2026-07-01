/**
 * Address audit + optional typo correction.
 *
 * Detects likely city typos by self-consistency: for each ZIP the dominant city
 * spelling is canonical; facilities whose city differs by a small edit distance
 * are flagged. Read-only by default.
 *
 * Run:  npx tsx scripts/audit-addresses.ts            # report only
 *       npx tsx scripts/audit-addresses.ts --apply    # fix the flagged typos
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

function lev(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

type Row = {
  id: string;
  name: string;
  street_address: string | null;
  city: string | null;
  zip: string | null;
  state: string | null;
};

async function fetchAll(): Promise<Row[]> {
  const PAGE = 1000;
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("facilities")
      .select("id, name, street_address, city, zip, state")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    out.push(...(data as Row[]));
    if (data.length < PAGE) break;
  }
  return out;
}

const fmt = (r: Row) =>
  `  ${r.name} — "${r.street_address ?? ""}", city="${r.city ?? ""}" zip="${r.zip ?? ""}" state="${r.state ?? ""}"`;

async function main() {
  const rows = await fetchAll();
  console.log(`Auditing ${rows.length} facilities${APPLY ? " (APPLY MODE)" : ""}…\n`);

  const byZip = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const zip = (r.zip ?? "").trim();
    const city = (r.city ?? "").trim().toUpperCase();
    if (!/^\d{5}$/.test(zip) || !city) continue;
    if (!byZip.has(zip)) byZip.set(zip, new Map());
    const m = byZip.get(zip)!;
    m.set(city, (m.get(city) ?? 0) + 1);
  }
  const dominant = new Map<string, string>();
  for (const [zip, m] of byZip) {
    let best = "";
    let bestN = 0;
    for (const [c, n] of m) if (n > bestN) [best, bestN] = [c, n];
    dominant.set(zip, best);
  }

  const typos: { id: string; from: string; to: string }[] = [];
  const badZip: Row[] = [];
  const badState: Row[] = [];
  const suspiciousCity: Row[] = [];

  for (const r of rows) {
    const zip = (r.zip ?? "").trim();
    const city = (r.city ?? "").trim().toUpperCase();
    if ((r.state ?? "").trim().toUpperCase() !== "CA") badState.push(r);
    if (city && city.length <= 3) suspiciousCity.push(r);
    if (!/^\d{5}$/.test(zip)) {
      badZip.push(r);
      continue;
    }
    if (!city) continue;
    const dom = dominant.get(zip)!;
    if (city === dom) continue;
    if (lev(city, dom) <= 2 && byZip.get(zip)!.get(dom)! >= 3) {
      typos.push({ id: r.id, from: city, to: dom });
    }
  }

  console.log(`Likely city typos: ${typos.length}`);
  console.log(`Invalid/missing ZIP: ${badZip.length}`);
  console.log(`State not CA: ${badState.length}`);
  console.log(`Suspicious short city (≤3 chars): ${suspiciousCity.length}\n`);

  console.log("=== EDGE CASES: state not CA ===");
  badState.forEach((r) => console.log(fmt(r)));
  console.log("\n=== EDGE CASES: invalid/missing ZIP ===");
  badZip.forEach((r) => console.log(fmt(r)));
  console.log("\n=== EDGE CASES: suspicious short city ===");
  suspiciousCity.forEach((r) => console.log(fmt(r)));

  if (!APPLY) {
    console.log(`\n(report only — run with --apply to fix the ${typos.length} typos)`);
    return;
  }

  console.log(`\nApplying ${typos.length} city corrections…`);
  let updated = 0;
  for (let i = 0; i < typos.length; i += 10) {
    await Promise.all(
      typos.slice(i, i + 10).map(async (t) => {
        const { error } = await supabase
          .from("facilities")
          .update({ city: t.to })
          .eq("id", t.id);
        if (error) console.error(`  ${t.id}:`, error.message);
        else updated++;
      }),
    );
  }
  console.log(`Done. Corrected ${updated} facilities.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
