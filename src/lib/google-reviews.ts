/**
 * Live Google reviews for the facility detail page.
 *
 * Google's ToS forbids caching ratings/reviews, so these are fetched fresh
 * per render (no-store) from the stored place_id and shown with attribution —
 * never written to the DB. Only the place_id is persisted.
 *
 * The key is HTTP-referrer restricted, so we send the allowlisted Referer.
 * If anything fails (key not enabled for prod origin, no place, quota), we
 * return null and the section simply doesn't render.
 */

const DETAILS_URL = "https://places.googleapis.com/v1/places";
const REFERER = "http://localhost:3000";
const FIELD_MASK = "rating,userRatingCount,reviews";

export type GoogleReviews = {
  rating: number | null;
  count: number;
  items: { author: string; rating: number; when: string; text: string }[];
};

type PlaceDetails = {
  rating?: number;
  userRatingCount?: number;
  reviews?: {
    rating?: number;
    text?: { text?: string };
    relativePublishTimeDescription?: string;
    authorAttribution?: { displayName?: string };
  }[];
};

export async function getGoogleReviews(placeId: string): Promise<GoogleReviews | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`${DETAILS_URL}/${placeId}`, {
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": FIELD_MASK,
        Referer: REFERER,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`google-reviews: HTTP ${res.status} for ${placeId}: ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    const d = (await res.json()) as PlaceDetails;
    if (typeof d.rating !== "number") return null;
    return {
      rating: d.rating,
      count: d.userRatingCount ?? 0,
      items: (d.reviews ?? [])
        .filter((r) => r.text?.text)
        .map((r) => ({
          author: r.authorAttribution?.displayName ?? "Google user",
          rating: r.rating ?? 0,
          when: r.relativePublishTimeDescription ?? "",
          text: r.text!.text!,
        })),
    };
  } catch (e) {
    console.error(`google-reviews: fetch failed for ${placeId}: ${(e as Error).message}`);
    return null;
  }
}
