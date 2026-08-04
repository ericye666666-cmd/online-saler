import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AffiliateAssetStatus, prisma } from "@online-saler/database";
import { renderMedia, selectComposition } from "@remotion/renderer";
import QRCode from "qrcode";
import { affiliateApiError } from "../../../../../affiliate/affiliate-api";
import { uploadAffiliateAsset } from "../../../../../affiliate/affiliate-asset-storage";
import { requireActiveAffiliate } from "../../../../../affiliate/affiliate-platform-service";
import { buildAffiliatePath } from "../../../../../affiliate/affiliate-platform";
import { currentCustomerSession } from "../../../../../auth/customer-auth";
import type { AffiliateTikTokVideoProps } from "../../../../../remotion/affiliate-tiktok-video";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  let assetId: string | null = null;
  try {
    const affiliate = await requireActiveAffiliate(await currentCustomerSession());
    const body = await request.json() as { collectionId?: string };
    const collection = await prisma.collection.findFirst({
      where: { id: body.collectionId?.trim(), affiliateId: affiliate.id },
      include: { items: { orderBy: { sortOrder: "asc" }, take: 5, include: { product: { include: { images: { orderBy: { sortOrder: "asc" }, take: 1 } } } } } },
    });
    if (!collection) return Response.json({ error: "Collection was not found." }, { status: 404 });
    if (collection.items.length < 5) return Response.json({ error: "TikTok video requires at least 5 Collection products." }, { status: 409 });

    assetId = randomUUID();
    const affiliateLink = buildAffiliatePath(`/c/${collection.slug}`, affiliate.affiliateCode, { source: "tiktok", placement: "video-qr", campaign: `tiktok-${collection.slug}` });
    await prisma.tikTokVideo.create({ data: { id: assetId, affiliateId: affiliate.id, collectionId: collection.id, durationSeconds: 12, affiliateLink, status: AffiliateAssetStatus.PROCESSING } });
    const absoluteLink = new URL(affiliateLink, request.url).toString();
    const inputProps: AffiliateTikTokVideoProps = {
      affiliateName: affiliate.displayName,
      collectionTitle: collection.title,
      qrDataUrl: await QRCode.toDataURL(absoluteLink, { width: 440, margin: 1 }),
      products: collection.items.map(({ product }) => ({
        code: product.productCode,
        title: product.title || "Direct Loop item",
        size: product.finalSizeLabel || product.tagSize || "Size not listed",
        price: product.priceKsh ?? 0,
        image: new URL(product.images[0]?.publicUrl || product.images[0]?.originalUrl || "/og.png", request.url).toString(),
      })),
    };
    const serveUrl = resolveRemotionBundle();
    const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE?.trim() || undefined;
    const composition = await selectComposition({ serveUrl, id: "AffiliateTikTokVideo", inputProps, browserExecutable });
    const tempDirectory = await mkdtemp(path.join(tmpdir(), "direct-loop-affiliate-video-"));
    const outputLocation = path.join(tempDirectory, `${assetId}.mp4`);
    try {
      await renderMedia({ composition, serveUrl, codec: "h264", outputLocation, inputProps, browserExecutable, concurrency: 1 });
      const video = await readFile(outputLocation);
      const objectName = `staging/affiliate-assets/${affiliate.id}/tiktok-videos/${assetId}.mp4`;
      const storageUrl = await uploadAffiliateAsset(objectName, "video/mp4", video);
      await prisma.tikTokVideo.update({ where: { id: assetId }, data: { status: AffiliateAssetStatus.READY, storageObjectKey: storageUrl ? objectName : null, errorMessage: null } });
      return new Response(new Uint8Array(video), { headers: { "Content-Type": "video/mp4", "Content-Disposition": `attachment; filename="direct-loop-${collection.slug}-tiktok.mp4"`, "Cache-Control": "no-store" } });
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  } catch (error) {
    if (assetId) await prisma.tikTokVideo.update({ where: { id: assetId }, data: { status: AffiliateAssetStatus.FAILED, errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Video render failed." } }).catch(() => undefined);
    return affiliateApiError(error, "affiliate_tiktok_video_failed");
  }
}

function resolveRemotionBundle() {
  const candidates = [path.join(process.cwd(), "build", "remotion-release"), path.join(process.cwd(), "apps", "storefront", "build", "remotion-release")];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error("Remotion bundle is missing. Run the Storefront build before rendering video.");
  return found;
}
