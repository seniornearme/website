/**
 * photo-pipeline.ts — unified website -> photos pipeline.
 *
 * Stages:
 *   1. targets  — active facilities with a website whose photos_synced_at is null
 *                 (a website add/change resets it via DB trigger), grouped by domain
 *   2. harvest  — static fetch of homepage + gallery subpages; if that yields few
 *                 images, headless Playwright fallback (JS galleries, lazy-load)
 *   3. rank     — heuristic score + kind (facility/stock); if ANTHROPIC_API_KEY is
 *                 set, a Claude vision pass refines kind, adds quality + a label
 *   4. store    — WebP 1600px + 480px thumb to S3, content-hashed keys
 *   5. db       — facility_photos rows: score -> position; kind -> default
 *                 visibility (facility=visible, stock=hidden). Judging RANKS,
 *                 it does not gate storage — owners curate `visible` after claiming.
 *
 * Re-running a facility replaces its site_scrape rows; owner_upload rows are
 * never touched. Definitive junk (logos, icons, pixels, sprites) is still
 * dropped — that's garbage, not a choice.
 *
 * Run:  npx tsx scripts/photo-pipeline.ts --city reseda
 *       npx tsx scripts/photo-pipeline.ts --facility 197610645 --force
 *       npx tsx scripts/photo-pipeline.ts --limit 50
 *
 * Env:  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (required)
 *       ANTHROPIC_API_KEY (optional — enables vision ranking + labels)
 */

import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { chromium, type Browser } from "playwright";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { config } from "dotenv";
import { extractCareFeatures, sortCareFeatures } from "../src/lib/care-taxonomy";

config({ path: ".env.local" });

// ---------- config ----------
const BUCKET = "seniornearme-media";
const CDN = "https://dow4aspggimft.cloudfront.net";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const MIN_BYTES = 12000;
const MAX_STORE = 20;         // photos stored per facility
const MAX_VERIFY = 30;        // candidates downloaded/verified per site
const HEADLESS_THRESHOLD = 6; // static yield below this -> render with Playwright
const SUBPAGES = 4;

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const CITY = flag("--city");
const FACILITY = flag("--facility");
const LIMIT = flag("--limit") ? parseInt(flag("--limit")!, 10) : undefined;
const FORCE = args.includes("--force");
const NO_HEADLESS = args.includes("--no-headless");
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
const s3 = new S3Client({ region: "us-west-2" });

// ---------- classification ----------
const JUNK =
  /(logo|icon|favicon|sprite|avatar|badge|btn|button|arrow|chevron|bg[-_]|pattern|placeholder|loader|spinner|pixel|1x1|blank|spacer|divider|social|facebook|instagram|twitter|linkedin|yelp|tripadvisor|gstatic|gravatar|star|rating|email|phone|cart|search|menu|close|hamburger|recaptcha|emoji|flag|award|seal|certified|equal.?housing|ada.?compliant|video-poster|og-card)/i;
const STOCK_HOST =
  /(shutterstock|istockphoto|gettyimages|unsplash|pexels|pixabay|stock\.adobe|adobestock|dreamstime|123rf|freepik|depositphotos|stocksy|alamy)/i;
const STOCK_SLUG =
  /(\/stock\/|shutterstock|istock|getty|unsplash|pexels|adobe.?stock|depositphotos|stock.?photo|senior.?couple|happy.?(family|senior|couple)|caring.?hands|holding.?hands|hands.?together|elderly.?(woman|man|couple|person)|smiling.?(woman|man|senior|nurse|face)|portrait|headshot|caresupport|autumn|leaves|flower|floral|sunset|nature[-_]|landscape|abstract|bokeh|texture|hero[-_]?bg|banner[-_]?bg|slide[-_]?bg|background[-_])/i;
const FACILITY_HINT =
  /(building|exterior|interior|home|house|room|bedroom|living|dining|kitchen|garden|courtyard|patio|yard|front|facility|property|community|suite|lobby|entrance|hallway|our[-_])/i;

type Cand = { url: string; w: number; score: number; og: boolean };
type Ranked = Cand & { buf: Buffer; kind: "facility" | "stock"; label: string | null; final: number };

