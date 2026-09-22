import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { RunThroughVideoProps } from "../remotion/run-through-video";
import { uploadAffiliateAsset } from "./affiliate-asset-storage";
import { resolveRemotionBundle } from "./remotion-bundle";
import type { RunThroughPlan } from "./run-through-service";

/** Renders a planned run-through video to MP4. Image paths resolve against `origin`. */
export async function renderRunThroughVideo(plan: RunThroughPlan, origin: string): Promise<Buffer> {
  const inputProps: RunThroughVideoProps = {
    categoryLabel: plan.categoryLabel,
    shopUrl: "dloop.co.ke",
    variant: plan.variant,
    products: plan.items.map((item) => ({ ...item, image: new URL(item.image || "/og.png", origin).toString() })),
  };
  const serveUrl = resolveRemotionBundle();
  const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE?.trim() || undefined;
  const composition = await selectComposition({ serveUrl, id: "RunThroughVideo", inputProps, browserExecutable });
  const tempDirectory = await mkdtemp(path.join(tmpdir(), "direct-loop-run-through-"));
  const outputLocation = path.join(tempDirectory, `${plan.id}.mp4`);
  try {
    await renderMedia({ composition, serveUrl, codec: "h264", outputLocation, inputProps, browserExecutable, concurrency: 2 });
    return await readFile(outputLocation);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

export function runThroughObjectName(affiliateId: string, videoId: string) {
  return `affiliate-assets/${affiliateId}/run-through-videos/${videoId}.mp4`;
}

/** Stores a rendered video; returns its object name, or null where no bucket is configured. */
export async function storeRunThroughVideo(affiliateId: string, videoId: string, video: Buffer) {
  const objectName = runThroughObjectName(affiliateId, videoId);
  return (await uploadAffiliateAsset(objectName, "video/mp4", video)) ? objectName : null;
}
