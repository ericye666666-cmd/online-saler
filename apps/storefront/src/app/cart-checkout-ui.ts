export type FulfillmentChoice = "PICKUP" | "KIKUYU_LOCAL_DELIVERY";

export type CheckoutStage = "details" | "payment" | "complete";

export function deliveryRequiresAddress(fulfillment: FulfillmentChoice): boolean {
  return fulfillment === "KIKUYU_LOCAL_DELIVERY";
}

export function googleMapsConfigured(apiKey?: string | null): boolean {
  return Boolean(apiKey?.trim());
}

export function checkoutStage(hasReservation: boolean, paymentComplete: boolean): CheckoutStage {
  if (paymentComplete) return "complete";
  if (hasReservation) return "payment";
  return "details";
}

export function checkoutStepStatus(stage: CheckoutStage, step: CheckoutStage): "current" | "done" | "pending" {
  const order: CheckoutStage[] = ["details", "payment", "complete"];
  const stageIndex = order.indexOf(stage);
  const stepIndex = order.indexOf(step);
  if (stepIndex < stageIndex) return "done";
  if (stepIndex === stageIndex) return "current";
  return "pending";
}

export type CheckoutPaymentPlanChoice = "FULL" | "DEPOSIT_50";

export type CheckoutStartInput = {
  productIds: string[];
  phone: string;
  fulfillment: FulfillmentChoice;
  deliveryAddress: string;
  deliveryNote: string;
  pickupPointId: string;
  paymentPlan: CheckoutPaymentPlanChoice;
};

/**
 * The body POSTed to /api/checkout/start. The shopper gives one number, the
 * M-Pesa phone. Checkout no longer asks for a separate WhatsApp number, so
 * none is sent; staff and notifications fall back to the M-Pesa phone.
 */
export function checkoutStartBody(input: CheckoutStartInput) {
  return {
    productIds: input.productIds,
    phone: input.phone,
    fulfillmentMethod: input.fulfillment,
    deliveryAddress: deliveryRequiresAddress(input.fulfillment) ? input.deliveryAddress : null,
    // The pickup point is a column, not a sentence pasted into the note, so
    // orders can be routed and counted by store.
    fulfillmentNodeId: input.fulfillment === "PICKUP" ? input.pickupPointId : null,
    deliveryNote: input.deliveryNote.trim() || null,
    paymentPlan: input.paymentPlan
  };
}
