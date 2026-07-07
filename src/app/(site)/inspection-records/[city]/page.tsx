import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { findCityBySlug } from "@/lib/cities";
import { titleCase, fmtDate } from "@/lib/format";
import { scoreTier } from "@/lib/inspection";

export const revalidate = 86400;

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://seniornearme.com";

type Row = {
  id: string;
  name: string;
  slug: string;
  capacity: number | null;
  inspection_score: number | null;
  cdss_last_visit_date: string | null;
  cdss_num_visits: number | null;
  cdss_num_complaints: number | null;
  cdss_citations_type_a: number | null;
  cdss_citations_type_b: number | null;
  cdss_substantiated_allegations: number | null;
};

type RecentReport = {
  report_date: string | null;
  visit_type: string | null;
  summary: string | null;
  facilities: { name: string; slug: string } | null;
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
  const title = `Assisted Living Inspection Records in ${cityName}, CA`;
  return {
    title,
    description: `State inspection records, citations, and complaint outcomes for every licensed assisted living facility in ${cityName}, California — from official CDSS data, refreshed weekly.`,
    alternates: { canonical: `/inspection-records/${slug}` },
    openGraph: { title, type: "website", url: `/inspection-records/${slug}` },
  };
}

export default async function CityInspectionsPage({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const { city: slug } = await params;
  const stat = await findCityBySlug(slug);
  if (!stat) notFound();
  const cityName = titleCase(stat.city);

  const supabase = await createClient();
  const { data } = await supabase
    .from("facilities")
    .select(
      "id, name, slug, capacity, inspection_score, cdss_last_visit_date, cdss_num_visits, cdss_num_complaints, cdss_citations_type_a, cdss_citations_type_b, cdss_substantiated_allegations",
    )
    .eq("status", "active")
    .neq("facility_type", "arf")
    .eq("city", stat.city)
    .order("inspection_score", { ascending: false, nullsFirst: false })
    .limit(1000);
  const rows = (data as Row[] | null) ?? [];
  if (!rows.length) notFound();

  const { data: recent } = await supabase
    .from("facility_reports")
    .select("report_date, visit_type, summary, facilities!inner(name, slug, city, facility_type, status)")
    .eq("facilities.city", stat.city)
    .eq("facilities.status", "active")
    .neq("facilities.facility_type", "arf")
    .not("summary", "is", null)
    .order("report_date", { ascending: false })
    .limit(8);
  const recentReports = (recent as unknown as RecentReport[] | null) ?? [];

  const scored = rows.filter((r) => r.inspection_score != null);
  const avgScore = scored.length
    ? Math.round(scored.reduce((s, r) => s + (r.inspection_score ?? 0), 0) / scored.length)
    : null;
  const totals = rows.reduce(
    (acc, r) => ({
      typeA: acc.typeA + (r.cdss_citations_type_a ?? 0),
      typeB: acc.typeB + (r.cdss_citations_type_b ?? 0),
      substantiated: acc.substantiated + (r.cdss_substantiated_allegations ?? 0),
    }),
    { typeA: 0, typeB: 0, substantiated: 0 },
  );

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Assisted Living", item: `${BASE}/assisted-living` },
      { "@type": "ListItem", position: 2, name: `${cityName}, CA`, item: `${BASE}/assisted-living/${slug}` },
      { "@type": "ListItem", position: 3, name: "Inspection records" },
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
        /{" "}
        <Link href={`/assisted-living/${slug}`} className="hover:underline">
          {cityName}, CA
        </Link>{" "}
        / <span className="text-zinc-700 dark:text-zinc-300">Inspection records</span>
      </nav>

      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        Assisted Living Inspection Records in {cityName}, CA
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        Official state inspection and complaint outcomes for all{" "}
        {rows.length.toLocaleString()} licensed assisted living{" "}
        {rows.length === 1 ? "facility" : "facilities"} in {cityName} — from the
        California Department of Social Services, refreshed weekly.{" "}
        <Link href="/about-our-data#inspection-score" className="text-blue-600 hover:underline">
          How the score works
        </Link>
        .
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Facilities" value={rows.length} />
        <Stat label="Average score" value={avgScore ?? "—"} />
        <Stat label="Type A citations" value={totals.typeA} warn={totals.typeA > 0} />
        <Stat label="Substantiated" value={totals.substantiated} warn={totals.substantiated > 0} />
      </div>

      <div className="mt-8 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800">
              <th className="px-4 py-2.5 font-semibold">Facility</th>
              <th className="px-3 py-2.5 font-semibold">Score</th>
              <th className="px-3 py-2.5 font-semibold">Visits</th>
              <th className="px-3 py-2.5 font-semibold">Complaints</th>
              <th className="px-3 py-2.5 font-semibold">Type A</th>
              <th className="px-3 py-2.5 font-semibold">Type B</th>
              <th className="px-3 py-2.5 font-semibold">Substantiated</th>
              <th className="px-3 py-2.5 font-semibold">Last visit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr
                key={f.id}
                className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
              >
                <td className="px-4 py-2.5">
                  <Link
                    href={`/facilities/${f.slug}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {titleCase(f.name)}
                  </Link>
                </td>
                <td className="px-3 py-2.5">
                  {f.inspection_score != null ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${scoreTier(f.inspection_score).chip}`}
                    >
                      {f.inspection_score}
                    </span>
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5">{f.cdss_num_visits ?? "—"}</td>
                <td className="px-3 py-2.5">{f.cdss_num_complaints ?? "—"}</td>
                <td className={`px-3 py-2.5 ${f.cdss_citations_type_a ? "font-semibold text-red-600" : ""}`}>
                  {f.cdss_citations_type_a ?? "—"}
                </td>
                <td className="px-3 py-2.5">{f.cdss_citations_type_b ?? "—"}</td>
                <td className={`px-3 py-2.5 ${f.cdss_substantiated_allegations ? "font-semibold text-amber-600" : ""}`}>
                  {f.cdss_substantiated_allegations ?? "—"}
                </td>
                <td className="px-3 py-2.5 text-zinc-500">
                  {fmtDate(f.cdss_last_visit_date) ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {recentReports.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Recent state visits in {cityName}</h2>
          <ul className="mt-3 space-y-3">
            {recentReports.map((r, i) => (
              <li key={i} className="rounded-xl border border-zinc-100 p-3 dark:border-zinc-800">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <Link
                    href={`/facilities/${r.facilities?.slug}`}
                    className="text-sm font-medium text-blue-600 hover:underline"
                  >
                    {titleCase(r.facilities?.name ?? "")}
                  </Link>
                  <span className="text-xs text-zinc-400">{fmtDate(r.report_date) ?? ""}</span>
                </div>
                {r.visit_type && (
                  <span className="mt-1 inline-block rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {r.visit_type}
                  </span>
                )}
                {r.summary && (
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                    {r.summary}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-10 rounded-xl border border-zinc-200 p-5 text-sm dark:border-zinc-800">
        <span className="font-semibold">Operate a facility in {cityName}?</span>{" "}
        <span className="text-zinc-600 dark:text-zinc-400">
          Claim your listing free to manage your profile and track your CDSS paperwork with
          our{" "}
          <Link href="/compliance-forms" className="text-blue-600 hover:underline">
            compliance forms library
          </Link>{" "}
          and reminder system.
        </span>
      </div>

      <p className="mt-6 text-[11px] leading-snug text-zinc-400">
        Data from the California Department of Social Services, Community Care Licensing
        Division. Scores reflect regulatory records, not care quality — read the underlying
        reports on each facility&apos;s page and visit in person.
      </p>
    </main>
  );
}

function Stat({ label, value, warn }: { label: string; value: number | string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <div className={`text-2xl font-semibold ${warn ? "text-amber-600" : ""}`}>{value}</div>
      <div className="mt-0.5 text-xs text-zinc-500">{label}</div>
    </div>
  );
}
