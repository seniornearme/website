// Completes the Google Business Profile OAuth flow: verifies state/nonce,
// exchanges the code for tokens, and stores the connection for the facility.
// RLS enforces that only the facility's owner (the signed-in session) can
// insert the row.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const [facilityId, nonce] = state.split(".");
  const cookieNonce = request.cookies.get("gb_oauth_nonce")?.value;

  const back = (slug: string | null, status: string) =>
    NextResponse.redirect(
      new URL(`/account/facilities/${facilityId}?google=${status}`, url.origin),
    );

  if (!code || !facilityId || !nonce || nonce !== cookieNonce) {
    return NextResponse.redirect(new URL("/account?google=error", url.origin));
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return back(null, "not-configured");
  }

  // Exchange the authorization code for tokens.
  let tokens: { refresh_token?: string; access_token?: string; id_token?: string };
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${url.origin}/api/google-business/callback`,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.error("gbp token exchange failed:", res.status, (await res.text()).slice(0, 200));
      return back(null, "error");
    }
    tokens = await res.json();
  } catch (e) {
    console.error("gbp token exchange:", (e as Error).message);
    return back(null, "error");
  }
  if (!tokens.refresh_token) return back(null, "error");

  // Best-effort email for display (from the OIDC id_token payload).
  let email: string | null = null;
  try {
    const payload = tokens.id_token?.split(".")[1];
    if (payload) email = JSON.parse(Buffer.from(payload, "base64").toString()).email ?? null;
  } catch { /* optional */ }

  const supabase = await createClient();
  const { error } = await supabase.from("google_business_connections").upsert(
    {
      facility_id: facilityId,
      owner_id: (await supabase.auth.getUser()).data.user?.id,
      refresh_token: tokens.refresh_token,
      google_email: email,
      status: "pending_api_approval",
    },
    { onConflict: "facility_id" },
  );
  if (error) {
    console.error("gbp connection insert:", error.message);
    return back(null, "error");
  }

  const res = back(null, "connected");
  res.cookies.delete("gb_oauth_nonce");
  return res;
}