const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const fileKey = (u: string) => { try { const p = new URL(u); return p.hostname + "/" + (p.pathname.split("/").pop() || p.pathname).toLowerCase(); } catch { return u; } };
const deent = (s: string) => s.replace(/&amp;/gi, "&").replace(/&#0*38;/g, "&").replace(/&#x0*26;/gi, "&");
const abs = (u: string, base: string) => { try { const x = new URL(deent(u.trim()), base); return x.protocol === "http:" || x.protocol === "https:" ? x.href : null; } catch { return null; } };

function heurKind(url: string, og: boolean): "facility" | "stock" {
  const l = url.toLowerCase();
  if (STOCK_HOST.test(hostOf(url)) || STOCK_SLUG.test(l)) return "stock";
  if (og && !FACILITY_HINT.test(l)) return "stock";
  return "facility";
}
function heurScore(url: string, w: number, tagCtx: string): number {
  let s = 1;
  if (/\.(jpe?g|webp)(\?|$)/i.test(url)) s += 1;
  if (w >= 800) s += 2; else if (w >= 400) s += 1;
  if (FACILITY_HINT.test(url)) s += 2;
  if (/(gallery|slider|slick|swiper|carousel|lightbox|fancybox|masonry)/i.test(tagCtx)) s += 3;
  return s;
}

// ---------- static harvest ----------
async function fetchHtml(url: string): Promise<{ finalUrl: string; html: string } | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(12000) });
    if (!res.ok || !(res.headers.get("content-type") || "").includes("html")) return null;
    return { finalUrl: res.url || url, html: await res.text() };
  } catch { return null; }
}

