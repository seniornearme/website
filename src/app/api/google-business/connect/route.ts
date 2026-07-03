// Starts the Google Business Profile OAuth flow for a facility the signed-in
// user owns. Redirects to Google's consent screen; the callback route stores
// the tokens. CSRF-protected via a nonce cookie bound into `state`.
import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

const SCOPES = "openid email https://www.googleapis.com/auth/business.manage";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const facilityId = url.searchParams.get("facility");
  if (!facilityId) {
    return NextResponse.json({ error: "missing facility" }, { status: 400 });
  }
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(
      new URL(`/account/facilities/${facilityId}?google=not-configured`, url.origin),
    );
  }

  // Only the facility's owner may start a connection.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL(`/sign-in?redirect=/account`, url.origin));
  }
  const { data: facility } = await supabase
    .from("facilities")
    .select("id, owner_id")
    .eq("id", facilityId)
    .single();
  if (!facility || facility.owner_id !== user.id) {
    return NextResponse.json({ error: "not the owner of this facility" }, { status: 403 });
  }

  const nonce = randomBytes(16).toString("hex");
  const state = `${facilityId}.${nonce}`;
  const redirectUri = `${url.origin}/api/google-business/callback`;

  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.searchParams.set("client_id", clientId);
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", SCOPES);
  auth.searchParams.set("access_type", "offline");
  auth.searchParams.set("prompt", "consent");
  auth.searchParams.set("state", state);

  const res = NextResponse.redirect(auth);
  res.cookies.set("gb_oauth_nonce", nonce, {
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/google-business",
  });
  return res;
}
