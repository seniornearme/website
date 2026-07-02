/**
 * Experiment: scrape the facility-owned websites we verified, extract content,
 * and compare it against what Google returned for the same facility.
 *
 * Why this matters: a facility's own site is public content we can cache and
 * display (with a link back), unlike Google's reviews/photos which the ToS
 * forbids storing. So if the sites are rich, they — not Google — are the
 * backbone of the detail page. This measures how rich they actually are and
 * where they agree/disagree with Google.
 *
 * Input:  data/google-places-sample.json (rows with ours.website set)
 * Output: data/site-scrape-sample.json  (gitignored)
 *
 * Dependency-free: fetch + regex extraction. Homepage + up to 3 internal
 * about/services/amenities pages per site.
 *
 * Run: npx tsx scripts/scrape-sites-compare.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const CONCURRENCY = 6;

const AMENITY_TERMS = [
  "memory care", "dementia", "alzheimer", "hospice", "respite", "assisted living",
  "board and care", "private room", "semi-private", "24-hour", "24/7", "around the clock",
  "medication management", "physical therapy", "occupational therapy", "transportation",
  "housekeeping", "laundry", "home-cooked", "meals", "activities", "wheelchair",
  "ambulatory", "non-ambulatory", "diabetic", "incontinence", "rn", "lvn", "caregiver",
  "companionship", "garden", "courtyard", "pet", "wifi", "cable",
];

type GoogleRow = {
  ours: { id: string; license_number: string | null; name: string; website: string | null; city: string | null };
  google: {
    displayName?: { text?: string };
    formattedAddress?: string;
    nationalPhoneNumber?: string;
    websiteUri?: string;
    rating?: number;
    userRatingCount?: number;
    reviews?: unknown[];
    photos?: unknown[];
    editorialSummary?: { text?: string };
    regularOpeningHours?: { weekdayDescriptions?: string[] };
  } | null;
};

const digits = (s: string) => s.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");

async function fetchHtml(url: string): Promise<{ finalUrl: string; html: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("html")) return null;
    return { finalUrl: res.url || url, html: await res.text() };
  } catch {
    return null;
  }
}

function stripText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return m ? m[1] : null;
}

function extract(html: string, baseUrl: string) {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim();
  let description = "";
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const n = (attr(tag, "name") || attr(tag, "property") || "").toLowerCase();
    if (n === "description" || n === "og:description") description = attr(tag, "content") || description;
  }
  const ogImages: string[] = [];
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const n = (attr(tag, "property") || attr(tag, "name") || "").toLowerCase();
    if (n === "og:image") {
      const c = attr(tag, "content");
      if (c) ogImages.push(c);
    }
  }
  const imgCount = (html.match(/<img\b/gi) || []).length;
  const headings: string[] = [];
  for (const m of html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi)) {
    const t = stripText(m[1]);
    if (t && t.length < 120) headings.push(t);
  }
  const text = stripText(html);
  const phones = [...text.matchAll(/\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/g)].map((m) => digits(m[0]));
  const emails = [...html.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)].map((m) => m[0].toLowerCase());
  const links: string[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(m[1], baseUrl);
      links.push(u.href);
    } catch { /* skip */ }
  }
  return {
    title, description, ogImages, imgCount,
    headings: headings.slice(0, 12),
    text,
    phones: [...new Set(phones)],
    emails: [...new Set(emails)],
    links,
  };
}

function pickSubpages(links: string[], host: string): string[] {
  const kw = /(about|service|amenit|care|community|our-home|gallery|room|pricing|cost)/i;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of links) {
    try {
      const u = new URL(l);
      if (u.hostname.replace(/^www\./, "") !== host) continue;
      const key = u.pathname.toLowerCase().replace(/\/$/, "");
      if (!key || key === "" || seen.has(key)) continue;
      if (kw.test(key)) { seen.add(key); out.push(u.href); }
    } catch { /* skip */ }
  }
  return out.slice(0, 3);
}

