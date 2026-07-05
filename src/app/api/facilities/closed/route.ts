import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Non-active facilities (closed/suspended/pending), fetched lazily only when
// the map's "include closed" toggle is on. Same compact shape as the active
// endpoint plus a status column.
export const dynamic = "force-static";
export const revalidate = 3600;

const PAGE = 1000;

// [id, name, slug, facility_type, city, capacity, lng, lat, photo, countyIdx, status]
export type ClosedRow = [
  string, string, string, string, string | null, number | null, number, number, string | null, number, string,
];

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );

  const counties: string[] = [];
  const countyIdx = new Map<string, number>();
  const idxFor = (c: string | null) => {
    const key = c ?? "";
    if (!countyIdx.has(key)) {
      countyIdx.set(key, counties.length);
      counties.push(key);
    }
    return countyIdx.get(key)!;
  };

  const rows: ClosedRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("facilities_search")
      .select("id,name,slug,facility_type,status,city,county,capacity,lng,lat,photo")
      .neq("status", "active")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data?.length) break;
    for (const f of data) {
      rows.push([
        f.id,
        f.name,
        f.slug,
        f.facility_type,
        f.city,
        f.capacity,
        Math.round(f.lng * 1e5) / 1e5,
        Math.round(f.lat * 1e5) / 1e5,
        f.photo,
        idxFor(f.county),
        f.status,
      ]);
    }
    if (data.length < PAGE) break;
  }

  return NextResponse.json(
    { v: 2, counties, rows },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
