/**
 * Batch-summarize CCLD inspection reports (visit type + first sentence of the
 * inspector's narrative) for every report that hasn't been processed yet.
 * ARF facilities are skipped (not displayed on the site). Resumable: targets
 * rows with summarized_at null, so re-runs and the weekly job only touch new
 * reports.
 *
 * Run:  npx tsx scripts/summarize-reports.ts            # full backlog
 *       npx tsx scripts/summarize-reports.ts --limit 50 # test
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { summarizeFacilityReports } from "../src/lib/report-summaries";

config({ path: ".env.local" });

const args = process.argv.slice(2);
const LIMIT = args.includes("--limit")
  ? parseInt(args[args.indexOf("--limit") + 1]!, 10)
  : undefined;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

type Row = {
  id: string;
  report_index: number;
  facilities: { license_number: string | null; facility_type: string } | null;
};

async function fetchPending(): Promise<Map<string, { id: string; report_index: number }[]>> {
  const PAGE = 1000;
  const byLicense = new Map<string, { id: string; report_index: number }[]>();
  let total = 0;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("facility_reports")
      .select("id, report_index, facilities!inner(license_number, facility_type)")
      .is("summarized_at", null)
      .neq("facilities.facility_type", "arf")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const r of data as unknown as Row[]) {
      const license = r.facilities?.license_number;
      if (!license) continue;
      (byLicense.get(license) ?? byLicense.set(license, []).get(license)!).push({
        id: r.id,
        report_index: r.report_index,
      });
      total++;
      if (LIMIT && total >= LIMIT) return byLicense;
    }
    if (data.length < PAGE) break;
  }
  return byLicense;
}

async function main() {
  const byLicense = await fetchPending();
  const facilities = [...byLicense.entries()];
  const totalReports = facilities.reduce((n, [, rows]) => n + rows.length, 0);
  console.log(`${totalReports} reports to summarize across ${facilities.length} facilities`);

  const FACILITY_CONC = 4; // × 3 fetches inside the lib = ~12 concurrent requests
  let done = 0;
  const started = Date.now();
  for (let i = 0; i < facilities.length; i += FACILITY_CONC) {
    await Promise.all(
      facilities
        .slice(i, i + FACILITY_CONC)
        .map(([license, rows]) => summarizeFacilityReports(license, rows)),
    );
    done += facilities.slice(i, i + FACILITY_CONC).reduce((n, [, rows]) => n + rows.length, 0);
    if (done % 500 < 40 || done >= totalReports) {
      const rate = done / Math.max(1, (Date.now() - started) / 1000);
      console.log(`  ${done}/${totalReports}  (${rate.toFixed(1)}/s)`);
    }
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
