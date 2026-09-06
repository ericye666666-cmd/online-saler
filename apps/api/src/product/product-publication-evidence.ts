import { ProductImageType, ProductImageVariant, type Prisma } from "@online-saler/database";
import { isShoeProduct } from "@online-saler/shared-types";
import { requiresAiMainImageConfirmation } from "./product-publication-readiness";

export async function hasCurrentShoeDisplaySource(
  client: Pick<Prisma.TransactionClient, "productImage">,
  productId: string,
  sourceImageId: string | null | undefined
): Promise<boolean> {
  if (!sourceImageId) return false;
  const original = await client.productImage.findFirst({
    where: { productId, type: ProductImageType.FRONT },
    orderBy: { createdAt: "desc" },
    select: { id: true }
  });
  return Boolean(original && original.id === sourceImageId);
}

export async function loadConfirmedDisplayImage(
  client: Pick<Prisma.TransactionClient, "product" | "productImage" | "productMainImageSelection" | "productImageVariantAsset">,
  productId: string
) {
  const selection = await client.productMainImageSelection.findUnique({ where: { productId } });
  if (!selection || requiresAiMainImageConfirmation(selection)) return null;
  // Selection identifiers are not foreign keys. Reject deleted or unrelated assets too.
  const [asset, product] = await Promise.all([
    client.productImageVariantAsset.findFirst({
      where: { id: selection.selectedImageId, productId, variant: ProductImageVariant.AI_DISPLAY_MAIN },
      select: { id: true, sourceImageId: true }
    }),
    client.product.findUnique({ where: { id: productId }, select: { category: true, subcategory: true } })
  ]);
  if (!asset || !product) return null;
  if (isShoeProduct(product.category, product.subcategory) &&
    !await hasCurrentShoeDisplaySource(client, productId, asset.sourceImageId)) return null;
  return selection;
}
