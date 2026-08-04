import { NextResponse } from "next/server";
import {
  InventoryItemStatus,
  ProductDetailAssetType,
  ProductDetailStatus,
  ProductImageType,
  ProductImageVariant,
  ProductStatus,
  prisma
} from "@online-saler/database";
import { CART_MAX_ITEMS } from "../../../storefront-cart";
import type {
  CartAvailabilityStatus,
  CartValidationResponse,
  ValidatedCartItem
} from "../../../../cart/cart-validation-types";

export const dynamic = "force-dynamic";

type ProductForCart = Awaited<ReturnType<typeof fetchCartProducts>>[number];

export async function POST(request: Request) {
  try {
    const body = await request.json() as { productIds?: unknown };
    const productIds = normalizeProductIds(body.productIds);
    if (!productIds.length) {
      return NextResponse.json(emptyResponse(), { headers: { "cache-control": "no-store" } });
    }

    const products = await fetchCartProducts(productIds);
    const productsByInput = new Map<string, ProductForCart>();
    for (const productId of productIds) {
      const product = products.find((candidate) => matchesProductIdentifier(candidate, productId));
      if (product) productsByInput.set(productId, product);
    }

    const actualProductIds = [...new Set(products.map((product) => product.id))];
    const [selections, variantAssets] = actualProductIds.length
      ? await Promise.all([
          prisma.productMainImageSelection.findMany({ where: { productId: { in: actualProductIds } } }),
          prisma.productImageVariantAsset.findMany({
            where: {
              productId: { in: actualProductIds },
              publicUrl: { not: null },
              variant: {
                in: [
                  ProductImageVariant.AI_DISPLAY_MAIN,
                  ProductImageVariant.OPTIMIZED_BALANCED_MAIN,
                  ProductImageVariant.OPTIMIZED_MAIN,
                  ProductImageVariant.CUTOUT_WHITE
                ]
              }
            },
            orderBy: [{ createdAt: "desc" }]
          })
        ])
      : [[], []] as const;

    const nowIso = new Date().toISOString();
    const items = productIds.map((requestedProductId) => {
      const product = productsByInput.get(requestedProductId);
      if (!product) return missingItem(requestedProductId, nowIso);
      return productToCartItem(
        requestedProductId,
        product,
        selections.find((selection) => selection.productId === product.id) ?? null,
        variantAssets.filter((asset) => asset.productId === product.id),
        nowIso
      );
    });
    const itemSubtotalKsh = items.reduce((sum, item) => (
      item.canCheckout && item.priceKsh ? sum + item.priceKsh : sum
    ), 0);
    const response: CartValidationResponse = {
      items,
      summary: {
        checkoutableCount: items.filter((item) => item.canCheckout).length,
        unavailableCount: items.filter((item) => !item.canCheckout).length,
        itemSubtotalKsh,
        updatedAt: nowIso
      }
    };
    return NextResponse.json(response, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("cart_validate_failed", error);
    return NextResponse.json({ error: "Cart could not be refreshed. Please try again." }, { status: 500 });
  }
}

function normalizeProductIds(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of values) {
    if (typeof raw !== "string") continue;
    const productId = raw.trim();
    if (!productId || seen.has(productId)) continue;
    seen.add(productId);
    normalized.push(productId);
    if (normalized.length >= CART_MAX_ITEMS) break;
  }
  return normalized;
}

async function fetchCartProducts(productIds: string[]) {
  return prisma.product.findMany({
    where: {
      OR: [
        { id: { in: productIds } },
        { productCode: { in: productIds } },
        { barcode: { in: productIds } }
      ]
    },
    include: {
      inventoryItem: true,
      images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      detailProfiles: {
        where: { status: ProductDetailStatus.APPROVED },
        orderBy: { sourceDataVersion: "desc" },
        take: 1,
        include: {
          assets: {
            where: {
              status: ProductDetailStatus.READY,
              type: ProductDetailAssetType.FRONT_MAIN
            },
            take: 1
          }
        }
      }
    }
  });
}

function matchesProductIdentifier(product: ProductForCart, productId: string): boolean {
  return product.id === productId || product.productCode === productId || product.barcode === productId;
}

