import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { findCityBySlug, slugifyCity } from "@/lib/cities";
import { titleCase, typeLabel } from "@/lib/format";

export const revalidate = 86400;

const PER_PAGE = 60;
const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://seniornearme.com";

type Row = {
  id: string;
  name: string;
  slug: string;
  street_address: string | null;
  capacity: number | null;
  facility_type: "rcfe" | "arf" | "other";
  cdss_num_complaints: number | null;
  facility_photos: { url: string; thumb_url: string | null; position: number }[] | null;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string }>;
}): Promise<Metadata> {
  const { city: slug } = await params;
  const stat = await findCityBySlug(slug);
  if (!stat) return { title: "City not found" };
  const cityName = titleCase(stat.city);
  const title = `Assisted Living in ${cityName}, CA — ${stat.facility_count} Licensed ${
    stat.facility_count === 1 ? "Facility" : "Facilities"
  }`;
  return {
    title,
    description: `Compare all ${stat.facility_count} licensed assisted living and residential care facilities in ${cityName}, California — photos, capacity, contact details, and state inspection records.`,
    alternates: { canonical: `/assisted-living/${slug}` },
    openGraph: { title, type: "website", url: `/assisted-living/${slug}` },
  };
}

export default async function CityPage({
  params,
  searchParams,
}: {
  params: Promise<{ city: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const [{ city: slug }, { page: pageParam }] = await Promise.all([params, searchParams]);
  const stat = await findCityBySlug(slug);
  if (!stat) notFound();

  const totalPages = Math.max(1, Math.ceil(stat.facility_count / PER_PAGE));
  const page = Math.min(Math.max(1, parseInt(pageParam ?? "1", 10) || 1), totalPages);
  const from = (page - 1) * PER_PAGE;

  const supabase = await createClient();
  const { data } = await supabase
    .from("facilities")
    .select(
      "id, name, slug, street_address, capacity, facility_type, cdss_num_complaints, facility_photos(url, thumb_url, position)",
    )
    .eq("status", "active")
    .eq("city", stat.city)
    .order("name")
    .range(from, from + PER_PAGE - 1);
  const rows = (data as Row[] | null) ?? [];
  const cityName = titleCase(stat.city);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Assisted Living", item: `${BASE}/assisted-living` },
      { "@type": "ListItem", position: 2, name: `${cityName}, CA` },
    ],
  };

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <nav className="text-sm text-zinc-500" aria-label="Breadcrumb">
        <Link href="/assisted-living" className="hover:underline">
          Assisted Living
        </Link>{" "}
        / <span className="text-zinc-700 dark:text-zinc-300">{cityName}, CA</span>
      </nav>

      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        Assisted Living in {cityName}, CA
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        {stat.facility_count.toLocaleString()} licensed{" "}
        {stat.facility_count === 1 ? "facility" : "facilities"} in {cityName}
        {stat.county ? `, ${titleCase(stat.county)} County` : ""} — from state licensing
        records, with inspection histories on every listing.{" "}
        <Link href={`/search?city=${slug}`} className="text-blue-600 hover:underline">
          View them on the map
        </Link>
        .
      </p>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((f) => {
          const photo = f.facility_photos
            ?.slice()
            .sort((a, b) => a.position - b.position)[0];
          return (
            <li key={f.id} className="min-w-0">
              <Link
                href={`/facilities/${f.slug}`}
                className="block overflow-hidden rounded-xl border border-zinc-200 transition-shadow hover:shadow-md dark:border-zinc-800"
              >
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo.thumb_url ?? photo.url}
                    alt={titleCase(f.name)}
                    loading="lazy"
                    className="h-36 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-36 items-center justify-center bg-gradient-to-br from-blue-500 to-blue-700 text-white/90">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                      <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
                <div className="p-3">
                  <div className="truncate font-medium">{titleCase(f.name)}</div>
                  <div className="mt-0.5 truncate text-sm text-zinc-500">
                    {typeLabel(f.facility_type)}
                    {f.capacity ? ` · ${f.capacity} beds` : ""}
                  </div>
                  {f.street_address && (
                    <div className="mt-0.5 truncate text-xs text-zinc-400">
                      {titleCase(f.street_address)}
                    </div>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {totalPages > 1 && (
        <nav className="mt-10 flex items-center justify-center gap-3 text-sm" aria-label="Pagination">
          {page > 1 ? (
            <Link
              href={`/assisted-living/${slug}${page - 1 > 1 ? `?page=${page - 1}` : ""}`}
              className="rounded-lg border border-zinc-300 px-4 py-2 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              ← Previous
            </Link>
          ) : (
            <span className="rounded-lg border border-zinc-200 px-4 py-2 text-zinc-300 dark:border-zinc-800 dark:text-zinc-700">
              ← Previous
            </span>
          )}
          <span className="text-zinc-500">
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={`/assisted-living/${slug}?page=${page + 1}`}
              className="rounded-lg border border-zinc-300 px-4 py-2 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Next →
            </Link>
          ) : (
            <span className="rounded-lg border border-zinc-200 px-4 py-2 text-zinc-300 dark:border-zinc-800 dark:text-zinc-700">
              Next →
            </span>
          )}
        </nav>
      )}
    </main>
  );
}
