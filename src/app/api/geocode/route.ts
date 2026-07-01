import { NextResponse } from "next/server";

// Geocode a free-text address via the US Census geocoder (free, no key).
// Called server-side to avoid browser CORS. Biased to California.
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ error: "missing q" }, { status: 400 });
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
