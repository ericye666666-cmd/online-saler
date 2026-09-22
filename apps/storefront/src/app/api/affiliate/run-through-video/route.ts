import { NextResponse } from "next/server";
import { affiliateApiError, noStoreHeaders } from "../../../../affiliate/affiliate-api";
import { requireActiveAffiliate } from "../../../../affiliate/affiliate-platform-service";
import { planRunThroughVideo, runThroughCategories } from "../../../../affiliate/run-through-service";
import { currentCustomerSession } from "../../../../auth/customer-auth";

export const runtime = "nodejs";

/** The categories an affiliate can make a run-through video of. */
export async function GET() {
  try {
    await requireActiveAffiliate(await currentCustomerSession());
    return NextResponse.json({ categories: await runThroughCategories() }, { headers: noStoreHeaders });
  } catch (error) {
    return affiliateApiError(error, "affiliate_run_through_categories_failed");
  }
}

/** Picks the pieces for a new video. The video itself is rendered by POST /[id]. */
export async function POST(request: Request) {
  try {
    const affiliate = await requireActiveAffiliate(await currentCustomerSession());
    const body = await request.json().catch(() => ({})) as { category?: string };
    return NextResponse.json({ plan: await planRunThroughVideo(affiliate, body.category?.trim() || undefined) }, { headers: noStoreHeaders });
  } catch (error) {
    return affiliateApiError(error, "affiliate_run_through_plan_failed");
  }
}
