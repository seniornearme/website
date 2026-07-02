// TEMPORARY diagnostic for Google reviews on Vercel — remove after debugging.
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const placeId = new URL(request.url).searchParams.get("id") ?? "ChIJ7wHSvtSbwoARKRv5h4Zk480";
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return NextResponse.json({ keyPresent: false });
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "rating,userRatingCount,reviews",
        Referer: "http://localhost:3000",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const body = await res.text();
    return NextResponse.json({
      keyPresent: true,
      keyLen: key.length,
      status: res.status,
      body: body.slice(0, 400),
    });
  } catch (e) {
    return NextResponse.json({ keyPresent: true, keyLen: key.length, error: (e as Error).message });
  }
}
