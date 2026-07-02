/**
 * Load city + ZIP boundary polygons into the boundaries table.
 *
 * Sources (Census cartographic boundary shapefiles, pre-simplified 1:500k):
 *   - Places 2023 (CA): official city polygons -> kind='city', source='census_place'
 *   - ZCTA 2020 (national, filtered to CA prefixes 900xx-961xx):
 *       every CA ZIP -> kind='zip', source='zcta'
 * Postal cities with no Place polygon (LA neighborhoods like Reseda) get a
 * fallback: union of the ZCTAs for the ZIPs their facilities use ->
 * kind='city', source='zcta_union'.
 *
 * Expects unzipped shapefiles at $BOUNDARY_DIR (see --dir), e.g.:
 *   <dir>/places/cb_2023_06_place_500k.shp
 *   <dir>/zcta/cb_2020_us_zcta520_500k.shp
 *
 * Run: npx tsx scripts/load-boundaries.ts --dir /path/to/boundaries
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import * as shapefile from "shapefile";
import { union } from "@turf/union";
import { featureCollection } from "@turf/helpers";
import bboxFn from "@turf/bbox";

config({ path: ".env.local" });

const args = process.argv.slice(2);
const dirIdx = args.indexOf("--dir");
const DIR = dirIdx >= 0 ? args[dirIdx + 1] : null;
if (!DIR) {
  console.error("Usage: npx tsx scripts/load-boundaries.ts --dir <unzipped shapefile dir>");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

function slugifyCity(city: string): string {
  return city.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

type Feat = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, Record<string, unknown>>;

async function readShapes(path: string, filter: (props: Record<string, unknown>) => boolean): Promise<Feat[]> {
  const out: Feat[] = [];
  const source = await shapefile.open(`${path}.shp`, `${path}.dbf`);
  for (;;) {
    const r = await source.read();
    if (r.done) break;
    const f = r.value as Feat;
    if (f.geometry && filter(f.properties ?? {})) out.push(f);
  }
  return out;
}

function round(coords: unknown): unknown {
  if (typeof coords === "number") return Math.round(coords * 1e5) / 1e5;
  if (Array.isArray(coords)) return coords.map(round);
  return coords;
}

function toRow(kind: string, slug: string, name: string, source: string, geom: Feat) {
  const geometry = { ...geom.geometry, coordinates: round(geom.geometry.coordinates) };
  const [w, s, e, n] = bboxFn(geom);
  return {
    kind,
    slug,
    name,
    source,
    geojson: { type: "Feature", properties: {}, geometry },
    bbox: [Math.round(w * 1e5) / 1e5, Math.round(s * 1e5) / 1e5, Math.round(e * 1e5) / 1e5, Math.round(n * 1e5) / 1e5],
  };
}

async function insertRows(rows: ReturnType<typeof toRow>[]) {
  for (let i = 0; i < rows.length; i += 50) {
    const { error } = await supabase
      .from("boundaries")
      .upsert(rows.slice(i, i + 50), { onConflict: "kind,slug" });
    if (error) throw new Error(error.message);
  }
}

async function main() {
  // ---- our cities + their ZIPs ----
  const { data: cityStats, error: csErr } = await supabase
    .from("city_stats")
    .select("city, facility_count");
  if (csErr) throw csErr;
  const ourCities = new Map<string, string>(); // UPPER name -> original
  for (const c of cityStats ?? []) ourCities.set(c.city.toUpperCase(), c.city);
  console.log(`${ourCities.size} cities in directory`);

  // ---- CA Places ----
  const places = await readShapes(`${DIR}/places/cb_2023_06_place_500k`, () => true);
  console.log(`${places.length} CA place polygons`);

  const cityRows: ReturnType<typeof toRow>[] = [];
  const matched = new Set<string>();
  for (const p of places) {
    const name = String(p.properties.NAME ?? "");
    const upper = name.toUpperCase();
    if (!ourCities.has(upper)) continue;
    matched.add(upper);
    cityRows.push(toRow("city", slugifyCity(name), name, "census_place", p));
  }
  console.log(`matched official place polygons: ${matched.size}`);

  // ---- CA ZCTAs (prefix 900-961) ----
  const zctas = await readShapes(`${DIR}/zcta/cb_2020_us_zcta520_500k`, (props) => {
    const z = String(props.ZCTA5CE20 ?? props.GEOID20 ?? "");
    return /^9(0\d|1\d|2\d|3\d|4\d|5\d|60|61)\d{2}$/.test(z);
  });
  console.log(`${zctas.length} CA ZCTA polygons`);
  const zctaByZip = new Map<string, Feat>();
  const zipRows: ReturnType<typeof toRow>[] = [];
  for (const z of zctas) {
    const zip = String(z.properties.ZCTA5CE20 ?? z.properties.GEOID20 ?? "");
    zctaByZip.set(zip, z);
    zipRows.push(toRow("zip", zip, zip, "zcta", z));
  }

  // ---- fallback city boundaries from facility ZIPs ----
  const unmatched = [...ourCities.keys()].filter((u) => !matched.has(u));
  console.log(`cities without a place polygon: ${unmatched.length} — building ZCTA unions`);
  const { data: cityZipRows, error: zErr } = await supabase
    .from("facilities")
    .select("city, zip")
    .eq("status", "active")
    .not("zip", "is", null)
    .limit(20000);
  if (zErr) throw zErr;
  const zipsByCity = new Map<string, Set<string>>();
  for (const r of cityZipRows ?? []) {
    const u = (r.city ?? "").toUpperCase();
    if (!u) continue;
    const z = String(r.zip).slice(0, 5);
    (zipsByCity.get(u) ?? zipsByCity.set(u, new Set()).get(u)!).add(z);
  }

  let unions = 0;
  let missing = 0;
  for (const u of unmatched) {
    const original = ourCities.get(u)!;
    const zips = [...(zipsByCity.get(u) ?? [])];
    const feats = zips.map((z) => zctaByZip.get(z)).filter(Boolean) as Feat[];
    if (!feats.length) { missing++; continue; }
    let geom: Feat = feats[0];
    if (feats.length > 1) {
      try {
        const merged = union(featureCollection(feats as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[]));
        if (merged) geom = merged as Feat;
      } catch {
        // union failure: fall back to the first (largest coverage unknown) ZCTA
      }
    }
    cityRows.push(toRow("city", slugifyCity(original), titleish(original), "zcta_union", geom));
    unions++;
  }

  console.log(`inserting ${cityRows.length} city + ${zipRows.length} zip boundaries…`);
  await insertRows(cityRows);
  await insertRows(zipRows);

  console.log(`\nDone.`);
  console.log(`  official place polygons: ${matched.size}`);
  console.log(`  zcta-union fallbacks:    ${unions}`);
  console.log(`  cities with no boundary: ${missing}`);
}

function titleish(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

main().catch((e) => { console.error(e); process.exit(1); });
