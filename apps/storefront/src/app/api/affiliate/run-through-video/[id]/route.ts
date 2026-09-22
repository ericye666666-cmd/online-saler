import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AffiliateAssetStatus } from "@online-saler/database";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { NextResponse } from "next/server";
import { affiliateApiError, noStoreHeaders } from "../../../../../affiliate/affiliate-api";
import { uploadAffiliateAsset } from "../../../../../affiliate/affiliate-asset-storage";
import { requireActiveAffiliate } from "../../../../../affiliate/affiliate-platform-service";
import { resolveRemotionBundle } from "../../../../../affiliate/remotion-bundle";
import { loadRunThroughPlan, markRunThroughVideo } from "../../../../../affiliate/run-through-service";
import { currentCustomerSession } from "../../../../../auth/customer-auth";
import type { RunThroughVideoProps } from "../../../../../remotion/run-through-video";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

/** Renders a planned run-through video and returns it as an MP4 download. */
export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  let planned = false;
  try {
    const affiliate = await requireActiveAffiliate(await currentCustomerSession());
    const plan = await loadRunThroughPlan(affiliate, id);
    if (!plan) return NextResponse.json({ error: "Video was not found." }, { status: 404, headers: noStoreHeaders });
    planned = true;

    const origin = new URL(request.url);
    const inputProps: RunThroughVideoProps = {
      categoryLabel: plan.categoryLabel,
      shopUrl: "dloop.co.ke",
      products: plan.items.map((item) => ({ ...item, image: new URL(item.image || "/og.png", origin).toString() })),
    };
    const serveUrl = resolveRemotionBundle();
    const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE?.trim() || undefined;
    const composition = await selectComposition({ serveUrl, id: "RunThroughVideo", inputProps, browserExecutable });
    const tempDirectory = await mkdtemp(path.join(tmpdir(), "direct-loop-run-through-"));
    const outputLocation = path.join(tempDirectory, `${id}.mp4`);
    try {
      await renderMedia({ composition, serveUrl, codec: "h264", outputLocation, inputProps, browserExecutable, concurrency: 2 });
      const video = await readFile(outputLocation);
      await uploadAffiliateAsset(`staging/affiliate-assets/${affiliate.id}/run-through-videos/${id}.mp4`, "video/mp4", video).catch(() => null);
      await markRunThroughVideo(id, AffiliateAssetStatus.READY);
      return new Response(new Uint8Array(video), {
        headers: { "Content-Type": "video/mp4", "Content-Disposition": `attachment; filename="direct-loop-${id.slice(0, 8)}.mp4"`, "Cache-Control": "no-store" },
      });
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  } catch (error) {
    if (planned) await markRunThroughVideo(id, AffiliateAssetStatus.FAILED, error instanceof Error ? error.message.slice(0, 500) : "Video render failed.").catch(() => undefined);
    return affiliateApiError(error, "affiliate_run_through_render_failed");
  }
}
