/**
 * US Census batch geocoder.
 *
 * Free, no API key. Accepts up to 10K rows per request as multipart CSV.
 * Docs: https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.pdf
 */

const BATCH_LIMIT = 10_000;
const ENDPOINT =
  "https://geocoding.geo.census.gov/geocoder/locations/addressbatch";

export type AddressInput = {
  id: string;
  street: string;
  city: string;
  state: string;
  zip: string;
};

export type GeocodeResult = {
  lat: number;
  lng: number;
  matched_address: string;
};

function toCsvRow(a: AddressInput): string {
  const esc = (s: string) => `"${(s ?? "").replace(/"/g, '""')}"`;
  return [esc(a.id), esc(a.street), esc(a.city), esc(a.state), esc(a.zip)].join(",");
}

async function geocodeChunk(
  chunk: AddressInput[],
): Promise<Map<string, GeocodeResult>> {
  const csv = chunk.map(toCsvRow).join("\n");
  const form = new FormData();
  form.append("addressFile", new Blob([csv], { type: "text/csv" }), "addresses.csv");
  form.append("benchmark", "Public_AR_Current");

  const res = await fetch(ENDPOINT, { method: "POST", body: form });
  if (!res.ok) {
    throw new Error(`Census geocoder ${res.status}: ${await res.text()}`);
  }

  const body = await res.text();
  const out = new Map<string, GeocodeResult>();

  // Response CSV columns: id, input_address, match_indicator, match_type,
  //   matched_address, coordinates (lng,lat), tiger_line_id, side
  // Fields are quoted; commas inside quoted fields must not split.
  for (const line of body.split("\n")) {
    if (!line.trim()) continue;
    const cols = parseCsvLine(line);
    if (cols.length < 6) continue;
    const [id, , matchIndicator, , matchedAddress, coords] = cols;
    if (matchIndicator !== "Match") continue;
    const [lngStr, latStr] = coords.split(",");
    const lng = parseFloat(lngStr);
    const lat = parseFloat(latStr);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.set(id, { lat, lng, matched_address: matchedAddress });
  }

  return out;
}

function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { cur += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { cols.push(cur); cur = ""; }
      else cur += c;
    }
  }
  cols.push(cur);
  return cols;
}

export async function geocodeBatch(
  addresses: AddressInput[],
): Promise<Map<string, GeocodeResult>> {
  const result = new Map<string, GeocodeResult>();
  for (let i = 0; i < addresses.length; i += BATCH_LIMIT) {
    const chunk = addresses.slice(i, i + BATCH_LIMIT);
    console.log(
      `Geocoding ${i + 1}-${i + chunk.length} of ${addresses.length}…`,
    );
    const chunkResult = await geocodeChunk(chunk);
    chunkResult.forEach((v, k) => result.set(k, v));
  }
  return result;
}
