// City browse helpers: slug mapping + city_stats access.
// Uses a cookie-less anon client so it works in metadata routes (sitemap)
// and server components alike; city_stats is public-readable.
import { createClient } from "@supabase/supabase-js";

export type CityStat = { city: string; county: string | null; facility_count: number };

export function slugifyCity(city: string): string {
  return city
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function publicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function fetchCityStats(): Promise<CityStat[]> {
  const { data, error } = await publicClient()
    .from("city_stats")
    .select("city, county, facility_count")
    .order("city");
  if (error) throw error;
  return (data as CityStat[]) ?? [];
}

export async function findCityBySlug(slug: string): Promise<CityStat | null> {
  const cities = await fetchCityStats();
  return cities.find((c) => slugifyCity(c.city) === slug) ?? null;
}

/** All active facility slugs, paginated — for the sitemap. */
export async function fetchAllFacilitySlugs(): Promise<{ slug: string; updated_at: string }[]> {
  const supabase = publicClient();
  const PAGE = 1000;
  const out: { slug: string; updated_at: string }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("facilities")
      .select("slug, updated_at")
      .eq("status", "active")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    out.push(...(data as { slug: string; updated_at: string }[]));
    if (data.length < PAGE) break;
  }
  return out;
}
