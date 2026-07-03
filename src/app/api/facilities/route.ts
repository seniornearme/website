import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Compact facility dataset for the map: array-of-arrays instead of objects,
// active facilities only. Served cached (per-deployment + CDN) so the /search
// page itself stays tiny — phones fetch and JSON.parse this instead of
// hydrating a multi-MB RSC payload.
export const dynamic = "force-static";
export const revalidate = 3600;

const PAGE = 1000;

// [id, name, slug, facility_type, city, capacity, lng, lat, photo]
export type FacilityRow = [
  string, string, string, string, string | null, number | null, number, number, string | null,
];

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );

  const rows: FacilityRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("facilities_search")
      .select("id,name,slug,facility_type,city,capacity,lng,lat,photo")
      .eq("status", "active")
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
      ]);
    }
    if (data.length < PAGE) break;
  }

  return NextResponse.json(
    { v: 1, rows },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
