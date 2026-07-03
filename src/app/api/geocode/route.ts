import { NextResponse } from "next/server";

// Address services, proxied server-side to avoid browser CORS:
//   /api/geocode?q=...            -> single best match (US Census geocoder)
//   /api/geocode?q=...&suggest=1  -> typeahead suggestions (Photon / OSM)
// Both are free, no-key services, biased/filtered to California.

type Suggestion = { label: string; lng: number; lat: number };

async function suggest(q: string): Promise<Suggestion[]> {
  const url =
    "https://photon.komoot.io/api/" +
    `?q=${encodeURIComponent(q)}` +
    "&limit=8&lang=en&lon=-119.42&lat=36.78" + // bias toward California
    "&bbox=-124.6,32.4,-114.0,42.1"; // and clip to it
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      features?: {
        geometry?: { coordinates?: [number, number] };
        properties?: Record<string, string | undefined>;
      }[];
    };
    const out: Suggestion[] = [];
    const seen = new Set<string>();
    for (const f of data.features ?? []) {
      const p = f.properties ?? {};
      const coords = f.geometry?.coordinates;
      if (!coords) continue;
      if (p.countrycode && p.countrycode !== "US") continue;
      if (p.state && p.state !== "California") continue;
      const street = [p.housenumber, p.street].filter(Boolean).join(" ");
      const label = [street || p.name, p.city || p.district, "CA"]
        .filter(Boolean)
        .join(", ");
      if (!label || seen.has(label)) continue;
      seen.add(label);
      out.push({ label, lng: coords[0], lat: coords[1] });
      if (out.length >= 4) break;
    }
    return out;
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = params.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ error: "missing q" }, { status: 400 });
  }

  if (params.get("suggest")) {
    return NextResponse.json({ suggestions: await suggest(q) });
  }

  const address = /\bca\b/i.test(q) ? q : `${q}, CA`;
  const url =
    "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress" +
    `?address=${encodeURIComponent(address)}` +
    "&benchmark=Public_AR_Current&format=json";

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      return NextResponse.json({ result: null }, { status: 200 });
    }
    const data = await res.json();
    const match = data?.result?.addressMatches?.[0];
    if (!match) return NextResponse.json({ result: null });
    return NextResponse.json({
      result: {
        lng: match.coordinates.x,
        lat: match.coordinates.y,
        matched: match.matchedAddress,
      },
    });
  } catch {
    return NextResponse.json({ result: null }, { status: 200 });
  }
}
