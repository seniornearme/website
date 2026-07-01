/**
 * Website discovery via Brave Search API (free tier: 2,000/mo, 1 query/sec).
 *
 * For each facility, searches "name city CA" and keeps the top result that is
 * (a) not a known directory/aggregator/social/gov site and (b) actually matches
 * the facility name (domain or title token). Stores the homepage URL. A no-match
 * still records website_checked_at so it isn't re-queried.
 *
 * Run:  npx tsx scripts/enrich-website-brave.ts --city reseda   # test first
 *       npx tsx scripts/enrich-website-brave.ts --limit 50
 *       npx tsx scripts/enrich-website-brave.ts                 # all un-checked
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

async function findWebsite(name: string, city: string | null): Promise<string | null> {
  const q = `${name} ${city ?? ""} CA`.trim();
  const url = `${SEARCH}?q=${encodeURIComponent(q)}&count=10&country=us`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json", "X-Subscription-Token": API_KEY! },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return null;
  }
  if (res.status === 429) {
    await sleep(2000);
    return null; // skip this one; it'll be retried on a later run
  }
  if (!res.ok) {
    console.error(`  brave ${res.status} for "${name}"`);
    return null;
  }
  const data = (await res.json()) as { web?: { results?: BraveResult[] } };
  const results = data.web?.results ?? [];
  const tokens = nameTokens(name);
  if (!tokens.length) return null;

  let best: { url: string; score: number } | null = null;
  for (const r of results) {
    const host = hostOf(r.url);
    if (!host || isBlocked(host)) continue;
    const domainStr = host.replace(/[^a-z0-9]/g, "");
    const title = (r.title ?? "").toLowerCase();
    let score = 0;
    if (tokens.some((t) => domainStr.includes(t))) score += 2;
    if (tokens.some((t) => title.includes(t))) score += 1;
    if (score >= 1 && (!best || score > best.score)) {
      best = { url: `https://${host}`, score };
    }
  }
  return best?.url ?? null;
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
      .order("id")
      .range(from, from + PAGE - 1);
    if (CITY_FILTER) q = q.ilike("city", CITY_FILTER);
    if (!FORCE) q = q.is("website_checked_at", null);
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
  console.log(`Finding websites via Brave for ${scope}…`);
  const targets = await fetchTargets();
  if (!targets.length) {
    console.log("Nothing to check.");
    return;
  }
  console.log(`  ${targets.length} facilities (rate-limited ~1/sec)`);

  let found = 0;
  let done = 0;
  for (const f of targets) {
    const website = await findWebsite(f.name, f.city);
    const update: Record<string, unknown> = {
      website_checked_at: new Date().toISOString(),
    };
    if (website) {
      update.website = website;
      update.website_source = "brave";
      found++;
    }
    const { error } = await supabase.from("facilities").update(update).eq("id", f.id);
    if (error) console.error(`  update ${f.name}:`, error.message);
    done++;
    if (done % 25 === 0 || done === targets.length) {
      console.log(`  ${done}/${targets.length}  found=${found}`);
    }
    await sleep(1100); // stay under Brave's 1 query/sec free limit
  }

  console.log(`Done. Found websites for ${found} / ${targets.length}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
