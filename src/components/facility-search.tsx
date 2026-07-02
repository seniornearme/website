"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { titleCase } from "@/lib/format";
import { slugifyCity } from "@/lib/cities";

type FacilityHit = {
  slug: string;
  name: string;
  city: string | null;
  capacity: number | null;
};
type CityHit = { city: string; facility_count: number };

export function FacilitySearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [facilities, setFacilities] = useState<FacilityHit[]>([]);
  const [cities, setCities] = useState<CityHit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setFacilities([]);
      setCities([]);
      return;
    }
    const t = setTimeout(async () => {
      setBusy(true);
      const supabase = createClient();
      const [f, c] = await Promise.all([
        supabase
          .from("facilities")
          .select("slug, name, city, capacity")
          .eq("status", "active")
          .or(`name.ilike.%${q}%,license_number.eq.${/^\d+$/.test(q) ? q : "0"}`)
          .order("name")
          .limit(12),
        supabase
          .from("city_stats")
          .select("city, facility_count")
          .ilike("city", `${q}%`)
          .order("facility_count", { ascending: false })
          .limit(3),
      ]);
      // rank: name-prefix matches first, then shorter (more exact) names
      const ql = q.toLowerCase();
      const ranked = ((f.data as FacilityHit[] | null) ?? [])
        .sort((a, b) => {
          const ap = a.name.toLowerCase().startsWith(ql) ? 0 : 1;
          const bp = b.name.toLowerCase().startsWith(ql) ? 0 : 1;
          return ap - bp || a.name.length - b.name.length;
        })
        .slice(0, 6);
      setFacilities(ranked);
      setCities((c.data as CityHit[] | null) ?? []);
      setOpen(true);
      setBusy(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  // close on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (facilities[0]) router.push(`/facilities/${facilities[0].slug}`);
    else if (cities[0]) router.push(`/search?city=${slugifyCity(cities[0].city)}`);
  }

  const hasResults = facilities.length > 0 || cities.length > 0;

  return (
    <div ref={boxRef} className="relative mx-auto mt-8 w-full max-w-xl text-left">
      <form onSubmit={submit} role="search">
        <div className="flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-4 py-3 shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200 dark:border-zinc-700 dark:bg-zinc-900">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-zinc-400" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => hasResults && setOpen(true)}
            placeholder="Facility name, license number, or city…"
            aria-label="Search facilities"
            className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
          />
          {busy && (
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-600" aria-hidden="true" />
          )}
        </div>
      </form>

      {open && hasResults && (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {facilities.length > 0 && (
            <ul>
              {facilities.map((f) => (
                <li key={f.slug}>
                  <button
                    type="button"
                    onClick={() => router.push(`/facilities/${f.slug}`)}
                    className="flex w-full items-baseline justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <span className="min-w-0 truncate font-medium">{titleCase(f.name)}</span>
                    <span className="shrink-0 text-xs text-zinc-400">
                      {f.city ? `${titleCase(f.city)}, CA` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {cities.length > 0 && (
            <ul className="border-t border-zinc-100 dark:border-zinc-800">
              {cities.map((c) => (
                <li key={c.city}>
                  <button
                    type="button"
                    onClick={() => router.push(`/search?city=${slugifyCity(c.city)}`)}
                    className="flex w-full items-baseline justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <span>
                      Assisted living in{" "}
                      <span className="font-medium">{titleCase(c.city)}, CA</span>
                    </span>
                    <span className="shrink-0 text-xs text-zinc-400">
                      {c.facility_count} on map
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
