import { AffiliateAssetStatus } from "@online-saler/database";
import { NextResponse } from "next/server";
import { affiliateApiError, noStoreHeaders } from "../../../../../affiliate/affiliate-api";
import { requireActiveAffiliate } from "../../../../../affiliate/affiliate-platform-service";
import { renderRunThroughVideo, storeRunThroughVideo } from "../../../../../affiliate/run-through-render";
import { loadRunThroughPlan, markRunThroughVideo } from "../../../../../affiliate/run-through-service";
import { currentCustomerSession } from "../../../../../auth/customer-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Renders a video now: an extra video, or a daily one the scheduler has not
 * reached yet. When a bucket is configured the video is stored and the client
 * loads it from /file; otherwise the MP4 comes back in this response.
 */
export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  let planned = false;
  try {
    const affiliate = await requireActiveAffiliate(await currentCustomerSession());
    const plan = await loadRunThroughPlan(affiliate, id);
    if (!plan) return NextResponse.json({ error: "Video was not found." }, { status: 404, headers: noStoreHeaders });
    if (plan.stored) return NextResponse.json({ stored: true }, { headers: noStoreHeaders });
    planned = true;

    const video = await renderRunThroughVideo(plan, new URL(request.url).origin);
    const objectName = await storeRunThroughVideo(affiliate.id, id, video).catch(() => null);
    await markRunThroughVideo(id, AffiliateAssetStatus.READY, null, objectName);
    if (objectName) return NextResponse.json({ stored: true }, { headers: noStoreHeaders });
    return new Response(new Uint8Array(video), {
      headers: { "Content-Type": "video/mp4", "Content-Disposition": `attachment; filename="direct-loop-${id.slice(0, 8)}.mp4"`, "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (planned) await markRunThroughVideo(id, AffiliateAssetStatus.FAILED, error instanceof Error ? error.message.slice(0, 500) : "Video render failed.").catch(() => undefined);
    return affiliateApiError(error, "affiliate_run_through_render_failed");
  }
}
