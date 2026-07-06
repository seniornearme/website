import { notFound } from "next/navigation";
import { after } from "next/server";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { titleCase, fmtDate, typeLabel, normalizeWebsite } from "@/lib/format";
import { getGoogleReviews } from "@/lib/google-reviews";
import { slugifyCity } from "@/lib/cities";
import { scoreTier } from "@/lib/inspection";
import { reportUrl, summarizeFacilityReports } from "@/lib/report-summaries";
import { PhotoGallery } from "./photo-gallery";
import { InquiryForm } from "./inquiry-form";
import { SaveButton } from "./save-button";

async function supabaseGeo(facilityId: string) {
  const supabase = await createClient();
  return supabase
    .from("facilities_search")
    .select("lat,lng")
    .eq("id", facilityId)
    .single<{ lat: number; lng: number }>();
}

type Nearby = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  capacity: number | null;
  lat: number;
  lng: number;
  photo: string | null;
  miles: number;
};

// Active facilities within a small box around the point, nearest first.
async function getNearby(facilityId: string, lat: number, lng: number): Promise<Nearby[]> {
  const supabase = await createClient();
  const d = 0.05; // ~3.5 miles
  const { data } = await supabase
    .from("facilities_search")
    .select("id,name,slug,city,capacity,lat,lng,photo")
    .eq("status", "active")
    .neq("id", facilityId)
    .gte("lat", lat - d)
    .lte("lat", lat + d)
    .gte("lng", lng - d)
    .lte("lng", lng + d)
    .limit(60);
  const toRad = (x: number) => (x * Math.PI) / 180;
  return ((data as Omit<Nearby, "miles">[] | null) ?? [])
    .map((f) => {
      const h =
        Math.sin(toRad(f.lat - lat) / 2) ** 2 +
        Math.cos(toRad(lat)) * Math.cos(toRad(f.lat)) * Math.sin(toRad(f.lng - lng) / 2) ** 2;
      return { ...f, miles: 2 * 3958.8 * Math.asin(Math.sqrt(h)) };
    })
    .sort((a, b) => a.miles - b.miles)
    .slice(0, 6);
}

type Photo = { url: string; thumb_url: string | null; label: string | null };

type Facility = {
  id: string;
  name: string;
  slug: string;
  facility_type: "rcfe" | "arf" | "other";
  status: string;
  street_address: string | null;
  city: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  capacity: number | null;
  administrator: string | null;
  licensee: string | null;
  license_number: string | null;
  license_issue_date: string | null;
  description: string | null;
  amenities: string[] | null;
  google_place_id: string | null;
  cdss_last_visit_date: string | null;
  cdss_num_visits: number | null;
  cdss_num_complaints: number | null;
  cdss_citations_type_a: number | null;
  cdss_citations_type_b: number | null;
  cdss_substantiated_allegations: number | null;
  cdss_synced_at: string | null;
  inspection_score: number | null;
};

const SELECT =
  "id,name,slug,facility_type,status,street_address,city,zip,phone,email,website,capacity,administrator,licensee,license_number,license_issue_date,description,amenities,google_place_id,cdss_last_visit_date,cdss_num_visits,cdss_num_complaints,cdss_citations_type_a,cdss_citations_type_b,cdss_substantiated_allegations,cdss_synced_at,inspection_score";

async function getFacility(slug: string): Promise<Facility | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("facilities").select(SELECT).eq("slug", slug).single();
  return (data as Facility | null) ?? null;
}

type Report = {
  id: string;
  report_index: number;
  report_date: string | null;
  report_title: string | null;
  report_type: string | null;
  visit_type: string | null;
  summary: string | null;
  summarized_at: string | null;
};

async function getReports(facilityId: string): Promise<Report[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("facility_reports")
    .select("id, report_index, report_date, report_title, report_type, visit_type, summary, summarized_at")
    .eq("facility_id", facilityId)
    .order("report_date", { ascending: false, nullsFirst: false })
    .limit(10);
  return (data as Report[] | null) ?? [];
}

