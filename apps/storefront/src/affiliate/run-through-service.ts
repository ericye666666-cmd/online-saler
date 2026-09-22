import {
  AffiliateAssetStatus,
  AffiliateStatus,
  InventoryItemStatus,
  Prisma,
  prisma,
  ProductDetailAssetType,
  ProductDetailStatus,
  ProductStatus,
} from "@online-saler/database";
import { buildAffiliatePath } from "./affiliate-platform";
import { AffiliatePlatformError } from "./affiliate-platform-service";
import {
  compareSizes,
  dailyCategories,
  nairobiDay,
  RUN_THROUGH_DAILY_VIDEOS,
  RUN_THROUGH_MIN_ITEMS,
  runThroughCaption,
  runThroughCategoryLabel,
  runThroughVariant,
  selectRunThroughProducts,
  type RunThroughVariant,
} from "./run-through";

export type RunThroughPlanItem = {
  number: number;
  productId: string;
  code: string;
  title: string;
  size: string;
  price: number;
  image: string;
  link: string;
};

export type RunThroughPlan = {
  id: string;
  day: string | null;
  slot: number | null;
  categoryLabel: string;
  caption: string;
  variant: RunThroughVariant;
  status: "READY" | "PROCESSING" | "FAILED";
  stored: boolean;
  downloaded: boolean;
  items: RunThroughPlanItem[];
};

type Affiliate = { id: string; affiliateCode: string };

// A render that has not finished in this long is assumed lost and retried.
const RENDER_LEASE_MS = 10 * 60 * 1000;

// Only pieces a shopper can buy right now, with a finished display image.
function eligibleWhere(category?: string): Prisma.ProductWhereInput {
  return {
    status: ProductStatus.PUBLISHED,
    priceKsh: { gt: 0 },
    inventoryItem: { is: { status: InventoryItemStatus.AVAILABLE } },
    detailProfiles: { some: { status: ProductDetailStatus.APPROVED, assets: { some: displayAssetWhere } } },
    ...(category ? { category } : {}),
  };
}

const displayAssetWhere = { type: ProductDetailAssetType.FRONT_MAIN, status: ProductDetailStatus.READY };

const shownWhere = { video: { status: { not: AffiliateAssetStatus.FAILED } } };

/** Categories with enough pieces for a video, most stocked first. Each video is one category. */
export async function runThroughCategories() {
  const groups = await prisma.product.groupBy({ by: ["category"], where: eligibleWhere(), _count: { _all: true } });
  return groups
    .filter((group) => group.category && group._count._all >= RUN_THROUGH_MIN_ITEMS)
    .sort((a, b) => b._count._all - a._count._all)
    .map((group) => ({ value: group.category!, label: runThroughCategoryLabel(group.category), count: group._count._all }));
}

type PlanOptions = { day?: string; slot?: number; seed?: number };

/** Picks the pieces for a new video and records them against the affiliate. */
export async function planRunThroughVideo(affiliate: Affiliate, category: string | undefined, options: PlanOptions = {}): Promise<RunThroughPlan> {
  if (!category) throw new AffiliatePlatformError("Choose a category for the video.");
  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
  const variant = runThroughVariant(seed);
  const products = await prisma.product.findMany({
    where: eligibleWhere(category),
    select: { id: true, publishedAt: true, finalSizeLabel: true, tagSize: true },
  });
  if (products.length < RUN_THROUGH_MIN_ITEMS) {
    throw new AffiliatePlatformError(`A video needs at least ${RUN_THROUGH_MIN_ITEMS} pieces in stock. Choose another category.`, 409);
  }

  const ids = products.map((product) => product.id);
  const [shown, shownByAffiliate] = await Promise.all([
    prisma.runThroughVideoItem.groupBy({ by: ["productId"], where: { productId: { in: ids }, ...shownWhere }, _count: { _all: true } }),
    prisma.runThroughVideoItem.groupBy({
      by: ["productId"],
      where: { productId: { in: ids }, video: { status: { not: AffiliateAssetStatus.FAILED }, affiliateId: affiliate.id } },
      _count: { _all: true },
    }),
  ]);
  const counts = new Map(shown.map((row) => [row.productId, row._count._all]));
  const ownCounts = new Map(shownByAffiliate.map((row) => [row.productId, row._count._all]));
  const bySize = (a: (typeof products)[number], b: (typeof products)[number]) =>
    compareSizes(a.finalSizeLabel || a.tagSize || "", b.finalSizeLabel || b.tagSize || "") * (variant.largestFirst ? -1 : 1);
  const picked = selectRunThroughProducts(
    products.map((product) => ({ ...product, timesShown: counts.get(product.id) ?? 0, timesShownByAffiliate: ownCounts.get(product.id) ?? 0 })),
    variant.itemCount,
  ).sort(bySize);

  const video = await prisma.runThroughVideo.create({
    data: {
      affiliateId: affiliate.id,
      category,
      day: options.day,
      slot: options.slot,
      seed,
      items: { create: picked.map((product, index) => ({ productId: product.id, position: index + 1 })) },
    },
  });
  return (await loadRunThroughPlan(affiliate, video.id))!;
}

