import { createClient } from "@/lib/supabase/server";
import { SearchMap, type FacilityGeo } from "./search-map";

export const revalidate = 3600;

const PAGE_SIZE = 1000;

async function fetchAllActive(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { count, error: countError } = await supabase
    .from("facilities_search")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");
  if (countError) throw countError;
  if (!count) return [];

  const pages = Math.ceil(count / PAGE_SIZE);
  const results = await Promise.all(
    Array.from({ length: pages }, (_, i) =>
      supabase
        .from("facilities_search")
        .select("id,name,slug,facility_type,status,city,county,capacity,lng,lat")
        .eq("status", "active")
        .order("id")
        .range(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1),
    ),
  );
  return results.flatMap((r) => r.data ?? []) as FacilityGeo[];
}

export default async function SearchPage() {
  const supabase = await createClient();
  try {
    const facilities = await fetchAllActive(supabase);
    return <SearchMap facilities={facilities} />;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold mb-2">Couldn&apos;t load facilities</h1>
        <p className="text-red-600 text-sm">{message}</p>
      </div>
    );
  }
}
