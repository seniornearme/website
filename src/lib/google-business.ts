/**
 * Google Business Profile helpers (owner-authorized review access).
 *
 * Uses the refresh token stored by the OAuth callback to mint access tokens
 * and call the GBP APIs. NOTE: these endpoints return quota errors until
 * Google approves our GBP API access application — callers should treat
 * failures as "pending approval", not bugs.
 */

type GbpReview = {
  reviewer?: { displayName?: string };
  starRating?: string; // "FIVE" | "FOUR" | ...
  comment?: string;
  createTime?: string;
};

const STAR: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

export async function mintAccessToken(refreshToken: string): Promise<string | null> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return ((await res.json()) as { access_token?: string }).access_token ?? null;
  } catch {
    return null;
  }
}

/** List the GBP locations the connected Google account manages. */
export async function listLocations(accessToken: string) {
  const acctRes = await fetch(
    "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
    { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10000) },
  );
  if (!acctRes.ok) throw new Error(`accounts ${acctRes.status}`);
  const accounts = ((await acctRes.json()).accounts ?? []) as { name: string }[];

  const locations: { name: string; title: string; address: string }[] = [];
  for (const a of accounts) {
    const locRes = await fetch(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${a.name}/locations` +
        "?readMask=name,title,storefrontAddress&pageSize=100",
      { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10000) },
    );
    if (!locRes.ok) continue;
    for (const l of (await locRes.json()).locations ?? []) {
      locations.push({
        name: l.name,
        title: l.title ?? "",
        address: (l.storefrontAddress?.addressLines ?? []).join(", "),
      });
    }
  }
  return locations;
}

/** Fetch reviews for a GBP location (owner-authorized, storable). */
export async function fetchOwnerReviews(accessToken: string, accountLocation: string) {
  // Reviews still live on the v4 API surface.
  const res = await fetch(
    `https://mybusiness.googleapis.com/v4/${accountLocation}/reviews?pageSize=50`,
    { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15000) },
  );
  if (!res.ok) throw new Error(`reviews ${res.status}`);
  const data = (await res.json()) as {
    reviews?: GbpReview[];
    averageRating?: number;
    totalReviewCount?: number;
  };
  return {
    averageRating: data.averageRating ?? null,
    totalReviewCount: data.totalReviewCount ?? null,
    reviews: (data.reviews ?? []).map((r) => ({
      author: r.reviewer?.displayName ?? "Google user",
      rating: STAR[r.starRating ?? ""] ?? null,
      text: r.comment ?? "",
      created: r.createTime ?? null,
    })),
  };
}
