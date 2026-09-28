import { BadRequestException } from "@nestjs/common";

export const PRODUCT_FACTORY_TEST_PREFIXES = [
  "DEPLOY-",
  "E2E-",
  "OPENAI-",
  "UPLOAD-",
  "TEST-",
  "CUTOUT-",
  "HEADERTEST-",
  "LOCALOPENAI-"
] as const;

/**
 * 商品管理 only handles garments that made it onto the shop: live ones and ones taken down. Items
 * still being entered, awaiting review or storage, or rejected are handled on their own pages.
 */
export const MANAGED_PRODUCT_STATUSES = ["PUBLISHED", "UNPUBLISHED"] as const;
export type ManagedProductStatus = (typeof MANAGED_PRODUCT_STATUSES)[number];

/** The one status the 商品管理 list shows: PUBLISHED unless UNPUBLISHED is asked for. */
export function managedProductStatus(status?: string | null): ManagedProductStatus {
  const requested = status?.trim();
  if (!requested) return "PUBLISHED";
  if ((MANAGED_PRODUCT_STATUSES as readonly string[]).includes(requested)) return requested as ManagedProductStatus;
  throw new BadRequestException(`Product management only lists ${MANAGED_PRODUCT_STATUSES.join(" or ")} products.`);
}

export function productFactoryVisibilityWhere(includeTestData = false): Record<string, unknown> {
  if (includeTestData) return {};

  return {
    NOT: {
      OR: PRODUCT_FACTORY_TEST_PREFIXES.map((prefix) => ({
        productCode: { startsWith: prefix }
      }))
    }
  };
}
