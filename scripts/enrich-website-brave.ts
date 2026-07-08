/**
 * Website discovery: Brave Search as a transient lead + first-party
 * verification before anything is stored.
 *
 * For each facility, a Brave query ("name city CA") produces candidate
 * homepages — filtered against known directories/aggregators/social/gov and
 * name-matched. Candidates are held only in-flight (Brave ToS permits
 * transient operational storage; storing Search Results requires a
 * storage-rights plan). We then fetch each candidate site OURSELVES and only
 * persist a URL after verifying, on the facility's own page, that a facility
 * name token appears in its content or final domain. What lands in the
 * database is a fact derived from our crawl of the facility's public website
 * (website_source = 'search_verified'), not a Brave result.
 *
 * A no-match or failed verification still records website_checked_at so the
 * facility isn't re-queried.
 *
 * Run:  npx tsx scripts/enrich-website-brave.ts --city reseda     # test first
 *       npx tsx scripts/enrich-website-brave.ts --limit 50
 *       npx tsx scripts/enrich-website-brave.ts                   # all un-checked
 *       npx tsx scripts/enrich-website-brave.ts --verify-existing # re-verify
 *           URLs stored before verification existed; failures are nulled out
 *
 * Env:  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BRAVE_API_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const args = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const CITY_FILTER = flag("--city");
const FORCE = args.includes("--force");
const LIMIT = flag("--limit") ? parseInt(flag("--limit")!, 10) : undefined;
const VERIFY_EXISTING = args.includes("--verify-existing");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const API_KEY = process.env.BRAVE_API_KEY;
if (!API_KEY) {
  console.error("Missing BRAVE_API_KEY in .env.local (brave.com/search/api → free plan → token).");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const SEARCH = "https://api.search.brave.com/res/v1/web/search";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Aggregators / directories / social / gov / listing sites — never the
// facility's own homepage.
const BLOCK = new Set([
  "yelp.com", "aplaceformom.com", "caring.com", "senioradvisor.com", "seniorly.com",
  "senioradvice.com", "after55.com", "seniorhousingnet.com", "assisted-living-directory.com",
  "facebook.com", "instagram.com", "twitter.com", "x.com", "linkedin.com", "youtube.com",
  "tiktok.com", "pinterest.com", "nextdoor.com", "yellowpages.com", "mapquest.com",
  "google.com", "bing.com", "tripadvisor.com", "healthgrades.com", "indeed.com",
  "glassdoor.com", "ziprecruiter.com", "zillow.com", "medicare.gov", "cdss.ca.gov",
  "dss.ca.gov", "ca.gov", "usnews.com", "wikipedia.org", "bbb.org", "manta.com",
  "opencorporates.com", "loopnet.com", "crexi.com", "apartments.com", "npino.com",
  "npidb.org", "yellowbook.com", "chamberofcommerce.com", "dandb.com", "buzzfile.com",
  // directories caught by first-party verification of the initial sweep —
  // their page titles contain facility names, so title-token scoring alone
  // let them through
  "seniorcareauthority.com", "miradorliving.com", "carelistings.com", "seniorhomes.com",
  "oasissenioradvisors.com", "myseniorcarefinder.com", "carechanges.com",
  "assistedlivingnearme.net", "seniorcarehomes.com", "careavailability.com",
  "familyassets.com", "elderlifefinancial.com", "choosewellsandiego.org",
  "assistedlivingcenter.com", "themapofcare.com", "seniorlivingfacilities.net",
  "seniorcare.com", "rubyhome.com", "nursa.com", "assistedliving.org",
  "seniorguidance.org", "retirementliving.com", "seniorsite.org", "care.com",
]);

const STOP = new Set([
  "assisted", "living", "care", "home", "homes", "board", "senior", "residential",
  "facility", "guest", "inc", "llc", "the", "of", "and", "elderly", "adult", "center",
  "house", "ranch", "villa", "manor", "ii", "iii", "iv", "family", "quality", "loving",
]);

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !STOP.has(t));
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isBlocked(host: string): boolean {
  if (BLOCK.has(host)) return true;
  for (const b of BLOCK) if (host.endsWith(`.${b}`)) return true;
  return false;
}

type BraveResult = { url: string; title?: string };

type Lookup =
  | { status: "candidates"; urls: string[] }
  | { status: "none" }
  | { status: "error" };

// Candidate homepages from a Brave query, ranked — held in-flight only, never
// stored. "none" is a real no-match and stamps website_checked_at; "error"
// (timeouts, 429s, exhausted quota) leaves the row untouched for retry.
async function findWebsite(name: string, city: string | null): Promise<Lookup> {
  const q = `${name} ${city ?? ""} CA`.trim();
  const url = `${SEARCH}?q=${encodeURIComponent(q)}&count=10&country=us`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json", "X-Subscription-Token": API_KEY! },
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    console.error(`  fetch error for "${name}": ${(e as Error).message.slice(0, 80)}`);
    return { status: "error" };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`  brave HTTP ${res.status} for "${name}": ${body.slice(0, 200)}`);
    if (res.status === 429) await sleep(2000);
    return { status: "error" };
  }
  // body reads can also die mid-stream — treat like any transient error
  let data: { web?: { results?: BraveResult[] } };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    return { status: "error" };
  }
  const results = data.web?.results ?? [];
  const tokens = nameTokens(name);
  if (!tokens.length) return { status: "none" };

  const scored: { url: string; score: number }[] = [];
  for (const r of results) {
    const host = hostOf(r.url);
    if (!host || isBlocked(host)) continue;
    const domainStr = host.replace(/[^a-z0-9]/g, "");
    const title = (r.title ?? "").toLowerCase();
    let score = 0;
    if (tokens.some((t) => domainStr.includes(t))) score += 2;
    if (tokens.some((t) => title.includes(t))) score += 1;
    if (score >= 1) scored.push({ url: `https://${host}`, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const urls = [...new Set(scored.map((s) => s.url))].slice(0, 3);
  return urls.length ? { status: "candidates", urls } : { status: "none" };
}

// First-party verification: fetch the candidate site ourselves and require a
// facility-name token on the page (or in the final domain after redirects).
// Returns the canonical https://host of the VERIFIED final destination —
// this observation of the facility's own website is what gets stored.
async function verifyFacilitySite(candidateUrl: string, tokens: string[]): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(candidateUrl, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    return null;
  }
  if (!res.ok || !(res.headers.get("content-type") || "").includes("html")) return null;
  const finalHost = hostOf(res.url || candidateUrl);
  if (!finalHost || isBlocked(finalHost)) return null;
  let raw: string;
  try {
    raw = await res.text(); // sockets can close mid-body
  } catch {
    return null;
  }
  const text = raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .toLowerCase();
  const hostStr = finalHost.replace(/[^a-z0-9]/g, "");
  const match = tokens.some((t) => text.includes(t) || hostStr.includes(t));
  return match ? `https://${finalHost}` : null;
}

type Target = { id: string; name: string; city: string | null };

async function fetchTargets(): Promise<Target[]> {
  const PAGE = 1000;
  const out: Target[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from("facilities")
      .select("id, name, city")
      .not("license_number", "is", null)
      .eq("status", "active")
      .eq("facility_type", "rcfe") // ARFs aren't shown on the site — don't spend quota
      .order("id")
      .range(from, from + PAGE - 1);
    if (CITY_FILTER) q = q.ilike("city", CITY_FILTER);
    // never re-query or overwrite a facility that already has a website
    // (owner-entered, experiment-curated, or from a prior sweep)
    if (!FORCE) q = q.is("website_checked_at", null).is("website", null);
    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) break;
    out.push(...(data as Target[]));
    if (LIMIT && out.length >= LIMIT) return out.slice(0, LIMIT);
    if (data.length < PAGE) break;
  }
  return out;
}

// Re-verify URLs stored before first-party verification existed. Passing
// rows upgrade to search_verified (with the canonical final host); failures
// are nulled out — conservative, with one retry for transient fetch flakes.
async function verifyExisting() {
  const PAGE = 1000;
  const rows: { id: string; name: string; website: string }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("facilities")
      .select("id, name, website")
      .eq("website_source", "brave")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...(data as never[]));
    if (data.length < PAGE) break;
  }
  console.log(`${rows.length} previously stored URLs to re-verify`);

  let kept = 0;
  let dropped = 0;
  let done = 0;
  const CONC = 8;
  for (let i = 0; i < rows.length; i += CONC) {
    await Promise.all(rows.slice(i, i + CONC).map(async (r) => {
      const tokens = nameTokens(r.name);
      let verified = await verifyFacilitySite(r.website, tokens);
      if (!verified) {
        await sleep(2000);
        verified = await verifyFacilitySite(r.website, tokens);
      }
      const update = verified
        ? { website: verified, website_source: "search_verified" }
        : { website: null, website_source: null };
      const { error } = await supabase.from("facilities").update(update).eq("id", r.id);
      if (error) console.error(`  update ${r.name}: ${error.message}`);
      else if (verified) kept++;
      else { dropped++; console.log(`  dropped ${r.name}: ${r.website}`); }
    }));
    done += Math.min(CONC, rows.length - i);
    if (done % 200 < CONC || done >= rows.length) {
      console.log(`  ${done}/${rows.length}  kept=${kept} dropped=${dropped}`);
    }
  }
  console.log(`Done. kept=${kept}, dropped=${dropped}`);
}

async function main() {
  if (VERIFY_EXISTING) {
    await verifyExisting();
    return;
  }
  const scope = CITY_FILTER ? `city="${CITY_FILTER}"` : "all CA facilities";
  console.log(`Finding websites via Brave for ${scope}…`);
  const targets = await fetchTargets();
  if (!targets.length) {
    console.log("Nothing to check.");
    return;
  }
  console.log(`  ${targets.length} facilities (rate-limited ~1/sec)`);

  let found = 0;
  let done = 0;
  let consecutiveErrors = 0;
  for (const f of targets) {
    const result = await findWebsite(f.name, f.city);
    if (result.status === "error") {
      // transient blips are common over a multi-hour run — back off and keep
      // going; only a sustained error wall (quota exhausted, outage) stops us
      consecutiveErrors++;
      if (consecutiveErrors >= 12) {
        console.log(`\nStopping after ${consecutiveErrors} consecutive errors (quota likely exhausted).`);
        break;
      }
      await sleep(Math.min(60000, 2000 * 2 ** Math.min(consecutiveErrors, 5)));
      continue;
    }
    consecutiveErrors = 0;
    const update: Record<string, unknown> = {
      website_checked_at: new Date().toISOString(),
    };
    if (result.status === "candidates") {
      const tokens = nameTokens(f.name);
      for (const candidate of result.urls) {
        const verified = await verifyFacilitySite(candidate, tokens);
        if (verified) {
          update.website = verified;
          update.website_source = "search_verified";
          found++;
          break;
        }
      }
    }
    const { error } = await supabase.from("facilities").update(update).eq("id", f.id);
    if (error) console.error(`  update ${f.name}:`, error.message);
    done++;
    if (done % 25 === 0 || done === targets.length) {
      console.log(`  ${done}/${targets.length}  found=${found}`);
    }
    await sleep(1100); // stay under Brave's 1 query/sec free limit
  }

  console.log(`Done. Checked ${done} / ${targets.length}, found websites for ${found}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