async function scrapeSite(url: string) {
  const home = await fetchHtml(url.startsWith("http") ? url : `https://${url}`);
  if (!home) return { reachable: false as const };
  const host = (() => { try { return new URL(home.finalUrl).hostname.replace(/^www\./, ""); } catch { return ""; } })();
  const base = extract(home.html, home.finalUrl);
  const subs = pickSubpages(base.links, host);
  let combinedText = base.text;
  let imgCount = base.imgCount;
  const phones = new Set(base.phones);
  const emails = new Set(base.emails);
  const ogImages = new Set(base.ogImages);
  const subPages: string[] = [];
  for (const s of subs) {
    const r = await fetchHtml(s);
    if (!r) continue;
    subPages.push(r.finalUrl);
    const e = extract(r.html, r.finalUrl);
    combinedText += " " + e.text;
    imgCount += e.imgCount;
    e.phones.forEach((p) => phones.add(p));
    e.emails.forEach((p) => emails.add(p));
    e.ogImages.forEach((p) => ogImages.add(p));
  }
  const lc = combinedText.toLowerCase();
  const amenities = AMENITY_TERMS.filter((t) => lc.includes(t));
  return {
    reachable: true as const,
    finalUrl: home.finalUrl,
    title: base.title,
    description: base.description,
    headings: base.headings,
    phones: [...phones],
    emails: [...emails],
    ogImages: [...ogImages],
    imgCount,
    amenities,
    textLength: combinedText.length,
    subPages,
  };
}

async function main() {
  const rows: GoogleRow[] = JSON.parse(readFileSync("data/google-places-sample.json", "utf8"));
  const targets = rows.filter((r) => r.ours.website);
  console.log(`Scraping ${targets.length} verified facility sites…\n`);

  const out: unknown[] = [];
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    const scraped = await Promise.all(
      batch.map(async (r) => ({ row: r, site: await scrapeSite(r.ours.website!) })),
    );
    for (const { row, site } of scraped) {
      const g = row.google;
      const gPhone = g?.nationalPhoneNumber ? digits(g.nationalPhoneNumber) : "";
      const phoneMatch = site.reachable && gPhone ? site.phones.includes(gPhone) : null;
      out.push({
        name: row.ours.name,
        license: row.ours.license_number,
        website: row.ours.website,
        site,
        google: g && {
          phone: g.nationalPhoneNumber ?? null,
          rating: g.rating ?? null,
          reviewCount: g.reviews?.length ?? 0,
          photoCount: g.photos?.length ?? 0,
          editorialSummary: g.editorialSummary?.text ?? null,
          hasHours: !!g.regularOpeningHours?.weekdayDescriptions?.length,
        },
        compare: {
          phoneMatch,
          siteHasDescription: site.reachable ? !!(site.description || site.headings.length) : false,
          googleHasSummary: !!g?.editorialSummary?.text,
          siteImages: site.reachable ? site.imgCount : 0,
          googlePhotos: g?.photos?.length ?? 0,
          siteAmenities: site.reachable ? site.amenities.length : 0,
        },
      });
      const flag = !site.reachable ? "UNREACHABLE" : `${site.imgCount}img ${site.amenities.length}amen ${site.textLength}chars`;
      const pm = phoneMatch === null ? "" : phoneMatch ? " phone✓" : " phone✗";
      console.log(`  ${site.reachable ? "✓" : "✗"} ${row.ours.name.slice(0, 34).padEnd(34)} ${flag}${pm}`);
    }
  }

  mkdirSync("data", { recursive: true });
  writeFileSync("data/site-scrape-sample.json", JSON.stringify(out, null, 2));

  // ---- Aggregate ----
  const reach = out.filter((o: any) => o.site.reachable);
  const thin = reach.filter((o: any) => o.site.textLength < 800); // JS-only / near-empty
  const richer = reach.filter((o: any) => o.site.imgCount > (o.google?.photoCount ?? 0));
  const phoneChecked = out.filter((o: any) => o.compare.phoneMatch !== null);
  const phoneAgree = phoneChecked.filter((o: any) => o.compare.phoneMatch);
  const avgAmen = reach.length ? (reach.reduce((s: number, o: any) => s + o.site.amenities.length, 0) / reach.length).toFixed(1) : "0";
  const avgImg = reach.length ? Math.round(reach.reduce((s: number, o: any) => s + o.site.imgCount, 0) / reach.length) : 0;

  console.log(`\n=== Scrape summary (${out.length} sites) ===`);
  console.log(`  reachable:                 ${reach.length}/${out.length}`);
  console.log(`  thin/JS-rendered (<800ch): ${thin.length}`);
  console.log(`  avg amenities detected:    ${avgAmen}`);
  console.log(`  avg <img> on site:         ${avgImg}`);
  console.log(`  more images than Google:   ${richer.length}/${reach.length}`);
  console.log(`  phone matches Google:      ${phoneAgree.length}/${phoneChecked.length}`);
  console.log(`\nWrote → data/site-scrape-sample.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
