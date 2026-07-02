import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://seniornearme.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/auth/", "/account", "/sign-in", "/demo-embed"],
    },
    sitemap: `${BASE}/sitemap.xml`,
  };
}