async function robotsAllows(site: string): Promise<boolean> {
  try {
    const res = await fetch(new URL("/robots.txt", site).href, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return true;
    const txt = await res.text();
    // minimal check: a global "Disallow: /" under User-agent: *
    const block = txt.split(/user-agent:\s*/i).find((b) => b.trim().startsWith("*"));
    return !(block && /^\s*disallow:\s*\/\s*$/im.test(block));
  } catch { return true; }
}

const extAttr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1] ?? null;
const largestSrcset = (ss: string) => {
  let best: { url: string; w: number } | null = null;
  for (const part of ss.split(",")) {
    const [u, d] = part.trim().split(/\s+/);
    if (!u) continue;
    const w = d?.endsWith("w") ? parseInt(d) : d?.endsWith("x") ? parseFloat(d) * 1000 : 0;
    if (!best || w > best.w) best = { url: u, w };
  }
  return best?.url ?? null;
};
const declaredW = (url: string, tag: string) =>
  parseInt(url.match(/[/,]w_(\d+)/)?.[1] ?? tag.match(/\bwidth\s*=\s*["']?(\d+)/i)?.[1] ?? url.match(/[?&](?:w|width|maxwidth)=(\d+)/i)?.[1] ?? "0");
// Width encoded in the URL itself — CDNs that serve size variants of the SAME
// filename from width directories (/720/x.webp vs /1920/x.webp) collide on
// fileKey, so the hint decides which variant survives dedup.
const urlWidthHint = (u: string) => {
  let path = u;
  try { path = new URL(u).pathname; } catch { /* keep raw */ }
  const m =
    path.match(/(?:^|\/)(\d{3,4})\//) ||          // /1920/photo.webp
    path.match(/[-_](\d{3,4})x\d{2,4}\.\w+$/) ||  // photo-1024x683.jpg
    path.match(/[-_](\d{3,4})w\.\w+$/) ||         // photo-800w.jpg
    u.match(/[/,]w_(\d{3,4})(?:[,/]|$)/) ||       // cloudinary w_1024
    u.match(/[?&](?:w|width|maxwidth)=(\d{2,4})/i);
  const w = m ? parseInt(m[1], 10) : 0;
  return w >= 200 && w <= 4000 ? w : 0;
};

function harvestHtml(html: string, base: string, acc: Map<string, Cand>) {
  const add = (raw: string | null, w: number, score: number, og: boolean) => {
    if (!raw) return;
    const url = abs(raw, base);
    if (!url || /^data:/i.test(url) || /\.(svg|gif|ico|bmp)(\?|$)/i.test(url) || JUNK.test(url)) return;
    const k = fileKey(url);
    const hint = Math.max(w, urlWidthHint(url));
    const prev = acc.get(k);
    if (!prev || hint > prev.w || (hint === prev.w && score > prev.score))
      acc.set(k, { url, w: hint, score: Math.max(score, prev?.score ?? 0), og: og || prev?.og || false });
  };
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = extAttr(tag, "src") || extAttr(tag, "data-src") || extAttr(tag, "data-lazy-src") || extAttr(tag, "data-original");
    const ss = extAttr(tag, "srcset") || extAttr(tag, "data-srcset");
    const chosen = (ss && largestSrcset(ss)) || src;
    if (!chosen) continue;
    const w = declaredW(chosen, tag);
    if (w && w < 220) continue;
    add(chosen, w, heurScore(chosen, w, tag), false);
  }
  for (const m of html.matchAll(/<source\b[^>]*>/gi)) { const ss = extAttr(m[0], "srcset"); if (ss) add(largestSrcset(ss), 0, 2, false); }
  for (const m of html.matchAll(/background-image\s*:\s*url\((['"]?)([^'")]+)\1\)/gi)) add(m[2], declaredW(m[2], ""), 2, false);
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const n = (extAttr(m[0], "property") || extAttr(m[0], "name") || "").toLowerCase();
    if (n === "og:image" || n === "og:image:url" || n === "twitter:image") add(extAttr(m[0], "content"), 1000, 5, true);
  }
}

function subpageLinks(html: string, base: string, host: string): string[] {
  const kw = /(gallery|photo|tour|room|about|amenit|service|care|community|accommodat|our-home)/i;
  const seen = new Set<string>(); const out: string[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["']/gi)) {
    const u = abs(m[1], base);
    if (!u) continue;
    try {
      const p = new URL(u);
      if (p.hostname.replace(/^www\./, "") !== host) continue;
      const path = p.pathname.toLowerCase().replace(/\/$/, "");
      if (!path || seen.has(path) || !kw.test(path)) continue;
      seen.add(path); out.push(p.href);
    } catch { /* skip */ }
  }
  return out.sort((a, b) => (/(gallery|photo|tour|room)/i.test(b) ? 1 : 0) - (/(gallery|photo|tour|room)/i.test(a) ? 1 : 0)).slice(0, SUBPAGES);
}

const htmlToText = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ");

async function staticHarvest(site: string): Promise<{ reachable: boolean; cands: Map<string, Cand>; texts: string[] }> {
  const cands = new Map<string, Cand>();
  const texts: string[] = [];
  const home = await fetchHtml(site.startsWith("http") ? site : `https://${site}`);
  if (!home) return { reachable: false, cands, texts };
  harvestHtml(home.html, home.finalUrl, cands);
  texts.push(htmlToText(home.html));
  const host = hostOf(home.finalUrl);
  for (const sp of subpageLinks(home.html, home.finalUrl, host)) {
    const r = await fetchHtml(sp);
    if (r) { harvestHtml(r.html, r.finalUrl, cands); texts.push(htmlToText(r.html)); }
  }
  return { reachable: true, cands, texts };
}

// ---------- headless harvest ----------
async function headlessHarvest(browser: Browser, site: string, cands: Map<string, Cand>, texts: string[]): Promise<boolean> {
  const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  // tsx/esbuild wraps evaluate()'d functions with a __name helper; define it in-page.
  await page.addInitScript("window.__name = window.__name || function (f) { return f; };");

  const collect = async () => {
    const urls: string[] = await page.evaluate(() => {
      const out = new Set<string>();
      const push = (u: string | null) => { if (u) out.add(u); };
      document.querySelectorAll("img").forEach((img) => {
        push((img as HTMLImageElement).currentSrc); push(img.getAttribute("src"));
        const ss = img.getAttribute("srcset") || img.getAttribute("data-srcset");
        if (ss) ss.split(",").forEach((p) => push(p.trim().split(/\s+/)[0]));
        ["data-src", "data-lazy-src", "data-original"].forEach((a) => push(img.getAttribute(a)));
      });
      document.querySelectorAll("source[srcset]").forEach((s) =>
        (s.getAttribute("srcset") || "").split(",").forEach((p) => push(p.trim().split(/\s+/)[0])));
      document.querySelectorAll("a[href]").forEach((a) => {
        const h = (a as HTMLAnchorElement).href;
        if (/\.(jpe?g|png|webp)(\?|$)/i.test(h)) push(h);
      });
      for (const el of Array.from(document.querySelectorAll("*"))) {
        const bg = getComputedStyle(el).backgroundImage;
        const m = bg?.match(/url\(["']?([^"')]+)["']?\)/);
        if (m) push(m[1]);
      }
      return [...out].map((u) => { try { return new URL(u, location.href).href; } catch { return ""; } }).filter(Boolean);
    });
    for (const u of urls) {
      if (/^data:/i.test(u) || /\.(svg|gif|ico|bmp)(\?|$)/i.test(u) || JUNK.test(u)) continue;
      const k = fileKey(u);
      const hint = urlWidthHint(u);
      const prev = cands.get(k);
      if (!prev || hint > prev.w)
        cands.set(k, { url: u, w: hint, score: Math.max(heurScore(u, hint, ""), prev?.score ?? 0), og: prev?.og ?? false });
    }
  };
  const scroll = async () => {
    await page.evaluate(async () => {
      await new Promise<void>((res) => {
        let t = 0; const s = 700;
        const id = setInterval(() => { window.scrollBy(0, s); t += s; if (t >= document.body.scrollHeight + 1200) { clearInterval(id); res(); } }, 160);
      });
    });
    await page.waitForTimeout(600);
  };

  const grabText = async () => {
    try { texts.push(await page.evaluate(() => document.body?.innerText ?? "")); } catch { /* optional */ }
  };

  try {
    await page.goto(site.startsWith("http") ? site : `https://${site}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1200);
    await scroll(); await collect(); await grabText();
    const host = hostOf(page.url());
    const links: string[] = await page.evaluate(() => Array.from(document.querySelectorAll("a[href]")).map((a) => (a as HTMLAnchorElement).href));
    const galleryKw = /(gallery|photo|tour|room)/i;
    const gpages = [...new Set(links.filter((l) => { try { const u = new URL(l); return u.hostname.replace(/^www\./, "") === host && galleryKw.test(u.pathname); } catch { return false; } }))].slice(0, 3);
    for (const g of gpages) {
      try {
        await page.goto(g, { waitUntil: "domcontentloaded", timeout: 25000 });
        await page.waitForTimeout(1000);
        await scroll(); await collect(); await grabText();
        // lightbox galleries: click the first tile and read the opened image
        try {
          await page.click("[class*=gallery] img, [class*=Gallery] img, [data-lightbox], [class*=lightbox] img", { timeout: 2500 });
          await page.waitForTimeout(900);
          await collect();
        } catch { /* no clickable gallery */ }
      } catch { /* skip subpage */ }
    }
    await ctx.close();
    return true;
  } catch (e) {
    console.log(`      headless err: ${(e as Error).message.split("\n")[0]}`);
    await ctx.close();
    return false;
  }
}

// ---------- verify + download ----------
// Width-directory CDNs (/720/x.webp) often host larger variants the page never
// declares in srcset; probe the standard sizes and take the biggest that exists.
async function upgradeWidthVariant(url: string): Promise<string> {
  const m = url.match(/(?<=\/)(\d{3,4})(?=\/[^/]+$)/);
  const cur = m ? parseInt(m[1], 10) : 0;
  if (!cur || cur < 200 || cur >= 1920) return url;
  for (const w of [1920, 1600]) {
    if (w <= cur) break;
    const candidate = url.replace(/(?<=\/)\d{3,4}(?=\/[^/]+$)/, String(w));
    try {
      const res = await fetch(candidate, { method: "HEAD", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(6000) });
      if (res.ok && (res.headers.get("content-type") || "").startsWith("image/")) return candidate;
    } catch { /* keep trying smaller */ }
  }
  return url;
}

async function download(url: string, referer: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "image/*", Referer: referer }, redirect: "follow", signal: AbortSignal.timeout(20000) });
    if (!res.ok || !(res.headers.get("content-type") || "").startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length >= MIN_BYTES ? buf : null;
  } catch { return null; }
}

// ---------- vision ranking (optional) ----------
type VisionVerdict = { i: number; kind: "facility" | "stock"; quality: number; label: string };

async function visionRank(bufs: Buffer[]): Promise<Map<number, VisionVerdict> | null> {
  if (!ANTHROPIC_KEY) return null;
  const TW = 200, TH = 150, COLS = 6, GAP = 4;
  const rows = Math.ceil(bufs.length / COLS);
  const comps: sharp.OverlayOptions[] = [];
  const labels: string[] = [];
  for (let i = 0; i < bufs.length; i++) {
    const left = (i % COLS) * (TW + GAP), top = Math.floor(i / COLS) * (TH + GAP);
    try { comps.push({ input: await sharp(bufs[i]).resize(TW, TH, { fit: "cover" }).jpeg().toBuffer(), top, left }); }
    catch { comps.push({ input: { create: { width: TW, height: TH, channels: 3, background: "#ddd" } }, top, left }); }
    labels.push(`<rect x="${left}" y="${top}" width="30" height="20" fill="#000"/><text x="${left + 5}" y="${top + 15}" font-size="14" fill="#fff" font-family="sans-serif">${i}</text>`);
  }
  const W = COLS * (TW + GAP), H = rows * (TH + GAP);
  const sheet = await sharp({ create: { width: W, height: H, channels: 3, background: "#fff" } })
    .composite([...comps, { input: Buffer.from(`<svg width="${W}" height="${H}">${labels.join("")}</svg>`), top: 0, left: 0 }])
    .jpeg({ quality: 72 }).toBuffer();

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: sheet.toString("base64") } },
            { type: "text", text:
              `These ${bufs.length} numbered photos were harvested from a senior care facility's own website. For each photo return: ` +
              `"kind" — "facility" if it looks like an actual photo of this specific facility (rooms, building exterior, garden, food, real residents/staff on-site) or "stock" if it is generic stock imagery (posed models, studio lighting, abstract/nature, logos); ` +
              `"quality" — 0-10 marketing appeal for a consumer directory; ` +
              `"label" — 2-3 word scene description (e.g. "bedroom", "front exterior", "dining room"). ` +
              `Respond with ONLY a JSON array: [{"i":0,"kind":"facility","quality":7,"label":"bedroom"}, ...]` },
          ],
        }],
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) { console.log(`      vision HTTP ${res.status}`); return null; }
    const data = await res.json() as { content?: { text?: string }[] };
    const text = data.content?.map((c) => c.text ?? "").join("") ?? "";
    const json = text.match(/\[[\s\S]*\]/)?.[0];
    if (!json) return null;
    const arr = JSON.parse(json) as VisionVerdict[];
    return new Map(arr.filter((v) => typeof v.i === "number").map((v) => [v.i, v]));
  } catch (e) {
    console.log(`      vision err: ${(e as Error).message.split("\n")[0]}`);
    return null;
  }
}

// ---------- store ----------
async function storePhoto(license: string, buf: Buffer): Promise<{ key: string; url: string; thumbUrl: string; width: number | null } | null> {
  try {
    const full = await sharp(buf).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    const thumb = await sharp(buf).rotate().resize({ width: 480, withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
    const hash = createHash("sha1").update(full).digest("hex").slice(0, 10);
    const base = `facilities/${license}/${hash}`;
    const put = (key: string, body: Buffer) => s3.send(new PutObjectCommand({
      Bucket: BUCKET, Key: key, Body: body, ContentType: "image/webp",
      CacheControl: "public, max-age=31536000, immutable",
    }));
    await Promise.all([put(`${base}_1600.webp`, full), put(`${base}_480.webp`, thumb)]);
    return { key: `${base}_1600.webp`, url: `${CDN}/${base}_1600.webp`, thumbUrl: `${CDN}/${base}_480.webp`, width: (await sharp(full).metadata()).width ?? null };
  } catch { return null; }
}

// ---------- main ----------
type Target = { id: string; license_number: string; name: string; website: string; amenities_source: string | null };

async function fetchTargets(): Promise<Target[]> {
  const PAGE = 1000; const out: Target[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from("facilities")
      .select("id, license_number, name, website, amenities_source")
      .not("website", "is", null).not("license_number", "is", null)
      .eq("status", "active").order("id").range(from, from + PAGE - 1);
    if (CITY) q = q.ilike("city", CITY);
    if (FACILITY) q = q.eq("license_number", FACILITY);
    if (!FORCE) q = q.is("photos_synced_at", null);
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
  const targets = await fetchTargets();
  if (!targets.length) { console.log("Nothing to harvest."); return; }

  // group facilities that share a website domain — harvest once, store per facility
  const groups = new Map<string, Target[]>();
  for (const t of targets) {
    const h = hostOf(t.website.startsWith("http") ? t.website : `https://${t.website}`) || t.website;
    (groups.get(h) ?? groups.set(h, []).get(h)!).push(t);
  }
  console.log(`${targets.length} facilities across ${groups.size} sites  (vision: ${ANTHROPIC_KEY ? "ON" : "off — heuristic ranking"})\n`);

  let browser: Browser | null = null;
  let stored = 0;

  for (const [host, members] of groups) {
    const site = members[0].website;
    process.stdout.write(`  ${host.padEnd(42)}`);

    if (!(await robotsAllows(site.startsWith("http") ? site : `https://${site}`))) {
      console.log("robots.txt disallows — skipped");
      for (const m of members) await supabase.from("facilities").update({ photos_synced_at: new Date().toISOString() }).eq("id", m.id);
      continue;
    }

    // 1-2. harvest (static, headless fallback)
    const { reachable, cands, texts } = await staticHarvest(site);
    let usedHeadless = false;
    if (!NO_HEADLESS && (!reachable || cands.size < HEADLESS_THRESHOLD)) {
      browser ??= await chromium.launch({ headless: true });
      usedHeadless = await headlessHarvest(browser, site, cands, texts);
    }

    // care & amenities from the site's own text — never overwrites owner curation
    const features = sortCareFeatures(extractCareFeatures(texts.join(" ")));
    if (features.length) {
      for (const m of members) {
        if (m.amenities_source === "owner") continue;
        await supabase.from("facilities")
          .update({ amenities: features, amenities_source: "scrape" })
          .eq("id", m.id);
      }
    }

    if (!cands.size) {
      console.log(reachable || usedHeadless ? "0 candidates" : "unreachable");
      for (const m of members) await supabase.from("facilities").update({ photos_synced_at: new Date().toISOString() }).eq("id", m.id);
      continue;
    }

    // 3a. verify + download the top candidates
    const top = [...cands.values()].sort((a, b) => b.score - a.score || b.w - a.w).slice(0, MAX_VERIFY);
    const downloaded: (Ranked | null)[] = [];
    for (let i = 0; i < top.length && downloaded.filter(Boolean).length < MAX_STORE; i += 10) {
      const chunk = top.slice(i, i + 10);
      const bufs = await Promise.all(chunk.map(async (c) => {
        const url = await upgradeWidthVariant(c.url);
        const buf = await download(url, site);
        return buf ?? (url !== c.url ? await download(c.url, site) : null);
      }));
      chunk.forEach((c, j) => {
        downloaded.push(bufs[j] ? { ...c, buf: bufs[j]!, kind: heurKind(c.url, c.og), label: null, final: c.score } : null);
      });
    }
    const photos = (downloaded.filter(Boolean) as Ranked[]).slice(0, MAX_STORE);
    if (!photos.length) {
      console.log(`${cands.size} candidates, 0 verified`);
      for (const m of members) await supabase.from("facilities").update({ photos_synced_at: new Date().toISOString() }).eq("id", m.id);
      continue;
    }

    // 3b. vision ranking (optional)
    const verdicts = await visionRank(photos.map((p) => p.buf));
    if (verdicts) {
      photos.forEach((p, i) => {
        const v = verdicts.get(i);
        if (!v) return;
        p.kind = v.kind === "stock" ? "stock" : "facility";
        p.label = v.label || null;
        p.final = v.quality * 10 + p.score;
      });
    }
    photos.sort((a, b) => b.final - a.final);

    // 4-5. store + write rows per member facility
    for (const m of members) {
      const rows: Record<string, unknown>[] = [];
      for (const p of photos) {
        const s = await storePhoto(m.license_number, p.buf);
        if (!s) continue;
        rows.push({
          facility_id: m.id,
          storage_key: s.key, url: s.url, thumb_url: s.thumbUrl,
          origin_url: p.url, source: "site_scrape",
          kind: p.kind, label: p.label, score: p.final,
          position: rows.length, visible: p.kind === "facility",
          width: s.width,
        });
      }
      await supabase.from("facility_photos").delete().eq("facility_id", m.id).eq("source", "site_scrape");
      if (rows.length) {
        const { error } = await supabase.from("facility_photos").insert(rows);
        if (error) { console.log(`\n      insert ${m.name}: ${error.message}`); continue; }
      }
      await supabase.from("facilities").update({ photos_synced_at: new Date().toISOString() }).eq("id", m.id);
      stored += rows.length;
    }
    const vis = photos.filter((p) => p.kind === "facility").length;
    console.log(`${photos.length} stored (${vis} visible, ${photos.length - vis} hidden-stock), ${features.length} features${usedHeadless ? " [headless]" : ""}${members.length > 1 ? ` ×${members.length} facilities` : ""}`);
  }

  if (browser) await browser.close();
  console.log(`\nDone. ${stored} photo rows written.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
