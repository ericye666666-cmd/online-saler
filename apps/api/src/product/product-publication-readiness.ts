import { requiredProductMeasurementTypes } from "@online-saler/business-rules";
import { formatShoeSizeLabel, isShoeProduct, SHOE_REQUIRED_IMAGE_TYPES, SHOE_TYPES } from "@online-saler/shared-types";

type PublicationProduct = {
  barcode?: string | null;
  labelPrintedAt?: Date | string | null;
  title?: string | null;
  category?: string | null;
  subcategory?: string | null;
  sleeveType?: string | null;
  finalSizeLabel?: string | null;
  tagSize?: string | null;
  shoeSizeSystem?: string | null;
  shoeType?: string | null;
  shoePairConfirmed?: boolean;
  shoeConditionNotes?: string | null;
  conditionGrade?: string | null;
  priceKsh?: number | null;
  images: readonly unknown[];
  measurements: Array<{ measurementType: string; finalValueCm?: unknown }>;
  reviews: Array<{ result: string; createdAt: Date }>;
  inventoryItem?: {
    barcode: string;
    status: string;
    locationId: string | null;
    checkedInAt: Date | null;
  } | null;
};

export type PublicationMainImage = {
  variant?: string | null;
  confirmedAt?: Date | string | null;
} | null;

export function requiresAiMainImageConfirmation(selection?: PublicationMainImage): boolean {
  return selection?.variant !== "AI_DISPLAY_MAIN" || !selection.confirmedAt;
}

export function missingPublishMeasurementTypes(product: Pick<PublicationProduct,
  "category" | "subcategory" | "sleeveType" | "measurements"
>): string[] {
  if (isShoeProduct(product.category, product.subcategory)) return [];
  const available = new Set(product.measurements.filter((measurement) => {
    const value = Number(measurement.finalValueCm);
    return Number.isFinite(value) && value > 0;
  }).map((measurement) => measurement.measurementType));
  return requiredProductMeasurementTypes(product).filter((type) => !available.has(type));
}

export function shoeIntakeBlocker(product: Pick<PublicationProduct,
  "category" | "subcategory" | "tagSize" | "shoeSizeSystem" | "shoeType" | "shoePairConfirmed" | "shoeConditionNotes" | "finalSizeLabel" | "images"
>): string | null {
  if (!isShoeProduct(product.category, product.subcategory)) return null;
  const shoeSize = formatShoeSizeLabel(product.tagSize, product.shoeSizeSystem);
  if (!shoeSize || product.finalSizeLabel !== shoeSize) return "Confirm the original shoe size and size system before approving shoes.";
  if (!SHOE_TYPES.includes(product.shoeType as never)) return "Confirm the shoe type before approving shoes.";
  if (product.shoePairConfirmed !== true) return "Confirm a matching pair with the same model and size before approving shoes.";
  if (!product.shoeConditionNotes?.trim()) return "Confirm customer-visible shoe condition notes before approving shoes.";
  const imageTypes = new Set(product.images.flatMap((image) => {
    if (!image || typeof image !== "object" || !("type" in image)) return [];
    return [String(image.type)];
  }));
  const missing = SHOE_REQUIRED_IMAGE_TYPES.filter((type) => !imageTypes.has(type));
  if (missing.length) return `Add original shoe photos before approving shoes: ${missing.join(", ")} (pair, side, soles, size label).`;
  return null;
}

export function productContentBlocker(product: PublicationProduct): string | null {
  if (!product.barcode?.trim()) return "Generate barcode before publishing.";
  if (!product.labelPrintedAt) return "Print the label before publishing.";
  if (!product.title?.trim()) return "Confirm the title before publishing.";
  if (!product.category?.trim()) return "Confirm the category before publishing.";
  const shoeBlocker = shoeIntakeBlocker(product);
  if (shoeBlocker) return shoeBlocker;
  if (!product.finalSizeLabel?.trim()) return "Confirm the size label before publishing.";
  if (!product.conditionGrade) return "Confirm the condition before publishing.";
  const missing = missingPublishMeasurementTypes(product);
  if (missing.length) return `Confirm required measurements before publishing: ${missing.join(", ")}.`;
  if (!product.priceKsh || product.priceKsh <= 0) return "Set the price before publishing.";
  if (!product.images.length) return "Add at least one product photo before publishing.";
  return null;
}

export function productApprovalBlocker(product: PublicationProduct, mainImage: PublicationMainImage): string | null {
  if (requiresAiMainImageConfirmation(mainImage)) {
    return "Confirm the AI display main image against the original before approving the product.";
  }
  const latestReview = [...product.reviews].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];
  if (latestReview?.result !== "APPROVED") return "Approve the product before publishing.";
  return null;
}

export function productPublicationBlocker(product: PublicationProduct, mainImage: PublicationMainImage): string | null {
  const contentBlocker = productContentBlocker(product);
  if (contentBlocker) return contentBlocker;
  const approvalBlocker = productApprovalBlocker(product, mainImage);
  if (approvalBlocker) return approvalBlocker;
  const inventory = product.inventoryItem;
  if (inventory?.status !== "AVAILABLE" || !inventory.checkedInAt) {
    return "Confirm the item is placed in the warehouse before publishing.";
  }
  if (!inventory.locationId) return "Assign a shelf location before publishing.";
  if (inventory.barcode !== product.barcode) return "Match the inventory barcode to the product before publishing.";
  return null;
}
