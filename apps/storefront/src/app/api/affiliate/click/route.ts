import { NextResponse } from "next/server";
import { currentCustomerSession } from "../../../../auth/customer-auth";
import {
  AFFILIATE_ATTRIBUTION_COOKIE,
  encodeAffiliateCookie,
  recordAffiliateClick
} from "../../../../affiliate/affiliate-service";

const ATTRIBUTION_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

type TrackBody = {
  affiliateCode?: string;
  sellerRef?: string;
  productCode?: string;
  source?: string;
  campaign?: string;
  landingPath?: string;
  sessionId?: string;
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as TrackBody;
    const session = await currentCustomerSession();
    const result = await recordAffiliateClick({
      affiliateCode: body.affiliateCode ?? body.sellerRef,
      productCode: body.productCode,
      customerId: session?.customerId ?? null,
      sessionId: body.sessionId,
      source: body.source,
      campaign: body.campaign,
      landingPath: body.landingPath,
      referrer: request.headers.get("referer"),
      userAgent: request.headers.get("user-agent"),
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip")
    });

    if (!result) return NextResponse.json({ ok: true, tracked: false }, { headers: { "cache-control": "no-store" } });

    const response = NextResponse.json({ ok: true, tracked: true, clickId: result.clickId, expiresAt: result.expiresAt }, {
      headers: { "cache-control": "no-store" }
    });
    response.cookies.set(AFFILIATE_ATTRIBUTION_COOKIE, encodeAffiliateCookie(result), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ATTRIBUTION_COOKIE_MAX_AGE_SECONDS
    });
    return response;
  } catch (error) {
    console.error("affiliate_click_failed", error);
    return NextResponse.json({ ok: true, tracked: false }, { headers: { "cache-control": "no-store" } });
  }
}
