/**
 * Refresh facility status from the LIVE CCLD API.
 *
 * Our seeded `status` comes from the CDSS CKAN roster snapshot (~May 2025).
 * The CCLD FacilityDetail endpoint returns current status, so this catches
 * facilities that have closed/suspended since the snapshot and drops them off
 * the (active-only) map.
 *
 * Conservative: only updates when the live status maps to a confident value
 * (active/closed/pending/suspended). Empty/unknown/failed fetches keep the
 * existing status — an API hiccup never clobbers good data.
 *
 * Run:  npx tsx scripts/refresh-status.ts
 *       npx tsx scripts/refresh-status.ts --limit 100
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const args = process.argv.slice(2);
const LIMIT = args.includes("--limit")
  ? parseInt(args[args.indexOf("--limit") + 1]!, 10)
  : undefined;

const CCLD = "https://www.ccld.dss.ca.gov/transparencyapi/api";
const CONCURRENCY = 10;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

function mapStatus(raw: string): string | null {
  const u = (raw || "").trim().toUpperCase();
  if (!u) return null;
  if (u === "LICENSED") return "active";
  if (u === "PENDING") return "pending";
  if (u.includes("SUSPEND")) return "suspended";
  if (["CLOSED", "REVOKED", "FORFEIT", "SURRENDER", "DENIED", "EXEMPT REVOKED"].some((k) => u.includes(k)))
    return "closed";
  return null; // unknown/unexpected — don't touch existing status
}

type Row = { id: string; license_number: string | null; status: string };

async function fetchAll(): Promise<Row[]> {
  const PAGE = 1000;
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("facilities")
      .select("id, license_number, status")
      .not("license_number", "is", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    out.push(...(data as Row[]));
    if (LIMIT && out.length >= LIMIT) return out.slice(0, LIMIT);
    if (data.length < PAGE) break;
  }
  return out;
}

async function liveStatus(license: string): Promise<string | null> {
  try {
    const res = await fetch(`${CCLD}/FacilityDetail/${license}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { FacilityDetail?: { STATUS?: string } };
    return mapStatus(j?.FacilityDetail?.STATUS ?? "");
  } catch {
    return null;
  }
}

async function main() {
  console.log("Refreshing status from live CCLD…");
  const rows = await fetchAll();
  console.log(`  ${rows.length} facilities`);

  const transitions: Record<string, number> = {};
  const nowClosed: string[] = [];
  let changed = 0;
  let done = 0;

  const processOne = async (r: Row) => {
    if (!r.license_number) return;
    const next = await liveStatus(r.license_number);
    if (!next || next === r.status) return;
    const { error } = await supabase
      .from("facilities")
      .update({ status: next })
      .eq("id", r.id);
    if (error) {
      console.error(`  ${r.id}:`, error.message);
      return;
    }
    changed++;
    const key = `${r.status} → ${next}`;
    transitions[key] = (transitions[key] ?? 0) + 1;
    if (r.status === "active" && next !== "active") nowClosed.push(r.license_number);
  };

  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    await Promise.all(rows.slice(i, i + CONCURRENCY).map(processOne));
    done += Math.min(CONCURRENCY, rows.length - i);
    if (done % 1000 < CONCURRENCY || done >= rows.length) {
      console.log(`  ${done}/${rows.length}  changed=${changed}`);
    }
  }

  console.log("\nDone.");
  console.log(`  changed=${changed}`);
  console.log("  transitions:", JSON.stringify(transitions, null, 2));
  console.log(`  no-longer-active licenses (first 20): ${nowClosed.slice(0, 20).join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
