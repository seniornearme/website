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
type ZipHit = { slug: string };
type AddressHit = { label: string; lng: number; lat: number };

const EMPTY = {
  facilities: [] as FacilityHit[],
  cities: [] as CityHit[],
  zips: [] as ZipHit[],
  addresses: [] as AddressHit[],
};

export function FacilitySearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState(EMPTY);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const latestQuery = useRef("");

  useEffect(() => {
    const q = query.trim();
    latestQuery.current = q;
    if (q.length < 2) {
      setHits(EMPTY);
      return;
    }
    const t = setTimeout(async () => {
      setBusy(true);
      const supabase = createClient();
      const digits = /^\d+$/.test(q);
      const zipish = /^\d{3,5}$/.test(q);
      const addressish = /\d/.test(q) && !digits && q.length >= 4;

      const orParts = [`name.ilike.%${q}%`, `street_address.ilike.%${q}%`];
      if (/^\d{5}$/.test(q)) orParts.push(`zip.eq.${q}`);
      if (digits) orParts.push(`license_number.eq.${q}`);

      const [f, c, z, a] = await Promise.all([
        supabase
          .from("facilities")
          .select("slug, name, city, capacity")
          .eq("status", "active")
          .or(orParts.join(","))
          .order("name")
          .limit(12),
        digits
          ? Promise.resolve({ data: [] })
          : supabase
              .from("city_stats")
              .select("city, facility_count")
              .ilike("city", `${q}%`)
              .order("facility_count", { ascending: false })
              .limit(3),
        zipish
          ? supabase
              .from("boundaries")
              .select("slug")
              .eq("kind", "zip")
              .ilike("slug", `${q}%`)
              .order("slug")
              .limit(3)
          : Promise.resolve({ data: [] }),
        addressish
          ? fetch(`/api/geocode?suggest=1&q=${encodeURIComponent(q)}`)
              .then((r) => r.json())
              .then((d) => ({ data: (d.suggestions ?? []) as AddressHit[] }))
              .catch(() => ({ data: [] }))
          : Promise.resolve({ data: [] }),
      ]);

      // rank facilities: name-prefix matches first, then shorter names
      const ql = q.toLowerCase();
      const facilities = ((f.data as FacilityHit[] | null) ?? [])
        .sort((x, y) => {
          const xp = x.name.toLowerCase().startsWith(ql) ? 0 : 1;
          const yp = y.name.toLowerCase().startsWith(ql) ? 0 : 1;
          return xp - yp || x.name.length - y.name.length;
        })
        .slice(0, 6);

      if (latestQuery.current !== q) return; // stale response — a newer query is in flight
      setHits({
        facilities,
        cities: (c.data as CityHit[] | null) ?? [],
        zips: (z.data as ZipHit[] | null) ?? [],
        addresses: (a.data as AddressHit[] | null) ?? [],
      });
      setOpen(true);
      setBusy(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const goAddress = (a: AddressHit) =>
    router.push(`/search?lng=${a.lng}&lat=${a.lat}&label=${encodeURIComponent(a.label)}`);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (hits.facilities[0]) router.push(`/facilities/${hits.facilities[0].slug}`);
    else if (hits.cities[0]) router.push(`/search?city=${slugifyCity(hits.cities[0].city)}`);
    else if (hits.zips[0]) router.push(`/search?zip=${hits.zips[0].slug}`);
    else if (hits.addresses[0]) goAddress(hits.addresses[0]);
  }

  const hasResults =
    hits.facilities.length > 0 ||
    hits.cities.length > 0 ||
    hits.zips.length > 0 ||
    hits.addresses.length > 0;

  const rowClass =
    "flex w-full items-baseline justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800";

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
            placeholder="Facility, city, ZIP, or address…"
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
          {hits.facilities.length > 0 && (
            <ul>
              {hits.facilities.map((f) => (
                <li key={f.slug}>
                  <button type="button" onClick={() => router.push(`/facilities/${f.slug}`)} className={rowClass}>
                    <span className="min-w-0 truncate font-medium">{titleCase(f.name)}</span>
                    <span className="shrink-0 text-xs text-zinc-400">
                      {f.city ? `${titleCase(f.city)}, CA` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {(hits.cities.length > 0 || hits.zips.length > 0) && (
            <ul className="border-t border-zinc-100 dark:border-zinc-800">
              {hits.cities.map((c) => (
                <li key={c.city}>
                  <button
                    type="button"
                    onClick={() => router.push(`/search?city=${slugifyCity(c.city)}`)}
                    className={rowClass}
                  >
                    <span>
                      Assisted living in{" "}
                      <span className="font-medium">{titleCase(c.city)}, CA</span>
                    </span>
                    <span className="shrink-0 text-xs text-zinc-400">{c.facility_count} on map</span>
                  </button>
                </li>
              ))}
              {hits.zips.map((z) => (
                <li key={z.slug}>
                  <button
                    type="button"
                    onClick={() => router.push(`/search?zip=${z.slug}`)}
                    className={rowClass}
                  >
                    <span>
                      Facilities in ZIP <span className="font-medium">{z.slug}</span>
                    </span>
                    <span className="shrink-0 text-xs text-zinc-400">show area</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {hits.addresses.length > 0 && (
            <ul className="border-t border-zinc-100 dark:border-zinc-800">
              {hits.addresses.map((a) => (
                <li key={a.label}>
                  <button type="button" onClick={() => goAddress(a)} className={rowClass}>
                    <span className="flex min-w-0 items-center gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 text-zinc-400" aria-hidden="true">
                        <path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
                      </svg>
                      <span className="truncate">{a.label}</span>
                    </span>
                    <span className="shrink-0 text-xs text-zinc-400">near here</span>
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