const planInclude = {
  items: {
    orderBy: { position: "asc" as const },
    include: {
      product: {
        select: {
          id: true,
          productCode: true,
          title: true,
          finalSizeLabel: true,
          tagSize: true,
          priceKsh: true,
          detailProfiles: {
            where: { status: ProductDetailStatus.APPROVED },
            orderBy: { sourceDataVersion: "desc" as const },
            take: 1,
            select: { assets: { where: displayAssetWhere, take: 1, select: { id: true, publicUrl: true } } },
          },
        },
      },
    },
  },
} satisfies Prisma.RunThroughVideoInclude;

type VideoWithItems = Prisma.RunThroughVideoGetPayload<{ include: typeof planInclude }>;

function toPlan(video: VideoWithItems, affiliateCode: string): RunThroughPlan {
  const categoryLabel = runThroughCategoryLabel(video.category);
  const items = video.items.map(({ product, position }) => {
    const asset = product.detailProfiles[0]?.assets[0];
    return {
      number: position,
      productId: product.id,
      code: product.productCode,
      title: product.title || "Direct Loop piece",
      size: (product.finalSizeLabel || product.tagSize || "").toUpperCase(),
      price: product.priceKsh ?? 0,
      image: displayImagePath(asset?.publicUrl ?? (asset ? `/product-detail-assets/${asset.id}/content` : "")),
      link: buildAffiliatePath(`/p/${product.productCode}`, affiliateCode, { source: "tiktok", placement: "run-through", campaign: `run-through-${video.id.slice(0, 8)}` }),
    };
  });
  return {
    id: video.id,
    day: video.day,
    slot: video.slot,
    categoryLabel,
    caption: runThroughCaption(categoryLabel, items.map((item) => item.price), items.map((item) => item.size)),
    variant: runThroughVariant(video.seed),
    status: video.status,
    stored: Boolean(video.storageObjectKey),
    downloaded: Boolean(video.downloadedAt),
    items,
  };
}

/** Loads a planned video back. Only its own affiliate may. */
export async function loadRunThroughPlan(affiliate: Affiliate, videoId: string): Promise<RunThroughPlan | null> {
  const video = await prisma.runThroughVideo.findFirst({ where: { id: videoId, affiliateId: affiliate.id }, include: planInclude });
  return video ? toPlan(video, affiliate.affiliateCode) : null;
}

/**
 * Plans today's videos for one affiliate, or for every active affiliate when
 * none is given. Categories rotate by the affiliate's place in the team, so
 * across the team every category is covered each day. Safe to call often:
 * slots already planned are left alone.
 */
