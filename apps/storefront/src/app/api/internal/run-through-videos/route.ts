import { AffiliateAssetStatus } from "@online-saler/database";
import { NextResponse } from "next/server";
import { renderRunThroughVideo, storeRunThroughVideo } from "../../../../affiliate/run-through-render";
import {
  claimNextRender,
  ensureDailyVideos,
  expireUnrenderedVideos,
  loadRunThroughPlan,
  markRunThroughVideo,
} from "../../../../affiliate/run-through-service";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Called by Cloud Scheduler every few minutes. Plans today's videos for every
 * active affiliate, then renders and stores one of them, so a day's videos
 * become ready one after another and no call carries more than one render.
 */
export async function POST(request: Request) {
  const expected = process.env.INTERNAL_CRON_SECRET?.trim();
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const expired = await expireUnrenderedVideos();
  const planned = await ensureDailyVideos();
  const claim = await claimNextRender();
  if (!claim) return NextResponse.json({ expired, planned, rendered: null });

  try {
    const plan = await loadRunThroughPlan(claim.affiliate, claim.videoId);
    if (!plan) return NextResponse.json({ expired, planned, rendered: null });
    const video = await renderRunThroughVideo(plan, process.env.STOREFRONT_PUBLIC_URL?.trim() || new URL(request.url).origin);
    const objectName = await storeRunThroughVideo(claim.affiliate.id, claim.videoId, video);
    if (!objectName) throw new Error("No asset bucket is configured, so daily videos cannot be stored.");
    await markRunThroughVideo(claim.videoId, AffiliateAssetStatus.READY, null, objectName);
    return NextResponse.json({ expired, planned, rendered: claim.videoId });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Video render failed.";
    await markRunThroughVideo(claim.videoId, AffiliateAssetStatus.FAILED, message).catch(() => undefined);
    console.error("run_through_daily_render_failed", error);
    return NextResponse.json({ expired, planned, rendered: null, error: message }, { status: 500 });
  }
}
