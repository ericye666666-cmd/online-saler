export type CartAvailabilityStatus =
  | "AVAILABLE"
  | "TEMPORARILY_RESERVED"
  // Someone paid a deposit on it. Unlike a payment lock this lasts days, and
  // it can still come back on sale, so it gets its own wording.
  | "HELD_ON_DEPOSIT"
  | "SOLD"
  | "UNPUBLISHED"
  | "REMOVED"
  | "DISABLED";

export type ValidatedCartItem = {
  requestedProductId: string;
  productId: string | null;
  productCode: string | null;
  barcode: string | null;
  title: string;
  storefrontImage: string | null;
  priceKsh: number | null;
  size: string | null;
  condition: string | null;
  availability: CartAvailabilityStatus;
  canCheckout: boolean;
  statusMessage: string;
  updatedAt: string;
};

export type CartValidationResponse = {
  items: ValidatedCartItem[];
  summary: {
    checkoutableCount: number;
    unavailableCount: number;
    itemSubtotalKsh: number;
    updatedAt: string;
  };
};