function productToCartItem(
  requestedProductId: string,
  product: ProductForCart,
  selection: { selectedImageId: string } | null,
  variantAssets: Array<{ id: string; variant: ProductImageVariant; publicUrl: string | null }>,
  nowIso: string
): ValidatedCartItem {
  const availability = cartAvailability(product);
  return {
    requestedProductId,
    productId: product.id,
    productCode: product.productCode,
    barcode: product.barcode,
    title: product.title || "Second-hand item",
    storefrontImage: storefrontImage(product, selection, variantAssets),
    priceKsh: product.priceKsh,
    size: product.finalSizeLabel || product.tagSize,
    condition: product.conditionGrade,
    availability,
    canCheckout: availability === "AVAILABLE" && Boolean(product.priceKsh && product.priceKsh > 0),
    statusMessage: statusMessage(availability, product.priceKsh),
    updatedAt: product.updatedAt.toISOString() || nowIso
  };
}

function missingItem(requestedProductId: string, nowIso: string): ValidatedCartItem {
  return {
    requestedProductId,
    productId: null,
    productCode: null,
    barcode: null,
    title: "Item removed",
    storefrontImage: null,
    priceKsh: null,
    size: null,
    condition: null,
    availability: "REMOVED",
    canCheckout: false,
    statusMessage: "This item is no longer in the catalog.",
    updatedAt: nowIso
  };
}

function cartAvailability(product: ProductForCart): CartAvailabilityStatus {
  if (product.status !== ProductStatus.PUBLISHED) {
    return product.status === ProductStatus.ARCHIVED ? "REMOVED" : "UNPUBLISHED";
  }
  const status = product.inventoryItem?.status;
  if (!status || status === InventoryItemStatus.PENDING_STOCK_IN || status === InventoryItemStatus.LOST) return "DISABLED";
  if (status === InventoryItemStatus.AVAILABLE) return "AVAILABLE";
  if (status === InventoryItemStatus.RESERVED) return "TEMPORARILY_RESERVED";
  if (
    status === InventoryItemStatus.PAID ||
    status === InventoryItemStatus.PICKED ||
    status === InventoryItemStatus.PACKED ||
    status === InventoryItemStatus.DELIVERED
  ) return "SOLD";
  return "DISABLED";
}

function statusMessage(status: CartAvailabilityStatus, priceKsh: number | null): string {
  if (status === "AVAILABLE" && (!priceKsh || priceKsh <= 0)) return "Price is not ready yet.";
  if (status === "AVAILABLE") return "Available for checkout.";
  if (status === "TEMPORARILY_RESERVED") return "Temporarily reserved by another customer. Keep it here and check again soon.";
  if (status === "SOLD") return "Sold. This one-of-one item can no longer be purchased.";
  if (status === "UNPUBLISHED") return "No longer listed for sale.";
  if (status === "REMOVED") return "Removed from the catalog.";
  return "Not available for checkout.";
}

function storefrontImage(
  product: ProductForCart,
  selection: { selectedImageId: string } | null,
  variantAssets: Array<{ id: string; variant: ProductImageVariant; publicUrl: string | null }>
): string | null {
  const selectedVariant = variantAssets.find((asset) => asset.id === selection?.selectedImageId && asset.publicUrl);
  if (selectedVariant?.publicUrl) return publicAssetUrl(selectedVariant.publicUrl);

  const selectedOriginal = product.images.find((image) => image.id === selection?.selectedImageId && image.publicUrl);
  if (selectedOriginal?.publicUrl) return publicAssetUrl(selectedOriginal.publicUrl);

  const frontMain = product.detailProfiles[0]?.assets[0];
  if (frontMain) return publicAssetUrl(frontMain.publicUrl ?? `/product-detail-assets/${frontMain.id}/content`);

  for (const variant of [
    ProductImageVariant.OPTIMIZED_BALANCED_MAIN,
    ProductImageVariant.OPTIMIZED_MAIN,
    ProductImageVariant.CUTOUT_WHITE
  ]) {
    const asset = variantAssets.find((candidate) => candidate.variant === variant && candidate.publicUrl);
    if (asset?.publicUrl) return publicAssetUrl(asset.publicUrl);
  }

  const frontOriginal = product.images.find((image) => image.type === ProductImageType.FRONT && image.publicUrl);
  if (frontOriginal?.publicUrl) return publicAssetUrl(frontOriginal.publicUrl);
  return null;
}

function publicAssetUrl(value: string): string {
  if (value.startsWith("http")) return value;
  return value.startsWith("/") ? `/api-proxy${value}` : value;
}

function emptyResponse(): CartValidationResponse {
  const updatedAt = new Date().toISOString();
  return {
    items: [],
    summary: {
      checkoutableCount: 0,
      unavailableCount: 0,
      itemSubtotalKsh: 0,
      updatedAt
    }
  };
}
