/**
 * Facility enrichment — free sources.
 *
 * For each facility in a target city, pulls CDSS inspection/complaint history
 * from the CCLD transparency API and attempts an NPI match via the free NPI
 * Registry API. Writes summary fields to facilities + rows to facility_reports.
 *
 * The CDSS join is ALWAYS keyed on facility license_number (facility number),
 * never city — city has source typos (e.g. "RECEDA") and isn't a reliable key.
 *
 * Run:  npx tsx scripts/enrich-cdss.ts               # all un-enriched facilities
 *       npx tsx scripts/enrich-cdss.ts --city reseda # optional test subset
 *       npx tsx scripts/enrich-cdss.ts --force       # re-enrich everything
 *       npx tsx scripts/enrich-cdss.ts --limit 100   # cap the batch
 *
 * Env:  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (in .env.local)
 *
 * Sources (public, no key):
 *   CCLD:  https://www.ccld.dss.ca.gov/transparencyapi/api/
 *   NPI:   https://npiregistry.cms.hhs.gov/api/
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
const CCLD = "https://www.ccld.dss.ca.gov/transparencyapi/api";
const NPI = "https://npiregistry.cms.hhs.gov/api";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const toInt = (v: unknown): number => {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : 0;
};
function toIsoDate(v: unknown): string | null {
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mo, d, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

type CdssSummary = {
  cdss_last_visit_date: string | null;
  cdss_num_visits: number;
  cdss_num_inspections: number;
  cdss_num_complaints: number;
  cdss_citations_type_a: number;
  cdss_citations_type_b: number;
  cdss_substantiated_allegations: number;
};

function parseDetail(json: unknown): CdssSummary | null {
  const fd = (json as { FacilityDetail?: Record<string, unknown> })
    ?.FacilityDetail;
  if (!fd) return null;
  const complaints = Array.isArray(fd.COMPLAINTARRAY)
    ? (fd.COMPLAINTARRAY as (Record<string, unknown> | null)[]).filter(
        (c): c is Record<string, unknown> => c != null,
      )
    : [];
  const substantiated = complaints.reduce(
    (sum, c) => sum + Math.max(0, toInt(c.SUBALLEGATIONS)),
    0,
  );
  return {
    cdss_last_visit_date: toIsoDate(fd.LASTVISITDATE),
    cdss_num_visits: toInt(fd.NBRALLVISITS),
    cdss_num_inspections: toInt(fd.NBRINSPVISITS),
    cdss_num_complaints: toInt(fd.CMPCOUNT),
    cdss_citations_type_a: toInt(fd.TOTTYPEA),
    cdss_citations_type_b: toInt(fd.TOTTYPEB),
    cdss_substantiated_allegations: substantiated,
  };
}

type ReportRow = {
  report_index: number;
  report_date: string | null;
  report_title: string | null;
  report_type: string | null;
  control_number: string | null;
};

function parseReports(json: unknown): ReportRow[] {
  const arr = Array.isArray((json as { REPORTARRAY?: unknown }).REPORTARRAY)
    ? ((json as { REPORTARRAY: (Record<string, unknown> | null)[] }).REPORTARRAY)
    : [];
  // Keep the original array index (CCLD's `inx` for fetching the HTML report),
  // but skip null entries.
  return arr
    .map((r, i): ReportRow | null =>
      r == null
        ? null
        : {
            report_index: i,
            report_date: toIsoDate(r.REPORTDATE),
            report_title: (r.REPORTTITLE as string) ?? null,
            report_type: (r.REPORTTYPE as string) ?? null,
            control_number: (r.CONTROLNUMBER as string) || null,
          },
    )
    .filter((r): r is ReportRow => r != null);
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(llc|inc|the|home|care|senior|residential|facility|elderly)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function matchNpi(name: string, city: string | null): Promise<string | null> {
  const cityParam = city ? `&city=${encodeURIComponent(city)}` : "";
  const url =
    `${NPI}/?version=2.1&enumeration_type=NPI-2&state=CA${cityParam}&limit=20`;
  const json = (await getJson(url)) as
    | { results?: { number: number; basic?: { organization_name?: string } }[] }
    | null;
  const results = json?.results ?? [];
  if (!results.length) return null;
  const target = normalizeName(name);
  if (!target) return null;
  for (const r of results) {
    const org = normalizeName(r.basic?.organization_name ?? "");
    if (org && (org === target || org.includes(target) || target.includes(org))) {
      return String(r.number);
    }
  }
  return null;
}

type Target = {
  id: string;
  name: string;
  license_number: string | null;
  city: string | null;
};

async function fetchTargets(): Promise<Target[]> {
  const PAGE = 1000;
  const out: Target[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from("facilities")
      .select("id, name, license_number, city")
      .not("license_number", "is", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (CITY_FILTER) q = q.ilike("city", CITY_FILTER);
    if (!FORCE) q = q.is("cdss_synced_at", null);
    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) break;
    out.push(...(data as Target[]));
    if (LIMIT && out.length >= LIMIT) return out.slice(0, LIMIT);
    if (data.length < PAGE) break;
  }
  return out;
}

async function main() {
  const scope = CITY_FILTER ? `city="${CITY_FILTER}"` : "all CA facilities";
  console.log(
    `Enriching ${scope} by facility number${FORCE ? " (force re-enrich)" : " (un-enriched only)"}…`,
  );
  const facilities = await fetchTargets();
  if (!facilities.length) {
    console.log("Nothing to enrich.");
    return;
  }
  console.log(`  ${facilities.length} facilities to process`);

  let enriched = 0;
  let withCitations = 0;
  let withComplaints = 0;
  let npiMatched = 0;
  let totalReports = 0;

  for (const f of facilities) {
    if (!f.license_number) continue;
    try {
      const [detailJson, reportsJson] = await Promise.all([
        getJson(`${CCLD}/FacilityDetail/${f.license_number}`),
        getJson(`${CCLD}/FacilityReports/${f.license_number}`),
      ]);

      const summary = parseDetail(detailJson);
      const reports = parseReports(reportsJson);
      const npi = await matchNpi(f.name, f.city);

      if (summary) {
        const { error: upErr } = await supabase
          .from("facilities")
          .update({ ...summary, npi, cdss_synced_at: new Date().toISOString() })
          .eq("id", f.id);
        if (upErr) console.error(`  update ${f.name}:`, upErr.message);
        else {
          enriched++;
          if (summary.cdss_citations_type_a + summary.cdss_citations_type_b > 0)
            withCitations++;
          if (summary.cdss_num_complaints > 0) withComplaints++;
        }
      }
      if (npi) npiMatched++;

      if (reports.length) {
        const rows = reports.map((r) => ({ ...r, facility_id: f.id }));
        const { error: repErr } = await supabase
          .from("facility_reports")
          .upsert(rows, { onConflict: "facility_id,report_index" });
        if (repErr) console.error(`  reports ${f.name}:`, repErr.message);
        else totalReports += reports.length;
      }
    } catch (e) {
      console.error(`  skip ${f.name} (${f.license_number}):`, (e as Error).message);
    }

    await sleep(150);
  }

  console.log("Done.");
  console.log(
    `  enriched=${enriched}  withCitations=${withCitations}  withComplaints=${withComplaints}  npiMatched=${npiMatched}  reports=${totalReports}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
