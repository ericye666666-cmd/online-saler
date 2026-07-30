import { NextRequest, NextResponse } from "next/server";
import { GOOGLE_OAUTH_STATE_COOKIE, newOAuthState, safeReturnTo } from "../../../../auth/customer-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const baseUrl = process.env.STOREFRONT_PUBLIC_URL?.trim();
  if (!clientId || !baseUrl) {
    return NextResponse.json({ error: "Google login is not configured." }, { status: 503 });
  }

  const state = newOAuthState();
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  const callbackUrl = new URL("/api/auth/google/callback", baseUrl).toString();
  const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorization.searchParams.set("client_id", clientId);
  authorization.searchParams.set("redirect_uri", callbackUrl);
  authorization.searchParams.set("response_type", "code");
  authorization.searchParams.set("scope", "openid email profile");
  authorization.searchParams.set("state", state);
  authorization.searchParams.set("prompt", "select_account");

  const response = NextResponse.redirect(authorization);
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, JSON.stringify({ state, returnTo }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600
  });
  return response;
}