// RLS returns only `visible` rows for anonymous readers; owners see all of
// theirs (curation UI comes with the claim flow).
async function getPhotos(facilityId: string): Promise<Photo[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("facility_photos")
    .select("url,thumb_url,label")
    .eq("facility_id", facilityId)
    .order("position");
  return (data as Photo[] | null) ?? [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const f = await getFacility(slug);
  if (!f) return { title: "Facility not found · SeniorNearMe" };
  const where = [f.city ? titleCase(f.city) : null, "CA"].filter(Boolean).join(", ");
  const title = `${titleCase(f.name)} — Assisted Living in ${where}`;
  const description =
    f.description?.slice(0, 155) ||
    `${titleCase(f.name)} is a licensed ${typeLabel(f.facility_type)} in ${where}. See photos, amenities, contact info, and state inspection history.`;
  const photos = await getPhotos(f.id);
  return {
    title,
    description,
    alternates: { canonical: `/facilities/${f.slug}` },
    openGraph: {
      title,
      description,
      type: "website",
      url: `/facilities/${f.slug}`,
      images: photos[0] ? [{ url: photos[0].url }] : undefined,
    },
  };
}

function amenityLabel(a: string): string {
  const map: Record<string, string> = {
    "24/7": "24/7 care",
    "24-hour": "24-hour care",
    rn: "RN on staff",
    lvn: "LVN on staff",
  };
  return map[a] ?? a.replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function FacilityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const f = await getFacility(slug);
  if (!f || f.facility_type === "arf") notFound(); // ARFs are out of scope

  const photos = await getPhotos(f.id);
  const amenities = f.amenities ?? [];
  const cityLine = [f.city ? titleCase(f.city) : null, "CA", f.zip].filter(Boolean).join(" ");
  const address = [f.street_address ? titleCase(f.street_address) : null, cityLine]
    .filter(Boolean)
    .join(", ");
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
  const telHref = f.phone ? `tel:${f.phone.replace(/[^0-9+]/g, "")}` : null;

  const reviews = f.google_place_id ? await getGoogleReviews(f.google_place_id) : null;
  const citations = (f.cdss_citations_type_a ?? 0) + (f.cdss_citations_type_b ?? 0);

  // saved state for the signed-in user (anon -> just a sign-in prompt on click)
  const supabaseUser = await createClient();
  const { data: { user } } = await supabaseUser.auth.getUser();
  let initialSaved = false;
  if (user) {
    const { data: savedRow } = await supabaseUser
      .from("saved_facilities")
      .select("facility_id")
      .eq("consumer_id", user.id)
      .eq("facility_id", f.id)
      .maybeSingle();
    initialSaved = !!savedRow;
  }

  // geo for structured data (PostGIS point exposed by the search view)
  const { data: geo } = await supabaseGeo(f.id);
  const nearby = geo ? await getNearby(f.id, geo.lat, geo.lng) : [];
  const reports = f.cdss_synced_at ? await getReports(f.id) : [];

  // Report summaries fill lazily: parse + store after this response is sent,
  // so the next visitor sees them without anyone waiting on CCLD fetches.
  const pendingSummaries = reports.filter((r) => !r.summarized_at);
  if (pendingSummaries.length && f.license_number) {
    const license = f.license_number;
    after(() =>
      summarizeFacilityReports(
        license,
        pendingSummaries.map((r) => ({ id: r.id, report_index: r.report_index })),
      ),
    );
  }

  const licensedYears = f.license_issue_date
    ? Math.floor(
        (Date.now() - new Date(f.license_issue_date).getTime()) / (365.25 * 24 * 3600 * 1000),
      )
    : null;
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://seniornearme.com";
  const citySlug = f.city ? slugifyCity(f.city) : null;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "LocalBusiness",
        "@id": `${base}/facilities/${f.slug}`,
        name: titleCase(f.name),
        url: `${base}/facilities/${f.slug}`,
        ...(f.description ? { description: f.description } : {}),
        ...(f.phone ? { telephone: f.phone } : {}),
        ...(f.website ? { sameAs: normalizeWebsite(f.website) } : {}),
        ...(photos.length ? { image: photos.map((p) => p.url) } : {}),
        ...(f.license_number
          ? { identifier: { "@type": "PropertyValue", name: "CA CDSS License", value: f.license_number } }
          : {}),
        address: {
          "@type": "PostalAddress",
          ...(f.street_address ? { streetAddress: titleCase(f.street_address) } : {}),
          ...(f.city ? { addressLocality: titleCase(f.city) } : {}),
          addressRegion: "CA",
          ...(f.zip ? { postalCode: f.zip } : {}),
          addressCountry: "US",
        },
        ...(geo ? { geo: { "@type": "GeoCoordinates", latitude: geo.lat, longitude: geo.lng } } : {}),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Assisted Living", item: `${base}/assisted-living` },
          ...(f.city && citySlug
            ? [{ "@type": "ListItem", position: 2, name: `${titleCase(f.city)}, CA`, item: `${base}/assisted-living/${citySlug}` }]
            : []),
          { "@type": "ListItem", position: f.city ? 3 : 2, name: titleCase(f.name) },
        ],
      },
    ],
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-16 pt-4">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <nav className="flex items-center justify-between gap-3 text-sm" aria-label="Breadcrumb">
        <ol className="flex min-w-0 items-center gap-1 text-zinc-500">
          <li className="shrink-0">
            <Link href="/assisted-living" className="hover:underline">
              Assisted Living
            </Link>
          </li>
          {f.city && citySlug && (
            <>
              <li aria-hidden="true">/</li>
              <li className="shrink-0">
                <Link href={`/assisted-living/${citySlug}`} className="hover:underline">
                  {titleCase(f.city)}, CA
                </Link>
              </li>
            </>
          )}
          <li aria-hidden="true">/</li>
          <li className="truncate text-zinc-700 dark:text-zinc-300">{titleCase(f.name)}</li>
        </ol>
        <Link
          href="/search"
          aria-label="View on map"
          className="inline-flex shrink-0 items-center gap-1 text-blue-600 hover:underline"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11Z" strokeLinejoin="round" />
          </svg>
          <span className="hidden sm:inline">View on map</span>
        </Link>
      </nav>

      {/* Gallery */}
      <div className="mt-3">
        {photos.length ? (
          <PhotoGallery photos={photos} name={titleCase(f.name)} />
        ) : (
          <div className="flex h-56 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-white/90">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
      </div>

      {/* Header */}
      <div className="mt-5">
        <h1 className="text-2xl font-semibold leading-tight sm:text-3xl">{titleCase(f.name)}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {typeLabel(f.facility_type)}
          {f.capacity ? ` · ${f.capacity} beds` : ""}
          {f.city ? ` · ${titleCase(f.city)}, CA` : ""}
        </p>
        {f.status !== "active" && (
          <span className="mt-2 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            {f.status}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        {telHref && (
          <a href={telHref} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Call {f.phone}
          </a>
        )}
        {f.website && (
          <a
            href={normalizeWebsite(f.website)}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Visit website
          </a>
        )}
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Directions
        </a>
        <SaveButton
          facilityId={f.id}
          slug={f.slug}
          userId={user?.id ?? null}
          initialSaved={initialSaved}
        />
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-3">
        <div className="space-y-6 md:col-span-2">
          {/* About */}
          {f.description && (
            <section>
              <h2 className="mb-2 text-lg font-semibold">About</h2>
              <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{f.description}</p>
            </section>
          )}

          {/* Amenities */}
          {amenities.length > 0 && (
            <section>
              <h2 className="mb-2 text-lg font-semibold">Care &amp; amenities</h2>
              <div className="flex flex-wrap gap-2">
                {amenities.map((a) => (
                  <span
                    key={a}
                    className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                  >
                    {amenityLabel(a)}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-zinc-400">
                Amenities detected from the facility&apos;s website — verify directly with the facility.
              </p>
            </section>
          )}

          {/* Google reviews */}
          {reviews && reviews.count > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Reviews</h2>
                <span className="text-[11px] uppercase tracking-wide text-zinc-400">from Google</span>
              </div>
              <div className="mb-3 flex items-center gap-2">
                <span className="text-2xl font-semibold">{reviews.rating?.toFixed(1)}</span>
                <Stars rating={reviews.rating ?? 0} />
                <span className="text-sm text-zinc-500">({reviews.count})</span>
              </div>
              <div className="space-y-3">
                {reviews.items.slice(0, 4).map((r, i) => (
                  <div key={i} className="rounded-lg border border-zinc-100 p-3 dark:border-zinc-800">
                    <div className="mb-1 flex items-center gap-2 text-sm">
                      <span className="font-medium">{r.author}</span>
                      <Stars rating={r.rating} small />
                      <span className="text-xs text-zinc-400">{r.when}</span>
                    </div>
                    <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{r.text}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-zinc-400">Ratings and reviews provided by Google.</p>
            </section>
          )}

          {/* State inspection record (official CDSS data) */}
          {f.cdss_synced_at && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-lg font-semibold">State inspection record</h2>
                <span className="text-[11px] uppercase tracking-wide text-zinc-400">CA CDSS</span>
              </div>

              {f.inspection_score != null && (
                <div className="mb-4 flex items-center gap-3">
                  <span className="text-3xl font-semibold">{f.inspection_score}</span>
                  <div className="min-w-0">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${scoreTier(f.inspection_score).chip}`}
                    >
                      {scoreTier(f.inspection_score).label}
                    </span>
                    <Link
                      href="/about-our-data#inspection-score"
                      className="block text-[11px] text-zinc-400 hover:underline"
                    >
                      Inspection record score · how it&apos;s calculated
                    </Link>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-zinc-100 p-4 text-sm sm:grid-cols-4 dark:border-zinc-800">
                <Stat label="Last visit" value={fmtDate(f.cdss_last_visit_date) ?? "—"} />
                <Stat label="Total visits" value={f.cdss_num_visits ?? 0} />
                <Stat label="Complaints" value={f.cdss_num_complaints ?? 0} />
                <Stat
                  label="Substantiated"
                  value={f.cdss_substantiated_allegations ?? 0}
                  warn={(f.cdss_substantiated_allegations ?? 0) > 0}
                />
              </div>
              {citations > 0 && (
                <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  <span className="font-medium">{f.cdss_citations_type_a ?? 0} Type A</span> ·{" "}
                  {f.cdss_citations_type_b ?? 0} Type B citations. Type A = a violation posing
                  immediate risk to health, safety, or personal rights.
                </div>
              )}

              {reports.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-sm font-semibold">Visit history</h3>
                  <ul className="mt-2 space-y-3">
                    {reports.map((r) => (
                      <li
                        key={r.id}
                        className="rounded-xl border border-zinc-100 p-3 dark:border-zinc-800"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <a
                            href={
                              f.license_number
                                ? reportUrl(f.license_number, r.report_index)
                                : "#"
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-blue-600 hover:underline"
                          >
                            {titleCase(r.report_title || r.report_type || "Visit report")} →
                          </a>
                          <span className="text-xs text-zinc-400">
                            {fmtDate(r.report_date) ?? "—"}
                          </span>
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
                  <p className="mt-2 text-[11px] text-zinc-400">
                    Each link opens the full official report. Summaries are excerpts from the
                    state inspector&apos;s narrative.
                  </p>
                </div>
              )}

              {f.license_number && (
                <a
                  href={`https://www.ccld.dss.ca.gov/carefacilitysearch/FacDetail/${f.license_number}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block text-xs font-medium text-blue-600 hover:underline"
                >
                  View the complete state record at CDSS →
                </a>
              )}
              <p className="mt-1 text-[11px] leading-snug text-zinc-400">
                Inspection and complaint history from the California Dept. of Social Services,
                Community Care Licensing.
              </p>
            </section>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-6">
          <InquiryForm facilityId={f.id} facilityName={titleCase(f.name)} />
          <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <h2 className="mb-3 text-sm font-semibold">Facility details</h2>
            <dl className="space-y-2 text-sm">
              <Row label="Address">{address || "—"}</Row>
              {f.phone && (
                <Row label="Phone">
                  <a href={telHref!} className="text-blue-600 hover:underline">
                    {f.phone}
                  </a>
                </Row>
              )}
              {f.license_number && <Row label="License #">{f.license_number}</Row>}
              {f.license_issue_date && (
                <Row label="Licensed since">
                  {fmtDate(f.license_issue_date)}
                  {licensedYears != null && licensedYears >= 1
                    ? ` (${licensedYears} ${licensedYears === 1 ? "year" : "years"})`
                    : ""}
                </Row>
              )}
              {f.administrator && <Row label="Administrator">{titleCase(f.administrator)}</Row>}
              {f.licensee && <Row label="Licensee">{titleCase(f.licensee)}</Row>}
            </dl>
          </section>

          <Link
            href={`/claim?facility=${f.slug}`}
            className="block w-full rounded-lg border border-zinc-300 py-2 text-center text-sm font-medium transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Own this facility? Claim this listing
          </Link>
        </aside>
      </div>

      {/* Nearby facilities */}
      {nearby.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-3 text-lg font-semibold">
            Nearby facilities
            {f.city ? ` in and around ${titleCase(f.city)}` : ""}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {nearby.map((n) => (
              <li key={n.id} className="min-w-0">
                <Link
                  href={`/facilities/${n.slug}`}
                  className="block overflow-hidden rounded-xl border border-zinc-200 transition-shadow hover:shadow-md dark:border-zinc-800"
                >
                  {n.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={n.photo} alt={titleCase(n.name)} loading="lazy" className="h-28 w-full object-cover" />
                  ) : (
                    <div className="flex h-28 w-full items-center justify-center bg-gradient-to-br from-blue-500 to-blue-700 text-white/90">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                        <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  )}
                  <div className="p-3">
                    <div className="truncate text-sm font-medium">{titleCase(n.name)}</div>
                    <div className="mt-0.5 truncate text-xs text-zinc-500">
                      {n.miles < 0.1 ? "Same block" : `${n.miles.toFixed(1)} mi away`}
                      {n.capacity ? ` · ${n.capacity} beds` : ""}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-zinc-500">{label}</dt>
      <dd className="min-w-0 break-words text-right">{children}</dd>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: React.ReactNode; warn?: boolean }) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`font-medium ${warn ? "text-amber-600 dark:text-amber-400" : ""}`}>{value}</div>
    </div>
  );
}

function Stars({ rating, small }: { rating: number; small?: boolean }) {
  const size = small ? 12 : 16;
  return (
    <span className="inline-flex" aria-label={`${rating} out of 5`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
            fill={i < Math.round(rating) ? "#f59e0b" : "#e4e4e7"}
          />
        </svg>
      ))}
    </span>
  );
}
