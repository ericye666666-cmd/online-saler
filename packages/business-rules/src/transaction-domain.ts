export const ORDER_CURRENCY = "KES" as const;

export type CustomerStatus = "ACTIVE" | "SUSPENDED" | "DELETED";
export type CheckoutDraftStatus = "OPEN" | "CONVERTED" | "ABANDONED" | "EXPIRED";
export type OrderStatus = "DRAFT" | "AWAITING_PAYMENT" | "PAID" | "CANCELLED";
export type FulfillmentMethod = "PICKUP" | "KIKUYU_LOCAL_DELIVERY";

export type OrderAmountLine = {
  productId: string;
  unitPriceKsh: number;
};

export type OrderAmounts = {
  itemSubtotalKsh: number;
  deliveryFeeKsh: number;
  totalKsh: number;
  currency: typeof ORDER_CURRENCY;
};

export function normalizeCustomerEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function calculateOrderAmounts(
  lines: readonly OrderAmountLine[],
  deliveryFeeKsh: number
): OrderAmounts {
  if (!Number.isInteger(deliveryFeeKsh) || deliveryFeeKsh < 0) {
    throw new Error("Delivery fee must be a non-negative integer in KSh.");
  }

  const seenProducts = new Set<string>();
  let itemSubtotalKsh = 0;

  for (const line of lines) {
    const productId = line.productId.trim();
    if (!productId) throw new Error("Every order line requires a product ID.");
    if (seenProducts.has(productId)) {
      throw new Error("A one-of-one product cannot appear twice in the same order.");
    }
    if (!Number.isInteger(line.unitPriceKsh) || line.unitPriceKsh <= 0) {
      throw new Error("Every order line requires a positive integer price in KSh.");
    }

    seenProducts.add(productId);
    itemSubtotalKsh += line.unitPriceKsh;
  }

  return {
    itemSubtotalKsh,
    deliveryFeeKsh,
    totalKsh: itemSubtotalKsh + deliveryFeeKsh,
    currency: ORDER_CURRENCY
  };
}
