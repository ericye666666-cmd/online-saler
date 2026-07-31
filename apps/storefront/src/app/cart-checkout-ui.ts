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