export async function ensureDailyVideos(onlyAffiliateId?: string, day: string = nairobiDay()) {
  const categories = (await runThroughCategories()).map((option) => option.value);
  if (!categories.length) return 0;
  const affiliates = await prisma.affiliate.findMany({
    where: { status: AffiliateStatus.ACTIVE },
    orderBy: { createdAt: "asc" },
    select: { id: true, affiliateCode: true, runThroughVideos: { where: { day }, select: { slot: true } } },
  });
  let planned = 0;
  for (const [index, affiliate] of affiliates.entries()) {
    if (onlyAffiliateId && affiliate.id !== onlyAffiliateId) continue;
    const done = new Set(affiliate.runThroughVideos.map((video) => video.slot));
    for (const [position, category] of dailyCategories(categories, index, day).entries()) {
      const slot = position + 1;
      if (done.has(slot)) continue;
      try {
        await planRunThroughVideo(affiliate, category, { day, slot });
        planned += 1;
      } catch (error) {
        // Another request planned this slot first; that one stands.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
        throw error;
      }
    }
  }
  return planned;
}

/** The affiliate's videos for today, in slot order. */
export async function listDailyVideos(affiliate: Affiliate, day: string = nairobiDay()): Promise<RunThroughPlan[]> {
  const videos = await prisma.runThroughVideo.findMany({
    where: { affiliateId: affiliate.id, day, slot: { lte: RUN_THROUGH_DAILY_VIDEOS } },
    orderBy: { slot: "asc" },
    include: planInclude,
  });
  return videos.map((video) => toPlan(video, affiliate.affiliateCode));
}

/**
 * Claims the next of today's videos that still needs rendering, so that two
 * overlapping scheduler calls never render the same one. A claim older than
 * the lease is treated as a crashed render and taken again.
 */
export async function claimNextRender(day: string = nairobiDay()) {
  const staleBefore = new Date(Date.now() - RENDER_LEASE_MS);
  const candidates = await prisma.runThroughVideo.findMany({
    where: {
      day,
      status: AffiliateAssetStatus.PROCESSING,
      storageObjectKey: null,
      OR: [{ renderStartedAt: null }, { renderStartedAt: { lt: staleBefore } }],
    },
    orderBy: [{ slot: "asc" }, { createdAt: "asc" }],
    take: 5,
    select: { id: true, renderStartedAt: true, affiliate: { select: { id: true, affiliateCode: true } } },
  });
  for (const candidate of candidates) {
    const claimed = await prisma.runThroughVideo.updateMany({
      where: { id: candidate.id, renderStartedAt: candidate.renderStartedAt },
      data: { renderStartedAt: new Date() },
    });
    if (claimed.count === 1) return { videoId: candidate.id, affiliate: candidate.affiliate };
  }
  return null;
}

/** Daily videos from past days that were never rendered no longer count as shown. */
export async function expireUnrenderedVideos(day: string = nairobiDay()) {
  const result = await prisma.runThroughVideo.updateMany({
    where: { day: { lt: day }, status: AffiliateAssetStatus.PROCESSING },
    data: { status: AffiliateAssetStatus.FAILED, errorMessage: "Not rendered on its day." },
  });
  return result.count;
}

export async function markRunThroughVideo(videoId: string, status: AffiliateAssetStatus, errorMessage: string | null = null, storageObjectKey?: string | null) {
  await prisma.runThroughVideo.update({
    where: { id: videoId },
    data: { status, errorMessage, ...(storageObjectKey !== undefined ? { storageObjectKey } : {}) },
  });
}

export async function storedRunThroughVideo(affiliate: Affiliate, videoId: string) {
  return prisma.runThroughVideo.findFirst({ where: { id: videoId, affiliateId: affiliate.id }, select: { id: true, storageObjectKey: true } });
}

export async function markRunThroughDownloaded(videoId: string) {
  await prisma.runThroughVideo.update({ where: { id: videoId }, data: { downloadedAt: new Date() } });
}

// Stored display images vary in how much of the square the piece fills; the
// storefront's /framed route evens them out, as it does for product cards.
function displayImagePath(url: string): string {
  if (!url || /^https?:/i.test(url)) return url;
  return `/framed${url.startsWith("/") ? url : `/${url}`}`;
}
