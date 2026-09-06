import { ProductImageVariant, type Prisma } from "@online-saler/database";
import { requiresAiMainImageConfirmation } from "./product-publication-readiness";

export async function loadConfirmedDisplayImage(
  client: Pick<Prisma.TransactionClient, "productMainImageSelection" | "productImageVariantAsset">,
  productId: string
) {
  const selection = await client.productMainImageSelection.findUnique({ where: { productId } });
  if (!selection || requiresAiMainImageConfirmation(selection)) return null;
  // Selection identifiers are not foreign keys. Reject deleted or unrelated assets too.
  const asset = await client.productImageVariantAsset.findFirst({
    where: { id: selection.selectedImageId, productId, variant: ProductImageVariant.AI_DISPLAY_MAIN },
    select: { id: true }
  });
  return asset ? selection : null;
}
