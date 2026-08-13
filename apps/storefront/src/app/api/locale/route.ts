import { NextRequest, NextResponse } from "next/server";
import { normalizeStorefrontLocale, STOREFRONT_LOCALE_COOKIE } from "../../../i18n/dictionary";

export function GET(request: NextRequest) {
  const locale = normalizeStorefrontLocale(request.nextUrl.searchParams.get("locale"));
  const referer = request.headers.get("referer");
  const refererUrl = referer ? new URL(referer) : null;
  const returnTo = request.nextUrl.searchParams.get("returnTo")
    ?? (refererUrl ? `${refererUrl.pathname}${refererUrl.search}` : "/");
  const safeReturnTo = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: safeReturnTo },
  });
  response.cookies.set(STOREFRONT_LOCALE_COOKIE, locale, {
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
  });
  return response;
}
