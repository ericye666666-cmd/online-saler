import { NextResponse } from "next/server";
import { affiliateApiError, noStoreHeaders } from "../../../../../../affiliate/affiliate-api";
import { fetchAffiliateAsset } from "../../../../../../affiliate/affiliate-asset-storage";
import { requireActiveAffiliate } from "../../../../../../affiliate/affiliate-platform-service";
import { markRunThroughDownloaded, storedRunThroughVideo } from "../../../../../../affiliate/run-through-service";
import { currentCustomerSession } from "../../../../../../auth/customer-auth";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** Streams a stored video to its affiliate. `?download=1` saves it and records the download. */
export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const affiliate = await requireActiveAffiliate(await currentCustomerSession());
    const video = await storedRunThroughVideo(affiliate, id);
    if (!video?.storageObjectKey) return NextResponse.json({ error: "Video is not ready yet." }, { status: 404, headers: noStoreHeaders });
    const download = new URL(request.url).searchParams.get("download") === "1";
    const stored = await fetchAffiliateAsset(video.storageObjectKey);
    if (download) await markRunThroughDownloaded(id).catch(() => undefined);
    const length = stored.headers.get("content-length");
    return new Response(stored.body, {
      headers: {
        "Content-Type": "video/mp4",
        ...(length ? { "Content-Length": length } : {}),
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="direct-loop-${id.slice(0, 8)}.mp4"`,
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (error) {
    return affiliateApiError(error, "affiliate_run_through_file_failed");
  }
}
