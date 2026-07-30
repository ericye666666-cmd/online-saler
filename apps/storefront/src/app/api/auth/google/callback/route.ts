import { NextRequest, NextResponse } from "next/server";
import {
  CUSTOMER_SESSION_COOKIE,
  GOOGLE_OAUTH_STATE_COOKIE,
  createSessionToken,
  customerCookieOptions,
  safeReturnTo,
  upsertGoogleCustomer
} from "../../../../../auth/customer-auth";

type OAuthState = { state: string; returnTo: string };
type TokenResponse = { access_token?: string; error?: string };

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const baseUrl = process.env.STOREFRONT_PUBLIC_URL?.trim();
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!baseUrl || !clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/login?error=configuration", request.url));
  }

  let saved: OAuthState | null = null;
  try {
    saved = JSON.parse(request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value ?? "null") as OAuthState | null;
  } catch {
    saved = null;
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!code || !state || !saved || state !== saved.state) {
    return NextResponse.redirect(new URL("/login?error=state", request.url));
  }

  try {
    const callbackUrl = new URL("/api/auth/google/callback", baseUrl).toString();
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: "authorization_code"
      }),
      cache: "no-store"
    });
    const token = (await tokenResponse.json()) as TokenResponse;
    if (!tokenResponse.ok || !token.access_token) throw new Error(token.error ?? "Google token exchange failed.");

    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { authorization: `Bearer ${token.access_token}` },
      cache: "no-store"
    });
    if (!profileResponse.ok) throw new Error("Google profile request failed.");
    const session = await upsertGoogleCustomer(await profileResponse.json());
    const response = NextResponse.redirect(new URL(safeReturnTo(saved.returnTo), baseUrl));
    response.cookies.set(CUSTOMER_SESSION_COOKIE, createSessionToken(session), customerCookieOptions);
    response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
    return response;
  } catch (error) {
    console.error("Google login failed", error);
    return NextResponse.redirect(new URL("/login?error=google", request.url));
  }
}
