import { NextResponse } from "next/server";
import { affiliateApiError, noStoreHeaders } from "../../../../affiliate/affiliate-api";
import { requireActiveAffiliate } from "../../../../affiliate/affiliate-platform-service";
import { ensureDailyVideos, listDailyVideos, planRunThroughVideo, runThroughCategories } from "../../../../affiliate/run-through-service";
import { currentCustomerSession } from "../../../../auth/customer-auth";

export const runtime = "nodejs";

/**
 * Today's videos for the affiliate, planning them first if the scheduler has
 * not yet (a new affiliate, or an early visit), plus the categories an extra
 * video can be made of.
 */
export async function GET() {
  try {
    const affiliate = await requireActiveAffiliate(await currentCustomerSession());
    await ensureDailyVideos(affiliate.id);
    const [videos, categories] = await Promise.all([listDailyVideos(affiliate), runThroughCategories()]);
    return NextResponse.json({ videos, categories }, { headers: noStoreHeaders });
  } catch (error) {
    return affiliateApiError(error, "affiliate_run_through_list_failed");
  }
}

/** Picks the pieces for an extra video. The video itself is rendered by POST /[id]. */
export async function POST(request: Request) {
  try {
    const affiliate = await requireActiveAffiliate(await currentCustomerSession());
    const body = await request.json().catch(() => ({})) as { category?: string };
    return NextResponse.json({ plan: await planRunThroughVideo(affiliate, body.category?.trim() || undefined) }, { headers: noStoreHeaders });
  } catch (error) {
    return affiliateApiError(error, "affiliate_run_through_plan_failed");
  }
}
