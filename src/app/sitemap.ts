// Single sitemap: ~26K active facility pages + ~1.5K city pages + statics.
// Comfortably under the 50K-URL/50MB sitemap limit; regenerated daily.
// Split into chunks via generateSitemaps only if we ever pass ~45K URLs.
import type { MetadataRoute } from "next";
import { fetchAllFacilitySlugs, fetchCityStats, slugifyCity } from "@/lib/cities";

export const revalidate = 86400;

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://seniornearme.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [facilities, cities] = await Promise.all([
    fetchAllFacilitySlugs(),
    fetchCityStats(),
  ]);

  const statics: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/search`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/assisted-living`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/claim`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/compliance-forms`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/about-our-data`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE}/privacy`, changeFrequency: "yearly", priority: 0.1 },
    { url: `${BASE}/terms`, changeFrequency: "yearly", priority: 0.1 },
  ];

  const inspectionUrls: MetadataRoute.Sitemap = cities.map((c) => ({
    url: `${BASE}/inspection-records/${slugifyCity(c.city)}`,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  const cityUrls: MetadataRoute.Sitemap = cities.map((c) => ({
    url: `${BASE}/assisted-living/${slugifyCity(c.city)}`,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const facilityUrls: MetadataRoute.Sitemap = facilities.map((f) => ({
    url: `${BASE}/facilities/${f.slug}`,
    lastModified: f.updated_at ? new Date(f.updated_at) : undefined,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...statics, ...cityUrls, ...inspectionUrls, ...facilityUrls];
}
