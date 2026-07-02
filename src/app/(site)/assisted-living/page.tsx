import type { Metadata } from "next";
import Link from "next/link";
import { fetchCityStats, slugifyCity } from "@/lib/cities";
import { titleCase } from "@/lib/format";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Assisted Living by City in California",
  description:
    "Browse every licensed assisted living and residential care facility in California by city — with state inspection records, photos, and contact details.",
  alternates: { canonical: "/assisted-living" },
};

export default async function CitiesIndexPage() {
  const cities = await fetchCityStats();
  const total = cities.reduce((n, c) => n + c.facility_count, 0);

  // group alphabetically
  const groups = new Map<string, typeof cities>();
  for (const c of cities) {
    const letter = c.city.charAt(0).toUpperCase();
    (groups.get(letter) ?? groups.set(letter, []).get(letter)!).push(c);
  }
  const letters = [...groups.keys()].sort();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">
        Assisted Living in California, by City
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        {total.toLocaleString()} licensed assisted living and residential care facilities
        across {cities.length.toLocaleString()} California cities — every listing backed by
        state licensing and inspection records. Prefer a map?{" "}
        <Link href="/search" className="text-blue-600 hover:underline">
          Search near an address
        </Link>
        .
      </p>

      <div className="mt-10 space-y-8">
        {letters.map((letter) => (
          <section key={letter}>
            <h2 className="text-sm font-semibold text-zinc-400">{letter}</h2>
            <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
              {groups.get(letter)!.map((c) => (
                <li key={c.city}>
                  <Link
                    href={`/assisted-living/${slugifyCity(c.city)}`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    {titleCase(c.city)}
                  </Link>{" "}
                  <span className="text-xs text-zinc-400">({c.facility_count})</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
