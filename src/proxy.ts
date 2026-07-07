import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Scraper deterrence that never touches the crawlers we want, then Supabase
 * session refresh for everyone who passes.
 *
 * Being indexed and quoted is the growth strategy, so verified search and AI
 * crawlers pass unconditionally. Automation tooling (curl, python, headless
 * frameworks, SEO bots) is refused on pages, and the bulk-data endpoints
 * additionally require the fetch-metadata headers real browsers send.
 * Determined actors can spoof a UA — for active attacks, flip on Vercel's
 * Firewall bot challenge, which layers in front of this.
 */

const ALLOWED_BOTS =
  /googlebot|google-inspectiontool|bingbot|slurp|duckduckbot|baiduspider|yandex(bot)?|applebot|facebookexternalhit|twitterbot|linkedinbot|pinterestbot|gptbot|oai-searchbot|chatgpt-user|claudebot|claude-web|anthropic-ai|perplexitybot|youbot|ccbot|bravebot|petalbot|amazonbot|bytespider/i;

const AUTOMATION_UA =
  /curl|wget|python|scrapy|httpx|aiohttp|go-http-client|okhttp|libwww|java\/|node-fetch|axios|undici|got \(|headlesschrome|phantomjs|puppeteer|playwright|selenium|dotbot|mj12bot|ahrefsbot|semrushbot|zoominfobot/i;

export async function proxy(request: NextRequest) {
  const ua = request.headers.get("user-agent") ?? "";

  if (!ALLOWED_BOTS.test(ua)) {
    if (!ua.trim() || AUTOMATION_UA.test(ua)) {
      return new NextResponse(
        "Automated access is not permitted. Search and AI crawlers are welcome — see /robots.txt.",
        { status: 403 },
      );
    }
    // bulk-data endpoints: real browsers announce themselves with fetch
    // metadata; tooling with a spoofed browser UA generally doesn't
    if (
      request.nextUrl.pathname.startsWith("/api/facilities") &&
      !request.headers.get("sec-fetch-site")
    ) {
      return new NextResponse("Not available. See /robots.txt.", { status: 403 });
    }
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots\\.txt|sitemap|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
