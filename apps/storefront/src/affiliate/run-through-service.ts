import {
  AffiliateAssetStatus,
  InventoryItemStatus,
  prisma,
  ProductDetailAssetType,
  ProductDetailStatus,
  ProductStatus,
  type Prisma,
} from "@online-saler/database";
import { buildAffiliatePath } from "./affiliate-platform";
import { AffiliatePlatformError } from "./affiliate-platform-service";
import {
  RUN_THROUGH_ALL_CATEGORIES,
  RUN_THROUGH_ITEM_COUNT,
  RUN_THROUGH_MIN_ITEMS,
  runThroughCaption,
  runThroughCategoryLabel,
  selectRunThroughProducts,
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
  categoryLabel: string;
  caption: string;
  items: RunThroughPlanItem[];
};

type Affiliate = { id: string; affiliateCode: string };

// Only pieces a shopper can buy right now, with a finished display image.
function eligibleWhere(category: string | null): Prisma.ProductWhereInput {
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

/** Categories with enough pieces for a video, most stocked first. */
export async function runThroughCategories() {
  const groups = await prisma.product.groupBy({ by: ["category"], where: eligibleWhere(null), _count: { _all: true } });
  const total = groups.reduce((sum, group) => sum + group._count._all, 0);
  return [
    { value: RUN_THROUGH_ALL_CATEGORIES, label: runThroughCategoryLabel(null), count: total },
    ...groups
      .filter((group) => group.category && group._count._all >= RUN_THROUGH_MIN_ITEMS)
      .sort((a, b) => b._count._all - a._count._all)
      .map((group) => ({ value: group.category!, label: runThroughCategoryLabel(group.category), count: group._count._all })),
  ].filter((option) => option.count >= RUN_THROUGH_MIN_ITEMS);
}

/** Picks the pieces for a new video and records them against the affiliate. */
export async function planRunThroughVideo(affiliate: Affiliate, requestedCategory: string | undefined): Promise<RunThroughPlan> {
  const category = requestedCategory && requestedCategory !== RUN_THROUGH_ALL_CATEGORIES ? requestedCategory : null;
  const products = await prisma.product.findMany({
    where: eligibleWhere(category),
    select: { id: true, publishedAt: true },
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
  const picked = selectRunThroughProducts(
    products.map((product) => ({ ...product, timesShown: counts.get(product.id) ?? 0, timesShownByAffiliate: ownCounts.get(product.id) ?? 0 })),
    RUN_THROUGH_ITEM_COUNT,
  );

  const video = await prisma.runThroughVideo.create({
    data: {
      affiliateId: affiliate.id,
      category,
      items: { create: picked.map((product, index) => ({ productId: product.id, position: index + 1 })) },
    },
  });
  return (await loadRunThroughPlan(affiliate, video.id))!;
}

/** Loads a planned video back, for rendering. Only its own affiliate may. */
export async function loadRunThroughPlan(affiliate: Affiliate, videoId: string): Promise<RunThroughPlan | null> {
  const video = await prisma.runThroughVideo.findFirst({
    where: { id: videoId, affiliateId: affiliate.id },
    include: {
      items: {
        orderBy: { position: "asc" },
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
                orderBy: { sourceDataVersion: "desc" },
                take: 1,
                select: { assets: { where: displayAssetWhere, take: 1, select: { id: true, publicUrl: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!video) return null;
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
      link: buildAffiliatePath(`/p/${product.productCode}`, affiliate.affiliateCode, { source: "tiktok", placement: "run-through", campaign: `run-through-${video.id.slice(0, 8)}` }),
    };
  });
  return { id: video.id, categoryLabel, caption: runThroughCaption(categoryLabel, items.map((item) => item.price)), items };
}

export async function markRunThroughVideo(videoId: string, status: AffiliateAssetStatus, errorMessage: string | null = null) {
  await prisma.runThroughVideo.update({ where: { id: videoId }, data: { status, errorMessage } });
}

// Stored display images vary in how much of the square the piece fills; the
// storefront's /framed route evens them out, as it does for product cards.
function displayImagePath(url: string): string {
  if (!url || /^https?:/i.test(url)) return url;
  return `/framed${url.startsWith("/") ? url : `/${url}`}`;
}
